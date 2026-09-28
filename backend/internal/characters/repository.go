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
	"vtt-backend/internal/systems"
)

var (
	ErrForbidden   = errors.New("forbidden")
	ErrNotFound    = errors.New("character not found")
	ErrNoHitDice   = errors.New("no hit dice available")
	ErrInvalidRest = errors.New("invalid rest")
)

// Sheet deliberately stores the D&D 2024 MVP without rules text from the books.
// Features, attacks and spells are user-authored notes, allowing the sheet to stay
// compact while still retaining the practical information used at the table.
type Sheet struct {
	Name                  string          `json:"name"`
	PortraitPath          string          `json:"portraitPath"`
	TokenPortraitPath     string          `json:"tokenPortraitPath"`
	Class                 string          `json:"class"`
	Subclass              string          `json:"subclass"`
	Level                 int             `json:"level"`
	Species               string          `json:"species"`
	SpeciesLineage        string          `json:"speciesLineage"`
	Background            string          `json:"background"`
	Alignment             string          `json:"alignment"`
	AbilityScores         AbilityScores   `json:"abilityScores"`
	ProficiencyBonus      int             `json:"proficiencyBonus"`
	SavingThrows          []string        `json:"savingThrows"`
	SkillProficiencies    []string        `json:"skillProficiencies"`
	SkillExpertise        []string        `json:"skillExpertise"`
	ArmorClass            int             `json:"armorClass"`
	Initiative            int             `json:"initiative"`
	InitiativeAdvantage   bool            `json:"initiativeAdvantage"`
	Speed                 int             `json:"speed"`
	HitPointsCurrent      int             `json:"hitPointsCurrent"`
	HitPointsMax          int             `json:"hitPointsMax"`
	TemporaryHP           int             `json:"temporaryHP"`
	HitDice               string          `json:"hitDice"`
	HitDiceSpent          int             `json:"hitDiceSpent"`
	PassivePerception     int             `json:"passivePerception"`
	Attacks               []Attack        `json:"attacks"`
	Spells                []Spell         `json:"spells"`
	SpellcastingOverride  bool            `json:"spellcastingOverride"`
	Features              string          `json:"features"`
	Feats                 string          `json:"feats"`
	Equipment             string          `json:"equipment"`
	Inventory             []InventoryItem `json:"inventory"`
	Resources             []Resource      `json:"resources"`
	SpellSlots            []SpellSlot     `json:"spellSlots"`
	VisibleRolls          []string        `json:"visibleRolls"`
	Resistances           []string        `json:"resistances,omitempty"`
	AutomaticTraits       []string        `json:"automaticTraits,omitempty"`
	SpeciesHPBonusApplied int             `json:"speciesHPBonusApplied,omitempty"`
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
	Mode     string `json:"modo"`
	Modifier int    `json:"modificador"`
	Total    int    `json:"total"`
	Label    string `json:"label"`
}
type SpellCastResult struct {
	EventID    int64  `json:"eventId"`
	Sheet      Sheet  `json:"sheet"`
	SpellName  string `json:"spellName"`
	BaseLevel  int    `json:"baseLevel"`
	SlotLevel  int    `json:"slotLevel"`
	Effect     string `json:"effect"`
	Expression string `json:"expression,omitempty"`
	Dice       []int  `json:"dados,omitempty"`
	Modifier   int    `json:"modificador,omitempty"`
	Total      int    `json:"total,omitempty"`
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

func abilityModifier(score int) int {
	return systems.DefaultCharacterRules().AbilityModifier(score)
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
	character, err := r.GetMine(ctx, campaignID, userID)
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
		result.Modifier = abilityModifier(abilityKey[ability](sheet.AbilityScores))
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
		result.Modifier = abilityModifier(get(sheet.AbilityScores))
		if contains(sheet.SavingThrows, key) {
			result.Modifier += sheet.ProficiencyBonus
		}
	case "spell":
		ability, ok := spellAbility[canonicalClass(sheet.Class)]
		if !ok {
			return result, fmt.Errorf("character cannot cast spells")
		}
		result.Label = "Ataque mágico"
		result.Modifier = abilityModifier(abilityKey[ability](sheet.AbilityScores)) + sheet.ProficiencyBonus
	default:
		return result, fmt.Errorf("invalid sheet roll")
	}
	d20, rollErr := systems.DefaultCharacterRules().RollD20(systems.D20Mode(mode), result.Modifier, func(sides int) (int, error) {
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
	result.Total = d20.Total
	payload, _ := json.Marshal(map[string]any{"expressao": "1d20", "dados": result.Dice, "modo": mode, "modificador": result.Modifier, "total": result.Total, "label": result.Label, "text": fmt.Sprintf("%s · %s · dados [%s] · modificador %+d · resultado %d", result.Label, map[string]string{"normal": "Normal", "advantage": "Vantagem", "disadvantage": "Desvantagem"}[mode], joinDice(result.Dice), result.Modifier, result.Total), "channel": "combat", "sheetRoll": true})
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
func joinDice(dice []int) string {
	values := make([]string, len(dice))
	for i, die := range dice {
		values[i] = fmt.Sprint(die)
	}
	return strings.Join(values, ", ")
}

// CastSpell locks the character row and consumes a compatible slot together
// with the chat event, preventing duplicate spending from concurrent clients.
func (r *Repository) CastSpell(ctx context.Context, campaignID, userID string, spellIndex, slotLevel int) (SpellCastResult, error) {
	if spellIndex < 0 || slotLevel < 0 {
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
	sheet = normalizeDerivedFields(sheet)
	if spellIndex >= len(sheet.Spells) {
		return SpellCastResult{}, fmt.Errorf("spell not found")
	}
	spell := sheet.Spells[spellIndex]
	if spell.Level > 0 {
		if slotLevel < spell.Level {
			return SpellCastResult{}, fmt.Errorf("incompatible spell slot")
		}
		found := false
		for i := range sheet.SpellSlots {
			if sheet.SpellSlots[i].Level == slotLevel && sheet.SpellSlots[i].Current > 0 {
				sheet.SpellSlots[i].Current--
				found = true
				break
			}
		}
		if !found {
			return SpellCastResult{}, fmt.Errorf("no compatible spell slot")
		}
	} else if slotLevel != 0 {
		return SpellCastResult{}, fmt.Errorf("cantrips do not consume spell slots")
	}
	var rules map[string]any
	if spell.EntryID == "" {
		var rulesErr error
		rules, rulesErr = customSpellRules(spell)
		if rulesErr != nil {
			return SpellCastResult{}, rulesErr
		}
	} else {
		var rulesRaw []byte
		if err = tx.QueryRow(ctx, `select rules from compendium_entries where id=$1 and campaign_id=$2 and entry_type='spell' and is_published=true`, spell.EntryID, campaignID).Scan(&rulesRaw); err != nil {
			return SpellCastResult{}, fmt.Errorf("spell data unavailable")
		}
		if err = json.Unmarshal(rulesRaw, &rules); err != nil {
			return SpellCastResult{}, err
		}
		if baseLevel, ok := rules["level"].(float64); !ok || int(baseLevel) != spell.Level {
			return SpellCastResult{}, fmt.Errorf("spell level does not match compendium data")
		}
	}
	effect := spellEffect(rules, spell.Level, slotLevel)
	if spell.EntryID == "" && slotLevel > spell.Level && strings.TrimSpace(spell.HigherLevels) != "" {
		effect = strings.TrimSpace(effect + " " + strings.TrimSpace(spell.HigherLevels))
	}
	if effect == "" {
		effect = "Efeito não definido."
	}
	expression, dice, modifier, total := rollSpellEffect(rules, spell.Level, slotLevel)
	raw, err = json.Marshal(sheet)
	if err != nil {
		return SpellCastResult{}, err
	}
	if _, err = tx.Exec(ctx, `update actors set sheet=$1 where id=$2`, raw, characterID); err != nil {
		return SpellCastResult{}, err
	}
	payload, _ := json.Marshal(map[string]any{"expressao": expression, "dados": dice, "modo": "normal", "modificador": modifier, "total": total, "label": spell.Name, "text": fmt.Sprintf("✨ %s · nível base %d · espaço usado %d · custo: %s · rolagem: %s · resultado: %d · efeito: %s", spell.Name, spell.Level, slotLevel, func() string {
		if slotLevel == 0 {
			return "nenhum"
		}
		return fmt.Sprintf("1 espaço de nível %d", slotLevel)
	}(), expression, total, effect), "channel": "combat", "spellCast": true, "spellName": spell.Name, "baseLevel": spell.Level, "slotLevel": slotLevel, "effect": effect})
	var eventID int64
	if err = tx.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'dice.roll',$3) returning id`, campaignID, userID, payload).Scan(&eventID); err != nil {
		return SpellCastResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SpellCastResult{}, err
	}
	return SpellCastResult{EventID: eventID, Sheet: sheet, SpellName: spell.Name, BaseLevel: spell.Level, SlotLevel: slotLevel, Effect: effect, Expression: expression, Dice: dice, Modifier: modifier, Total: total}, nil
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
	var item Character
	var raw []byte
	err = r.pool.QueryRow(ctx, `select id::text,campaign_id::text,owner_id::text,sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character'`, campaignID, userID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("get character: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	item.Sheet = normalizeDerivedFields(item.Sheet)
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
	sheet = normalizeDerivedFields(sheet)
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `
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
	item.Sheet = normalizeDerivedFields(item.Sheet)
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
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	item.Sheet = normalizeDerivedFields(item.Sheet)
	return item, nil
}

// SaveForGM allows the owner to edit their own linked sheet and the GM to
// administer any sheet in the campaign. The owner check is campaign-scoped.
func (r *Repository) SaveForGM(ctx context.Context, campaignID, characterID, userID string, sheet Sheet) (Character, error) {
	var currentOwnerID *string
	err := r.pool.QueryRow(ctx, `select owner_id::text from actors where id=$1 and campaign_id=$2 and kind='character'`, characterID, campaignID).Scan(&currentOwnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, err
	}
	if err := r.authorizeCharacterWrite(ctx, campaignID, currentOwnerID, userID); err != nil {
		return Character{}, err
	}
	sheet = normalizeDerivedFields(sheet)
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `update actors set name=$1,sheet=jsonb_set($2::jsonb,'{initiativeAdvantage}',coalesce(actors.sheet->'initiativeAdvantage','false'::jsonb),true) where id=$3 and campaign_id=$4 and owner_id is not distinct from $5::uuid and kind='character' returning id::text,campaign_id::text,owner_id::text,sheet`, sheet.Name, raw, characterID, campaignID, currentOwnerID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("save character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	item.Sheet = normalizeDerivedFields(item.Sheet)
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
	_, err := r.pool.Exec(ctx, `update scene_tokens set name=$1,hp_current=$2,hp_max=$3,armor_class=$4,initiative_bonus=$5,image_url=nullif($6,''),updated_at=now() where actor_id=$7`, sheet.Name, sheet.HitPointsCurrent, sheet.HitPointsMax, sheet.ArmorClass, sheet.Initiative, portrait, actorID)
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
	sheet := normalizeDerivedFields(Sheet{Name: "Novo personagem", Level: 1, AbilityScores: AbilityScores{Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10}, ProficiencyBonus: 2, ArmorClass: 10, Speed: 9, HitPointsCurrent: 10, HitPointsMax: 10, HitDice: "1d8", PassivePerception: 10, Attacks: []Attack{}, Spells: []Spell{}, Inventory: []InventoryItem{}, SavingThrows: []string{}, SkillProficiencies: []string{}})
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
			character.Sheet = normalizeDerivedFields(character.Sheet)
			item.Character = &character
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
