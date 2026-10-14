package scenes

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSetCombatTransitionsPreserveDnd2024EffectsMovementAndEventsIntegration(t *testing.T) {
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

	campaignID, gmID, playerID, sceneID := sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t)
	tokenA, tokenB := sceneTestUUID(t), sceneTestUUID(t)
	defer func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, gmID, playerID)
	}()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated SetCombat fixtures: %v", err)
	}
	for _, profile := range []struct{ id, name string }{{gmID, "SetCombat GM"}, {playerID, "SetCombat player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, profile.id, profile.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'SetCombat transition test',$2,'dnd2024','1.0.0')`, campaignID, gmID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, gmID, playerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scenes(id,campaign_id,name,player_access) values($1,$2,'SetCombat transition test','available')`, sceneID, campaignID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into scene_tokens(id,scene_id,name) values($1,$3,'Token A'),($2,$3,'Token B')`, tokenA, tokenB, sceneID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	seedSetCombatEffectsAndMovement(t, ctx, pool, sceneID, tokenA, tokenB)

	// Authorization is checked before campaign system resolution.
	if _, err := pool.Exec(ctx, `update campaigns set system_version='9.9.9' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}
	var unsupportedUpdatedAt time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&unsupportedUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SetCombat(ctx, sceneID, tokenA, playerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unauthorized player with unsupported reference error = %v, want forbidden", err)
	}
	if _, err := repo.SetCombat(ctx, sceneID, tokenA, gmID); !errors.Is(err, ErrUnsupportedCampaignSystem) {
		t.Fatalf("authorized GM with unsupported reference error = %v, want unsupported system", err)
	}
	var activeToken *string
	var eventCount int
	if err := pool.QueryRow(ctx, `select active_token_id::text from scenes where id=$1`, sceneID).Scan(&activeToken); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='combat.log'`, campaignID).Scan(&eventCount); err != nil {
		t.Fatal(err)
	}
	if activeToken != nil || eventCount != 0 {
		t.Fatalf("unsupported reference left partial state: active token=%v, events=%d", activeToken, eventCount)
	}
	var afterUnsupportedUpdatedAt time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&afterUnsupportedUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if !afterUnsupportedUpdatedAt.Equal(unsupportedUpdatedAt) {
		t.Fatalf("unsupported reference changed scene updated_at from %v to %v", unsupportedUpdatedAt, afterUnsupportedUpdatedAt)
	}
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenA, 5)
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenA, "A start expires", true, 1, "A start decrements", true, 2, "A end untouched", true, 1, "A end expires", true, 1, "A end decrements", true, 2)
	if _, err := pool.Exec(ctx, `update campaigns set system_version='1.0.0' where id=$1`, campaignID); err != nil {
		t.Fatal(err)
	}

	// Empty -> empty has no write, event, effect tick, or movement reset.
	var originalUpdatedAt time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&originalUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SetCombat(ctx, sceneID, "", gmID); err != nil {
		t.Fatalf("empty combat no-op: %v", err)
	}
	assertSetCombatNoOp(t, ctx, pool, sceneID, campaignID, originalUpdatedAt, 0)
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenA, 5)
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenA, "A start expires", true, 1, "A start decrements", true, 2)

	// Starting combat resets movement and consumes only the entrant's start effects.
	started, err := repo.SetCombat(ctx, sceneID, tokenA, gmID)
	if err != nil || started.ActiveTokenID == nil || *started.ActiveTokenID != tokenA || started.Message != "⚔️ Combate iniciado — turno de Token A." {
		t.Fatalf("start transition = %+v, err=%v", started, err)
	}
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenA, "A start expires", false, 0, "A start decrements", true, 1, "A end untouched", true, 1)
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenA, 0)
	assertSetCombatEvents(t, ctx, pool, campaignID, "⚔️ Combate iniciado — turno de Token A.")

	// Repeating the active token must not update, reset movement, tick effects, or emit another event.
	if _, err := pool.Exec(ctx, `update scene_token_turn_movement set spent_squares=2 where scene_id=$1 and token_id=$2`, sceneID, tokenA); err != nil {
		t.Fatal(err)
	}
	var beforeNoOp time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&beforeNoOp); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SetCombat(ctx, sceneID, tokenA, gmID); err != nil {
		t.Fatalf("same-token no-op: %v", err)
	}
	assertSetCombatNoOp(t, ctx, pool, sceneID, campaignID, beforeNoOp, 1)
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenA, 2)
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenA, "A start expires", false, 0, "A start decrements", true, 1, "A end untouched", true, 1)

	// Switching tokens ticks the outgoing end and incoming start boundaries once.
	advanced, err := repo.SetCombat(ctx, sceneID, tokenB, gmID)
	if err != nil || advanced.ActiveTokenID == nil || *advanced.ActiveTokenID != tokenB || advanced.Message != "⚔️ Turno de Token B." {
		t.Fatalf("advance transition = %+v, err=%v", advanced, err)
	}
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenA, "A end expires", false, 0, "A end decrements", true, 1)
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenB, "B start decrements", true, 1, "B end untouched", true, 1)
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenB, 0)
	assertSetCombatEvents(t, ctx, pool, campaignID, "⚔️ Combate iniciado — turno de Token A.", "⚔️ Turno de Token B.")

	if _, err := pool.Exec(ctx, `update scene_token_turn_movement set spent_squares=4 where scene_id=$1 and token_id=$2`, sceneID, tokenB); err != nil {
		t.Fatal(err)
	}
	ended, err := repo.SetCombat(ctx, sceneID, "", gmID)
	if err != nil || ended.ActiveTokenID != nil || ended.Message != "⚔️ Combate encerrado." {
		t.Fatalf("end transition = %+v, err=%v", ended, err)
	}
	assertSetCombatEffects(t, ctx, pool, sceneID, tokenB, "B end expires", false, 0)
	assertSetCombatMovement(t, ctx, pool, sceneID, tokenB, 4)
	assertSetCombatEvents(t, ctx, pool, campaignID, "⚔️ Combate iniciado — turno de Token A.", "⚔️ Turno de Token B.", "⚔️ Combate encerrado.")
	var endedUpdatedAt time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&endedUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SetCombat(ctx, sceneID, "", gmID); err != nil {
		t.Fatalf("ended combat no-op: %v", err)
	}
	assertSetCombatNoOp(t, ctx, pool, sceneID, campaignID, endedUpdatedAt, 3)
}

