package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCommittedGameEventNotifiesCampaignRealtimeIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	if !ListenCompatibleDatabaseURL(databaseURL) && !isLocalSupabaseTestURL(databaseURL) {
		t.Fatal("REALTIME_TEST_DATABASE_URL must use direct/session PostgreSQL or local Supabase")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	ids := []string{randomRealtimeTestUUID(t), randomRealtimeTestUUID(t)}
	campaignID, ownerID := ids[0], ids[1]
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id=$1`, ownerID)
	}
	defer cleanup()
	setup, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer setup.Rollback(context.Background())
	if _, err = setup.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated auth test profile: %v", err)
	}
	if _, err = setup.Exec(ctx, `insert into profiles(id,display_name) values($1,'Realtime integration')`, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err = setup.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Realtime integration',$2,'dnd2024')`, campaignID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err = setup.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm')`, campaignID, ownerID); err != nil {
		t.Fatal(err)
	}
	if err = setup.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	listener, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close(context.Background())
	if _, err = listener.Exec(ctx, `listen maismorras_realtime_v1`); err != nil {
		t.Fatal(err)
	}
	var eventID int64
	if err = pool.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'dice.roll','{"expressao":"1d20","dados":[17],"total":17}') returning id`, campaignID, ownerID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	notification, err := listener.WaitForNotification(ctx)
	if err != nil {
		t.Fatalf("committed game event was not notified: %v", err)
	}
	var envelope Envelope
	if err = json.Unmarshal([]byte(notification.Payload), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.RoomType != campaignRoomType || envelope.CampaignID != campaignID || envelope.EventID != fmt.Sprint(eventID) {
		t.Fatalf("notification envelope has wrong campaign/event identity: %#v", envelope)
	}
	if !validCampaignEvent(envelope.Payload) {
		t.Fatalf("notification payload is not a campaign event: %s", envelope.Payload)
	}
}

func randomRealtimeTestUUID(t *testing.T) string {
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
