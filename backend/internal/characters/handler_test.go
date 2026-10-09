package characters

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"

	"vtt-backend/internal/apperror"
	"vtt-backend/internal/systems"
)

func TestUnsupportedCampaignSystemReturnsExplicitConflict(t *testing.T) {
	var appError *apperror.Error
	if err := mapError(ErrUnsupportedSystem); !errors.As(err, &appError) {
		t.Fatalf("mapError = %T, want an application error", err)
	} else if appError.Status != 409 || appError.Code != "UNSUPPORTED_CAMPAIGN_SYSTEM" {
		t.Fatalf("unsupported system response = (%d, %s), want explicit 409", appError.Status, appError.Code)
	}
}

func TestCharacterAccessIsLimitedToOwnerOrCampaignGM(t *testing.T) {
	cases := []struct {
		name              string
		gm, member, owner bool
		want              bool
	}{
		{name: "campaign GM", gm: true, want: true},
		{name: "sheet owner who is a member", member: true, owner: true, want: true},
		{name: "other campaign member", member: true, want: false},
		{name: "owner outside campaign", owner: true, want: false},
		{name: "outsider", want: false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := characterAccessAllowed(test.gm, test.member, test.owner); got != test.want {
				t.Fatalf("characterAccessAllowed(%t, %t, %t) = %t, want %t", test.gm, test.member, test.owner, got, test.want)
			}
		})
	}
}

func TestAbilityModifierUsesDNDHalfDownForNegativeScores(t *testing.T) {
	cases := map[int]int{1: -5, 9: -1, 10: 0, 11: 0, 18: 4}
	for score, want := range cases {
		if got := abilityModifier(score, systems.Dnd2024Rules{}); got != want {
			t.Errorf("abilityModifier(%d) = %d, want %d", score, got, want)
		}
	}
}

func TestSpellEffectAddsScalingForHigherSlots(t *testing.T) {
	rules := map[string]any{
		"description": "Each creature takes 3d6 fire damage.",
		"damage":      map[string]any{"dice": "3d6", "scalingType": "spell-level"},
	}
	got := spellEffect(rules, 1, 3)
	if !strings.Contains(got, "5d6") || strings.Contains(got, "3d6") {
		t.Fatalf("unexpected scaling effect: %q", got)
	}
}

