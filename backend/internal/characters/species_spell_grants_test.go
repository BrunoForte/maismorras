package characters

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type speciesSpellTestQueryer map[string]compendiumSpellChoice

func (q speciesSpellTestQueryer) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	ruleID, _ := args[1].(string)
	choice, ok := q[ruleID]
	if !ok {
		return featSpellTestRow{err: pgx.ErrNoRows}
	}
	rules, _ := json.Marshal(choice.Rules)
	return featSpellTestRow{values: []any{choice.ID, choice.Name, rules}}
}

func speciesTestQueryer() speciesSpellTestQueryer {
	return speciesSpellTestQueryer{
		"detect-magic":    {ID: "detect-entry", Name: "Detect Magic", Level: 1, Rules: map[string]any{"id": "detect-magic", "level": float64(1)}},
		"misty-step":      {ID: "misty-entry", Name: "Misty Step", Level: 2, Rules: map[string]any{"id": "misty-step", "level": float64(2)}},
		"ray-of-sickness": {ID: "ray-entry", Name: "Ray of Sickness", Level: 1, Rules: map[string]any{"id": "ray-of-sickness", "level": float64(1)}},
		"hold-person":     {ID: "hold-entry", Name: "Hold Person", Level: 2, Rules: map[string]any{"id": "hold-person", "level": float64(2)}},
	}
}

func TestSpeciesSpellGrantUsesOnlyExplicitStableSpeciesAndSpellIDs(t *testing.T) {
	queryer := speciesTestQueryer()
	cases := []struct {
		name, species, lineage string
		level                  int
		want                   int
	}{
		{"high elf level three", "Elfo", "Alto Elfo", 3, 1},
		{"high elf level five", "elf", "high elf", 5, 2},
		{"abyssal tiefling", "tiefling", "Abissal", 3, 1},
		{"unsupported lineage", "elf", "Drow", 20, 0},
		{"unsupported species", "gnome", "Forest", 20, 0},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			sheet := normalizeSpeciesIdentity(Sheet{Species: test.species, SpeciesLineage: test.lineage, Level: test.level})
			grants, err := reconcileSpeciesSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{})
			if err != nil {
				t.Fatal(err)
			}
			active := 0
			for _, grant := range grants {
				if grant.Active {
					active++
					if grant.ID == "" || grant.FeatureID == "" || grant.SpellEntryID == "" || grant.DefaultFreeCasts != 1 || grant.FreeCastsRemaining != 1 || grant.FreeCastsRecovery != "" {
						t.Fatalf("invalid server-derived grant: %+v", grant)
					}
				}
			}
			if active != test.want {
				t.Fatalf("active grant count = %d, want %d (%+v)", active, test.want, grants)
			}
		})
	}
}

func TestSpeciesSpellGrantReconciliationPreservesServerConfigButIgnoresSubmittedGrant(t *testing.T) {
	queryer := speciesTestQueryer()
	sheet := normalizeSpeciesIdentity(Sheet{Species: "Elf", SpeciesLineage: "High Elf", Level: 3, SpeciesSpellcastingAbility: "wisdom"})
	first, err := reconcileSpeciesSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{})
	if err != nil || len(first) != 1 {
		t.Fatalf("setup: %+v, %v", first, err)
	}
	old := first[0]
	old.FreeCastsRemaining = 0
	old.FreeCastsMaxOverride = ptrInt(4)
	old.FreeCastsRecovery = "short"
	clientSheet := sheet
	clientSheet.SpeciesSpellGrants = []SpeciesSpellGrant{{ID: "forged", SpellEntryID: "forged", FreeCastsRemaining: 999, FreeCastsMaxOverride: ptrInt(999), Active: true}}
	got, err := reconcileSpeciesSpellGrants(context.Background(), queryer, "campaign", clientSheet, Sheet{SpeciesSpellGrants: []SpeciesSpellGrant{old}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].ID != old.ID || got[0].SpellEntryID != old.SpellEntryID || got[0].FreeCastsRemaining != 0 || got[0].FreeCastsMax != 4 || got[0].FreeCastsRecovery != "short" || got[0].SpellcastingAbility != "wisdom" {
		t.Fatalf("server configuration/counter not preserved or client values trusted: %+v", got[0])
	}
}

func TestSpeciesSpellRecoveryShortLongNoneAndInvalidState(t *testing.T) {
	base := SpeciesSpellGrant{DefaultFreeCasts: 1, FreeCastsMax: 2, FreeCastsMaxOverride: ptrInt(2), Active: true}
	base.FreeCastsRemaining = 0
	base.FreeCastsRecovery = "short"
	short, err := recoverSpeciesSpellGrantUses([]SpeciesSpellGrant{base}, "short")
	if err != nil || short[0].FreeCastsRemaining != 2 {
		t.Fatalf("short did not restore configured maximum: %+v %v", short, err)
	}
	long, err := recoverSpeciesSpellGrantUses([]SpeciesSpellGrant{base}, "long")
	if err != nil || long[0].FreeCastsRemaining != 2 {
		t.Fatalf("long did not restore short recovery grant: %+v %v", long, err)
	}
	base.FreeCastsRecovery = "none"
	never, err := recoverSpeciesSpellGrantUses([]SpeciesSpellGrant{base}, "long")
	if err != nil || never[0].FreeCastsRemaining != 0 {
		t.Fatalf("none unexpectedly recovered: %+v %v", never, err)
	}
	base.FreeCastsRemaining = 3
	if _, err := recoverSpeciesSpellGrantUses([]SpeciesSpellGrant{base}, "long"); !errors.Is(err, ErrInvalidSpellGrantState) {
		t.Fatalf("invalid persisted state accepted: %v", err)
	}
}

func TestSpeciesSpellGrantIdentityRequiresReviewedAliasesAndSpellcastingAbility(t *testing.T) {
	got := normalizeSpeciesIdentity(Sheet{Species: "Elfo", SpeciesLineage: "Alto Elfo", SpeciesSpellcastingAbility: "strength"})
	if got.SpeciesID != "elf" || got.SpeciesLineageID != "high-elf" || got.SpeciesSpellcastingAbility != "" {
		t.Fatalf("identity/ability normalization mismatch: %+v", got)
	}
	if speciesSpellGrantID(dnd2024SpeciesSpellRules[0]) != "dnd2024:species:elf:elven-lineage:high-elf:detect-magic" {
		t.Fatal("species grant ID must be deterministic and derived from stable rules IDs")
	}
}
