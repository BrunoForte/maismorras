package characters

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type featSpellTestQueryer map[string]compendiumSpellChoice

func (q featSpellTestQueryer) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	entryID, _ := args[0].(string)
	choice, ok := q[entryID]
	if !ok {
		return featSpellTestRow{err: pgx.ErrNoRows}
	}
	rules, _ := json.Marshal(choice.Rules)
	return featSpellTestRow{values: []any{choice.ID, choice.Name, rules}}
}

type featSpellTestRow struct {
	values []any
	err    error
}

func (r featSpellTestRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for i := range dest {
		switch target := dest[i].(type) {
		case *string:
			*target = r.values[i].(string)
		case *[]byte:
			*target = append([]byte(nil), r.values[i].([]byte)...)
		default:
			return errors.New("unexpected scan target")
		}
	}
	return nil
}

func magicInitiateGrant(id string) FeatSpellGrant {
	return FeatSpellGrant{
		ID: id, FeatID: "magic-initiate", SpellList: "wizard", Ability: "intelligence",
		CantripEntryIDs: []string{"light", "mage-hand"}, FirstLevelSpellEntryID: "shield",
		FreeCastsRemaining: 99, // clients cannot grant themselves extra uses
	}
}

func TestDnd2024MagicInitiateCuratedGrantUsesPublishedSpellChoicesAndServerUsage(t *testing.T) {
	queryer := featSpellTestQueryer{
		"light":     {ID: "light", Name: "Light", Level: 0, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"mage-hand": {ID: "mage-hand", Name: "Mage Hand", Level: 0, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"shield":    {ID: "shield", Name: "Shield", Level: 1, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(1), "classes": []any{"wizard"}}},
	}
	sheet := validSheet()
	sheet.Feats = "Magic Initiate"
	sheet.FeatSpellGrants = []FeatSpellGrant{magicInitiateGrant("client-grant")}
	grants, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{})
	if err != nil {
		t.Fatalf("reconcile valid grant: %v", err)
	}
	if len(grants) != 1 || grants[0].FreeCastsRemaining != 1 || !grants[0].Active || grants[0].ID != "dnd2024:feat:magic-initiate:wizard" {
		t.Fatalf("server did not initialize the curated one-use long-rest grant: %#v", grants)
	}
	if got := dnd2024FeatSpellRules[grants[0].FeatID]; got.FreeCasts != 1 || got.Recovery != "long" || got.FreeCastSpellLevel != 1 {
		t.Fatalf("unexpected curated casting terms: %+v", got)
	}
}

func TestFeatGrantCannotRefreshUsesByChangingIDOrDeletingMapping(t *testing.T) {
	queryer := featSpellTestQueryer{
		"light":     {ID: "light", Name: "Light", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"mage-hand": {ID: "mage-hand", Name: "Mage Hand", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"shield":    {ID: "shield", Name: "Shield", Rules: map[string]any{"level": float64(1), "classes": []any{"wizard"}}},
	}
	previous := Sheet{FeatSpellGrants: []FeatSpellGrant{{
		ID: "stable-server-id", FeatID: "magic-initiate", FreeCastsRemaining: 0, Active: true,
	}}}
	sheet := validSheet()
	sheet.Feats = "Magic Initiate"
	sheet.FeatSpellGrants = []FeatSpellGrant{magicInitiateGrant("forged-new-id")}
	grants, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, previous)
	if err != nil {
		t.Fatalf("reconcile reidentified grant: %v", err)
	}
	if grants[0].ID != "stable-server-id" || grants[0].FreeCastsRemaining != 0 {
		t.Fatalf("reidentified grant restored its spent use: %#v", grants[0])
	}
	sheet.FeatSpellGrants = nil
	grants, err = reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, previous)
	if err != nil || len(grants) != 1 || grants[0].Active || grants[0].FreeCastsRemaining != 0 {
		t.Fatalf("deleted mapping should remain inactive usage history, grants=%#v err=%v", grants, err)
	}
}

func TestInactiveHistoricalGrantsCanBeResubmittedWithoutRevalidation(t *testing.T) {
	queryer := featSpellTestQueryer{}
	previous := Sheet{
		FeatSpellGrants: []FeatSpellGrant{{
			ID: "legacy-feat-grant", FeatID: "magic-initiate", FreeCastsRemaining: 0, Active: false,
		}},
		CampaignFeatSpellGrants: []CampaignFeatSpellGrant{{
			ID: "campaign-feat:removed-entry:1", FeatEntryID: "removed-entry",
			FreeCastsRemaining: map[string]int{"spell": 0}, Active: false,
		}},
	}

	featGrants, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", previous, previous)
	if err != nil {
		t.Fatalf("resubmitting an inactive built-in grant should preserve its history: %v", err)
	}
	if len(featGrants) != 1 || featGrants[0].ID != previous.FeatSpellGrants[0].ID || featGrants[0].Active || featGrants[0].FreeCastsRemaining != 0 {
		t.Fatalf("inactive built-in grant history changed: %#v", featGrants)
	}

	campaignGrants, err := reconcileCampaignFeatSpellGrants(context.Background(), queryer, "campaign", previous, previous)
	if err != nil {
		t.Fatalf("resubmitting an inactive campaign grant should preserve its history: %v", err)
	}
	if len(campaignGrants) != 1 || campaignGrants[0].ID != previous.CampaignFeatSpellGrants[0].ID || campaignGrants[0].Active || campaignGrants[0].FreeCastsRemaining["spell"] != 0 {
		t.Fatalf("inactive campaign grant history changed: %#v", campaignGrants)
	}
}