func TestRollSpellEffectScalesDiceAndReturnsAllResults(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "8d6", "scalingType": "spell-level"}}
	expression, dice, modifier, total := rollSpellEffect(rules, 3, 4)
	if expression != "9d6" || len(dice) != 9 || modifier != 0 || total < 9 || total > 54 {
		t.Fatalf("unexpected roll: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestRollSpellEffectSupportsRepeatedProjectiles(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "1d4+1", "scalingType": "spell-level", "instances": float64(3), "scalingInstances": float64(1)}}
	expression, dice, modifier, _ := rollSpellEffect(rules, 1, 2)
	if expression != "4d4+4" || len(dice) != 4 || modifier != 4 {
		t.Fatalf("unexpected projectile roll: %s %v +%d", expression, dice, modifier)
	}
}

func TestSpellEffectDoesNotInventScaling(t *testing.T) {
	rules := map[string]any{"description": "An effect.", "damage": map[string]any{"dice": "1d8"}}
	if got := spellEffect(rules, 1, 2); got != "An effect." {
		t.Fatalf("unexpected effect: %q", got)
	}
}

func TestRollSpellEffectPreservesModifierWhenScaling(t *testing.T) {
	rules := map[string]any{"damage": map[string]any{"dice": "2d8+3", "scalingType": "spell-level"}}
	expression, dice, modifier, total := rollSpellEffect(rules, 2, 4)
	if expression != "4d8+3" || len(dice) != 4 || modifier != 3 || total < 7 || total > 35 {
		t.Fatalf("unexpected scaled modifier roll: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestCustomSpellRulesScaleConfiguredDicePerSlotLevel(t *testing.T) {
	rules, err := customSpellRules(Spell{
		Name: "Explosão de teste", Level: 1, DiceFormula: "2d6+1", ScalingDicePerLevel: 1,
	})
	if err != nil {
		t.Fatalf("customSpellRules returned error: %v", err)
	}
	expression, dice, modifier, total := rollSpellEffect(rules, 1, 3)
	if expression != "4d6+1" || len(dice) != 4 || modifier != 1 || total < 5 || total > 25 {
		t.Fatalf("unexpected custom spell scaling: %s %v +%d = %d", expression, dice, modifier, total)
	}
}

func TestCustomSpellRulesRejectInvalidScaling(t *testing.T) {
	_, err := customSpellRules(Spell{Level: 1, DiceFormula: "2d6", ScalingDicePerLevel: 11})
	if err == nil {
		t.Fatal("expected out-of-range scaling to be rejected")
	}
	_, err = customSpellRules(Spell{Level: 1, ScalingDicePerLevel: 1})
	if err == nil {
		t.Fatal("expected scaling without base damage dice to be rejected")
	}
}

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

func TestDnd2024MoneyAcceptsNonnegativeIntegerDenominationsAndRejectsNegative(t *testing.T) {
	sheet := validSheet()
	sheet.Money = Dnd2024Money{CP: 14, SP: 3, EP: 2, GP: 7, PP: 1}
	if err := validate(sheet); err != nil {
		t.Fatalf("valid purse rejected: %v", err)
	}
	sheet.Money.EP = -1
	if err := validate(sheet); err == nil {
		t.Fatal("negative coins accepted")
	}
}

func TestSheetRoundTripKeepsMoneyAndFeatGrantUsageAndLegacyDefaults(t *testing.T) {
	sheet := validSheet()
	sheet.Money = Dnd2024Money{CP: 1, SP: 2, EP: 3, GP: 4, PP: 5}
	sheet.FeatSpellGrants = []FeatSpellGrant{{
		ID: "grant", FeatID: "magic-initiate", SpellList: "wizard", Ability: "intelligence",
		CantripEntryIDs: []string{"c1", "c2"}, FirstLevelSpellEntryID: "s1", FreeCastsRemaining: 0, Active: true,
	}}
	raw, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var restored Sheet
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.Money != sheet.Money || len(restored.FeatSpellGrants) != 1 || restored.FeatSpellGrants[0].FreeCastsRemaining != 0 {
		t.Fatalf("sheet additions did not round-trip: %+v", restored)
	}
	var legacy Sheet
	if err := json.Unmarshal([]byte(`{"name":"Lia"}`), &legacy); err != nil {
		t.Fatal(err)
	}
	legacy = normalizeDerivedFields(legacy, systems.Dnd2024Rules{})
	if legacy.Money != (Dnd2024Money{}) || legacy.FeatSpellGrants == nil {
		t.Fatalf("legacy sheet did not receive empty compatible defaults: %+v", legacy)
	}
}

func TestValidateAndDecodeAcceptFractionalMetricSpeciesSpeed(t *testing.T) {
	for _, species := range []string{"Goliath", "Elfo"} {
		t.Run(species, func(t *testing.T) {
			payload := `{"name":"Ari","level":1,"species":"` + species + `","speciesLineage":"Elfo da Floresta","speed":10.5,"hitPointsCurrent":10,"hitPointsMax":10,"abilityScores":{"strength":10,"dexterity":10,"constitution":10,"intelligence":10,"wisdom":10,"charisma":10}}`
			var sheet Sheet
			if err := json.Unmarshal([]byte(payload), &sheet); err != nil {
				t.Fatalf("fractional speed should decode through the API sheet contract: %v", err)
			}
			if err := validate(sheet); err != nil {
				t.Fatalf("fractional speed should be valid: %v", err)
			}
			if sheet.Speed != 10.5 {
				t.Fatalf("decoded speed = %v, want 10.5", sheet.Speed)
			}
		})
	}
}

func TestLegacyIntegerSpeedStillDecodesAndRoundTrips(t *testing.T) {
	var sheet Sheet
	if err := json.Unmarshal([]byte(`{"speed":9}`), &sheet); err != nil {
		t.Fatalf("legacy integer speed failed to decode: %v", err)
	}
	if sheet.Speed != 9 {
		t.Fatalf("legacy speed = %v, want 9", sheet.Speed)
	}
	raw, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var restored Sheet
	if err := json.Unmarshal(raw, &restored); err != nil || restored.Speed != 9 {
		t.Fatalf("legacy speed round trip = %v, err=%v", restored.Speed, err)
	}
}

func TestValidateRejectsNonFiniteOrOutOfRangeSpeed(t *testing.T) {
	for _, speed := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), -0.1, 300.1} {
		sheet := validSheet()
		sheet.Speed = speed
		if err := validate(sheet); err == nil {
			t.Errorf("validate accepted invalid speed %v", speed)
		}
	}
}

func TestValidateDoesNotTrustClientArmorClass(t *testing.T) {
	sheet := validSheet()
	sheet.ArmorClass = 999
	if err := validate(sheet); err != nil {
		t.Fatalf("derived client CA should be ignored and recomputed by repository, got %v", err)
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

func TestValidateAcceptsSpeciesLineage(t *testing.T) {
	sheet := validSheet()
	sheet.Species = "Elf"
	sheet.SpeciesLineage = "Drow"
	if err := validate(sheet); err != nil {
		t.Fatalf("expected lineage to be valid, got %v", err)
	}
}

func TestInventoryWeaponAbilitySurvivesSheetJSONRoundTrip(t *testing.T) {
	sheet := validSheet()
	sheet.Inventory = []InventoryItem{{
		EntryID:  "longbow",
		Name:     "Arco longo",
		Quantity: 1,
		Rules:    json.RawMessage(`{"category":"weapon","attackAbility":"dexterity"}`),
	}}
	raw, err := json.Marshal(sheet)
	if err != nil {
		t.Fatalf("marshal sheet: %v", err)
	}
	var restored Sheet
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatalf("unmarshal sheet: %v", err)
	}
	var rules map[string]any
	if err := json.Unmarshal(restored.Inventory[0].Rules, &rules); err != nil {
		t.Fatalf("unmarshal item rules: %v", err)
	}
	if got := rules["attackAbility"]; got != "dexterity" {
		t.Fatalf("attack ability = %v, want dexterity", got)
	}
}

func TestSheetOptionalFieldsSurviveBackendRoundTrip(t *testing.T) {
	sheet := validSheet()
	sheet.Attacks = []Attack{{Name: "Arco", AttackType: "ranged", Ability: "dexterity"}}
	sheet.Spells = []Spell{{Name: "Luz", Level: 0, Origin: "species"}}
	sheet.Resistances = []string{"fogo"}
	sheet.AutomaticTraits = []string{"Visão no escuro"}
	sheet.SpeciesHPBonusApplied = 3

	raw, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var restored Sheet
	if err := json.Unmarshal(raw, &restored); err != nil {
		t.Fatal(err)
	}
	if restored.Attacks[0].Ability != "dexterity" || restored.Attacks[0].AttackType != "ranged" || restored.Spells[0].Origin != "species" {
		t.Fatalf("attack/spell metadata was lost: attacks=%+v spells=%+v", restored.Attacks, restored.Spells)
	}
	if len(restored.Resistances) != 1 || len(restored.AutomaticTraits) != 1 || restored.SpeciesHPBonusApplied != 3 {
		t.Fatalf("sheet extension fields were lost: %+v", restored)
	}
}
