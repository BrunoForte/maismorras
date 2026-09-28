package scenes

import "vtt-backend/internal/audience"
import "github.com/jackc/pgx/v5/pgxpool"
import "github.com/jackc/pgx/v5/pgconn"
import "strings"
import "errors"
import "encoding/json"
import "context"
import "github.com/jackc/pgx/v5"

func isPresentationDismissal(p Presentation) bool {
	return !p.Visible && strings.TrimSpace(p.AssetPath) == "" && strings.TrimSpace(p.Title) == "" && strings.TrimSpace(p.Description) == ""
}

func presentationVisibleTo(p Presentation, role, userID string, overlay bool) bool {
	if !p.Visible || (overlay && (!p.OverlayVisible || role != "gm")) {
		return false
	}

	if role == "gm" || overlay {
		return true
	}
	policy := audience.Policy{Mode: audience.ModeAll}
	if p.AudienceRestricted {
		policy.Mode = audience.ModeSelected
		policy.UserIDs = p.VisibleUserIDs
		if len(policy.UserIDs) == 0 {
			policy.Mode = audience.ModeNone
		}
	}
	return policy.Allows(userID)
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool} }

func (r *Repository) GetOverlaySettings(ctx context.Context, campaignID, userID string) (OverlaySettings, error) {
	var allowed bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from campaigns c left join campaign_members m on m.campaign_id=c.id and m.user_id=$2 left join profiles p on p.id=$2 where c.id=$1 and (c.owner_id=$2 or m.user_id is not null or coalesce(p.is_admin,false)))`, campaignID, userID).Scan(&allowed); err != nil {
		return OverlaySettings{}, err
	}
	if !allowed {
		return OverlaySettings{}, ErrForbidden
	}
	var out OverlaySettings
	if err := r.pool.QueryRow(ctx, `select enabled,cameras,active_scene_id::text from campaign_overlay_settings where campaign_id=$1`, campaignID).Scan(&out.Enabled, &out.Cameras, &out.ActiveSceneID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			out.Cameras = json.RawMessage("[]")
			return out, nil
		}
		return OverlaySettings{}, err
	}
	return out, nil
}

func (r *Repository) SaveOverlaySettings(ctx context.Context, campaignID, userID string, in OverlaySettings) (OverlaySettings, error) {
	var isGM bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from campaigns c left join campaign_members m on m.campaign_id=c.id and m.user_id=$2 left join profiles p on p.id=$2 where c.id=$1 and (c.owner_id=$2 or (m.user_id=$2 and m.role='gm'::public.campaign_role) or coalesce(p.is_admin,false)))`, campaignID, userID).Scan(&isGM); err != nil {
		return OverlaySettings{}, err
	}
	if !isGM {
		return OverlaySettings{}, ErrForbidden
	}
	for _, characterID := range in.CharacterIDs {
		var belongsToCampaign bool
		if err := r.pool.QueryRow(ctx, `select exists(select 1 from actors where id=$1::uuid and campaign_id=$2 and kind='character')`, characterID, campaignID).Scan(&belongsToCampaign); err != nil {
			return OverlaySettings{}, err
		}
		if !belongsToCampaign {
			return OverlaySettings{}, ErrInvalidOverlayCharacter
		}
	}
	if len(in.Cameras) == 0 {
		in.Cameras = json.RawMessage("[]")
	}
	var out OverlaySettings
	err := r.pool.QueryRow(ctx, `insert into campaign_overlay_settings(campaign_id,enabled,cameras,active_scene_id,updated_at) values($1,$2,$3,nullif($4,'')::uuid,now()) on conflict(campaign_id) do update set enabled=excluded.enabled,cameras=excluded.cameras,active_scene_id=excluded.active_scene_id,updated_at=now() returning enabled,cameras,active_scene_id::text`, campaignID, in.Enabled, in.Cameras, valueOrEmpty(in.ActiveSceneID)).Scan(&out.Enabled, &out.Cameras, &out.ActiveSceneID)
	return out, err
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (r *Repository) GetPresentation(ctx context.Context, sceneID, userID string, overlay bool) (Presentation, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Presentation{}, err
	}
	var p Presentation
	err = r.pool.QueryRow(ctx, `select asset_path,title,description,visible,visible_user_ids::text[],audience_restricted,overlay_visible,updated_at::text from scene_presentations where scene_id=$1`, sceneID).Scan(&p.AssetPath, &p.Title, &p.Description, &p.Visible, &p.VisibleUserIDs, &p.AudienceRestricted, &p.OverlayVisible, &p.UpdatedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
		return Presentation{}, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return Presentation{}, nil
	}
	if err != nil {
		return Presentation{}, err
	}
	if role == "gm" && !overlay {
		return p, nil
	}
	if !presentationVisibleTo(p, role, userID, overlay) || strings.TrimSpace(p.AssetPath) == "" {
		return Presentation{}, nil
	}
	return p, nil
}
func (r *Repository) SavePresentation(ctx context.Context, sceneID, userID string, p Presentation) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return err
	}

	if role != "gm" {
		return ErrForbidden
	}
	if isPresentationDismissal(p) {
		_, err := r.pool.Exec(ctx, `delete from scene_presentations where scene_id=$1`, sceneID)
		return err
	}
	if p.VisibleUserIDs == nil {
		p.VisibleUserIDs = []string{}
	}
	var validCount int
	err = r.pool.QueryRow(ctx, `select count(*) from unnest($2::uuid[]) selected(id) join scenes s on s.id=$1 join campaign_members m on m.campaign_id=s.campaign_id and m.user_id=selected.id and m.role='player'::public.campaign_role`, sceneID, p.VisibleUserIDs).Scan(&validCount)
	if err != nil {
		return err
	}
	if validCount != len(p.VisibleUserIDs) {
		return ErrForbidden
	}
	_, err = r.pool.Exec(ctx, `insert into scene_presentations(scene_id,campaign_id,asset_path,title,description,visible,visible_user_ids,audience_restricted,overlay_visible) select $1,campaign_id,$2,$3,$4,$5,$6,$7,$8 from scenes where id=$1 on conflict(scene_id) do update set asset_path=excluded.asset_path,title=excluded.title,description=excluded.description,visible=excluded.visible,visible_user_ids=excluded.visible_user_ids,audience_restricted=excluded.audience_restricted,overlay_visible=excluded.overlay_visible,updated_at=now()`, sceneID, p.AssetPath, p.Title, p.Description, p.Visible, p.VisibleUserIDs, p.AudienceRestricted, p.OverlayVisible)
	return err
}

