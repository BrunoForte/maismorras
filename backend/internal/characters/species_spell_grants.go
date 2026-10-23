package characters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// This deliberately small registry contains only grants whose feature IDs are
// in the SRD species records and whose spell rules IDs are present in the
// campaign's enabled SRD catalog. Other legacy prose-only species grants are
// not inferred from Spell.Origin or descriptions.
type dnd2024SpeciesSpellRule struct {
	SpeciesID   string
	FeatureID   string
	LineageID   string
	SpellRuleID string
	MinLevel    int
	SpellLevel  int
	FreeUses    int
	Recovery    string
	CanUseSlots bool
}

var dnd2024SpeciesSpellRules = []dnd2024SpeciesSpellRule{
	{SpeciesID: "elf", FeatureID: "elven-lineage", LineageID: "high-elf", SpellRuleID: "detect-magic", MinLevel: 3, SpellLevel: 1, FreeUses: 1, Recovery: "long", CanUseSlots: true},
	{SpeciesID: "elf", FeatureID: "elven-lineage", LineageID: "high-elf", SpellRuleID: "misty-step", MinLevel: 5, SpellLevel: 2, FreeUses: 1, Recovery: "long", CanUseSlots: true},
	{SpeciesID: "tiefling", FeatureID: "fiendish-legacy", LineageID: "abyssal", SpellRuleID: "ray-of-sickness", MinLevel: 3, SpellLevel: 1, FreeUses: 1, Recovery: "long", CanUseSlots: true},
	{SpeciesID: "tiefling", FeatureID: "fiendish-legacy", LineageID: "abyssal", SpellRuleID: "hold-person", MinLevel: 5, SpellLevel: 2, FreeUses: 1, Recovery: "long", CanUseSlots: true},
}

func canonicalSpeciesID(value string) string {
	switch normalizeRuleText(value) {
	case "elf", "elfo":
		return "elf"
	case "tiefling", "tieflingue":
		return "tiefling"
	default:
		return ""
	}
}

func canonicalSpeciesLineageID(speciesID, value string) string {
	lineage := normalizeRuleText(value)
	switch speciesID {
	case "elf":
		switch lineage {
		case "high elf", "alto elfo":
			return "high-elf"
		default:
			return ""
		}
	case "tiefling":
		switch lineage {
		case "abyssal", "abissal":
			return "abyssal"
		default:
			return ""
		}
	default:
		return ""
	}
}

func normalizeSpeciesIdentity(sheet Sheet) Sheet {
	// Existing sheets store localized display values. Resolve only an exact,
	// reviewed alias at the compatibility boundary, then use stable IDs for all
	// grant identity and authorization decisions.
	sheet.SpeciesID = canonicalSpeciesID(sheet.Species)
	sheet.SpeciesLineageID = canonicalSpeciesLineageID(sheet.SpeciesID, sheet.SpeciesLineage)
	if !validSpellcastingAbility(sheet.SpeciesSpellcastingAbility) {
		sheet.SpeciesSpellcastingAbility = ""
	}
	return sheet
}

func validSpellcastingAbility(ability string) bool {
	switch ability {
	case "intelligence", "wisdom", "charisma":
		return true
	default:
		return false
	}
}

func speciesSpellGrantID(rule dnd2024SpeciesSpellRule) string {
	return fmt.Sprintf("dnd2024:species:%s:%s:%s:%s", rule.SpeciesID, rule.FeatureID, rule.LineageID, rule.SpellRuleID)
}

func loadSpeciesSpellEntry(ctx context.Context, queryer campaignReferenceQuerier, campaignID, ruleID string) (compendiumSpellChoice, error) {
	var choice compendiumSpellChoice
	var raw []byte
	// Only a catalog rules.id is accepted. Names, translations, and arbitrary
	// client-provided entry IDs cannot establish a species grant.
	err := queryer.QueryRow(ctx, `select e.id::text,e.name,e.rules from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1 where s.slug='dnd-srd' and s.version='5.2.1' and e.entry_type='spell' and e.is_published and e.rules->>'id'=$2 limit 1`, campaignID, ruleID).Scan(&choice.ID, &choice.Name, &raw)
	if err != nil {
		return compendiumSpellChoice{}, err
	}
	if err = json.Unmarshal(raw, &choice.Rules); err != nil {
		return compendiumSpellChoice{}, err
	}
	if rawLevel, ok := choice.Rules["level"].(float64); !ok || rawLevel < 0 || rawLevel > 9 || rawLevel != float64(int(rawLevel)) {
		return compendiumSpellChoice{}, fmt.Errorf("invalid species spell level")
	} else {
		choice.Level = int(rawLevel)
	}
	if got, _ := choice.Rules["id"].(string); got != ruleID {
		return compendiumSpellChoice{}, fmt.Errorf("species spell identity mismatch")
	}
	return choice, nil
}

