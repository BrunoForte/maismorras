package scenes

import "testing"
import "context"
import "crypto/rand"
import "encoding/hex"
import "errors"
import "os"
import "time"

import "github.com/jackc/pgx/v5/pgxpool"
import "vtt-backend/internal/systems"

func TestOverlayCameraCharacterIDs(t *testing.T) {
	validID := "34c52f5e-b8cb-4f16-b881-c93c3bf5cc74"
	ids, err := overlayCameraCharacterIDs([]byte(`[{"url":"https://vdo.ninja/one","characterId":"` + validID + `"},"https://vdo.ninja/legacy"]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != validID {
		t.Fatalf("got character ids %v, want [%s]", ids, validID)
	}
	if _, err := overlayCameraCharacterIDs([]byte(`[{"characterId":"not-a-uuid"}]`)); err == nil {
		t.Fatal("expected invalid character id to be rejected")
	}
}

func TestSceneAudioStatePersistenceAuthorizationAndRevisionIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ids := []string{sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t), sceneTestUUID(t)}
	campaignID, ownerID, playerID, sceneID := ids[0], ids[1], ids[2], ids[3]
	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `delete from campaigns where id=$1`, campaignID)
		_, _ = pool.Exec(context.Background(), `delete from profiles where id in ($1,$2)`, ownerID, playerID)
	}
	defer cleanup()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `set local session_replication_role=replica`); err != nil {
		t.Skipf("database role cannot create isolated profiles: %v", err)
	}
	for _, user := range []struct{ id, name string }{{ownerID, "Audio GM"}, {playerID, "Audio player"}} {
		if _, err := tx.Exec(ctx, `insert into profiles(id,display_name) values($1,$2)`, user.id, user.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `insert into campaigns(id,name,owner_id,system_id) values($1,'Audio state integration',$2,'dnd2024')`, campaignID, ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'gm'),($1,$3,'player')`, campaignID, ownerID, playerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `insert into scenes(campaign_id,name,player_access) values($1,'Audio integration','available') returning id::text`, campaignID).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	repo := NewRepository(pool)
	path := "campaigns/" + campaignID + "/media/theme.mp3"
	music, err := repo.UpdateAudioState(ctx, sceneID, ownerID, "music", 0, AudioChannelState{Path: &path, Playing: true, Volume: .7, PositionMs: 0, StartedAt: time.Now().UnixMilli(), Loop: true})
	if err != nil || music.Revision != 1 || !music.Loop || !music.Playing {
		t.Fatalf("music state = %+v, err=%v", music, err)
	}
	if _, err := repo.UpdateAudioState(ctx, sceneID, ownerID, "music", 0, AudioChannelState{Path: &path, Playing: false, Volume: .7}); !errors.Is(err, ErrAudioRevisionConflict) {
		t.Fatalf("stale music update error = %v, want revision conflict", err)
	}
	effectPath := "campaigns/" + campaignID + "/media/rain.ogg"
	effect, err := repo.UpdateAudioState(ctx, sceneID, ownerID, "effect", 0, AudioChannelState{Path: &effectPath, Playing: true, Volume: .5, StartedAt: time.Now().UnixMilli(), Loop: false})
	if err != nil || effect.Revision != 1 || effect.Loop {
		t.Fatalf("effect state = %+v, err=%v", effect, err)
	}
	if _, err := repo.UpdateAudioState(ctx, sceneID, playerID, "effect", effect.Revision, effect); !errors.Is(err, ErrForbidden) {
		t.Fatalf("player audio update error = %v, want forbidden", err)
	}
	var savedMusic, savedEffect bool
	if err := pool.QueryRow(ctx, `select ambient_audio_loop,ambient_effect_loop from scenes where id=$1`, sceneID).Scan(&savedMusic, &savedEffect); err != nil {
		t.Fatal(err)
	}
	if !savedMusic || savedEffect {
		t.Fatalf("persisted loops = music:%v effects:%v", savedMusic, savedEffect)
	}
}

func sceneTestUUID(t *testing.T) string {
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

func TestInitiativeAdvantageKeepsHigherRoll(t *testing.T) {
	rules, err := resolveDnd2024Rules(systems.DefaultRef())
	if err != nil {
		t.Fatal(err)
	}
	rolled, err := rules.RollD20(systems.RollAdvantage, 3, fixedRoller(4, 17))
	if err != nil {
		t.Fatal(err)
	}
	if rolled.Kept != 17 || rolled.Total != 20 {
		t.Fatalf("advantage result = %+v, want kept 17 and total 20", rolled)
	}
}

func TestResolveDnd2024RulesAndRejectUnknownReference(t *testing.T) {
	rules, err := resolveDnd2024Rules(systems.Ref{ID: systems.Dnd2024, Version: systems.Dnd2024V1})
	if err != nil || rules == nil {
		t.Fatalf("resolve registered reference = %v, %v", rules, err)
	}
	if _, err := resolveDnd2024Rules(systems.Ref{ID: systems.Dnd2024, Version: "9.9.9"}); !errors.Is(err, ErrUnsupportedCampaignSystem) {
		t.Fatalf("unknown reference error = %v, want unsupported campaign system", err)
	}
}

func TestResolveCombatTurnTransitionPolicyAndRejectUnknownReference(t *testing.T) {
	policy, err := resolveCombatTurnTransitionPolicy(systems.DefaultRef())
	if err != nil || policy == nil {
		t.Fatalf("resolve registered combat transition policy = %v, %v", policy, err)
	}
	if _, err := resolveCombatTurnTransitionPolicy(systems.Ref{ID: systems.Dnd2024, Version: "9.9.9"}); !errors.Is(err, ErrUnsupportedCampaignSystem) {
		t.Fatalf("unknown combat transition reference error = %v, want unsupported campaign system", err)
	}
}

func TestRollD20ModesPreserveDnd2024Results(t *testing.T) {
	rules, err := resolveDnd2024Rules(systems.DefaultRef())
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name     string
		mode     systems.D20Mode
		rolls    []int
		wantKept int
	}{{"normal", systems.RollNormal, []int{9}, 9}, {"advantage", systems.RollAdvantage, []int{4, 17}, 17}, {"disadvantage", systems.RollDisadvantage, []int{16, 3}, 3}} {
		t.Run(test.name, func(t *testing.T) {
			rolled, err := rollD20WithRoller(rules, test.mode, fixedRoller(test.rolls...))
			if err != nil {
				t.Fatal(err)
			}
			if len(rolled.Rolls) != len(test.rolls) {
				t.Fatalf("got %d d20 results, want %d", len(rolled.Rolls), len(test.rolls))
			}
			for _, roll := range rolled.Rolls {
				if roll < 1 || roll > 20 {
					t.Fatalf("d20 result out of range: %d", roll)
				}
			}
			if rolled.Kept != test.wantKept || rolled.Total != test.wantKept {
				t.Fatalf("d20 result = %+v, want kept/total %d", rolled, test.wantKept)
			}
		})
	}
}

func fixedRoller(values ...int) systems.DiceRoller {
	index := 0
	return func(int) (int, error) {
		value := values[index]
		index++
		return value, nil
	}
}

func TestPresentationDismissalRequiresEmptyHiddenPayload(t *testing.T) {
	if !isPresentationDismissal(Presentation{}) {
		t.Fatal("empty presentation should be dismissible")
	}
	if isPresentationDismissal(Presentation{Visible: true}) {
		t.Fatal("visible presentation must not be treated as a dismissal")
	}
	if isPresentationDismissal(Presentation{AssetPath: "campaigns/map.png"}) {
		t.Fatal("presentation with an asset must not be treated as a dismissal")
	}
}

func TestPresentationRecipientAuthorization(t *testing.T) {
	p := Presentation{Visible: true, AudienceRestricted: true, VisibleUserIDs: []string{"player-a"}, OverlayVisible: true}
	if !presentationVisibleTo(p, "player", "player-a", false) {
		t.Fatal("selected player should see the presentation")
	}
	if presentationVisibleTo(p, "player", "player-b", false) {
		t.Fatal("unselected player must not see the presentation")
	}
	if presentationVisibleTo(p, "player", "player-b", true) {
		t.Fatal("only the GM session should load content for the OBS overlay")
	}
	if !presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("GM should see the image in the overlay when that destination is enabled")
	}
	p.OverlayVisible = false
	if presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("overlay must stay hidden when the GM did not select it")
	}
}

