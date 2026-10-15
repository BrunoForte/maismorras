package characters

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/compendium"
	"vtt-backend/internal/systems"
)

var (
	ErrForbidden        = errors.New("forbidden")
	ErrNotFound         = errors.New("character not found")
	ErrNoHitDice        = errors.New("no hit dice available")
	ErrInvalidRest      = errors.New("invalid rest")
	ErrInvalidSpellSlot = errors.New("invalid spell slot quantity")
	sceneIDPattern      = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

// Sheet deliberately stores the D&D 2024 MVP without rules text from the books.
// Features, attacks and spells are user-authored notes, allowing the sheet to stay
// compact while still retaining the practical information used at the table.
type Sheet struct {
	Name                    string                   `json:"name"`
	PortraitPath            string                   `json:"portraitPath"`
	TokenPortraitPath       string                   `json:"tokenPortraitPath"`
	Class                   string                   `json:"class"`
	Subclass                string                   `json:"subclass"`
	Level                   int                      `json:"level"`
	Species                 string                   `json:"species"`
	SpeciesLineage          string                   `json:"speciesLineage"`
	Background              string                   `json:"background"`
	Alignment               string                   `json:"alignment"`
	AbilityScores           AbilityScores            `json:"abilityScores"`
	ProficiencyBonus        int                      `json:"proficiencyBonus"`
	SavingThrows            []string                 `json:"savingThrows"`
	SkillProficiencies      []string                 `json:"skillProficiencies"`
	SkillExpertise          []string                 `json:"skillExpertise"`
	ArmorClass              int                      `json:"armorClass"`
	Initiative              int                      `json:"initiative"`
	InitiativeAdvantage     bool                     `json:"initiativeAdvantage"`
	Speed                   float64                  `json:"speed"`
	HitPointsCurrent        int                      `json:"hitPointsCurrent"`
	HitPointsMax            int                      `json:"hitPointsMax"`
	TemporaryHP             int                      `json:"temporaryHP"`
	HitDice                 string                   `json:"hitDice"`
	HitDiceSpent            int                      `json:"hitDiceSpent"`
	PassivePerception       int                      `json:"passivePerception"`
	Attacks                 []Attack                 `json:"attacks"`
	Spells                  []Spell                  `json:"spells"`
	SpellcastingOverride    bool                     `json:"spellcastingOverride"`
	Features                string                   `json:"features"`
	Feats                   string                   `json:"feats"`
	Equipment               string                   `json:"equipment"`
	Inventory               []InventoryItem          `json:"inventory"`
	Resources               []Resource               `json:"resources"`
	SpellSlots              []SpellSlot              `json:"spellSlots"`
	Money                   Dnd2024Money             `json:"money"`
	FeatSpellGrants         []FeatSpellGrant         `json:"featSpellGrants,omitempty"`
	CampaignFeatSpellGrants []CampaignFeatSpellGrant `json:"campaignFeatSpellGrants,omitempty"`
	VisibleRolls            []string                 `json:"visibleRolls"`
	Resistances             []string                 `json:"resistances,omitempty"`
	AutomaticTraits         []string                 `json:"automaticTraits,omitempty"`
	SpeciesHPBonusApplied   int                      `json:"speciesHPBonusApplied,omitempty"`
}

// Dnd2024Money is the D&D 2024 coin purse, separate from carried inventory.
type Dnd2024Money struct {
	CP int64 `json:"cp"`
	SP int64 `json:"sp"`
	EP int64 `json:"ep"`
	GP int64 `json:"gp"`
	PP int64 `json:"pp"`
}

// FeatSpellGrant records player choices; maximum use and recovery are defined
// by the reviewed D&D 2024 feat catalog, not by these client-provided values.
type FeatSpellGrant struct {
	ID                     string   `json:"id"`
	FeatID                 string   `json:"featId"`
	SpellList              string   `json:"spellList"`
	Ability                string   `json:"ability"`
	CantripEntryIDs        []string `json:"cantripEntryIds"`
	FirstLevelSpellEntryID string   `json:"firstLevelSpellEntryId"`
	FreeCastsRemaining     int      `json:"freeCastsRemaining"`
	Active                 bool     `json:"active,omitempty"`
}

// CampaignFeatSpellGrant stores character choices and remaining uses only.
// Granted spells and mechanics are reloaded from the validated campaign rule.
type CampaignFeatSpellGrant struct {
	ID                    string            `json:"id"`
	FeatEntryID           string            `json:"featEntryId"`
	SpellcastingAbilities map[string]string `json:"spellcastingAbilities,omitempty"`
	FreeCastsRemaining    map[string]int    `json:"freeCastsRemaining,omitempty"`
	Active                bool              `json:"active,omitempty"`
}

type AbilityScores struct {
	Strength     int `json:"strength"`
	Dexterity    int `json:"dexterity"`
	Constitution int `json:"constitution"`
	Intelligence int `json:"intelligence"`
	Wisdom       int `json:"wisdom"`
	Charisma     int `json:"charisma"`
}
type Attack struct {
	Name        string `json:"name"`
	AttackBonus int    `json:"attackBonus"`
	DamageBonus int    `json:"damageBonus,omitempty"`
	Damage      string `json:"damage"`
	Notes       string `json:"notes"`
	AttackType  string `json:"attackType,omitempty"`
	Ability     string `json:"ability,omitempty"`
}
type Spell struct {
	EntryID             string `json:"entryId"`
	Name                string `json:"name"`
	Level               int    `json:"level"`
	Notes               string `json:"notes"`
	Description         string `json:"description"`
	DiceFormula         string `json:"diceFormula"`
	HigherLevels        string `json:"higherLevels"`
	ScalingDicePerLevel int    `json:"scalingDicePerLevel"`
	Origin              string `json:"origin,omitempty"`
}
type Resource struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Current           int    `json:"current"`
	Max               int    `json:"max"`
	MaxOverride       *int   `json:"maxOverride,omitempty"`
	ShortRestRecovery int    `json:"shortRestRecovery,omitempty"`
	RestoreOn         string `json:"restoreOn"`
}
type SpellSlot struct {
	Level   int `json:"level"`
	Current int `json:"current"`
	Max     int `json:"max"`
}

