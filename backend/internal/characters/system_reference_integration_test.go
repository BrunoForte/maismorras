package characters

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
	"vtt-backend/internal/systems"
)

func TestSheetOperationsUsePersistedCampaignReferenceIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	campaignID, gmID, playerID := characterTestUUID(t), characterTestUUID(t), characterTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from actors where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaign_members where campaign_id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}
	defer cleanup()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated character fixtures: %v", err)
	}
	if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,'Versioned sheet GM'),($2,'Versioned sheet player')`, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Versioned sheet test',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character','Versioned sheet test','{}')`, campaignID, playerID); err != nil {
		t.Fatal(err)
	}
	var actorID string
	if err := tx.QueryRow(ctx, `select id::text from actors where campaign_id=$1 and owner_id=$2 and kind='character'`, campaignID, playerID).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	forwardFields := []byte(`{
		"speciesId":"compat-drow",
		"speciesLineageId":"compat-lineage",
		"speciesSpellcastingAbility":"charisma",
		"speciesSpellGrants":[{"id":"species-grant-1","featureId":"drow-magic","speciesId":"compat-drow","lineageId":"compat-lineage","spellEntryId":"spell-a","freeCastsRemaining":1,"freeCastsMaxOverride":2,"freeCastsRecovery":"long","freeCastsMax":1,"defaultFreeCasts":1,"canUseExistingSlots":false,"active":true,"futureMetadata":{"source":"synthetic"}}],
		"featSpellGrants":[{"id":"legacy-feat-grant-1","featId":"magic-initiate","spellList":"wizard","ability":"intelligence","cantripEntryIds":["cantrip-a","cantrip-b"],"firstLevelSpellEntryId":"spell-a","freeCastsRemaining":1,"freeCastsMaxOverride":2,"freeCastsRecovery":"long","active":true,"futureMetadata":{"source":"synthetic"}}],
		"campaignFeatSpellGrants":[{"id":"campaign-feat:synthetic-entry:1","featEntryId":"synthetic-entry","spellcastingAbilities":{"spell-a":"wisdom"},"freeCastsRemaining":{"spell-a":1},"freeCastsMaxOverrides":{"spell-a":2},"freeCastsRecoveries":{"spell-a":"short"},"active":true,"futureMetadata":{"source":"synthetic"}}],
		"abilityScores":{"strength":10,"dexterity":14,"constitution":12,"intelligence":10,"wisdom":12,"charisma":10,"futureMetadata":{"keep":true}}
	}`)
	if _, err := tx.Exec(ctx, `update actors set sheet=$1::jsonb where id=$2`, forwardFields, actorID); err != nil {
		t.Fatal(err)
	}
	var sceneID string
	if err := tx.QueryRow(ctx, `insert into scenes(campaign_id,name) values($1,'Fractional speed test') returning id::text`, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scene_tokens(scene_id,actor_id,name,movement_limit) values($1,$2,'Fractional speed token',6)`, sceneID, actorID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	handler := NewHandler(repo)
	sheet := Sheet{
		Name: "Versioned character", Class: "wizard", Level: 5, Species: "Goliath", Speed: 10.5, AbilityScores: AbilityScores{Strength: 10, Dexterity: 14, Constitution: 12, Intelligence: 10, Wisdom: 12, Charisma: 10},
		ProficiencyBonus: 99, ArmorClass: 99, PassivePerception: 99, SkillProficiencies: []string{"Percepção"},
		HitPointsCurrent: 1, HitPointsMax: 10, HitDice: "1d8", Spells: []Spell{{Name: "Teste de slot", Level: 1, DiceFormula: "1d4"}}, SpellSlots: []SpellSlot{}, Resources: []Resource{},
	}
	input, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var clientPayload map[string]any
	if err := json.Unmarshal(input, &clientPayload); err != nil {
		t.Fatal(err)
	}
	clientPayload["systemId"] = "melted-lands"
	clientPayload["systemVersion"] = "999.0.0"
	clientPayload["speciesId"] = "attacker-species"
	clientPayload["clientOnlyField"] = map[string]any{"admin": true}
	input, err = json.Marshal(clientPayload)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("PUT", "/", bytes.NewReader(input))
	request.SetPathValue("campaignID", campaignID)
	request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: playerID}))
	response := httptest.NewRecorder()
	if err := handler.SaveMine(response, request); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 {
		t.Fatalf("SaveMine status = %d, body=%s", response.Code, response.Body.String())
	}
	var saved Character
	if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if saved.Sheet.ProficiencyBonus != 3 || saved.Sheet.ArmorClass != 12 || saved.Sheet.PassivePerception != 14 {
		t.Fatalf("derived fields did not use persisted D&D reference: proficiency=%d AC=%d passive=%d", saved.Sheet.ProficiencyBonus, saved.Sheet.ArmorClass, saved.Sheet.PassivePerception)
	}
	assertCompatibilityFields := func(stage string) {
		t.Helper()
		assertStoredForwardSheetFields(t, ctx, pool, actorID, stage)
	}
	assertCompatibilityFields("SaveMine")
	assertPlayerSpeed := func(species, lineage string, speed float64, wantSquares int) {
		t.Helper()
		current := saved.Sheet
		current.Species, current.SpeciesLineage, current.Speed = species, lineage, speed
		body, err := json.Marshal(current)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest("PUT", "/", bytes.NewReader(body))
		req.SetPathValue("campaignID", campaignID)
		req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{UserID: playerID}))
		res := httptest.NewRecorder()
		if err := handler.SaveMine(res, req); err != nil {
			t.Fatal(err)
		}
		if res.Code != http.StatusOK {
			t.Fatalf("player SaveMine for %s returned %d: %s", species, res.Code, res.Body.String())
		}
		assertCompatibilityFields("SaveMine speed update")
		var response Character
		if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if response.Sheet.Speed != speed {
			t.Fatalf("saved %s speed = %v, want exact %v", species, response.Sheet.Speed, speed)
		}
		req = httptest.NewRequest("GET", "/", nil)
		req.SetPathValue("campaignID", campaignID)
		req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{UserID: playerID}))
		res = httptest.NewRecorder()
		if err := handler.GetMine(res, req); err != nil || res.Code != http.StatusOK {
			t.Fatalf("player GetMine for %s returned %d, err=%v", species, res.Code, err)
		}
		var loaded Character
		if err := json.Unmarshal(res.Body.Bytes(), &loaded); err != nil {
			t.Fatal(err)
		}
		if loaded.Sheet.Speed != speed {
			t.Fatalf("reloaded %s speed = %v, want %v", species, loaded.Sheet.Speed, speed)
		}
		var actualSquares int
		if err := pool.QueryRow(ctx, `select movement_limit from scene_tokens where scene_id=$1 and actor_id=$2`, sceneID, actorID).Scan(&actualSquares); err != nil {
			t.Fatal(err)
		}
		if actualSquares != wantSquares {
			t.Fatalf("token movement limit for %s = %d squares, want %d", species, actualSquares, wantSquares)
		}
		saved = response
	}
	assertPlayerSpeed("Golias", "", 10.5, 7)
	assertPlayerSpeed("Elfo", "Elfo da Floresta", 10.5, 7)
	assertPlayerSpeed("Humano", "", 9, 6)
	gmPayload, err := json.Marshal(clientPayload)
	if err != nil {
		t.Fatal(err)
	}
	request = httptest.NewRequest("PUT", "/", bytes.NewReader(gmPayload))
	request.SetPathValue("campaignID", campaignID)
	request.SetPathValue("characterID", saved.ID)
	request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: gmID}))
	response = httptest.NewRecorder()
	if err := handler.SaveForGM(response, request); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 {
		t.Fatalf("GM SaveForGM status = %d, body=%s", response.Code, response.Body.String())
	}
	assertCompatibilityFields("SaveForGM")
	var persistedSystemID, persistedSystemVersion string
	if err := pool.QueryRow(ctx, `select system_id,system_version from campaigns where id=$1`, campaignID).Scan(&persistedSystemID, &persistedSystemVersion); err != nil {
		t.Fatal(err)
	}
	if persistedSystemID != string(systems.Dnd2024) || persistedSystemVersion != string(systems.Dnd2024V1) {
		t.Fatalf("sheet payload changed campaign reference to %s@%s", persistedSystemID, persistedSystemVersion)
	}

	adjustSlot := func(userID string, current int) error {
		t.Helper()
		body, marshalErr := json.Marshal(map[string]int{"level": 2, "current": current})
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		req := httptest.NewRequest("PATCH", "/", bytes.NewReader(body))
		req.SetPathValue("campaignID", campaignID)
		req.SetPathValue("characterID", saved.ID)
		req = req.WithContext(auth.WithPrincipal(req.Context(), auth.Principal{UserID: userID}))
		return handler.SetAvailableSpellSlotsForGM(httptest.NewRecorder(), req)
	}
	if err := adjustSlot(gmID, 1); err != nil {
		t.Fatalf("GM slot adjustment failed: %v", err)
	}
	assertCompatibilityFields("SetAvailableSpellSlotsForGM")
	adjusted, err := repo.GetForGM(ctx, campaignID, saved.ID, gmID)
	if err != nil {
		t.Fatal(err)
	}
	if adjusted.Sheet.SpellSlots[1] != (SpellSlot{Level: 2, Current: 1, Max: 3}) {
		t.Fatalf("adjustment did not persist remaining/max independently: %+v", adjusted.Sheet.SpellSlots)
	}
	if err := adjustSlot(playerID, 0); err == nil {
		t.Fatal("player could adjust another character's slots")
	} else {
		var apiErr *apperror.Error
		if !errors.As(err, &apiErr) || apiErr.Status != http.StatusForbidden {
			t.Fatalf("player slot adjustment error = %v, want forbidden", err)
		}
	}
	if err := adjustSlot(gmID, 4); err == nil {
		t.Fatal("GM could exceed progression maximum")
	} else {
		var apiErr *apperror.Error
		if !errors.As(err, &apiErr) || apiErr.Status != http.StatusBadRequest {
			t.Fatalf("out-of-range slot adjustment error = %v, want bad request", err)
		}
	}
	unchanged, err := repo.GetForGM(ctx, campaignID, saved.ID, gmID)
	if err != nil || unchanged.Sheet.SpellSlots[1].Current != 1 || unchanged.Sheet.SpellSlots[1].Max != 3 {
		t.Fatalf("rejected slot edits changed persisted state: %+v, %v", unchanged.Sheet.SpellSlots, err)
	}
	cast, err := repo.CastSpell(ctx, campaignID, playerID, SpellCastInput{SpellIndex: 0, SlotLevel: 2})
	if err != nil || cast.Sheet.SpellSlots[1].Current != 0 || cast.Sheet.SpellSlots[1].Max != 3 {
		t.Fatalf("normal cast did not consume the adjusted remaining slot: %+v, %v", cast.Sheet.SpellSlots, err)
	}
	assertCompatibilityFields("CastSpell")
	if err := adjustSlot(gmID, 2); err != nil {
		t.Fatalf("GM recovery adjustment failed: %v", err)
	}
	recovered, err := repo.GetForGM(ctx, campaignID, saved.ID, gmID)
	if err != nil || recovered.Sheet.SpellSlots[1].Current != 2 || recovered.Sheet.SpellSlots[1].Max != 3 {
		t.Fatalf("GM could not restore available slots: %+v, %v", recovered.Sheet.SpellSlots, err)
	}

	roll, err := repo.RollSheet(ctx, campaignID, playerID, "skill", "Percepção", "normal")
	if err != nil || roll.Modifier != 4 || len(roll.Dice) != 1 {
		t.Fatalf("sheet roll = %+v, %v; want persisted D&D modifier 4 and one server die", roll, err)
	}
	for _, mode := range []string{"advantage", "disadvantage"} {
		rolled, rollErr := repo.RollSheet(ctx, campaignID, playerID, "skill", "Percepção", mode)
		if rollErr != nil || len(rolled.Dice) != 2 {
			t.Fatalf("sheet %s roll = %+v, %v; want two server-rolled d20s", mode, rolled, rollErr)
		}
		wantKept := rolled.Dice[0]
		if (mode == "advantage" && rolled.Dice[1] > wantKept) || (mode == "disadvantage" && rolled.Dice[1] < wantKept) {
			wantKept = rolled.Dice[1]
		}
		if rolled.Kept != wantKept || rolled.Total != wantKept+rolled.Modifier {
			t.Fatalf("sheet %s roll kept/total = %+v, want %d + %d", mode, rolled, wantKept, rolled.Modifier)
		}
		var payload struct {
			Dice []int  `json:"dados"`
			Kept int    `json:"dadoEscolhido"`
			Mode string `json:"modo"`
		}
		if err := pool.QueryRow(ctx, `select payload from game_events where id=$1`, rolled.EventID).Scan(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.Mode != mode || payload.Kept != wantKept || len(payload.Dice) != 2 {
			t.Fatalf("persisted %s roll payload = %+v", mode, payload)
		}
	}
	shortRest, err := repo.RestCharacter(ctx, campaignID, playerID, saved.ID, "short")
	if err != nil || shortRest.Sheet.ProficiencyBonus != 3 {
		t.Fatalf("short rest = %+v, %v", shortRest, err)
	}
	assertCompatibilityFields("RestCharacter short")
	longRest, err := repo.RestCharacter(ctx, campaignID, playerID, saved.ID, "long")
	if err != nil || longRest.Sheet.HitPointsCurrent != longRest.Sheet.HitPointsMax {
		t.Fatalf("long rest = %+v, %v", longRest, err)
	}
	assertCompatibilityFields("RestCharacter long")

	if _, err := pool.Exec(ctx, `update campaigns set system_version='9.9.9' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}
	request = httptest.NewRequest("GET", "/", nil)
	request.SetPathValue("campaignID", campaignID)
	request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: playerID}))
	if err := handler.GetMine(httptest.NewRecorder(), request); err == nil {
		t.Fatal("sheet read silently accepted an unregistered persisted campaign version")
	} else {
		var appError *apperror.Error
		if !errors.As(err, &appError) || appError.Code != "UNSUPPORTED_CAMPAIGN_SYSTEM" || appError.Status != 409 {
			t.Fatalf("unknown persisted reference response = %v, want explicit 409", err)
		}
	}
}

