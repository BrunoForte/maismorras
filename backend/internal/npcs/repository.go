package npcs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
)

// Sheet holds only the combat data that is useful to create and run an NPC token.
// Narrative detail remains in the NPC's notes, avoiding a second full character-sheet format.
type Sheet struct {
	HitPointsCurrent int       `json:"hitPointsCurrent"`
	HitPointsMax     int       `json:"hitPointsMax"`
	ArmorClass       int       `json:"armorClass"`
	Initiative       int       `json:"initiative"`
	Size             int       `json:"size"`
	Color            int       `json:"color"`
	ImageURL         string    `json:"imageUrl"`
	CreatureType     string    `json:"creatureType"`
	Challenge        string    `json:"challenge"`
	Speed            string    `json:"speed"`
	Abilities        Abilities `json:"abilities"`
	Traits           []Trait   `json:"traits"`
	Actions          []Action  `json:"actions"`
	Resistances      []string  `json:"resistances"`
	Immunities       []string  `json:"immunities"`
	Senses           string    `json:"senses"`
	Languages        string    `json:"languages"`
}

type Abilities struct {
	Strength     int `json:"strength"`
	Dexterity    int `json:"dexterity"`
	Constitution int `json:"constitution"`
	Intelligence int `json:"intelligence"`
	Wisdom       int `json:"wisdom"`
	Charisma     int `json:"charisma"`
}
type Trait struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
type Action struct {
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	ToHit       int    `json:"toHit"`
	Range       string `json:"range"`
	Damage      string `json:"damage"`
	SaveDC      int    `json:"saveDC"`
	Description string `json:"description"`
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

func (r *Repository) Update(ctx context.Context, campaignID, npcID, userID, name string, sheet Sheet) (NPC, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return NPC{}, ErrForbidden
	}
	raw, err := json.Marshal(sheet)
	if err != nil {
		return NPC{}, err
	}
	var item NPC
	err = r.pool.QueryRow(ctx, `update actors set name=$1,sheet=$2,updated_at=now() where id=$3 and campaign_id=$4 and kind='npc' returning id::text,campaign_id::text,name,sheet`, name, raw, npcID, campaignID).Scan(&item.ID, &item.CampaignID, &item.Name, &raw)
	if err != nil {
		return NPC{}, fmt.Errorf("update npc: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return NPC{}, err
	}
	return item, nil
}
func (r *Repository) Delete(ctx context.Context, campaignID, npcID, userID string) error {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return ErrForbidden
	}
	if _, err := r.pool.Exec(ctx, `delete from scene_tokens where actor_id=$1`, npcID); err != nil {
		return err
	}
	result, err := r.pool.Exec(ctx, `delete from actors where id=$1 and campaign_id=$2 and kind='npc'`, npcID, campaignID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