func seedSetCombatEffectsAndMovement(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sceneID, tokenA, tokenB string) {
	t.Helper()
	_, err := pool.Exec(ctx, `
		insert into scene_token_effects(scene_id,token_id,name,remaining_turns,tick_at) values
		($1,$2,'A start expires',1,'turn_start'),($1,$2,'A start decrements',2,'turn_start'),($1,$2,'A end untouched',1,'turn_end'),
		($1,$2,'A end expires',1,'turn_end'),($1,$2,'A end decrements',2,'turn_end'),
		($1,$3,'B start decrements',2,'turn_start'),($1,$3,'B end untouched',1,'turn_end'),($1,$3,'B end expires',1,'turn_end')`, sceneID, tokenA, tokenB)
	if err != nil {
		t.Fatal(err)
	}
	for _, tokenID := range []string{tokenA, tokenB} {
		if _, err := pool.Exec(ctx, `insert into scene_token_turn_movement(scene_id,token_id,spent_squares) values($1,$2,5)`, sceneID, tokenID); err != nil {
			t.Fatal(err)
		}
	}
}

func assertSetCombatEffects(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sceneID, tokenID string, expectations ...any) {
	t.Helper()
	for i := 0; i < len(expectations); i += 3 {
		name := expectations[i].(string)
		wantPresent := expectations[i+1].(bool)
		wantTurns := expectations[i+2].(int)
		var turns *int
		err := pool.QueryRow(ctx, `select remaining_turns from scene_token_effects where scene_id=$1 and token_id=$2 and name=$3`, sceneID, tokenID, name).Scan(&turns)
		if !wantPresent {
			if err == nil {
				t.Errorf("effect %q remains, want expired", name)
			} else if !errors.Is(err, pgx.ErrNoRows) {
				t.Errorf("read effect %q: %v", name, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("read effect %q: %v", name, err)
			continue
		}
		if turns == nil || *turns != wantTurns {
			t.Errorf("effect %q remaining turns=%v, want %d", name, turns, wantTurns)
		}
	}
}

func assertSetCombatMovement(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sceneID, tokenID string, want float64) {
	t.Helper()
	var got float64
	if err := pool.QueryRow(ctx, `select spent_squares from scene_token_turn_movement where scene_id=$1 and token_id=$2`, sceneID, tokenID).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("movement spent=%v, want %v", got, want)
	}
}

func assertSetCombatEventCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, campaignID string, want int) {
	t.Helper()
	var got int
	if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='combat.log'`, campaignID).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("combat log count=%d, want %d", got, want)
	}
}

func assertSetCombatEvents(t *testing.T, ctx context.Context, pool *pgxpool.Pool, campaignID string, want ...string) {
	t.Helper()
	rows, err := pool.Query(ctx, `select payload->>'text' from game_events where campaign_id=$1 and event_type='combat.log' order by id`, campaignID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []string
	for rows.Next() {
		var message string
		if err := rows.Scan(&message); err != nil {
			t.Fatal(err)
		}
		got = append(got, message)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("combat log events=%v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("combat log event %d=%q, want %q", i, got[i], want[i])
		}
	}
}

func assertSetCombatNoOp(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sceneID, campaignID string, wantUpdatedAt time.Time, wantEvents int) {
	t.Helper()
	var gotUpdatedAt time.Time
	if err := pool.QueryRow(ctx, `select updated_at from scenes where id=$1`, sceneID).Scan(&gotUpdatedAt); err != nil {
		t.Fatal(err)
	}
	if !gotUpdatedAt.Equal(wantUpdatedAt) {
		t.Errorf("no-op changed scene updated_at from %v to %v", wantUpdatedAt, gotUpdatedAt)
	}
	assertSetCombatEventCount(t, ctx, pool, campaignID, wantEvents)
}