// InventoryItem keeps a compact snapshot of the mechanic selected from the
// compendium. The entry ID preserves its source while the snapshot keeps old
// characters readable if a private compendium entry is later edited.
type InventoryItem struct {
	EntryID  string          `json:"entryId"`
	Name     string          `json:"name"`
	Quantity int             `json:"quantity"`
	Equipped bool            `json:"equipped"`
	Rules    json.RawMessage `json:"rules"`
}
type Character struct {
	ID         string `json:"id"`
	CampaignID string `json:"campaignId"`
	OwnerID    string `json:"ownerId"`
	Sheet      Sheet  `json:"sheet"`
}
type Participant struct {
	UserID      string     `json:"userId"`
	DisplayName string     `json:"displayName"`
	Role        string     `json:"role"`
	Character   *Character `json:"character"`
}

type Repository struct{ pool *pgxpool.Pool }

type SheetRollResult struct {
	EventID  int64  `json:"eventId"`
	Dice     []int  `json:"dados"`
	Kept     int    `json:"dadoEscolhido"`
	Mode     string `json:"modo"`
	Modifier int    `json:"modificador"`
	Total    int    `json:"total"`
	Label    string `json:"label"`
}
type SpellCastResult struct {
	EventID             int64  `json:"eventId"`
	Sheet               Sheet  `json:"sheet"`
	SpellName           string `json:"spellName"`
	BaseLevel           int    `json:"baseLevel"`
	SlotLevel           int    `json:"slotLevel"`
	Effect              string `json:"effect"`
	ChatText            string `json:"chatText"`
	PresentationUpdated bool   `json:"presentationUpdated,omitempty"`
	Expression          string `json:"expression,omitempty"`
	Dice                []int  `json:"dados,omitempty"`
	Modifier            int    `json:"modificador,omitempty"`
	Total               int    `json:"total,omitempty"`
	SpellcastingAbility string `json:"spellcastingAbility,omitempty"`
	FreeCastRemaining   int    `json:"freeCastRemaining,omitempty"`
}