func TestClientCannotMarkActiveHistoricalGrantInactiveToBypassValidation(t *testing.T) {
	queryer := featSpellTestQueryer{}
	previous := Sheet{
		FeatSpellGrants: []FeatSpellGrant{{
			ID: "active-feat-grant", FeatID: "magic-initiate", FreeCastsRemaining: 0, Active: true,
		}},
		CampaignFeatSpellGrants: []CampaignFeatSpellGrant{{
			ID: "campaign-feat:unavailable-entry:1", FeatEntryID: "unavailable-entry",
			FreeCastsRemaining: map[string]int{"spell": 0}, Active: true,
		}},
	}
	request := Sheet{
		FeatSpellGrants:         append([]FeatSpellGrant(nil), previous.FeatSpellGrants...),
		CampaignFeatSpellGrants: append([]CampaignFeatSpellGrant(nil), previous.CampaignFeatSpellGrants...),
	}
	request.FeatSpellGrants[0].Active = false
	request.CampaignFeatSpellGrants[0].Active = false
	if _, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", request, previous); err == nil {
		t.Fatal("client-supplied inactive flag bypassed validation for an active stored grant")
	}
	if _, err := reconcileCampaignFeatSpellGrants(context.Background(), queryer, "campaign", request, previous); err == nil {
		t.Fatal("client-supplied inactive flag bypassed validation for an active stored campaign grant")
	}
}

func TestFeatSpellGrantRejectsUncuratedOrIneligibleChoices(t *testing.T) {
	queryer := featSpellTestQueryer{
		"wrong-level": {ID: "wrong-level", Name: "Shield", Rules: map[string]any{"level": float64(2), "classes": []any{"wizard"}}},
		"cantrip-a":   {ID: "cantrip-a", Name: "Light", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"cantrip-b":   {ID: "cantrip-b", Name: "Mage Hand", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
	}
	sheet := validSheet()
	sheet.Feats = "Magic Initiate"
	grant := magicInitiateGrant("grant")
	grant.FirstLevelSpellEntryID = "wrong-level"
	sheet.FeatSpellGrants = []FeatSpellGrant{grant}
	if _, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{}); err == nil {
		t.Fatal("accepted a level 2 spell in the first-level choice")
	}
	grant = magicInitiateGrant("grant")
	grant.FeatID = "free-text-guessed-feat"
	sheet.FeatSpellGrants = []FeatSpellGrant{grant}
	if _, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{}); err == nil {
		t.Fatal("accepted an uncurated feat ID")
	}
}

