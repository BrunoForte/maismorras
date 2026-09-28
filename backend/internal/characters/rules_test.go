package characters

import (
	"encoding/json"
	"testing"
)

func TestProficiencyBonusFromCharacterLevel(t *testing.T) {
	cases := map[int]int{1: 2, 4: 2, 5: 3, 8: 3, 9: 4, 13: 5, 17: 6, 20: 6}
	for level, want := range cases {
		if got := proficiencyBonus(level); got != want {
			t.Errorf("proficiencyBonus(%d) = %d, want %d", level, got, want)
		}
	}
}

func TestNormalizeDerivedFieldsIgnoresClientValues(t *testing.T) {
	sheet := validSheet()
	sheet.Level = 5
	sheet.ProficiencyBonus = 99
	sheet.ArmorClass = 99
	sheet.PassivePerception = 99
	sheet.AbilityScores.Dexterity = 14
	sheet.SkillProficiencies = []string{"Percepção"}

	got := normalizeDerivedFields(sheet)
	if got.ProficiencyBonus != 3 || got.ArmorClass != 12 || got.PassivePerception != 13 {
		t.Fatalf("derived fields = PB %d, AC %d, passive perception %d; want 3, 12, 13", got.ProficiencyBonus, got.ArmorClass, got.PassivePerception)
	}
}

func TestPassivePerceptionIncludesProficiencyAndExpertise(t *testing.T) {
	sheet := validSheet()
	sheet.Level = 5
	sheet.AbilityScores.Wisdom = 12
	sheet.SkillProficiencies = []string{"Percepção"}
	sheet.SkillExpertise = []string{"Percepcao"}
	if got := passivePerception(sheet); got != 17 {
		t.Fatalf("passivePerception() = %d, want 17", got)
	}
}

func TestCalculateArmorClassHalfPlateAndShield(t *testing.T) {
	sheet := validSheet()
	sheet.AbilityScores.Dexterity = 16
	sheet.Inventory = []InventoryItem{
		{Name: "Meia armadura", Equipped: true, Rules: json.RawMessage(`{"category":"medium","ac":"15 + Dex (max 2)"}`)},
		{Name: "Escudo", Equipped: true, Rules: json.RawMessage(`{"category":"shield","ac":"+2"}`)},
	}
	if got := calculateArmorClass(sheet); got != 19 {
		t.Fatalf("calculateArmorClass() = %d, want 19", got)
	}
}

func TestCalculateArmorClassDoesNotStackArmorAndOnlyUsesEquipped(t *testing.T) {
	sheet := validSheet()
	sheet.AbilityScores.Dexterity = 14
	sheet.Inventory = []InventoryItem{
		{Name: "Armadura leve", Equipped: true, Rules: json.RawMessage(`{"category":"light","ac":"11 + Dex"}`)},
		{Name: "Armadura pesada", Equipped: false, Rules: json.RawMessage(`{"category":"heavy","ac":"18"}`)},
	}
	if got := calculateArmorClass(sheet); got != 13 {
		t.Fatalf("calculateArmorClass() = %d, want 13", got)
	}
}

func TestCalculateArmorClassUnarmoredDefenseAndBonuses(t *testing.T) {
	sheet := validSheet()
	sheet.Class = "Bárbaro"
	sheet.AbilityScores.Dexterity = 14
	sheet.AbilityScores.Constitution = 16
	sheet.Inventory = []InventoryItem{{
		Name: "Manto mágico", Equipped: true,
		Rules: json.RawMessage(`{"category":"wondrous","acBonus":1,"magicBonus":1}`),
	}}
	if got := calculateArmorClass(sheet); got != 17 {
		t.Fatalf("calculateArmorClass() = %d, want 17", got)
	}
}

func TestResourceOverridesAndShortRestRecoverySurviveRoundTrip(t *testing.T) {
	sheet := validSheet()
	max := 7
	sheet.Resources = []Resource{{
		ID: "channel-divinity", Name: "Canalizar Divindade", Current: 2, Max: 7,
		MaxOverride: &max, ShortRestRecovery: 1, RestoreOn: "long",
	}}
	raw, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var restored Sheet
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatal(err)
	}
	resource := restored.Resources[0]
	if resource.MaxOverride == nil || *resource.MaxOverride != 7 || resource.ShortRestRecovery != 1 {
		t.Fatalf("resource metadata was lost: %+v", resource)
	}
}

func TestShortRestRecoveryUsesStoredRules(t *testing.T) {
	sheet := validSheet()
	sheet.Class = "Bruxo"
	sheet.HitPointsCurrent = 3
	sheet.HitPointsMax = 10
	sheet.Resources = []Resource{
		{ID: "short", Current: 0, Max: 2, RestoreOn: "short"},
		{ID: "incremental", Current: 1, Max: 4, ShortRestRecovery: 2, RestoreOn: "long"},
		{ID: "long", Current: 0, Max: 3, RestoreOn: "long"},
	}
	sheet.SpellSlots = []SpellSlot{{Level: 1, Current: 0, Max: 2}}

	got := applyRestRecovery(sheet, "short", 4)
	if got.HitPointsCurrent != 7 || got.Resources[0].Current != 2 || got.Resources[1].Current != 3 || got.Resources[2].Current != 0 || got.SpellSlots[0].Current != 2 {
		t.Fatalf("short rest recovery mismatch: hp=%d resources=%+v slots=%+v", got.HitPointsCurrent, got.Resources, got.SpellSlots)
	}
}

func TestLongRestRestoresHPResourcesSlotsAndHitDice(t *testing.T) {
	sheet := validSheet()
	sheet.HitPointsCurrent = 3
	sheet.HitPointsMax = 10
	sheet.TemporaryHP = 5
	sheet.HitDiceSpent = 2
	sheet.Resources = []Resource{{Current: 0, Max: 3, RestoreOn: "long"}}
	sheet.SpellSlots = []SpellSlot{{Level: 2, Current: 0, Max: 2}}

	got := applyRestRecovery(sheet, "long", 0)
	if got.HitPointsCurrent != 10 || got.TemporaryHP != 0 || got.HitDiceSpent != 0 || got.Resources[0].Current != 3 || got.SpellSlots[0].Current != 2 {
		t.Fatalf("long rest recovery mismatch: %+v", got)
	}
}
