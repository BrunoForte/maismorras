package characters

import (
	"encoding/json"
	"testing"

	"vtt-backend/internal/sheetcompat"
)

func TestMarshalSheetPreservingUnknownFieldsKeepsStoredPR31Data(t *testing.T) {
	stored := []byte(`{
		"name":"Antes",
		"speciesId":"stored-species",
		"speciesLineageId":"stored-lineage",
		"speciesSpellcastingAbility":"charisma",
		"speciesSpellGrants":[{"id":"species-grant-1","featureId":"drow-magic","spellEntryId":"spell-a","freeCastsRemaining":1,"freeCastsMaxOverride":2,"freeCastsRecovery":"long","sourceMetadata":{"campaign":"stored"}}],
		"featSpellGrants":[
			{"id":"feat-b","featId":"magic-initiate","freeCastsRemaining":1,"freeCastsMaxOverride":3,"freeCastsRecovery":"short","sourceMetadata":{"grant":"b"}},
			{"id":"feat-a","featId":"magic-initiate","freeCastsRemaining":0,"freeCastsMaxOverride":1,"freeCastsRecovery":"long","sourceMetadata":{"grant":"a"}}
		],
		"campaignFeatSpellGrants":[{"id":"campaign-grant-1","featEntryId":"feat-entry","freeCastsRemaining":{"spell-a":1},"freeCastsMaxOverrides":{"spell-a":2},"freeCastsRecoveries":{"spell-a":"short"},"sourceMetadata":{"campaign":"stored"}}],
		"abilityScores":{"strength":10,"dexterity":12,"constitution":14,"intelligence":10,"wisdom":10,"charisma":16,"futureScoreMetadata":{"keep":true}},
		"resistances":["fire"]
	}`)
	request := []byte(`{
		"name":"Depois",
		"featSpellGrants":[
			{"id":"feat-a","featId":"magic-initiate","freeCastsRemaining":0},
			{"id":"feat-b","featId":"magic-initiate","freeCastsRemaining":1}
		],
		"campaignFeatSpellGrants":[{"id":"campaign-grant-1","featEntryId":"feat-entry","freeCastsRemaining":{"spell-a":0}}],
		"abilityScores":{"strength":10,"dexterity":12,"constitution":14,"intelligence":10,"wisdom":10,"charisma":16}
	}`)

	var sheet Sheet
	if err := json.Unmarshal(request, &sheet); err != nil {
		t.Fatal(err)
	}
	encoded, err := sheetcompat.MarshalPreservingUnknown(stored, sheet)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if got["name"] != "Depois" {
		t.Fatalf("known field name = %v, want updated value", got["name"])
	}
	for key, want := range map[string]any{
		"speciesId":                  "stored-species",
		"speciesLineageId":           "stored-lineage",
		"speciesSpellcastingAbility": "charisma",
	} {
		if got[key] != want {
			t.Errorf("preserved %s = %v, want %v", key, got[key], want)
		}
	}
	if _, exists := got["resistances"]; exists {
		t.Error("omitted known optional field resistances should remain removed")
	}

	species := got["speciesSpellGrants"].([]any)[0].(map[string]any)
	if species["freeCastsMaxOverride"] != float64(2) || species["freeCastsRecovery"] != "long" || species["sourceMetadata"].(map[string]any)["campaign"] != "stored" {
		t.Fatalf("species spell grant metadata was not preserved: %#v", species)
	}
	feats := got["featSpellGrants"].([]any)
	if feats[0].(map[string]any)["id"] != "feat-a" || feats[0].(map[string]any)["freeCastsRecovery"] != "long" || feats[0].(map[string]any)["sourceMetadata"].(map[string]any)["grant"] != "a" {
		t.Fatalf("unknown nested feat fields did not follow stable IDs after reorder: %#v", feats[0])
	}
	if feats[1].(map[string]any)["freeCastsMaxOverride"] != float64(3) || feats[1].(map[string]any)["freeCastsRecovery"] != "short" {
		t.Fatalf("second feat grant metadata was not preserved: %#v", feats[1])
	}
	campaignGrant := got["campaignFeatSpellGrants"].([]any)[0].(map[string]any)
	if campaignGrant["freeCastsMaxOverrides"].(map[string]any)["spell-a"] != float64(2) || campaignGrant["freeCastsRecoveries"].(map[string]any)["spell-a"] != "short" || campaignGrant["sourceMetadata"].(map[string]any)["campaign"] != "stored" {
		t.Fatalf("campaign feat grant metadata was not preserved: %#v", campaignGrant)
	}
	abilityScores := got["abilityScores"].(map[string]any)
	if abilityScores["futureScoreMetadata"].(map[string]any)["keep"] != true {
		t.Fatalf("nested unknown object was not preserved: %#v", abilityScores)
	}
}

