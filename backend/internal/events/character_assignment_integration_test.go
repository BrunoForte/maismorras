package events

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/apperror"
	"vtt-backend/internal/auth"
)

func TestCreateEventValidatesCharacterAssignmentIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatalf("invalid REALTIME_TEST_DATABASE_URL: %v", err)
	}
	host := parsedURL.Hostname()
	if ip := net.ParseIP(host); (ip == nil || !ip.IsLoopback()) && host != "localhost" {
		t.Fatal("REALTIME_TEST_DATABASE_URL must point to a loopback PostgreSQL instance")
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

	campaignID, otherCampaignID := eventAssignmentTestUUID(t), eventAssignmentTestUUID(t)
	gmID, playerID, otherPlayerID := eventAssignmentTestUUID(t), eventAssignmentTestUUID(t), eventAssignmentTestUUID(t)
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from actors where campaign_id in ($1,$2)`, campaignID, otherCampaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaign_members where campaign_id in ($1,$2)`, campaignID, otherCampaignID)
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id in ($1,$2)`, campaignID, otherCampaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2,$3)`, gmID, playerID, otherPlayerID)
	}
	defer cleanup()

	setup, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer setup.Rollback(context.Background())
	if _, err := setup.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated event fixtures: %v", err)
	}
	if _, err := setup.Exec(ctx, `insert into profiles(id,display_name) values($1,'Event test GM'),($2,'Event test player'),($3,'Event test other player')`, gmID, playerID, otherPlayerID); err != nil {
		t.Fatal(err)
	}
	if _, err := setup.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id,system_version) values($1,'Event assignment test',$2,'dnd2024','1.0.0'),($3,'Other event campaign',$2,'dnd2024','1.0.0')`, campaignID, gmID, otherCampaignID); err != nil {
		t.Fatal(err)
	}
	if _, err := setup.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player'),($1,$4,'player'),($5,$2,'gm')`, campaignID, gmID, playerID, otherPlayerID, otherCampaignID); err != nil {
		t.Fatal(err)
	}
	var ownCharacterID, otherPlayerCharacterID, ownerlessCharacterID, otherCampaignCharacterID string
	if err := setup.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,full_npc,name,sheet) values($1,$2,'character',false,'Aela da Aurora','{}') returning id::text`, campaignID, playerID).Scan(&ownCharacterID); err != nil {
		t.Fatal(err)
	}
	if err := setup.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,full_npc,name,sheet) values($1,$2,'character',false,'Personagem de outra jogadora','{}') returning id::text`, campaignID, otherPlayerID).Scan(&otherPlayerCharacterID); err != nil {
		t.Fatal(err)
	}
	if err := setup.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,full_npc,name,sheet) values($1,NULL,'character',true,'NPC sem proprietário','{}') returning id::text`, campaignID).Scan(&ownerlessCharacterID); err != nil {
		t.Fatal(err)
	}
	if err := setup.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,full_npc,name,sheet) values($1,$2,'character',false,'Ficha de outra campanha','{}') returning id::text`, otherCampaignID, playerID).Scan(&otherCampaignCharacterID); err != nil {
		t.Fatal(err)
	}
	if err := setup.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	handler := NewHandler(pool)
	createRoll := func(userID, requestedCampaignID, characterID string) (*httptest.ResponseRecorder, error) {
		t.Helper()
		body, err := json.Marshal(map[string]any{
			"type": "dice.roll",
			"payload": map[string]any{
				"expression":  "1d20+4",
				"channel":     "combat",
				"characterId": characterID,
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
		request.SetPathValue("campaignID", requestedCampaignID)
		request = request.WithContext(auth.WithPrincipal(request.Context(), auth.Principal{UserID: userID}))
		response := httptest.NewRecorder()
		return response, handler.Create(response, request)
	}

	acceptedResponse, err := createRoll(playerID, campaignID, ownCharacterID)
	if err != nil || acceptedResponse.Code != http.StatusCreated {
		t.Fatalf("owner's character assignment status=%d err=%v body=%s", acceptedResponse.Code, err, acceptedResponse.Body.String())
	}
	var accepted Event
	if err := json.Unmarshal(acceptedResponse.Body.Bytes(), &accepted); err != nil {
		t.Fatal(err)
	}
	if accepted.Author != "Aela da Aurora" {
		t.Fatalf("authorized roll author=%q, want character name", accepted.Author)
	}
	var persistedCharacterName string
	if err := pool.QueryRow(ctx, `select payload->>'characterName' from game_events where id=$1`, accepted.ID).Scan(&persistedCharacterName); err != nil {
		t.Fatal(err)
	}
	if persistedCharacterName != "Aela da Aurora" {
		t.Fatalf("persisted characterName=%q, want Aela da Aurora", persistedCharacterName)
	}

	deniedAssignments := []struct {
		name        string
		characterID string
	}{
		{name: "another player's character", characterID: otherPlayerCharacterID},
		{name: "a character from another campaign", characterID: otherCampaignCharacterID},
		{name: "an ownerless character", characterID: ownerlessCharacterID},
	}
	for _, test := range deniedAssignments {
		t.Run(test.name, func(t *testing.T) {
			var before int
			if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='dice.roll'`, campaignID).Scan(&before); err != nil {
				t.Fatal(err)
			}
			response, err := createRoll(playerID, campaignID, test.characterID)
			var apiErr *apperror.Error
			if !errors.As(err, &apiErr) || apiErr.Status != http.StatusForbidden {
				t.Fatalf("assignment error=%v response=%s, want forbidden", err, response.Body.String())
			}
			var after int
			if err := pool.QueryRow(ctx, `select count(*) from game_events where campaign_id=$1 and event_type='dice.roll'`, campaignID).Scan(&after); err != nil {
				t.Fatal(err)
			}
			if after != before {
				t.Fatalf("rejected assignment persisted a roll: before=%d after=%d", before, after)
			}
		})
	}
}

func eventAssignmentTestUUID(t *testing.T) string {
	t.Helper()
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		t.Fatal(err)
	}
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80
	encoded := hex.EncodeToString(raw[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", encoded[:8], encoded[8:12], encoded[12:16], encoded[16:20], encoded[20:])
}
