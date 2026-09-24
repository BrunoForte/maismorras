package npcs

import "testing"

func TestValidateNPC(t *testing.T) {
	valid := Sheet{HitPointsCurrent: 8, HitPointsMax: 8, ArmorClass: 13, Size: 1, Color: 3381504}
	if err := validate("Guarda drow", valid); err != nil {
		t.Fatalf("expected valid NPC, got %v", err)
	}
	for _, tc := range []struct {
		label string
		name  string
		sheet Sheet
	}{
		{"empty name", "", valid},
		{"current hp exceeds max", "Drow", Sheet{HitPointsCurrent: 9, HitPointsMax: 8, ArmorClass: 13, Size: 1, Color: 1}},
		{"invalid size", "Drow", Sheet{HitPointsCurrent: 8, HitPointsMax: 8, ArmorClass: 13, Size: 0, Color: 1}},
	} {
		if err := validate(tc.name, tc.sheet); err == nil {
			t.Errorf("%s: expected validation error", tc.label)
		}
	}
}

func TestValidateNPCStatBlock(t *testing.T) {
	valid := Sheet{
		HitPointsCurrent: 18, HitPointsMax: 18, ArmorClass: 14, Size: 1, Color: 1,
		Abilities: Abilities{Strength: 12, Dexterity: 14, Constitution: 12, Intelligence: 10, Wisdom: 11, Charisma: 8},
		Actions:   []Action{{Name: "Espada curta", Kind: "action", ToHit: 4, Damage: "1d6+2 perfurante"}},
	}
	if err := validate("Batedor", valid); err != nil {
		t.Fatalf("expected complete stat block valid, got %v", err)
	}
	valid.Actions[0].SaveDC = 51
	if err := validate("Batedor", valid); err == nil {
		t.Fatal("expected invalid save DC to be rejected")
	}
}

func TestValidateNPCClassLevelAndGender(t *testing.T) {
	valid := Sheet{HitPointsCurrent: 8, HitPointsMax: 8, ArmorClass: 13, Size: 1, Color: 1, ClassName: "ladino", Level: 5, Gender: "feminino"}
	if err := validate("Batedora", valid); err != nil {
		t.Fatalf("expected generated NPC metadata to be valid, got %v", err)
	}

	for _, tc := range []struct {
		label string
		edit  func(*Sheet)
	}{
		{"level over 20", func(sheet *Sheet) { sheet.Level = 21 }},
		{"class without level", func(sheet *Sheet) { sheet.Level = 0 }},
		{"negative level", func(sheet *Sheet) { sheet.Level = -1 }},
		{"unknown class", func(sheet *Sheet) { sheet.ClassName = "classe-inventada" }},
		{"unresolved unisex", func(sheet *Sheet) { sheet.Gender = "unissex" }},
	} {
		t.Run(tc.label, func(t *testing.T) {
			sheet := valid
			tc.edit(&sheet)
			if err := validate("Batedora", sheet); err == nil {
				t.Fatalf("expected %s to be rejected", tc.label)
			}
		})
	}
}