func TestTextOnlyPresentationIsVisibleAccordingToAudienceAndOverlayPolicy(t *testing.T) {
	p := Presentation{
		Title:              "Luz",
		Description:        "Uma chama ilumina a sala.",
		Visible:            true,
		VisibleUserIDs:     []string{"player-a"},
		AudienceRestricted: true,
		OverlayVisible:     false,
	}
	if !presentationVisibleTo(p, "player", "player-a", false) {
		t.Fatal("selected player should be allowed to receive a text-only presentation")
	}
	if presentationVisibleTo(p, "player", "player-b", false) {
		t.Fatal("unselected player must not receive a text-only presentation")
	}
	if presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("text presentation must not reach overlay unless explicitly enabled")
	}
	p.OverlayVisible = true
	if !presentationVisibleTo(p, "gm", "gm-id", true) {
		t.Fatal("GM overlay should receive text-only presentation when explicitly enabled")
	}
}

func TestApplyVisibilityRedactsPrivateFieldsForOtherPlayer(t *testing.T) {
	owner := "owner-id"
	token := Token{
		OwnerID: &owner, Name: "Arcanista", HPCurrent: 17, HPMax: 24, ArmorClass: 16,
		Statuses: []string{"Envenenado"}, Visibility: Visibility{},
	}

	got := applyVisibility(token, "player", "other-player")
	if got.Name != "Desconhecido" || got.HPCurrent != 0 || got.HPMax != 0 || got.ArmorClass != 0 || got.Statuses != nil {
		t.Fatalf("private fields leaked to another player: %#v", got)
	}
}

func TestApplyVisibilityPreservesOwnerAndGMData(t *testing.T) {
	owner := "owner-id"
	token := Token{OwnerID: &owner, Name: "Arcanista", HPCurrent: 17, HPMax: 24, ArmorClass: 16, Statuses: []string{"Envenenado"}}

	for _, viewer := range []struct{ role, userID string }{{"player", owner}, {"gm", "gm-id"}} {
		got := applyVisibility(token, viewer.role, viewer.userID)
		if got.Name != token.Name || got.HPCurrent != token.HPCurrent || got.ArmorClass != token.ArmorClass || len(got.Statuses) != 1 {
			t.Fatalf("%s should see private data: %#v", viewer.role, got)
		}
	}
}

func TestApplyVisibilityRespectsPublishedFields(t *testing.T) {
	token := Token{Name: "Goblin", HPCurrent: 5, HPMax: 7, ArmorClass: 13, Statuses: []string{"Caído"}, Visibility: Visibility{ShowName: true, ShowHP: true, ShowAC: true, ShowStatuses: true}}
	got := applyVisibility(token, "player", "viewer")
	if got.Name != "Goblin" || got.HPCurrent != 5 || got.HPMax != 7 || got.ArmorClass != 13 || len(got.Statuses) != 1 {
		t.Fatalf("published fields were incorrectly redacted: %#v", got)
	}
}