func TestMarshalSheetPreservingUnknownFieldsRejectsClientUnknownValues(t *testing.T) {
	stored := []byte(`{"name":"Stored","speciesId":"canonical-species","featSpellGrants":[{"id":"feat-1","featId":"magic-initiate","freeCastsRemaining":1,"freeCastsMaxOverride":2,"freeCastsRecovery":"long"}]}`)
	request := []byte(`{"name":"Edited","speciesId":"attacker-species","clientOnlyField":{"admin":true},"featSpellGrants":[{"id":"feat-1","featId":"magic-initiate","freeCastsRemaining":0,"freeCastsMaxOverride":999,"freeCastsRecovery":"short","clientOnlyNested":{"admin":true}}]}`)
	var sheet Sheet
	if err := json.Unmarshal(request, &sheet); err != nil {
		t.Fatal(err)
	}
	encoded, err := sheetcompat.MarshalPreservingUnknown(stored, sheet)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if got["name"] != "Edited" || got["speciesId"] != "canonical-species" {
		t.Fatalf("known update or stored unknown field changed unexpectedly: %#v", got)
	}
	if _, exists := got["clientOnlyField"]; exists {
		t.Fatal("client-only unknown top-level field was persisted")
	}
	grant := got["featSpellGrants"].([]any)[0].(map[string]any)
	if grant["freeCastsMaxOverride"] != float64(2) || grant["freeCastsRecovery"] != "long" {
		t.Fatalf("client overwrote stored unknown grant fields: %#v", grant)
	}
	if _, exists := grant["clientOnlyNested"]; exists {
		t.Fatal("client-only unknown nested field was persisted")
	}
}

func TestMarshalSheetPreservingUnknownFieldsRefusesAmbiguousUnkeyedItems(t *testing.T) {
	t.Run("unknown metadata on unkeyed array items", func(t *testing.T) {
		type item struct {
			Name string `json:"name"`
		}
		type model struct {
			Items []item `json:"items"`
		}
		stored := []byte(`{"items":[{"name":"stored","futureMetadata":{"keep":true}}]}`)
		current := model{Items: []item{{Name: "updated"}}}
		if _, err := sheetcompat.MarshalPreservingUnknown(stored, current); err == nil {
			t.Fatal("expected unsafe unkeyed nested merge to be rejected")
		}
	})

	t.Run("unknown metadata below nested arrays", func(t *testing.T) {
		type child struct {
			Name string `json:"name"`
		}
		type item struct {
			Name     string  `json:"name"`
			Children []child `json:"children"`
		}
		type model struct {
			Items []item `json:"items"`
		}
		stored := []byte(`{"items":[{"name":"stored","children":[{"name":"child","futureMetadata":{"nested":[{"keep":true}]}}]}]}`)
		current := model{Items: []item{{Name: "updated", Children: []child{{Name: "updated child"}}}}}
		if _, err := sheetcompat.MarshalPreservingUnknown(stored, current); err == nil {
			t.Fatal("expected unknown metadata below an unkeyed item array to be rejected")
		}
	})

	t.Run("stable IDs remain safe", func(t *testing.T) {
		type identifiedItem struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		type identifiedModel struct {
			Items []identifiedItem `json:"items"`
		}
		identifiedStored := []byte(`{"items":[{"id":"stable","name":"stored","futureMetadata":{"keep":true}}]}`)
		identifiedCurrent := identifiedModel{Items: []identifiedItem{{Name: "updated without id"}}}
		if _, err := sheetcompat.MarshalPreservingUnknown(identifiedStored, identifiedCurrent); err == nil {
			t.Fatal("expected unknown fields on an ID-keyed item to reject an update without its stable ID")
		}

		identifiedStored = []byte(`{"items":[{"id":"first","name":"stored first","futureMetadata":{"keep":"first"}},{"id":"second","name":"stored second","futureMetadata":{"keep":"second"}}]}`)
		identifiedCurrent = identifiedModel{Items: []identifiedItem{{ID: "second", Name: "updated second"}, {ID: "first", Name: "updated first"}}}
		encoded, err := sheetcompat.MarshalPreservingUnknown(identifiedStored, identifiedCurrent)
		if err != nil {
			t.Fatalf("stable-ID reorder should preserve metadata: %v", err)
		}
		var got struct {
			Items []map[string]any `json:"items"`
		}
		if err := json.Unmarshal(encoded, &got); err != nil {
			t.Fatal(err)
		}
		if got.Items[0]["name"] != "updated second" || got.Items[0]["futureMetadata"].(map[string]any)["keep"] != "second" || got.Items[1]["name"] != "updated first" || got.Items[1]["futureMetadata"].(map[string]any)["keep"] != "first" {
			t.Fatalf("stable-ID metadata did not remain attached to its item after reorder: %#v", got.Items)
		}
	})
}
