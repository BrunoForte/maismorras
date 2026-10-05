package characters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// These are the only D&D 2024 SRD feats currently curated to grant specific
// spells. Additions require reviewing the feat rule and its choices here and
// in frontend/src/lib/data/dnd2024FeatSpells.ts; free-use mechanics stay server-side.
type dnd2024FeatSpellRule struct {
	ID                  string
	Names               []string
	AllowedSpellLists   map[string]bool
	Cantrips            int
	LeveledSpell        int
	FreeCasts           int
	FreeCastSpellLevel  int
	CanUseExistingSlots bool
	Recovery            string
}

var dnd2024FeatSpellRules = map[string]dnd2024FeatSpellRule{
	"magic-initiate": {
		ID: "magic-initiate", Names: []string{"magic initiate", "iniciado em magia"},
		AllowedSpellLists: map[string]bool{"bard": true, "cleric": true, "druid": true, "sorcerer": true, "warlock": true, "wizard": true},
		Cantrips:          2, LeveledSpell: 1, FreeCasts: 1, FreeCastSpellLevel: 1,
		CanUseExistingSlots: true, Recovery: "long",
	},
}

type compendiumSpellChoice struct {
	ID      string
	Name    string
	Level   int
	Classes []string
	Rules   map[string]any
}

func validateFeatGrantedSpellChoice(grant FeatSpellGrant, choice compendiumSpellChoice) error {
	rule, ok := dnd2024FeatSpellRules[grant.FeatID]
	if !ok || !rule.AllowedSpellLists[canonicalClass(grant.SpellList)] {
		return fmt.Errorf("unsupported feat spell grant")
	}
	wantLevel := 0
	if choice.ID == grant.FirstLevelSpellEntryID {
		wantLevel = rule.LeveledSpell
	} else if !containsString(grant.CantripEntryIDs, choice.ID) {
		return fmt.Errorf("spell is not granted by this feat")
	}
	if choice.Level != wantLevel || !spellBelongsToList(choice.Classes, canonicalClass(grant.SpellList)) {
		return fmt.Errorf("feat spell choice no longer matches its curated rule")
	}
	return nil
}

func containsString(values []string, candidate string) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}
	return false
}

func normalizeDndFeatName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}

func featOccurrenceCount(feats string, names []string) int {
	allowed := make(map[string]bool, len(names))
	for _, name := range names {
		allowed[normalizeDndFeatName(name)] = true
	}
	count := 0
	for _, feat := range strings.FieldsFunc(feats, func(r rune) bool { return r == '\n' || r == ',' }) {
		if allowed[normalizeDndFeatName(feat)] {
			count++
		}
	}
	return count
}

