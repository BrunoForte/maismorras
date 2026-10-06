package compendium

import "testing"

func TestValidateCampaignFeatSpellRule(t *testing.T) {
	t.Run("enabled cantrip does not receive slots by implication", func(t *testing.T) {
		rule := CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{
			SpellEntryID: "cantrip", Recovery: "none", AbilityOptions: []string{"wisdom"},
		}}}
		if err := ValidateCampaignFeatSpellRule(rule, map[string]int{"cantrip": 0}); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("limited free casting validates uses and recovery", func(t *testing.T) {
		rule := CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{
			SpellEntryID: "spell", FreeUses: 1, Recovery: "long", CanUseExistingSlots: true,
			AbilityOptions: []string{"intelligence", "wisdom"},
		}}}
		if err := ValidateCampaignFeatSpellRule(rule, map[string]int{"spell": 1}); err != nil {
			t.Fatal(err)
		}
	})

	tests := []struct {
		name  string
		rule  CampaignFeatSpellRule
		level map[string]int
	}{
		{"missing campaign spell", CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{SpellEntryID: "foreign", Recovery: "none"}}}, map[string]int{}},
		{"leveled spell without slot or free use", CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{SpellEntryID: "spell", Recovery: "none"}}}, map[string]int{"spell": 1}},
		{"recovery without uses", CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{SpellEntryID: "spell", CanUseExistingSlots: true, Recovery: "long"}}}, map[string]int{"spell": 1}},
		{"unknown ability", CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{SpellEntryID: "spell", CanUseExistingSlots: true, Recovery: "none", AbilityOptions: []string{"strength"}}}}, map[string]int{"spell": 1}},
		{"duplicate spell", CampaignFeatSpellRule{Enabled: true, Spells: []CampaignFeatSpellDefinition{{SpellEntryID: "cantrip", Recovery: "none"}, {SpellEntryID: "cantrip", Recovery: "none"}}}, map[string]int{"cantrip": 0}},
		{"enabled rule without spells", CampaignFeatSpellRule{Enabled: true}, map[string]int{}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := ValidateCampaignFeatSpellRule(test.rule, test.level); err == nil {
				t.Fatal("expected invalid rule to be rejected")
			}
		})
	}
}
