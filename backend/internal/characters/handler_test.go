package characters

import "testing"

func validSheet() Sheet {
	return Sheet{
		Name: "Lia", Level: 1, ArmorClass: 14, Speed: 9, HitPointsCurrent: 10, HitPointsMax: 10,
		AbilityScores: AbilityScores{Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 10, Wisdom: 10, Charisma: 8},
	}
}

func TestValidateAcceptsMinimalDND2024Sheet(t *testing.T) {
	if err := validate(validSheet()); err != nil {
		t.Fatalf("expected valid sheet, got %v", err)
	}
}

func TestValidateRejectsInvalidHitPoints(t *testing.T) {
	sheet := validSheet()
	sheet.HitPointsCurrent = 11
	if err := validate(sheet); err == nil {
		t.Fatal("expected invalid hit points to be rejected")
	}
}

func TestValidateRejectsInvalidAbilityScore(t *testing.T) {
	sheet := validSheet()
	sheet.AbilityScores.Charisma = 31
	if err := validate(sheet); err == nil {
		t.Fatal("expected invalid ability score to be rejected")
	}
}
