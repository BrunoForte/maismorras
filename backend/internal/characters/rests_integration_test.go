package characters

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

func TestShortRestPersistsSelectionAuthorizationAndAtomicityIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	campaignID, gmID, playerID, otherPlayerID, sceneID := characterTestUUID(t), characterTestUUID(t), characterTestUUID(t), characterTestUUID(t), characterTestUUID(t)
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2,$3)`, gmID, playerID, otherPlayerID)
	}()

	sheet := Sheet{
		Name: "Short rest integration", Class: "fighter", Level: 2, HitDice: "1d8", HitDiceSpent: 0,
		HitPointsCurrent: 4, HitPointsMax: 6, AbilityScores: AbilityScores{Strength: 10, Dexterity: 10, Constitution: 6, Intelligence: 10, Wisdom: 10, Charisma: 10},
		Resources:  []Resource{{ID: "short-feature", Name: "Short-rest feature", Current: 0, Max: 1, RestoreOn: "short"}},
		SpellSlots: []SpellSlot{},
	}
	rawSheet, err := json.Marshal(sheet)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated short-rest fixtures: %v", err)
	}
	for _, profile := range []struct{ id, name string }{{gmID, "Short rest GM"}, {playerID, "Short rest player"}, {otherPlayerID, "Other short rest player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, profile.id, profile.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Short rest integration',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player'),($1,$4,'player')`, campaignID, gmID, playerID, otherPlayerID); err != nil {
		t.Fatal(err)
	}
	var actorID, tokenID string
	if err := tx.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet,token) values($1,$2,'character',$3,$4,'{}'::jsonb) returning id::text`, campaignID, playerID, sheet.Name, rawSheet).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `insert into scenes(id,campaign_id,name,player_access) values($1,$2,'Short rest scene','available') returning id::text`, sceneID, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,owner_id,name,hp_current,hp_max,movement_limit) values($1,$2,$3,$4,$5,$6,6) returning id::text`, sceneID, actorID, playerID, sheet.Name, sheet.HitPointsCurrent, sheet.HitPointsMax).Scan(&tokenID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	assertPersistedState := func(wantHP, wantSpent, wantResource, wantEvents int) {
		t.Helper()
		var raw []byte
		if err := pool.QueryRow(ctx, `select sheet from actors where id=$1`, actorID).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var saved Sheet
		if err := json.Unmarshal(raw, &saved); err != nil {
			t.Fatal(err)
		}
		var tokenHP int
		if err := pool.QueryRow(ctx, `select hp_current from scene_tokens where id=$1`, tokenID).Scan(&tokenHP); err != nil {
			t.Fatal(err)
		}
		var eventCount int
		if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and actor_id=$2 and event_type in ('dice.roll','system.info')`, campaignID, playerID).Scan(&eventCount); err != nil {
			t.Fatal(err)
		}
		if saved.HitPointsCurrent != wantHP || tokenHP != wantHP || saved.HitDiceSpent != wantSpent || saved.Resources[0].Current != wantResource || eventCount != wantEvents {
			t.Fatalf("actor/token/spend/resource/events = %d/%d/%d/%d/%d, want %d/%d/%d/%d/%d", saved.HitPointsCurrent, tokenHP, saved.HitDiceSpent, saved.Resources[0].Current, eventCount, wantHP, wantHP, wantSpent, wantResource, wantEvents)
		}
	}

	// The HTTP handler must reject corrupt persisted state before changing the
	// sheet, token, Hit Dice, resources, or event stream.
	invalidSheet := sheet
	invalidSheet.HitPointsCurrent = sheet.HitPointsMax + 1
	invalidRawSheet, err := json.Marshal(invalidSheet)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `update actors set sheet=$1 where id=$2`, invalidRawSheet, actorID); err != nil {
		t.Fatal(err)
	}
	invalidRequest := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"kind":"short","hitDiceCount":0}`))
	invalidRequest.SetPathValue("campaignID", campaignID)
	invalidRequest.SetPathValue("characterID", actorID)
	invalidRequest = invalidRequest.WithContext(auth.WithPrincipal(invalidRequest.Context(), auth.Principal{UserID: playerID}))
	invalidResponse := httptest.NewRecorder()
	if err := NewHandler(repo).Rest(invalidResponse, invalidRequest); err != nil {
		apperror.Write(invalidResponse, err)
	}
	if invalidResponse.Code != http.StatusConflict || !strings.Contains(invalidResponse.Body.String(), `"code":"INVALID_REST_STATE"`) {
		t.Fatalf("invalid-state short-rest status=%d body=%s; want 409 INVALID_REST_STATE", invalidResponse.Code, invalidResponse.Body.String())
	}
	var afterInvalidRaw []byte
	if err := pool.QueryRow(ctx, `select sheet from actors where id=$1`, actorID).Scan(&afterInvalidRaw); err != nil {
		t.Fatal(err)
	}
	var afterInvalid Sheet
	if err := json.Unmarshal(afterInvalidRaw, &afterInvalid); err != nil {
		t.Fatal(err)
	}
	var tokenHP, invalidEventCount int
	if err := pool.QueryRow(ctx, `select hp_current from scene_tokens where id=$1`, tokenID).Scan(&tokenHP); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and actor_id=$2 and event_type in ('dice.roll','system.info')`, campaignID, playerID).Scan(&invalidEventCount); err != nil {
		t.Fatal(err)
	}
	if afterInvalid.HitPointsCurrent != invalidSheet.HitPointsCurrent || afterInvalid.HitDiceSpent != invalidSheet.HitDiceSpent || afterInvalid.Resources[0].Current != invalidSheet.Resources[0].Current || tokenHP != sheet.HitPointsCurrent || invalidEventCount != 0 {
		t.Fatalf("invalid-state request partially wrote: sheet=%+v tokenHP=%d events=%d", afterInvalid, tokenHP, invalidEventCount)
	}
	if _, err := pool.Exec(ctx, `update actors set sheet=$1 where id=$2`, rawSheet, actorID); err != nil {
		t.Fatal(err)
	}

	one := 1
	if _, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, otherPlayerID, actorID, "short", &one); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another campaign player rest error = %v, want not found", err)
	}
	assertPersistedState(4, 0, 0, 0)

	tooMany := 3
	if _, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, actorID, "short", &tooMany); !errors.Is(err, ErrInvalidHitDiceCount) {
		t.Fatalf("above-available count error = %v, want ErrInvalidHitDiceCount", err)
	}
	assertPersistedState(4, 0, 0, 0)

	// Force a database failure after actor and event writes. The transaction must
	// roll all of them back, including token synchronization.
	triggerSuffix := strings.ReplaceAll(actorID, "-", "")
	functionName := "reject_rest_token_" + triggerSuffix
	triggerName := "reject_rest_token_update_" + triggerSuffix
	if _, err := pool.Exec(ctx, fmt.Sprintf(`create function public.%s() returns trigger language plpgsql as $$ begin if new.actor_id='%s'::uuid then raise exception 'injected rest token sync failure'; end if; return new; end $$`, functionName, actorID)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, fmt.Sprintf(`create trigger %s before update on scene_tokens for each row execute function public.%s()`, triggerName, functionName)); err != nil {
		_, _ = pool.Exec(context.Background(), fmt.Sprintf(`drop function if exists public.%s()`, functionName))
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(context.Background(), fmt.Sprintf(`drop trigger if exists %s on scene_tokens`, triggerName))
		_, _ = pool.Exec(context.Background(), fmt.Sprintf(`drop function if exists public.%s()`, functionName))
	}()
	if _, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, actorID, "short", &one); err == nil {
		t.Fatal("injected token write failure was accepted")
	}
	assertPersistedState(4, 0, 0, 0)
	if _, err := pool.Exec(ctx, fmt.Sprintf(`drop trigger %s on scene_tokens`, triggerName)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, fmt.Sprintf(`drop function public.%s()`, functionName)); err != nil {
		t.Fatal(err)
	}

	zero := 0
	zeroResult, err := repo.RestCharacterWithHitDiceCount(ctx, campaignID, playerID, actorID, "short", &zero)
	if err != nil {
		t.Fatal(err)
	}
	if len(zeroResult.Dice) != 0 || zeroResult.Sheet.HitDiceSpent != 0 || zeroResult.Sheet.Resources[0].Current != 1 || zeroResult.Sheet.HitPointsCurrent != 4 {
		t.Fatalf("zero-die rest result = %+v; want resource recovery without HP or Hit Die changes", zeroResult)
	}
	assertPersistedState(4, 0, 1, 1)
	var zeroEventType string
	if err := pool.QueryRow(ctx, `select event_type from game_events where id=$1`, zeroResult.EventID).Scan(&zeroEventType); err != nil || zeroEventType != "system.info" {
		t.Fatalf("zero-die rest event type = %q, err=%v; want system.info", zeroEventType, err)
	}

	count := 2
	request := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"kind":"short","hitDiceCount":2,"dados":[8,8],"hitPointsCurrent":999999}`))
	request.SetPathValue("campaignID", campaignID)
	request.SetPathValue("characterID", actorID)
	request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: playerID}))
	response := httptest.NewRecorder()
	if err := NewHandler(repo).Rest(response, request); err != nil {
		apperror.Write(response, err)
	}
	if response.Code != http.StatusOK {
		t.Fatalf("authorized short-rest HTTP status=%d body=%s", response.Code, response.Body.String())
	}
	var result RestResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Sheet.HitPointsCurrent == 999999 {
		t.Fatal("server accepted client-provided final HP")
	}
	wantHealing := 0
	for _, roll := range result.Dice {
		wantHealing += max(1, roll+abilityModifier(sheet.AbilityScores.Constitution, dnd2024TestRules()))
	}
	wantHP := min(sheet.HitPointsMax, 4+wantHealing)
	if len(result.Dice) != count || result.Total != wantHealing || result.HPRecovered != wantHP-4 || result.Sheet.HitPointsCurrent != wantHP || result.Sheet.HitDiceSpent != count {
		t.Fatalf("multi-die rest result = %+v; expected server-derived healing %d and HP %d", result, wantHealing, wantHP)
	}
	assertPersistedState(wantHP, count, 1, 2)
	if err := repo.syncSceneTokens(ctx, actorID); err != nil {
		t.Fatal(err)
	}
	assertPersistedState(wantHP, count, 1, 2)
}