type SpellCastInput struct {
	SpellIndex          int
	SlotLevel           int
	GrantID             string
	EntryID             string
	FreeCast            bool
	PresentationSceneID string
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var abilityKey = map[string]func(AbilityScores) int{
	"strength": func(s AbilityScores) int { return s.Strength }, "dexterity": func(s AbilityScores) int { return s.Dexterity },
	"constitution": func(s AbilityScores) int { return s.Constitution }, "intelligence": func(s AbilityScores) int { return s.Intelligence },
	"wisdom": func(s AbilityScores) int { return s.Wisdom }, "charisma": func(s AbilityScores) int { return s.Charisma },
}
var skills = map[string]string{"Acrobacia": "dexterity", "Adestrar Animais": "wisdom", "Arcanismo": "intelligence", "Atletismo": "strength", "Atuação": "charisma", "Enganação": "charisma", "Furtividade": "dexterity", "História": "intelligence", "Intimidação": "charisma", "Intuição": "wisdom", "Investigação": "intelligence", "Medicina": "wisdom", "Natureza": "intelligence", "Percepção": "wisdom", "Persuasão": "charisma", "Prestidigitação": "dexterity", "Religião": "intelligence", "Sobrevivência": "wisdom"}
var spellAbility = map[string]string{"bard": "charisma", "cleric": "wisdom", "druid": "wisdom", "paladin": "charisma", "ranger": "wisdom", "sorcerer": "charisma", "warlock": "charisma", "wizard": "intelligence"}
var diceInEffect = regexp.MustCompile(`(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?`)

func abilityModifier(score int, rules systems.Dnd2024CharacterRules) int {
	return rules.AbilityModifier(score)
}
func canonicalClass(value string) string {
	key := strings.ToLower(strings.TrimSpace(value))
	if mapped, ok := map[string]string{
		"bárbaro": "barbarian", "barbaro": "barbarian", "bardo": "bard", "clérigo": "cleric",
		"clerigo": "cleric", "druida": "druid", "guerreiro": "fighter", "monge": "monk",
		"paladino": "paladin", "patrulheiro": "ranger", "ladino": "rogue", "feiticeiro": "sorcerer",
		"bruxo": "warlock", "mago": "wizard",
	}[key]; ok {
		return mapped
	}
	return key
}

// RollSheet creates sheet-bound d20 rolls. The client selects only an allowed
// roll and its advantage state; the modifier always comes from the stored sheet.
func (r *Repository) RollSheet(ctx context.Context, campaignID, userID, kind, key, mode string) (SheetRollResult, error) {
	if mode != "normal" && mode != "advantage" && mode != "disadvantage" {
		return SheetRollResult{}, fmt.Errorf("invalid roll mode")
	}
	member, err := r.isMember(ctx, campaignID, userID)
	if err != nil {
		return SheetRollResult{}, err
	}
	if !member {
		return SheetRollResult{}, ErrForbidden
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, r.pool)
	if err != nil {
		return SheetRollResult{}, err
	}
	character, err := r.getMineWithRules(ctx, campaignID, userID, rules)
	if err != nil {
		return SheetRollResult{}, err
	}
	sheet := character.Sheet
	result := SheetRollResult{Mode: mode}
	switch kind {
	case "skill":
		ability, ok := skills[key]
		if !ok {
			return result, fmt.Errorf("invalid skill")
		}
		result.Label = "Teste de " + key
		result.Modifier = abilityModifier(abilityKey[ability](sheet.AbilityScores), rules)
		if contains(sheet.SkillProficiencies, key) {
			result.Modifier += sheet.ProficiencyBonus
		}
		if contains(sheet.SkillExpertise, key) {
			result.Modifier += sheet.ProficiencyBonus
		}
	case "save":
		get, ok := abilityKey[key]
		if !ok {
			return result, fmt.Errorf("invalid saving throw")
		}
		result.Label = "Resistência de " + key
		result.Modifier = abilityModifier(get(sheet.AbilityScores), rules)
		if contains(sheet.SavingThrows, key) {
			result.Modifier += sheet.ProficiencyBonus
		}
	case "spell":
		ability, ok := spellAbility[canonicalClass(sheet.Class)]
		if !ok {
			return result, fmt.Errorf("character cannot cast spells")
		}
		result.Label = "Ataque mágico"
		result.Modifier = abilityModifier(abilityKey[ability](sheet.AbilityScores), rules) + sheet.ProficiencyBonus
	default:
		return result, fmt.Errorf("invalid sheet roll")
	}
	d20, rollErr := rules.RollD20(systems.D20Mode(mode), result.Modifier, func(sides int) (int, error) {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
		if err != nil {
			return 0, err
		}
		return int(n.Int64()) + 1, nil
	})
	if rollErr != nil {
		return result, rollErr
	}
	result.Dice = d20.Rolls
	result.Kept = d20.Kept
	result.Total = d20.Total
	payload, _ := json.Marshal(map[string]any{"expressao": "1d20", "dados": result.Dice, "dadoEscolhido": result.Kept, "modo": mode, "modificador": result.Modifier, "total": result.Total, "label": result.Label, "text": fmt.Sprintf("%s · %s · dados [%s] · escolhido %d · modificador %+d · resultado %d", result.Label, map[string]string{"normal": "Normal", "advantage": "Vantagem", "disadvantage": "Desvantagem"}[mode], joinDice(result.Dice), result.Kept, result.Modifier, result.Total), "channel": "combat", "sheetRoll": true})
	err = r.pool.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'dice.roll',$3) returning id`, campaignID, userID, payload).Scan(&result.EventID)
	return result, err
}

func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

// setAvailableSpellSlots changes only the remaining count for a level. Maximum
// counts are always recalculated from the stored class and level.
func setAvailableSpellSlots(sheet *Sheet, level, current int) error {
	if current < 0 {
		return ErrInvalidSpellSlot
	}
	slots := dnd2024SpellSlots(sheet.Class, sheet.Level, sheet.SpellSlots)
	for index := range slots {
		if slots[index].Level != level {
			continue
		}
		if current > slots[index].Max {
			return ErrInvalidSpellSlot
		}
		slots[index].Current = current
		sheet.SpellSlots = slots
		return nil
	}
	return ErrInvalidSpellSlot
}
func joinDice(dice []int) string {
	values := make([]string, len(dice))
	for i, die := range dice {
		values[i] = fmt.Sprint(die)
	}
	return strings.Join(values, ", ")
}

// CastSpell locks the character row and consumes a compatible slot together
// with the chat event, preventing duplicate spending from concurrent clients.
func (r *Repository) CastSpell(ctx context.Context, campaignID, userID string, input SpellCastInput) (SpellCastResult, error) {
	if (input.GrantID == "" && input.SpellIndex < 0) || input.SlotLevel < 0 || len(input.GrantID) > 80 || len(input.EntryID) > 120 || (input.PresentationSceneID != "" && !sceneIDPattern.MatchString(input.PresentationSceneID)) {
		return SpellCastResult{}, fmt.Errorf("invalid spell")
	}
	member, err := r.isMember(ctx, campaignID, userID)
	if err != nil || !member {
		return SpellCastResult{}, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return SpellCastResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	characterRules, err := dnd2024RulesForCampaign(ctx, campaignID, tx)
	if err != nil {
		return SpellCastResult{}, err
	}
	var raw []byte
	var characterID string
	if err = tx.QueryRow(ctx, `select id::text,sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character' for update`, campaignID, userID).Scan(&characterID, &raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SpellCastResult{}, ErrNotFound
		}
		return SpellCastResult{}, err
	}
	var sheet Sheet
	if err = json.Unmarshal(raw, &sheet); err != nil {
		return SpellCastResult{}, err
	}
	sheet = normalizeDerivedFields(sheet, characterRules)
	var spell Spell
	var rules map[string]any
	var selectedGrant *FeatSpellGrant
	var selectedCampaignGrant *CampaignFeatSpellGrant
	var campaignGrantRule *compendium.CampaignFeatSpellDefinition
	if input.GrantID != "" {
		if input.EntryID == "" || input.SpellIndex >= 0 {
			return SpellCastResult{}, fmt.Errorf("invalid feat spell cast")
		}
		for i := range sheet.FeatSpellGrants {
			grant := &sheet.FeatSpellGrants[i]
			if grant.ID != input.GrantID || !grant.Active || grant.FeatID != "magic-initiate" {
				continue
			}
			allowed := grant.FirstLevelSpellEntryID == input.EntryID
			for _, cantripID := range grant.CantripEntryIDs {
				allowed = allowed || cantripID == input.EntryID
			}
			if !allowed {
				return SpellCastResult{}, fmt.Errorf("spell is not granted by this feat")
			}
			selectedGrant = grant
			break
		}
		if selectedGrant != nil {
			choice, choiceErr := loadCompendiumSpellChoice(ctx, tx, campaignID, input.EntryID)
			if choiceErr != nil {
				return SpellCastResult{}, choiceErr
			}
			if choiceErr = validateFeatGrantedSpellChoice(*selectedGrant, choice); choiceErr != nil {
				return SpellCastResult{}, choiceErr
			}
			spell = Spell{EntryID: choice.ID, Name: choice.Name, Level: choice.Level, Origin: "feat"}
			rules = choice.Rules
		} else {
			for i := range sheet.CampaignFeatSpellGrants {
				grant := &sheet.CampaignFeatSpellGrants[i]
				if grant.ID == input.GrantID && grant.Active {
					selectedCampaignGrant = grant
					break
				}
			}
			if selectedCampaignGrant == nil {
				return SpellCastResult{}, fmt.Errorf("campaign feat spell grant not found")
			}
			data, ruleErr := loadCampaignFeatSpellRule(ctx, tx, campaignID, selectedCampaignGrant.FeatEntryID)
			if ruleErr != nil || featOccurrenceCountForNames(sheet.Feats, data.Names) == 0 {
				return SpellCastResult{}, fmt.Errorf("campaign feat spell grant is not authorized")
			}
			for i := range data.Rule.Spells {
				if data.Rule.Spells[i].SpellEntryID == input.EntryID {
					campaignGrantRule = &data.Rule.Spells[i]
					break
				}
			}
			if campaignGrantRule == nil {
				return SpellCastResult{}, fmt.Errorf("spell is not granted by this campaign feat")
			}
			if len(campaignGrantRule.AbilityOptions) > 1 && !containsString(campaignGrantRule.AbilityOptions, selectedCampaignGrant.SpellcastingAbilities[input.EntryID]) {
				return SpellCastResult{}, fmt.Errorf("campaign spellcasting ability is invalid")
			}
			choice, choiceErr := loadCompendiumSpellChoice(ctx, tx, campaignID, input.EntryID)
			if choiceErr != nil {
				return SpellCastResult{}, choiceErr
			}
			spell = Spell{EntryID: choice.ID, Name: choice.Name, Level: choice.Level, Origin: "feat"}
			rules = choice.Rules
		}
	} else {
		if input.FreeCast || input.EntryID != "" || input.SpellIndex >= len(sheet.Spells) {
			return SpellCastResult{}, fmt.Errorf("spell not found")
		}
		spell = sheet.Spells[input.SpellIndex]
	}
	slotLevel := input.SlotLevel
	freeCast := input.FreeCast && (selectedGrant != nil || selectedCampaignGrant != nil)
	if input.FreeCast && selectedGrant == nil && selectedCampaignGrant == nil {
		return SpellCastResult{}, fmt.Errorf("free casting requires an authorized feat grant")
	}
	if selectedCampaignGrant != nil {
		remaining := selectedCampaignGrant.FreeCastsRemaining[input.EntryID]
		if freeCast {
			if campaignGrantRule.FreeUses <= 0 || remaining <= 0 || slotLevel != 0 {
				return SpellCastResult{}, fmt.Errorf("no free campaign feat casting available")
			}
			selectedCampaignGrant.FreeCastsRemaining[input.EntryID] = remaining - 1
		} else if spell.Level > 0 {
			if !campaignGrantRule.CanUseExistingSlots || slotLevel < spell.Level {
				return SpellCastResult{}, fmt.Errorf("campaign feat spell cannot use this slot")
			}
			if costErr := consumeSpellSlotForCast(&sheet, spell.Level, slotLevel); costErr != nil {
				return SpellCastResult{}, costErr
			}
		} else if slotLevel != 0 || campaignGrantRule.FreeUses > 0 {
			if campaignGrantRule.FreeUses > 0 {
				return SpellCastResult{}, fmt.Errorf("limited feat cantrip requires its free use")
			}
			if costErr := consumeSpellSlotForCast(&sheet, spell.Level, slotLevel); costErr != nil {
				return SpellCastResult{}, costErr
			}
		}
	} else if freeCast {
		rule := dnd2024FeatSpellRules[selectedGrant.FeatID]
		if spell.Level != rule.FreeCastSpellLevel || selectedGrant.FreeCastsRemaining <= 0 || slotLevel != 0 {
			return SpellCastResult{}, fmt.Errorf("no free feat casting available")
		}
		selectedGrant.FreeCastsRemaining--
	} else {
		if spell.Level > 0 && selectedGrant != nil && !dnd2024FeatSpellRules[selectedGrant.FeatID].CanUseExistingSlots {
			return SpellCastResult{}, fmt.Errorf("this feat spell cannot use existing slots")
		}
		if costErr := consumeSpellSlotForCast(&sheet, spell.Level, slotLevel); costErr != nil {
			return SpellCastResult{}, costErr
		}
	}
	if rules == nil {
		if spell.EntryID == "" {
			var rulesErr error
			rules, rulesErr = customSpellRules(spell)
			if rulesErr != nil {
				return SpellCastResult{}, rulesErr
			}
		} else {
			var rulesRaw []byte
			if err = tx.QueryRow(ctx, `select e.rules from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1 where e.id::text=$2 and s.slug='dnd-srd' and e.entry_type='spell' and e.is_published
				union all select e.rules from compendium_entries e where e.id::text=$2 and e.campaign_id=$1 and e.entry_type='spell' and e.is_published
				union all select e.rules from srd_catalog_entry_aliases a join srd_catalog_entries e on e.id=a.catalog_entry_id where a.campaign_id=$1 and a.legacy_entry_id::text=$2 and e.entry_type='spell' and e.is_published limit 1`, campaignID, spell.EntryID).Scan(&rulesRaw); err != nil {
				return SpellCastResult{}, fmt.Errorf("spell data unavailable")
			}
			if err = json.Unmarshal(rulesRaw, &rules); err != nil {
				return SpellCastResult{}, err
			}
			if baseLevel, ok := rules["level"].(float64); !ok || int(baseLevel) != spell.Level {
				return SpellCastResult{}, fmt.Errorf("spell level does not match compendium data")
			}
		}
	}
	var effect, expression string
	var dice []int
	modifier, total := 0, 0
	if spell.Level > 0 {
		effect = spellEffect(rules, spell.Level, slotLevel)
		if spell.EntryID == "" && slotLevel > spell.Level && strings.TrimSpace(spell.HigherLevels) != "" {
			effect = strings.TrimSpace(effect + " " + strings.TrimSpace(spell.HigherLevels))
		}
		if effect == "" {
			effect = "Efeito não definido."
		}
		expression, dice, modifier, total = rollSpellEffect(rules, spell.Level, slotLevel)
	}
	raw, err = json.Marshal(sheet)
	if err != nil {
		return SpellCastResult{}, err
	}
	if _, err = tx.Exec(ctx, `update actors set sheet=$1 where id=$2`, raw, characterID); err != nil {
		return SpellCastResult{}, err
	}
	castingAbility := ""
	if selectedGrant != nil {
		castingAbility = selectedGrant.Ability
	} else if selectedCampaignGrant != nil {
		castingAbility = selectedCampaignGrant.SpellcastingAbilities[input.EntryID]
	}
	castCost := "nenhum"
	if freeCast {
		remaining := 0
		if selectedGrant != nil {
			remaining = selectedGrant.FreeCastsRemaining
		} else if selectedCampaignGrant != nil {
			remaining = selectedCampaignGrant.FreeCastsRemaining[input.EntryID]
		}
		castCost = fmt.Sprintf("uso gratuito do talento · restantes %d", remaining)
	} else if slotLevel > 0 {
		castCost = fmt.Sprintf("1 espaço de nível %d", slotLevel)
	}
	chatText := fmt.Sprintf("✨ %s · nível base %d · custo: %s · rolagem: %s · resultado: %d · efeito: %s", spell.Name, spell.Level, castCost, expression, total, effect)
	eventType := "dice.roll"
	var payload []byte
	if spell.Level == 0 {
		chatText = fmt.Sprintf("✨ %s conjurou %s · truque · nenhum espaço consumido", sheet.Name, spell.Name)
		eventType = "chat.message"
		payload, _ = json.Marshal(map[string]any{"text": chatText, "channel": "chat", "spellCast": true, "spellName": spell.Name, "baseLevel": 0, "slotLevel": 0})
	} else {
		payload, _ = json.Marshal(map[string]any{"expressao": expression, "dados": dice, "modo": "normal", "modificador": modifier, "total": total, "label": spell.Name, "text": chatText, "channel": "combat", "spellCast": true, "spellName": spell.Name, "baseLevel": spell.Level, "slotLevel": slotLevel, "effect": effect, "spellcastingAbility": castingAbility})
	}
	var eventID int64
	if err = tx.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,$3,$4) returning id`, campaignID, userID, eventType, payload).Scan(&eventID); err != nil {
		return SpellCastResult{}, err
	}
	presentationUpdated := false
	if spell.Level == 0 && input.PresentationSceneID != "" {
		description, _ := rules["description"].(string)
		if strings.TrimSpace(description) == "" {
			description = spell.Description
		}
		if len([]rune(spell.Name)) <= 200 && len([]rune(description)) <= 12_000 {
			presentationResult, presentationErr := tx.Exec(ctx, `insert into scene_presentations(scene_id,campaign_id,asset_path,title,description,visible,visible_user_ids,audience_restricted,overlay_visible)
				select id,campaign_id,'',$3,$4,true,array[]::uuid[],false,false from scenes where id=$1 and campaign_id=$2
				on conflict(scene_id) do update set asset_path='',title=excluded.title,description=excluded.description,visible=true,visible_user_ids=array[]::uuid[],audience_restricted=false,overlay_visible=false,updated_at=now()`, input.PresentationSceneID, campaignID, spell.Name, description)
			if presentationErr != nil {
				return SpellCastResult{}, presentationErr
			}
			presentationUpdated = presentationResult.RowsAffected() == 1
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return SpellCastResult{}, err
	}
	remaining := 0
	if selectedGrant != nil {
		remaining = selectedGrant.FreeCastsRemaining
	} else if selectedCampaignGrant != nil {
		remaining = selectedCampaignGrant.FreeCastsRemaining[input.EntryID]
	}
	return SpellCastResult{EventID: eventID, Sheet: sheet, SpellName: spell.Name, BaseLevel: spell.Level, SlotLevel: slotLevel, Effect: effect, ChatText: chatText, PresentationUpdated: presentationUpdated, Expression: expression, Dice: dice, Modifier: modifier, Total: total, SpellcastingAbility: castingAbility, FreeCastRemaining: remaining}, nil
}

func consumeSpellSlotForCast(sheet *Sheet, spellLevel, slotLevel int) error {
	if spellLevel == 0 {
		if slotLevel != 0 {
			return fmt.Errorf("cantrips do not consume spell slots")
		}
		return nil
	}
	if slotLevel < spellLevel {
		return fmt.Errorf("incompatible spell slot")
	}
	if !consumeCharacterSpellSlot(sheet, slotLevel) {
		return fmt.Errorf("no compatible spell slot")
	}
	return nil
}

func consumeCharacterSpellSlot(sheet *Sheet, slotLevel int) bool {
	for i := range sheet.SpellSlots {
		if sheet.SpellSlots[i].Level == slotLevel && sheet.SpellSlots[i].Current > 0 {
			sheet.SpellSlots[i].Current--
			return true
		}
	}
	return false
}

// customSpellRules derives mechanics exclusively from the custom spell stored
// on the character sheet. The optional upcast model adds a fixed number of
// base-formula dice per slot level above the spell's base level.
func customSpellRules(spell Spell) (map[string]any, error) {
	if spell.ScalingDicePerLevel < 0 || spell.ScalingDicePerLevel > 10 {
		return nil, fmt.Errorf("invalid custom spell scaling")
	}
	rules := map[string]any{"level": float64(spell.Level), "description": spell.Description}
	dice := strings.TrimSpace(spell.DiceFormula)
	if dice == "" {
		if spell.ScalingDicePerLevel != 0 {
			return nil, fmt.Errorf("custom spell scaling requires base damage dice")
		}
		return rules, nil
	}
	match := diceInEffect.FindStringSubmatch(dice)
	if match == nil || strings.TrimSpace(match[0]) != dice {
		return nil, fmt.Errorf("invalid custom spell dice formula")
	}
	count, _ := strconv.Atoi(match[1])
	sides := mustParseDieSides(match[2])
	validSides := map[int]bool{4: true, 6: true, 8: true, 10: true, 12: true, 20: true, 100: true}
	if count < 1 || count > 50 || !validSides[sides] {
		return nil, fmt.Errorf("custom spell dice count is out of range")
	}
	damage := map[string]any{"dice": dice}
	if spell.ScalingDicePerLevel > 0 {
		damage["scalingType"] = "spell-level"
		rules["scalingIncrement"] = float64(spell.ScalingDicePerLevel)
	}
	rules["damage"] = damage
	return rules, nil
}

func mustParseDieSides(value string) int {
	sides, _ := strconv.Atoi(value)
	return sides
}

func spellEffect(rules map[string]any, base, slot int) string {
	description := strings.TrimSpace(fmt.Sprint(rules["description"]))
	if description == "<nil>" {
		description = ""
	}
	expression, original, _, ok := spellExpression(rules, base, slot)
	if !ok || slot <= base || original == "" || !spellScales(rules) {
		return description
	}
	if idx := strings.Index(description, original); idx >= 0 {
		return description[:idx] + expression + description[idx+len(original):]
	}
	return description + " Aumento automático: " + expression + "."
}

func spellScales(rules map[string]any) bool {
	if damage, ok := rules["damage"].(map[string]any); ok {
		return fmt.Sprint(damage["scalingType"]) == "spell-level"
	}
	_, healing := rules["healing"].(string)
	return healing
}

func rollSpellEffect(rules map[string]any, base, slot int) (string, []int, int, int) {
	expression, _, modifier, ok := spellExpression(rules, base, slot)
	if !ok {
		return "", nil, 0, 0
	}
	match := diceInEffect.FindStringSubmatch(expression)
	if match == nil {
		return expression, nil, modifier, modifier
	}
	count, _ := strconv.Atoi(match[1])
	sides, _ := strconv.Atoi(match[2])
	dice := make([]int, count)
	total := modifier
	for i := range dice {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
		if err != nil {
			return expression, nil, modifier, 0
		}
		dice[i] = int(n.Int64()) + 1
		total += dice[i]
	}
	return expression, dice, modifier, total
}

func spellExpression(rules map[string]any, base, slot int) (string, string, int, bool) {
	if slot < base {
		return "", "", 0, false
	}
	diceExpression := ""
	scaling := false
	if damage, ok := rules["damage"].(map[string]any); ok {
		diceExpression = strings.TrimSpace(fmt.Sprint(damage["dice"]))
		scaling = fmt.Sprint(damage["scalingType"]) == "spell-level"
	} else if healing, ok := rules["healing"].(string); ok {
		diceExpression = strings.TrimSpace(healing)
		scaling = true
	}
	match := diceInEffect.FindStringSubmatch(diceExpression)
	if match == nil {
		return "", "", 0, false
	}
	count, _ := strconv.Atoi(match[1])
	sides := match[2]
	modifier, _ := strconv.Atoi(match[4])
	if match[3] == "-" {
		modifier = -modifier
	}
	instances := 1
	if damage, ok := rules["damage"].(map[string]any); ok {
		if value, ok := damage["instances"].(float64); ok && value > 0 {
			instances = int(value)
		}
	}
	if scaling && slot > base {
		if damage, ok := rules["damage"].(map[string]any); ok {
			if value, ok := damage["scalingInstances"].(float64); ok && value > 0 {
				instances += (slot - base) * int(value)
			}
		}
		if instances == 1 {
			increment := 1
			if value, ok := rules["scalingIncrement"].(float64); ok && value > 0 {
				increment = int(value)
			}
			count += (slot - base) * increment
		}
	}
	modifier *= instances
	count *= instances
	expression := fmt.Sprintf("%dd%s", count, sides)
	if modifier > 0 {
		expression += fmt.Sprintf("+%d", modifier)
	} else if modifier < 0 {
		expression += fmt.Sprintf("%d", modifier)
	}
	return expression, match[0], modifier, true
}

func (r *Repository) isMember(ctx context.Context, campaignID, userID string) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, userID).Scan(&ok)
	return ok, err
}

func (r *Repository) GetMine(ctx context.Context, campaignID, userID string) (Character, error) {
	ok, err := r.isMember(ctx, campaignID, userID)
	if err != nil {
		return Character{}, err
	}
	if !ok {
		return Character{}, ErrForbidden
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, r.pool)
	if err != nil {
		return Character{}, err
	}
	return r.getMineWithRules(ctx, campaignID, userID, rules)
}

func (r *Repository) getMineWithRules(ctx context.Context, campaignID, userID string, rules systems.Dnd2024CharacterRules) (Character, error) {
	var item Character
	var raw []byte
	err := r.pool.QueryRow(ctx, `select id::text,campaign_id::text,owner_id::text,sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character'`, campaignID, userID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("get character: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	item.Sheet = normalizeDerivedFields(item.Sheet, rules)
	return item, nil
}

