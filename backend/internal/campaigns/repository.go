package campaigns

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Campaign struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Role    string `json:"role"`
	IsAdmin bool   `json:"isAdmin"`
}
type Invite struct {
	Code       string    `json:"code"`
	CampaignID string    `json:"campaignId"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

var (
	ErrForbidden     = errors.New("forbidden")
	ErrInviteInvalid = errors.New("invalid invite")
	ErrNotFound      = errors.New("not found")
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, userID string, isAdmin bool) ([]Campaign, error) {
	query := `select c.id::text, c.name, case when $2 then 'gm' else m.role::text end, $2 from campaigns c left join campaign_members m on m.campaign_id=c.id and m.user_id=$1 where $2 or m.user_id is not null order by c.created_at desc`
	rows, err := r.pool.Query(ctx, query, userID, isAdmin)
	if err != nil {
		return nil, fmt.Errorf("list campaigns: %w", err)
	}
	defer rows.Close()
	items := []Campaign{}
	for rows.Next() {
		var item Campaign
		if err := rows.Scan(&item.ID, &item.Name, &item.Role, &item.IsAdmin); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
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
	// Every new campaign starts with an empty scene visible to invited players.
	// Keeping this in the same transaction prevents campaigns without a playable
	// entry scene when the API is called outside the web client.
	if _, err = tx.Exec(ctx, `insert into scenes (campaign_id,name,player_access) values ($1,$2,'available')`, item.ID, "Cena principal"); err != nil {
		return Campaign{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Campaign{}, err
	}
	item.Role = "gm"
	return item, nil
}

func (r *Repository) Rename(ctx context.Context, campaignID, userID, name string) (Campaign, error) {
	var item Campaign
	err := r.pool.QueryRow(ctx, `update campaigns set name=$1 where id=$2 and owner_id=$3 returning id::text,name`, name, campaignID, userID).Scan(&item.ID, &item.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return Campaign{}, ErrForbidden
	}
	if err != nil {
		return Campaign{}, err
	}
	item.Role = "gm"
	return item, nil
}

func (r *Repository) Delete(ctx context.Context, campaignID, userID string) error {
	result, err := r.pool.Exec(ctx, `delete from campaigns where id=$1 and owner_id=$2`, campaignID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrForbidden
	}
	return nil
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
	err := r.pool.QueryRow(ctx, `insert into campaign_invites(campaign_id,created_by,expires_at) values($1,$2,now()+interval '24 hours') returning code::text,campaign_id::text,expires_at`, campaignID, userID).Scan(&invite.Code, &invite.CampaignID, &invite.ExpiresAt)
	return invite, err
}

func (r *Repository) AcceptInvite(ctx context.Context, code, userID string) (Campaign, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Campaign{}, err
	}
	defer tx.Rollback(ctx)
	var campaignID string
	err = tx.QueryRow(ctx, `select campaign_id::text from campaign_invites where code=$1 and revoked_at is null and expires_at > now() for update`, code).Scan(&campaignID)
	if err != nil {
		return Campaign{}, ErrInviteInvalid
	}
	if _, err = tx.Exec(ctx, `insert into campaign_members(campaign_id,user_id,role) values($1,$2,'player') on conflict (campaign_id,user_id) do nothing`, campaignID, userID); err != nil {
		return Campaign{}, err
	}
	if _, err = tx.Exec(ctx, `update campaign_invites set accepted_by=coalesce(accepted_by,$1),accepted_at=coalesce(accepted_at,now()) where code=$2`, userID, code); err != nil {
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