func reconcileSpeciesSpellGrants(ctx context.Context, queryer campaignReferenceQuerier, campaignID string, sheet Sheet, previous Sheet) ([]SpeciesSpellGrant, error) {
	sheet = normalizeSpeciesIdentity(sheet)
	previousByID := make(map[string]SpeciesSpellGrant, len(previous.SpeciesSpellGrants))
	for _, grant := range previous.SpeciesSpellGrants {
		previousByID[grant.ID] = grant
	}
	active := make([]SpeciesSpellGrant, 0, len(dnd2024SpeciesSpellRules))
	seen := make(map[string]bool, len(dnd2024SpeciesSpellRules))
	for _, rule := range dnd2024SpeciesSpellRules {
		if sheet.SpeciesID != rule.SpeciesID || sheet.SpeciesLineageID != rule.LineageID || sheet.Level < rule.MinLevel {
			continue
		}
		choice, err := loadSpeciesSpellEntry(ctx, queryer, campaignID, rule.SpellRuleID)
		if errors.Is(err, pgx.ErrNoRows) {
			// An unimported or disabled SRD record does not become a grant. It is
			// safer to leave it unsupported than identify it by display text.
			continue
		}
		if err != nil {
			return nil, err
		}
		if choice.Level != rule.SpellLevel {
			return nil, fmt.Errorf("species spell does not match reviewed level")
		}
		id := speciesSpellGrantID(rule)
		grant := SpeciesSpellGrant{
			ID: id, FeatureID: rule.FeatureID, SpeciesID: rule.SpeciesID, LineageID: rule.LineageID,
			SpellEntryID: choice.ID, FreeCastsRemaining: rule.FreeUses, FreeCastsMax: rule.FreeUses,
			DefaultFreeCasts: rule.FreeUses, CanUseExistingSlots: rule.CanUseSlots,
			SpellcastingAbility: sheet.SpeciesSpellcastingAbility, Active: true,
		}
		if old, ok := previousByID[id]; ok {
			maxUses, recovery, err := validateSavedSpellUseConfig(rule.FreeUses, rule.Recovery, old.FreeCastsMaxOverride, old.FreeCastsRecovery)
			if err != nil {
				return nil, err
			}
			if old.FreeCastsRemaining < 0 || old.FreeCastsRemaining > maxUses {
				return nil, ErrInvalidSpellGrantState
			}
			grant.FreeCastsRemaining = old.FreeCastsRemaining
			grant.FreeCastsMaxOverride = copyInt(old.FreeCastsMaxOverride)
			grant.FreeCastsRecovery = old.FreeCastsRecovery
			grant.FreeCastsMax = maxUses
			grant.Active = true
			_ = recovery // validated here; the configured value remains stored as an override.
		}
		active = append(active, grant)
		seen[id] = true
	}
	for _, old := range previous.SpeciesSpellGrants {
		if seen[old.ID] {
			continue
		}
		old.Active = false
		active = append(active, old)
	}
	if len(active) > 40 {
		return nil, fmt.Errorf("too many historical species spell grants")
	}
	return active, nil
}

func effectiveSpellGrantMax(defaultMax int, override *int) int {
	if override != nil {
		return *override
	}
	return defaultMax
}

func effectiveSpellGrantRecovery(defaultRecovery, override string) string {
	if override != "" {
		return override
	}
	return defaultRecovery
}

func validateSavedSpellUseConfig(defaultMax int, defaultRecovery string, maxOverride *int, recoveryOverride string) (int, string, error) {
	maxUses := effectiveSpellGrantMax(defaultMax, maxOverride)
	recovery := effectiveSpellGrantRecovery(defaultRecovery, recoveryOverride)
	if maxUses < 0 || maxUses > 100 {
		return 0, "", ErrInvalidSpellGrantState
	}
	switch recovery {
	case "none", "short", "long":
	default:
		return 0, "", ErrInvalidSpellGrantState
	}
	return maxUses, recovery, nil
}

func copyInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