func containsID(ids []string, id string) bool {
	for _, candidate := range ids {
		if candidate == id {
			return true
		}
	}
	return false
}

func (r *Repository) GetOverlayLayout(ctx context.Context, sceneID, userID string) (map[string]any, error) {
	if _, err := r.memberRole(ctx, sceneID, userID); err != nil {
		return nil, err
	}
	var raw []byte
	err := r.pool.QueryRow(ctx, `select layout from scene_overlay_layouts where scene_id=$1`, sceneID).Scan(&raw)
	// Keep older deployments usable until migration 0033 is applied. The editor
	// can still use its local layout and will report a save error instead of
	// repeatedly failing during initialization.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
		return map[string]any{}, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	var layout map[string]any
	if err := json.Unmarshal(raw, &layout); err != nil {
		return nil, err
	}
	return layout, nil
}

func (r *Repository) SaveOverlayLayout(ctx context.Context, sceneID, userID string, layout map[string]any) error {
	if role, err := r.memberRole(ctx, sceneID, userID); err != nil || role != "gm" {
		return ErrForbidden
	}
	raw, err := json.Marshal(layout)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `insert into scene_overlay_layouts(scene_id,campaign_id,layout) select $1,campaign_id,$2 from scenes where id=$1 on conflict(scene_id) do update set layout=excluded.layout,updated_at=now()`, sceneID, raw)
	return err
}