func (r *Repository) SaveMine(ctx context.Context, campaignID, userID string, sheet Sheet) (Character, error) {
	ok, err := r.isMember(ctx, campaignID, userID)
	if err != nil {
		return Character{}, err
	}
	if !ok {
		return Character{}, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Character{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, tx)
	if err != nil {
		return Character{}, err
	}
	var previous Sheet
	var previousRaw []byte
	previousErr := tx.QueryRow(ctx, `select sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character' for update`, campaignID, userID).Scan(&previousRaw)
	if previousErr != nil && !errors.Is(previousErr, pgx.ErrNoRows) {
		return Character{}, previousErr
	}
	if previousErr == nil {
		if err := json.Unmarshal(previousRaw, &previous); err != nil {
			return Character{}, err
		}
	}
	sheet.FeatSpellGrants, err = reconcileFeatSpellGrants(ctx, tx, campaignID, sheet, previous)
	if err != nil {
		return Character{}, fmt.Errorf("validate feat spell grants: %w", err)
	}
	sheet.CampaignFeatSpellGrants, err = reconcileCampaignFeatSpellGrants(ctx, tx, campaignID, sheet, previous)
	if err != nil {
		return Character{}, fmt.Errorf("validate campaign feat spell grants: %w", err)
	}
	sheet.SpellSlots = dnd2024SpellSlots(sheet.Class, sheet.Level, previous.SpellSlots)
	sheet = normalizeDerivedFields(sheet, rules)
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = tx.QueryRow(ctx, `
		insert into actors(campaign_id,owner_id,kind,name,sheet)
		values($1,$2,'character',$3,$4)
		on conflict (campaign_id,owner_id) where kind='character'
		do update set name=excluded.name,sheet=jsonb_set(excluded.sheet,'{initiativeAdvantage}',coalesce(actors.sheet->'initiativeAdvantage','false'::jsonb),true)
		returning id::text,campaign_id::text,owner_id::text,sheet`, campaignID, userID, sheet.Name, raw).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if err != nil {
		return Character{}, fmt.Errorf("save character: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	item.Sheet = normalizeDerivedFields(item.Sheet, rules)
	if err := tx.Commit(ctx); err != nil {
		return Character{}, err
	}
	if err := r.syncSceneTokens(ctx, item.ID, item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

// GetForGM lets the campaign narrator or the sheet owner open a character linked
// to the campaign. Other players cannot read another player's sheet.
func (r *Repository) GetForGM(ctx context.Context, campaignID, characterID, userID string) (Character, error) {
	var item Character
	var raw []byte
	err := r.pool.QueryRow(ctx, `select id::text,campaign_id::text,coalesce(owner_id::text,''),sheet from actors where id=$1 and campaign_id=$2 and kind='character'`, characterID, campaignID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("get character for gm: %w", err)
	}
	var ownerID *string
	if item.OwnerID != "" {
		ownerID = &item.OwnerID
	}
	if err := r.authorizeCharacterWrite(ctx, campaignID, ownerID, userID); err != nil {
		return Character{}, err
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, r.pool)
	if err != nil {
		return Character{}, err
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	item.Sheet = normalizeDerivedFields(item.Sheet, rules)
	return item, nil
}

// SaveForGM allows the owner to edit their own linked sheet and the GM to
// administer any sheet in the campaign. The owner check is campaign-scoped.
func (r *Repository) SaveForGM(ctx context.Context, campaignID, characterID, userID string, sheet Sheet) (Character, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Character{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var currentOwnerID *string
	var previousRaw []byte
	err = tx.QueryRow(ctx, `select owner_id::text,sheet from actors where id=$1 and campaign_id=$2 and kind='character' for update`, characterID, campaignID).Scan(&currentOwnerID, &previousRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, err
	}
	if err := r.authorizeCharacterWrite(ctx, campaignID, currentOwnerID, userID); err != nil {
		return Character{}, err
	}
	var previous Sheet
	if err := json.Unmarshal(previousRaw, &previous); err != nil {
		return Character{}, err
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, tx)
	if err != nil {
		return Character{}, err
	}
	sheet.FeatSpellGrants, err = reconcileFeatSpellGrants(ctx, tx, campaignID, sheet, previous)
	if err != nil {
		return Character{}, fmt.Errorf("validate feat spell grants: %w", err)
	}
	sheet.CampaignFeatSpellGrants, err = reconcileCampaignFeatSpellGrants(ctx, tx, campaignID, sheet, previous)
	if err != nil {
		return Character{}, fmt.Errorf("validate campaign feat spell grants: %w", err)
	}
	sheet.SpellSlots = dnd2024SpellSlots(sheet.Class, sheet.Level, previous.SpellSlots)
	sheet = normalizeDerivedFields(sheet, rules)
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = tx.QueryRow(ctx, `update actors set name=$1,sheet=jsonb_set($2::jsonb,'{initiativeAdvantage}',coalesce(actors.sheet->'initiativeAdvantage','false'::jsonb),true) where id=$3 and campaign_id=$4 and owner_id is not distinct from $5::uuid and kind='character' returning id::text,campaign_id::text,owner_id::text,sheet`, sheet.Name, raw, characterID, campaignID, currentOwnerID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("save character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	item.Sheet = normalizeDerivedFields(item.Sheet, rules)
	if err := tx.Commit(ctx); err != nil {
		return Character{}, err
	}
	if err := r.syncSceneTokens(ctx, item.ID, item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

func (r *Repository) authorizeCharacterWrite(ctx context.Context, campaignID string, ownerID *string, userID string) error {
	isGM := r.requireGM(ctx, campaignID, userID) == nil
	isOwner := ownerID != nil && *ownerID == userID
	isMember := false
	if !isGM && isOwner {
		member, err := r.isMember(ctx, campaignID, userID)
		if err != nil {
			return err
		}
		isMember = member
	}
	if !characterAccessAllowed(isGM, isMember, isOwner) {
		return ErrForbidden
	}
	return nil
}

func characterAccessAllowed(isGM, isMember, isOwner bool) bool {
	return isGM || (isMember && isOwner)
}

// SetInitiativeAdvantage manages a one-use initiative preference independently
// from ordinary sheet saves, so stale editors cannot accidentally re-arm it.
func (r *Repository) SetInitiativeAdvantage(ctx context.Context, campaignID, characterID, userID string, enabled bool) error {
	var ownerID *string
	err := r.pool.QueryRow(ctx, `select owner_id::text from actors where id=$1 and campaign_id=$2 and kind='character'`, characterID, campaignID).Scan(&ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := r.authorizeCharacterWrite(ctx, campaignID, ownerID, userID); err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `update actors set sheet=jsonb_set(sheet,'{initiativeAdvantage}',to_jsonb($1::boolean),true) where id=$2 and campaign_id=$3 and owner_id is not distinct from $4::uuid and kind='character'`, enabled, characterID, campaignID, ownerID)
	return err
}

// SetAvailableSpellSlotsForGM gives the narrator direct control over remaining
// slots while keeping progression-derived maximums server-owned.
func (r *Repository) SetAvailableSpellSlotsForGM(ctx context.Context, campaignID, characterID, userID string, level, current int) (Character, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Character{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var role string
	if err := tx.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2 for share`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return Character{}, ErrForbidden
	}

	var item Character
	var raw []byte
	if err := tx.QueryRow(ctx, `select id::text,campaign_id::text,coalesce(owner_id::text,''),sheet from actors where id=$1 and campaign_id=$2 and kind='character' for update`, characterID, campaignID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw); errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	} else if err != nil {
		return Character{}, err
	}

	if _, err := dnd2024RulesForCampaign(ctx, campaignID, tx); err != nil {
		return Character{}, err
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	if err := setAvailableSpellSlots(&item.Sheet, level, current); err != nil {
		return Character{}, err
	}
	raw, err = json.Marshal(item.Sheet)
	if err != nil {
		return Character{}, err
	}
	if err := tx.QueryRow(ctx, `update actors set sheet=$1::jsonb where id=$2 and campaign_id=$3 and kind='character' returning sheet`, raw, characterID, campaignID).Scan(&raw); err != nil {
		return Character{}, err
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Character{}, err
	}
	return item, nil
}
func (r *Repository) DeleteForGM(ctx context.Context, campaignID, characterID, userID string) error {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return err
	}
	if _, err := r.pool.Exec(ctx, `delete from scene_tokens where actor_id=$1`, characterID); err != nil {
		return err
	}
	result, err := r.pool.Exec(ctx, `delete from actors where id=$1 and campaign_id=$2 and kind='character'`, characterID, campaignID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Tokens linked to a character are instances for position and conditions, but
// their sheet-derived combat numbers must follow the character sheet.
func (r *Repository) syncSceneTokens(ctx context.Context, actorID string, sheet Sheet) error {
	portrait := sheet.TokenPortraitPath
	if strings.TrimSpace(portrait) == "" {
		portrait = sheet.PortraitPath
	}
	_, err := r.pool.Exec(ctx, `update scene_tokens set name=$1,hp_current=$2,hp_max=$3,armor_class=$4,initiative_bonus=$5,movement_limit=$6,image_url=nullif($7,''),updated_at=now() where actor_id=$8`, sheet.Name, sheet.HitPointsCurrent, sheet.HitPointsMax, sheet.ArmorClass, sheet.Initiative, MovementLimitSquares(sheet.Speed), portrait, actorID)
	if err != nil {
		return fmt.Errorf("sync character tokens: %w", err)
	}
	return nil
}

// CreateForGM creates the one character slot assigned to a campaign member.
// It is useful when the GM is preparing a sheet with the player at the table.
func (r *Repository) CreateForGM(ctx context.Context, campaignID, ownerID, userID string) (Character, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Character{}, err
	}
	var member bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, ownerID).Scan(&member); err != nil || !member {
		return Character{}, ErrForbidden
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, r.pool)
	if err != nil {
		return Character{}, err
	}
	sheet := normalizeDerivedFields(Sheet{Name: "Novo personagem", Level: 1, AbilityScores: AbilityScores{Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10}, ProficiencyBonus: 2, ArmorClass: 10, Speed: 9, HitPointsCurrent: 10, HitPointsMax: 10, HitDice: "1d8", PassivePerception: 10, Attacks: []Attack{}, Spells: []Spell{}, Inventory: []InventoryItem{}, SavingThrows: []string{}, SkillProficiencies: []string{}}, rules)
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character',$3,$4) returning id::text,campaign_id::text,owner_id::text,sheet`, campaignID, ownerID, sheet.Name, raw).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if err != nil {
		return Character{}, fmt.Errorf("create character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

func (r *Repository) requireGM(ctx context.Context, campaignID, userID string) error {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return ErrForbidden
	}
	return nil
}

// ListForGM exposes only enough sheet data for table management. It is intentionally
// restricted to the campaign GM; players continue using GetMine for their own sheet.
func (r *Repository) ListForGM(ctx context.Context, campaignID, userID string) ([]Participant, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return nil, ErrForbidden
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, r.pool)
	if err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `select m.user_id::text,p.display_name,m.role::text,a.id::text,a.owner_id::text,a.sheet from campaign_members m join profiles p on p.id=m.user_id left join actors a on a.campaign_id=m.campaign_id and a.owner_id=m.user_id and a.kind='character' where m.campaign_id=$1 order by m.joined_at`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Participant{}
	for rows.Next() {
		var item Participant
		var characterID, ownerID *string
		var raw []byte
		if err := rows.Scan(&item.UserID, &item.DisplayName, &item.Role, &characterID, &ownerID, &raw); err != nil {
			return nil, err
		}
		if characterID != nil {
			character := Character{ID: *characterID, CampaignID: campaignID, OwnerID: *ownerID}
			if err := json.Unmarshal(raw, &character.Sheet); err != nil {
				return nil, fmt.Errorf("decode participant sheet: %w", err)
			}
			character.Sheet = normalizeDerivedFields(character.Sheet, rules)
			item.Character = &character
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