// reconcileFeatSpellGrants validates player choices against published campaign
// compendium data, ignores client usage counters, and preserves spent uses even
// if a client edits grant identifiers or temporarily removes a mapping.
func reconcileFeatSpellGrants(ctx context.Context, queryer campaignReferenceQuerier, campaignID string, sheet Sheet, previous Sheet) ([]FeatSpellGrant, error) {
	requested := sheet.FeatSpellGrants
	previousByID := make(map[string]FeatSpellGrant, len(previous.FeatSpellGrants))
	previousByFeat := make(map[string][]FeatSpellGrant)
	for _, grant := range previous.FeatSpellGrants {
		previousByID[grant.ID] = grant
		previousByFeat[grant.FeatID] = append(previousByFeat[grant.FeatID], grant)
	}
	usedPrevious := map[string]bool{}
	seenIDs := map[string]bool{}
	seenSpellLists := map[string]map[string]bool{}
	active := make([]FeatSpellGrant, 0, len(requested))
	requestedByFeat := map[string]int{}
	for _, input := range requested {
		rule, ok := dnd2024FeatSpellRules[input.FeatID]
		if !ok || input.FeatID != rule.ID {
			return nil, fmt.Errorf("unsupported D&D 2024 feat spell grant")
		}
		requestedByFeat[input.FeatID]++
		if len(input.ID) < 1 || len(input.ID) > 80 || seenIDs[input.ID] || requestedByFeat[input.FeatID] > featOccurrenceCount(sheet.Feats, rule.Names) {
			return nil, fmt.Errorf("feat granting these spells is not on the sheet")
		}
		seenIDs[input.ID] = true
		if !rule.AllowedSpellLists[canonicalClass(input.SpellList)] || !allowedFeatSpellAbility(input.Ability) {
			return nil, fmt.Errorf("invalid feat spell list or ability")
		}
		spellList := canonicalClass(input.SpellList)
		if seenSpellLists[input.FeatID] == nil {
			seenSpellLists[input.FeatID] = map[string]bool{}
		}
		if seenSpellLists[input.FeatID][spellList] {
			return nil, fmt.Errorf("repeatable feat requires a different spell list")
		}
		seenSpellLists[input.FeatID][spellList] = true
		if len(input.CantripEntryIDs) != rule.Cantrips || input.FirstLevelSpellEntryID == "" {
			return nil, fmt.Errorf("incomplete feat spell choices")
		}
		choiceIDs := append(append([]string{}, input.CantripEntryIDs...), input.FirstLevelSpellEntryID)
		seen := map[string]bool{}
		for index, entryID := range choiceIDs {
			if entryID == "" || seen[entryID] {
				return nil, fmt.Errorf("duplicate or empty feat spell choice")
			}
			seen[entryID] = true
			choice, err := loadCompendiumSpellChoice(ctx, queryer, campaignID, entryID)
			if err != nil {
				return nil, err
			}
			wantLevel := 0
			if index >= rule.Cantrips {
				wantLevel = rule.LeveledSpell
			}
			if choice.Level != wantLevel || !spellBelongsToList(choice.Classes, canonicalClass(input.SpellList)) {
				return nil, fmt.Errorf("feat spell choice does not match its level and spell list")
			}
		}
		grant := FeatSpellGrant{
			ID: input.ID, FeatID: input.FeatID, SpellList: spellList,
			Ability: input.Ability, CantripEntryIDs: append([]string{}, input.CantripEntryIDs...),
			FirstLevelSpellEntryID: input.FirstLevelSpellEntryID, Active: true,
			FreeCastsRemaining: rule.FreeCasts,
		}
		if old, ok := previousByID[input.ID]; ok && old.FeatID == input.FeatID && !usedPrevious[old.ID] {
			grant.ID = old.ID
			grant.FreeCastsRemaining = clampFreeUses(old.FreeCastsRemaining, rule.FreeCasts)
			usedPrevious[old.ID] = true
		} else {
			// Re-identifying an existing mapping does not restore its charge.
			for _, old := range previousByFeat[input.FeatID] {
				if usedPrevious[old.ID] {
					continue
				}
				grant.ID = old.ID
				grant.FreeCastsRemaining = clampFreeUses(old.FreeCastsRemaining, rule.FreeCasts)
				usedPrevious[old.ID] = true
				break
			}
		}
		active = append(active, grant)
	}
	if len(active) > 20 {
		return nil, fmt.Errorf("too many feat spell grants")
	}
	// Keep inactive records as server-owned usage history so deleting/re-adding a
	// feat mapping through the sheet editor cannot refresh an expended free cast.
	for _, old := range previous.FeatSpellGrants {
		if usedPrevious[old.ID] {
			continue
		}
		old.Active = false
		if rule, ok := dnd2024FeatSpellRules[old.FeatID]; ok {
			old.FreeCastsRemaining = clampFreeUses(old.FreeCastsRemaining, rule.FreeCasts)
		}
		active = append(active, old)
	}
	if len(active) > 40 {
		return nil, fmt.Errorf("too many historical feat spell grants")
	}
	return active, nil
}

func clampFreeUses(current, maximum int) int {
	if current < 0 {
		return 0
	}
	if current > maximum {
		return maximum
	}
	return current
}

func allowedFeatSpellAbility(ability string) bool {
	switch ability {
	case "intelligence", "wisdom", "charisma":
		return true
	default:
		return false
	}
}

func loadCompendiumSpellChoice(ctx context.Context, queryer campaignReferenceQuerier, campaignID, entryID string) (compendiumSpellChoice, error) {
	var choice compendiumSpellChoice
	var raw []byte
	err := queryer.QueryRow(ctx, `select id::text,name,rules from compendium_entries where id=$1 and campaign_id=$2 and entry_type='spell' and is_published=true`, entryID, campaignID).Scan(&choice.ID, &choice.Name, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return compendiumSpellChoice{}, fmt.Errorf("feat spell is not available in this campaign")
	}
	if err != nil {
		return compendiumSpellChoice{}, err
	}
	if err := json.Unmarshal(raw, &choice.Rules); err != nil {
		return compendiumSpellChoice{}, err
	}
	level, ok := choice.Rules["level"].(float64)
	if !ok || level < 0 || level > 9 || level != float64(int(level)) {
		return compendiumSpellChoice{}, fmt.Errorf("invalid compendium spell level")
	}
	choice.Level = int(level)
	if classes, ok := choice.Rules["classes"].([]any); ok {
		for _, className := range classes {
			if class, ok := className.(string); ok {
				choice.Classes = append(choice.Classes, canonicalClass(class))
			}
		}
	}
	return choice, nil
}

func spellBelongsToList(classes []string, spellList string) bool {
	for _, class := range classes {
		if canonicalClass(class) == spellList {
			return true
		}
	}
	return false
}