func TestRepeatableMagicInitiateRequiresDifferentSpellLists(t *testing.T) {
	queryer := featSpellTestQueryer{
		"light":     {ID: "light", Name: "Light", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"mage-hand": {ID: "mage-hand", Name: "Mage Hand", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"shield":    {ID: "shield", Name: "Shield", Rules: map[string]any{"level": float64(1), "classes": []any{"wizard"}}},
		"guidance":  {ID: "guidance", Name: "Guidance", Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"detect":    {ID: "detect", Name: "Detect Magic", Rules: map[string]any{"level": float64(1), "classes": []any{"wizard"}}},
	}
	sheet := validSheet()
	sheet.Feats = "Magic Initiate\nMagic Initiate"
	second := magicInitiateGrant("grant-two")
	second.CantripEntryIDs = []string{"guidance", "light"}
	second.FirstLevelSpellEntryID = "detect"
	sheet.FeatSpellGrants = []FeatSpellGrant{magicInitiateGrant("grant-one"), second}
	if _, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{}); err == nil {
		t.Fatal("repeatable Magic Initiate accepted the same spell list twice")
	}
}

func TestLongRestRecoversMagicInitiateUseButShortRestDoesNot(t *testing.T) {
	grants := []FeatSpellGrant{{FeatID: "magic-initiate", FreeCastsRemaining: 0, Active: true}}
	short, err := recoverFeatSpellGrantUses(append([]FeatSpellGrant(nil), grants...), "short")
	if err != nil {
		t.Fatal(err)
	}
	if short[0].FreeCastsRemaining != 0 {
		t.Fatalf("short rest recovered the free casting: %+v", short[0])
	}
	long, err := recoverFeatSpellGrantUses(append([]FeatSpellGrant(nil), grants...), "long")
	if err != nil {
		t.Fatal(err)
	}
	if long[0].FreeCastsRemaining != 1 {
		t.Fatalf("long rest did not recover exactly one casting: %+v", long[0])
	}
}

func TestFeatSpellUseConfigOverridesMaximumAndRecoveryWithoutClientAuthority(t *testing.T) {
	queryer := featSpellTestQueryer{
		"guidance": {ID: "guidance", Name: "Guidance", Level: 0, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"light":    {ID: "light", Name: "Light", Level: 0, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(0), "classes": []any{"wizard"}}},
		"shield":   {ID: "shield", Name: "Shield", Level: 1, Classes: []string{"wizard"}, Rules: map[string]any{"level": float64(1), "classes": []any{"wizard"}}},
	}
	sheet := validSheet()
	sheet.Feats = "Magic Initiate"
	input := magicInitiateGrant("client-selected")
	input.CantripEntryIDs = []string{"guidance", "light"}
	sheet.FeatSpellGrants = []FeatSpellGrant{input}
	previous := Sheet{FeatSpellGrants: []FeatSpellGrant{{
		ID: "grant", FeatID: "magic-initiate", SpellList: "wizard", FirstLevelSpellEntryID: "shield",
		FreeCastsRemaining: 0, FreeCastsMaxOverride: ptrInt(3), FreeCastsRecovery: "short", Active: true,
	}}}
	grants, err := reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, previous)
	if err != nil {
		t.Fatal(err)
	}
	if len(grants) != 1 || grants[0].ID != "grant" || grants[0].FreeCastsRemaining != 0 || grants[0].FreeCastsMaxOverride == nil || *grants[0].FreeCastsMaxOverride != 3 || grants[0].FreeCastsRecovery != "short" {
		t.Fatalf("stored narrator configuration/current use was not preserved: %+v", grants)
	}
	input.FreeCastsRemaining = 999
	input.FreeCastsMaxOverride = ptrInt(999)
	sheet.FeatSpellGrants = []FeatSpellGrant{input}
	grants, err = reconcileFeatSpellGrants(context.Background(), queryer, "campaign", sheet, Sheet{})
	if err != nil {
		t.Fatal(err)
	}
	if grants[0].FreeCastsRemaining != 1 || grants[0].FreeCastsMaxOverride != nil {
		t.Fatalf("client changed server-owned usage/config: %+v", grants[0])
	}
}

func TestConfiguredFeatSpellRecoveryShortAndLongIncludesShortRecovery(t *testing.T) {
	grant := FeatSpellGrant{FeatID: "magic-initiate", FreeCastsRemaining: 0, FreeCastsMaxOverride: ptrInt(3), FreeCastsRecovery: "short", Active: true}
	short, err := recoverFeatSpellGrantUses([]FeatSpellGrant{grant}, "short")
	if err != nil || short[0].FreeCastsRemaining != 3 {
		t.Fatalf("short rest should restore configured maximum: %+v, %v", short, err)
	}
	long, err := recoverFeatSpellGrantUses([]FeatSpellGrant{grant}, "long")
	if err != nil || long[0].FreeCastsRemaining != 3 {
		t.Fatalf("long rest should also restore short-recovery grants: %+v, %v", long, err)
	}
	never := FeatSpellGrant{FeatID: "magic-initiate", FreeCastsRemaining: 0, FreeCastsMaxOverride: ptrInt(3), FreeCastsRecovery: "none", Active: true}
	unchanged, err := recoverFeatSpellGrantUses([]FeatSpellGrant{never}, "long")
	if err != nil || unchanged[0].FreeCastsRemaining != 0 {
		t.Fatalf("nonrecovering grant was restored: %+v, %v", unchanged, err)
	}
}

func ptrInt(value int) *int { return &value }

func TestFeatGrantedSpellChoiceRemainsBoundToItsReviewedLevelAndSpellList(t *testing.T) {
	grant := magicInitiateGrant("server-grant")
	cases := []struct {
		name  string
		spell compendiumSpellChoice
		valid bool
	}{
		{name: "selected cantrip", spell: compendiumSpellChoice{ID: "light", Level: 0, Classes: []string{"wizard"}}, valid: true},
		{name: "selected first-level spell", spell: compendiumSpellChoice{ID: "shield", Level: 1, Classes: []string{"wizard"}}, valid: true},
		{name: "wrong level", spell: compendiumSpellChoice{ID: "shield", Level: 2, Classes: []string{"wizard"}}},
		{name: "wrong list", spell: compendiumSpellChoice{ID: "shield", Level: 1, Classes: []string{"cleric"}}},
		{name: "not selected", spell: compendiumSpellChoice{ID: "other", Level: 0, Classes: []string{"wizard"}}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			err := validateFeatGrantedSpellChoice(grant, test.spell)
			if test.valid && err != nil {
				t.Fatalf("valid choice rejected: %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("invalid choice accepted")
			}
		})
	}
}