func assertStoredForwardSheetFields(t *testing.T, ctx context.Context, pool *pgxpool.Pool, actorID, stage string) {
	t.Helper()
	var raw []byte
	if err := pool.QueryRow(ctx, `select sheet from actors where id=$1`, actorID).Scan(&raw); err != nil {
		t.Fatalf("%s: read compatibility sheet: %v", stage, err)
	}
	var stored map[string]any
	if err := json.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("%s: decode compatibility sheet: %v", stage, err)
	}
	for key, want := range map[string]any{
		"speciesId":                  "compat-drow",
		"speciesLineageId":           "compat-lineage",
		"speciesSpellcastingAbility": "charisma",
	} {
		if stored[key] != want {
			t.Fatalf("%s: %s = %v, want %v", stage, key, stored[key], want)
		}
	}
	if _, exists := stored["clientOnlyField"]; exists {
		t.Fatalf("%s: client-only unknown field was persisted", stage)
	}
	species := stored["speciesSpellGrants"].([]any)[0].(map[string]any)
	if species["freeCastsMaxOverride"] != float64(2) || species["freeCastsRecovery"] != "long" || species["futureMetadata"].(map[string]any)["source"] != "synthetic" {
		t.Fatalf("%s: species grant fields changed: %#v", stage, species)
	}
	feat := stored["featSpellGrants"].([]any)[0].(map[string]any)
	if feat["id"] != "legacy-feat-grant-1" || feat["freeCastsMaxOverride"] != float64(2) || feat["freeCastsRecovery"] != "long" || feat["futureMetadata"].(map[string]any)["source"] != "synthetic" {
		t.Fatalf("%s: feat grant fields changed: %#v", stage, feat)
	}
	campaignGrant := stored["campaignFeatSpellGrants"].([]any)[0].(map[string]any)
	maxOverrides := campaignGrant["freeCastsMaxOverrides"].(map[string]any)
	recoveries := campaignGrant["freeCastsRecoveries"].(map[string]any)
	if maxOverrides["spell-a"] != float64(2) || recoveries["spell-a"] != "short" || campaignGrant["futureMetadata"].(map[string]any)["source"] != "synthetic" {
		t.Fatalf("%s: campaign feat grant fields changed: %#v", stage, campaignGrant)
	}
	abilityScores := stored["abilityScores"].(map[string]any)
	if !reflect.DeepEqual(abilityScores["futureMetadata"], map[string]any{"keep": true}) {
		t.Fatalf("%s: nested forward field changed: %#v", stage, abilityScores)
	}
}

func characterTestUUID(t *testing.T) string {
	t.Helper()
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		t.Fatal(err)
	}
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80
	encoded := hex.EncodeToString(raw[:])
	return encoded[:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:]
}
