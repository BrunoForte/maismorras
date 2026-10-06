package compendium

import (
	"errors"
	"fmt"
	"sort"
)

var ErrInvalidFeatSpellRule = errors.New("invalid campaign feat spell rule")

// CampaignFeatSpellRule is an explicit campaign override for a D&D 2024 feat.
// It is stored only on that campaign's compendium entry, never in the SRD pack.
type CampaignFeatSpellRule struct {
	Enabled bool                          `json:"enabled"`
	Spells  []CampaignFeatSpellDefinition `json:"spells"`
}

type CampaignFeatSpellDefinition struct {
	SpellEntryID        string   `json:"spellEntryId"`
	CanUseExistingSlots bool     `json:"canUseExistingSlots"`
	FreeUses            int      `json:"freeUses"`
	Recovery            string   `json:"recovery"`
	AbilityOptions      []string `json:"abilityOptions"`
}

var featSpellAbilities = map[string]bool{
	"intelligence": true,
	"wisdom":       true,
	"charisma":     true,
}

// ValidateCampaignFeatSpellRule checks mechanics independently from storage.
// spellLevels must contain only published spells in the same campaign.
func ValidateCampaignFeatSpellRule(rule CampaignFeatSpellRule, spellLevels map[string]int) error {
	if len(rule.Spells) > 20 {
		return fmt.Errorf("%w: a feat can grant at most 20 spells", ErrInvalidFeatSpellRule)
	}
	seen := make(map[string]bool, len(rule.Spells))
	for _, spell := range rule.Spells {
		if spell.SpellEntryID == "" || seen[spell.SpellEntryID] {
			return fmt.Errorf("%w: spell references must be unique", ErrInvalidFeatSpellRule)
		}
		seen[spell.SpellEntryID] = true
		level, ok := spellLevels[spell.SpellEntryID]
		if !ok || level < 0 || level > 9 {
			return fmt.Errorf("%w: spell reference is not available in this campaign", ErrInvalidFeatSpellRule)
		}
		if spell.FreeUses < 0 || spell.FreeUses > 100 {
			return fmt.Errorf("%w: free uses must be between 0 and 100", ErrInvalidFeatSpellRule)
		}
		switch spell.Recovery {
		case "none", "short", "long":
		default:
			return fmt.Errorf("%w: invalid free-use recovery", ErrInvalidFeatSpellRule)
		}
		if spell.FreeUses == 0 && spell.Recovery != "none" {
			return fmt.Errorf("%w: recovery requires at least one free use", ErrInvalidFeatSpellRule)
		}
		if level > 0 && !spell.CanUseExistingSlots && spell.FreeUses == 0 {
			return fmt.Errorf("%w: a leveled spell needs a slot or a free use", ErrInvalidFeatSpellRule)
		}
		if len(spell.AbilityOptions) > 3 {
			return fmt.Errorf("%w: too many spellcasting ability options", ErrInvalidFeatSpellRule)
		}
		abilities := append([]string(nil), spell.AbilityOptions...)
		sort.Strings(abilities)
		for index, ability := range abilities {
			if !featSpellAbilities[ability] || (index > 0 && ability == abilities[index-1]) {
				return fmt.Errorf("%w: invalid spellcasting ability options", ErrInvalidFeatSpellRule)
			}
		}
	}
	if rule.Enabled && len(rule.Spells) == 0 {
		return fmt.Errorf("%w: an enabled feat spell rule needs at least one spell", ErrInvalidFeatSpellRule)
	}
	return nil
}
