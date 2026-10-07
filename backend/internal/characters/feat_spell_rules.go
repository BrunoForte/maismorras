package characters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"vtt-backend/internal/compendium"
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

type campaignFeatRuleData struct {
	Name  string
	Names []string
	Rule  compendium.CampaignFeatSpellRule
}

func loadCampaignFeatSpellRule(ctx context.Context, queryer campaignReferenceQuerier, campaignID, featEntryID string) (campaignFeatRuleData, error) {
	var data campaignFeatRuleData
	var translationsRaw, rulesRaw []byte
	err := queryer.QueryRow(ctx, `select name,translations,rules from compendium_entries where id=$1 and campaign_id=$2 and entry_type='feat' and is_published=true`, featEntryID, campaignID).Scan(&data.Name, &translationsRaw, &rulesRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		var overrideRaw []byte
		err = queryer.QueryRow(ctx, `select e.name,e.translations,e.rules,o.rules->'featSpellGrant'
			from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$2
			left join campaign_srd_entry_overrides o on o.catalog_entry_id=e.id and o.campaign_id=$2
			where e.id::text=$1 and s.slug='dnd-srd' and e.entry_type='feat' and e.is_published
			union all select e.name,e.translations,e.rules,o.rules->'featSpellGrant'
			from srd_catalog_entry_aliases a join srd_catalog_entries e on e.id=a.catalog_entry_id join srd_catalog_sources s on s.id=e.source_id
			left join campaign_srd_entry_overrides o on o.catalog_entry_id=e.id and o.campaign_id=a.campaign_id
			where a.legacy_entry_id::text=$1 and a.campaign_id=$2 and s.slug='dnd-srd' and e.entry_type='feat' and e.is_published limit 1`, featEntryID, campaignID).Scan(&data.Name, &translationsRaw, &rulesRaw, &overrideRaw)
		if err == nil && len(overrideRaw) > 0 {
			var rules map[string]any
			if err = json.Unmarshal(rulesRaw, &rules); err == nil {
				var grant any
				if json.Unmarshal(overrideRaw, &grant) == nil {
					overrides, _ := rules["campaignOverrides"].(map[string]any)
					if overrides == nil {
						overrides = map[string]any{}
					}
					overrides["featSpellGrant"] = grant
					rules["campaignOverrides"] = overrides
					rulesRaw, err = json.Marshal(rules)
				}
			}
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return campaignFeatRuleData{}, fmt.Errorf("campaign feat is not available")
	}
	if err != nil {
		return campaignFeatRuleData{}, err
	}
	var translations map[string]string
	if err = json.Unmarshal(translationsRaw, &translations); err != nil && len(translationsRaw) > 0 {
		return campaignFeatRuleData{}, err
	}
	data.Names = []string{data.Name}
	if translated := strings.TrimSpace(translations["pt-BR"]); translated != "" {
		data.Names = append(data.Names, translated)
	}
	var rules map[string]any
	if err = json.Unmarshal(rulesRaw, &rules); err != nil {
		return campaignFeatRuleData{}, err
	}
	overrides, _ := rules["campaignOverrides"].(map[string]any)
	rawOverride, ok := overrides["featSpellGrant"]
	if !ok {
		return campaignFeatRuleData{}, fmt.Errorf("campaign feat spell rule is not configured")
	}
	encoded, err := json.Marshal(rawOverride)
	if err != nil {
		return campaignFeatRuleData{}, err
	}
	if err = json.Unmarshal(encoded, &data.Rule); err != nil {
		return campaignFeatRuleData{}, err
	}
	if !data.Rule.Enabled {
		return campaignFeatRuleData{}, fmt.Errorf("campaign feat spell rule is disabled")
	}
	levels := make(map[string]int, len(data.Rule.Spells))
	for _, spell := range data.Rule.Spells {
		choice, choiceErr := loadCompendiumSpellChoice(ctx, queryer, campaignID, spell.SpellEntryID)
		if choiceErr != nil {
			return campaignFeatRuleData{}, choiceErr
		}
		levels[spell.SpellEntryID] = choice.Level
	}
	if err = compendium.ValidateCampaignFeatSpellRule(data.Rule, levels); err != nil {
		return campaignFeatRuleData{}, err
	}
	return data, nil
}

// reconcileCampaignFeatSpellGrants derives mechanics from published campaign
// entries and accepts only ability choices permitted by each saved rule.
func reconcileCampaignFeatSpellGrants(ctx context.Context, queryer campaignReferenceQuerier, campaignID string, sheet Sheet, previous Sheet) ([]CampaignFeatSpellGrant, error) {
	requested := sheet.CampaignFeatSpellGrants
	if len(requested) > 20 {
		return nil, fmt.Errorf("too many campaign feat spell grants")
	}
	previousByID := make(map[string]CampaignFeatSpellGrant, len(previous.CampaignFeatSpellGrants))
	for _, old := range previous.CampaignFeatSpellGrants {
		previousByID[old.ID] = old
	}
	occurrences := make(map[string]int)
	seenIDs := make(map[string]bool)
	active := make([]CampaignFeatSpellGrant, 0, len(requested))
	for _, input := range requested {
		data, err := loadCampaignFeatSpellRule(ctx, queryer, campaignID, input.FeatEntryID)
		if err != nil {
			return nil, err
		}
		count := featOccurrenceCountForNames(sheet.Feats, data.Names)
		occurrences[input.FeatEntryID]++
		occurrence := occurrences[input.FeatEntryID]
		if count < occurrence {
			return nil, fmt.Errorf("feat granting these spells is not on the sheet")
		}
		id := fmt.Sprintf("campaign-feat:%s:%d", input.FeatEntryID, occurrence)
		if seenIDs[id] {
			return nil, fmt.Errorf("duplicate campaign feat spell grant")
		}
		seenIDs[id] = true
		grant := CampaignFeatSpellGrant{ID: id, FeatEntryID: input.FeatEntryID, Active: true,
			SpellcastingAbilities: make(map[string]string), FreeCastsRemaining: make(map[string]int)}
		old, hasOld := previousByID[id]
		for _, spell := range data.Rule.Spells {
			options := spell.AbilityOptions
			ability := ""
			if len(options) == 1 {
				ability = options[0]
			} else if len(options) > 1 {
				ability = input.SpellcastingAbilities[spell.SpellEntryID]
				if !containsString(options, ability) {
					return nil, fmt.Errorf("choose an allowed spellcasting ability")
				}
			}
			if ability != "" {
				grant.SpellcastingAbilities[spell.SpellEntryID] = ability
			}
			remaining := spell.FreeUses
			if hasOld {
				if current, ok := old.FreeCastsRemaining[spell.SpellEntryID]; ok {
					remaining = clampFreeUses(current, spell.FreeUses)
				}
			}
			grant.FreeCastsRemaining[spell.SpellEntryID] = remaining
		}
		active = append(active, grant)
	}
	for _, old := range previous.CampaignFeatSpellGrants {
		if seenIDs[old.ID] {
			continue
		}
		old.Active = false
		active = append(active, old)
	}
	if len(active) > 40 {
		return nil, fmt.Errorf("too many historical campaign feat spell grants")
	}
	return active, nil
}

func featOccurrenceCountForNames(feats string, names []string) int {
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

func recoverCampaignFeatSpellGrantUses(ctx context.Context, queryer campaignReferenceQuerier, campaignID, kind string, grants []CampaignFeatSpellGrant) ([]CampaignFeatSpellGrant, error) {
	if kind != "short" && kind != "long" {
		return grants, nil
	}
	for index := range grants {
		grant := &grants[index]
		if !grant.Active {
			continue
		}
		data, err := loadCampaignFeatSpellRule(ctx, queryer, campaignID, grant.FeatEntryID)
		if err != nil {
			return nil, err
		}
		for _, spell := range data.Rule.Spells {
			if spell.Recovery == kind {
				if grant.FreeCastsRemaining == nil {
					grant.FreeCastsRemaining = make(map[string]int)
				}
				grant.FreeCastsRemaining[spell.SpellEntryID] = spell.FreeUses
			}
		}
	}
	return grants, nil
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
		overridden, overrideErr := campaignFeatSpellOverrideEnabled(ctx, queryer, campaignID, rule)
		if overrideErr != nil {
			return nil, overrideErr
		}
		if overridden {
			// An explicit narrator rule replaces the built-in mapping. The old
			// record remains in history below, inactive, so choices are not erased.
			continue
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

func campaignFeatSpellOverrideEnabled(ctx context.Context, queryer campaignReferenceQuerier, campaignID string, rule dnd2024FeatSpellRule) (bool, error) {
	names := make([]string, 0, len(rule.Names))
	for _, name := range rule.Names {
		names = append(names, normalizeDndFeatName(name))
	}
	var enabled bool
	err := queryer.QueryRow(ctx, `select exists(select 1 from compendium_entries where campaign_id=$1 and entry_type='feat' and is_published=true and (rules->>'id'=$2 or lower(name)=any($3::text[]) or lower(coalesce(translations->>'pt-BR',''))=any($3::text[])) and rules#>>'{campaignOverrides,featSpellGrant,enabled}'='true') or exists(select 1 from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1 join campaign_srd_entry_overrides o on o.catalog_entry_id=e.id and o.campaign_id=$1 where s.slug='dnd-srd' and e.entry_type='feat' and e.is_published and (e.rules->>'id'=$2 or lower(e.name)=any($3::text[]) or lower(coalesce(e.translations->>'pt-BR',''))=any($3::text[])) and o.rules#>>'{featSpellGrant,enabled}'='true')`, campaignID, rule.ID, names).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return enabled, err
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
	err := queryer.QueryRow(ctx, `select e.id::text,e.name,e.rules from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$2 where s.slug='dnd-srd' and e.id::text=$1 and e.entry_type='spell' and e.is_published
		union all select e.id::text,e.name,e.rules from compendium_entries e where e.id::text=$1 and e.campaign_id=$2 and e.entry_type='spell' and e.is_published
		union all select e.id::text,e.name,e.rules from srd_catalog_entry_aliases a join srd_catalog_entries e on e.id=a.catalog_entry_id where a.campaign_id=$2 and a.legacy_entry_id::text=$1 and e.entry_type='spell' and e.is_published limit 1`, entryID, campaignID).Scan(&choice.ID, &choice.Name, &raw)
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
