package npcs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrForbidden = errors.New("forbidden")

// Sheet holds only the combat data that is useful to create and run an NPC token.
// Narrative detail remains in the NPC's notes, avoiding a second full character-sheet format.
type Sheet struct {
	HitPointsCurrent int    `json:"hitPointsCurrent"`
	HitPointsMax     int    `json:"hitPointsMax"`
	ArmorClass       int    `json:"armorClass"`
	Initiative       int    `json:"initiative"`
	Size             int    `json:"size"`
	Color            int    `json:"color"`
	ImageURL         string `json:"imageUrl"`
}

type NPC struct {
	ID         string `json:"id"`
	CampaignID string `json:"campaignId"`
	Name       string `json:"name"`
	Sheet      Sheet  `json:"sheet"`
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, campaignID, userID string) ([]NPC, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return nil, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select id::text,campaign_id::text,name,sheet from actors where campaign_id=$1 and kind='npc' order by created_at`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []NPC{}
	for rows.Next() {
		var item NPC
		var raw []byte
		if err := rows.Scan(&item.ID, &item.CampaignID, &item.Name, &raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &item.Sheet); err != nil {
			return nil, fmt.Errorf("decode npc: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) Create(ctx context.Context, campaignID, userID, name string, sheet Sheet) (NPC, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return NPC{}, ErrForbidden
	}
	raw, err := json.Marshal(sheet)
	if err != nil {
		return NPC{}, err
	}
	var item NPC
	err = r.pool.QueryRow(ctx, `insert into actors(campaign_id,kind,name,sheet) values($1,'npc',$2,$3) returning id::text,campaign_id::text,name,sheet`, campaignID, name, raw).Scan(&item.ID, &item.CampaignID, &item.Name, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return NPC{}, err
	}
	if err != nil {
		return NPC{}, fmt.Errorf("create npc: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return NPC{}, err
	}
	return item, nil
}
