package campaigns

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Campaign struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}
type Invite struct {
	Code       string    `json:"code"`
	CampaignID string    `json:"campaignId"`
	ExpiresAt  time.Time `json:"expiresAt"`
}
type OverlayToken struct {
	Token string `json:"token"`
}

var (
	ErrForbidden     = errors.New("forbidden")
	ErrInviteInvalid = errors.New("invalid invite")
	ErrNotFound      = errors.New("not found")
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, userID string) ([]Campaign, error) {
	rows, err := r.pool.Query(ctx, `select c.id::text, c.name, m.role::text from campaigns c join campaign_members m on m.campaign_id=c.id where m.user_id=$1 order by c.created_at desc`, userID)
	if err != nil {
		return nil, fmt.Errorf("list campaigns: %w", err)
	}
	defer rows.Close()
	items := []Campaign{}
	for rows.Next() {
		var item Campaign
		if err := rows.Scan(&item.ID, &item.Name, &item.Role); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type PublicOverlay struct {
	CampaignID   string          `json:"campaignId"`
	CampaignName string          `json:"campaignName"`
	Scene        json.RawMessage `json:"scene"`
	Tokens       json.RawMessage `json:"tokens"`
	Events       json.RawMessage `json:"events"`
}

func (r *Repository) Create(ctx context.Context, userID, name string) (Campaign, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Campaign{}, err
	}
	defer tx.Rollback(ctx)
	var item Campaign
	err = tx.QueryRow(ctx, `insert into campaigns (name, owner_id) values ($1,$2) returning id::text,name`, name, userID).Scan(&item.ID, &item.Name)
	if err != nil {
		return Campaign{}, fmt.Errorf("create campaign: %w", err)
	}
	if _, err = tx.Exec(ctx, `insert into campaign_members (campaign_id,user_id,role) values ($1,$2,'gm')`, item.ID, userID); err != nil {
		return Campaign{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Campaign{}, err
	}
	item.Role = "gm"
	return item, nil
}

func (r *Repository) CreateInvite(ctx context.Context, campaignID, userID string) (Invite, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil {
		return Invite{}, ErrForbidden
	}
	if role != "gm" {
		return Invite{}, ErrForbidden
	}
	var invite Invite
	err := r.pool.QueryRow(ctx, `insert into campaign_invites(campaign_id,created_by) values($1,$2) returning code::text,campaign_id::text,expires_at`, campaignID, userID).Scan(&invite.Code, &invite.CampaignID, &invite.ExpiresAt)
	return invite, err
}

func (r *Repository) AcceptInvite(ctx context.Context, code, userID string) (Campaign, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Campaign{}, err
	}
	defer tx.Rollback(ctx)
	var campaignID string
	err = tx.QueryRow(ctx, `select campaign_id::text from campaign_invites where code=$1 and accepted_at is null and revoked_at is null and expires_at > now() for update`, code).Scan(&campaignID)
	if err != nil {
		return Campaign{}, ErrInviteInvalid
	}
	if _, err = tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'player') on conflict (campaign_id,user_id) do nothing`, campaignID, userID); err != nil {
		return Campaign{}, err
	}
	if _, err = tx.Exec(ctx, `update campaign_invites set accepted_by=$1,accepted_at=now() where code=$2`, userID, code); err != nil {
		return Campaign{}, err
	}
	var campaign Campaign
	if err = tx.QueryRow(ctx, `select id::text,name from campaigns where id=$1`, campaignID).Scan(&campaign.ID, &campaign.Name); err != nil {
		return Campaign{}, err
	}
	campaign.Role = "player"
	if err = tx.Commit(ctx); err != nil {
		return Campaign{}, err
	}
	return campaign, nil
}

func (r *Repository) RemoveMember(ctx context.Context, campaignID, memberID, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var role string
	if err = tx.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return ErrForbidden
	}
	var ownerID string
	if err = tx.QueryRow(ctx, `select owner_id::text from campaigns where id=$1`, campaignID).Scan(&ownerID); err != nil {
		return err
	}
	if ownerID == memberID || memberID == userID {
		return ErrForbidden
	}
	if _, err = tx.Exec(ctx, `delete from scene_tokens where actor_id in (select id from actors where campaign_id=$1 and owner_id=$2 and kind='character')`, campaignID, memberID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `delete from actors where campaign_id=$1 and owner_id=$2 and kind='character'`, campaignID, memberID); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `delete from campaign_members where campaign_id=$1 and user_id=$2 and role='player'`, campaignID, memberID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

func (r *Repository) CreateOverlayToken(ctx context.Context, campaignID, userID string) (string, error) {
	var owner string
	if err := r.pool.QueryRow(ctx, `select owner_id::text from campaigns where id=$1`, campaignID).Scan(&owner); err != nil {
		return "", ErrNotFound
	}
	if owner != userID {
		return "", ErrForbidden
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	hash := sha256.Sum256([]byte(token))
	_, err := r.pool.Exec(ctx, `update campaigns set overlay_token_hash=$1,overlay_token_created_at=now() where id=$2`, fmt.Sprintf("%x", hash), campaignID)
	return token, err
}

func (r *Repository) RevokeOverlayToken(ctx context.Context, campaignID, userID string) error {
	var owner string
	if err := r.pool.QueryRow(ctx, `select owner_id::text from campaigns where id=$1`, campaignID).Scan(&owner); err != nil {
		return ErrNotFound
	}
	if owner != userID {
		return ErrForbidden
	}
	_, err := r.pool.Exec(ctx, `update campaigns set overlay_token_hash=null,overlay_token_created_at=null where id=$1`, campaignID)
	return err
}

func (r *Repository) PublicOverlay(ctx context.Context, token, sceneID string) (PublicOverlay, error) {
	hash := sha256.Sum256([]byte(token))
	var out PublicOverlay
	var ownerID string
	if err := r.pool.QueryRow(ctx, `select c.id::text,c.name,c.owner_id::text from campaigns c where c.overlay_token_hash=$1`, fmt.Sprintf("%x", hash)).Scan(&out.CampaignID, &out.CampaignName, &ownerID); err != nil {
		return out, ErrNotFound
	}
	if err := r.pool.QueryRow(ctx, `select jsonb_build_object('id',id::text,'campaignId',campaign_id::text,'name',name,'backgroundUrl',background_url,'ambientAudioPath',ambient_audio_path,'ambientAudioEnabled',ambient_audio_enabled,'ambientAudioVolume',ambient_audio_volume,'gridSize',grid_size,'playerAccess',player_access) from scenes where id=$1 and campaign_id=$2`, sceneID, out.CampaignID).Scan(&out.Scene); err != nil {
		return out, ErrNotFound
	}
	if err := r.pool.QueryRow(ctx, `coalesce((select jsonb_agg(jsonb_build_object('id',st.id::text,'name',st.name,'imageUrl',st.image_url,'color',st.color,'x',st.position_x,'y',st.position_y,'size',st.size,'hpCurrent',st.hp_current,'hpMax',st.hp_max,'armorClass',st.armor_class,'initiative',st.initiative,'visibility',st.visibility) order by st.created_at from scene_tokens st where st.scene_id=$1 and st.is_hidden=false),'[]'::jsonb)`, sceneID).Scan(&out.Tokens); err != nil {
		return out, err
	}
	if err := r.pool.QueryRow(ctx, `coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'author',coalesce(p.display_name,'Mesa'),'type',e.event_type,'payload',e.payload,'createdAt',e.created_at::text) order by e.id) from game_events e left join profiles p on p.id=e.actor_id where e.campaign_id=$1 and e.event_type in ('chat.message','dice.roll','combat.log','system.info') and e.id > greatest((select coalesce(max(id),0)-100 from game_events where campaign_id=$1),0)),'[]'::jsonb)`, out.CampaignID).Scan(&out.Events); err != nil {
		return out, err
	}
	return out, nil
}
