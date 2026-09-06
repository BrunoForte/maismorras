package characters

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
	ErrNotFound  = errors.New("character not found")
)

// Sheet deliberately stores the D&D 2024 MVP without rules text from the books.
// Features, attacks and spells are user-authored notes, allowing the sheet to stay
// compact while still retaining the practical information used at the table.
type Sheet struct {
	Name               string        `json:"name"`
	Class              string        `json:"class"`
	Level              int           `json:"level"`
	Species            string        `json:"species"`
	Background         string        `json:"background"`
	Alignment          string        `json:"alignment"`
	AbilityScores      AbilityScores `json:"abilityScores"`
	ProficiencyBonus   int           `json:"proficiencyBonus"`
	SavingThrows       []string      `json:"savingThrows"`
	SkillProficiencies []string      `json:"skillProficiencies"`
	ArmorClass         int           `json:"armorClass"`
	Speed              int           `json:"speed"`
	HitPointsCurrent   int           `json:"hitPointsCurrent"`
	HitPointsMax       int           `json:"hitPointsMax"`
	TemporaryHP        int           `json:"temporaryHP"`
	HitDice            string        `json:"hitDice"`
	PassivePerception  int           `json:"passivePerception"`
	Attacks            []Attack      `json:"attacks"`
	Spells             []Spell       `json:"spells"`
	Features           string        `json:"features"`
	Equipment          string        `json:"equipment"`
}

type AbilityScores struct {
	Strength     int `json:"strength"`
	Dexterity    int `json:"dexterity"`
	Constitution int `json:"constitution"`
	Intelligence int `json:"intelligence"`
	Wisdom       int `json:"wisdom"`
	Charisma     int `json:"charisma"`
}
type Attack struct {
	Name        string `json:"name"`
	AttackBonus int    `json:"attackBonus"`
	Damage      string `json:"damage"`
	Notes       string `json:"notes"`
}
type Spell struct {
	Name  string `json:"name"`
	Level int    `json:"level"`
	Notes string `json:"notes"`
}
type Character struct {
	ID         string `json:"id"`
	CampaignID string `json:"campaignId"`
	OwnerID    string `json:"ownerId"`
	Sheet      Sheet  `json:"sheet"`
}
type Participant struct {
	UserID      string     `json:"userId"`
	DisplayName string     `json:"displayName"`
	Role        string     `json:"role"`
	Character   *Character `json:"character"`
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) isMember(ctx context.Context, campaignID, userID string) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, userID).Scan(&ok)
	return ok, err
}

func (r *Repository) GetMine(ctx context.Context, campaignID, userID string) (Character, error) {
	ok, err := r.isMember(ctx, campaignID, userID)
	if err != nil {
		return Character{}, err
	}
	if !ok {
		return Character{}, ErrForbidden
	}
	var item Character
	var raw []byte
	err = r.pool.QueryRow(ctx, `select id::text,campaign_id::text,owner_id::text,sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character'`, campaignID, userID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("get character: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	return item, nil
}

func (r *Repository) SaveMine(ctx context.Context, campaignID, userID string, sheet Sheet) (Character, error) {
	ok, err := r.isMember(ctx, campaignID, userID)
	if err != nil {
		return Character{}, err
	}
	if !ok {
		return Character{}, ErrForbidden
	}
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `
		insert into actors(campaign_id,owner_id,kind,name,sheet)
		values($1,$2,'character',$3,$4)
		on conflict (campaign_id,owner_id) where kind='character'
		do update set name=excluded.name,sheet=excluded.sheet
		returning id::text,campaign_id::text,owner_id::text,sheet`, campaignID, userID, sheet.Name, raw).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if err != nil {
		return Character{}, fmt.Errorf("save character: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

// ListForGM exposes only enough sheet data for table management. It is intentionally
// restricted to the campaign GM; players continue using GetMine for their own sheet.
func (r *Repository) ListForGM(ctx context.Context, campaignID, userID string) ([]Participant, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil {
		return nil, ErrForbidden
	}
	if role != "gm" {
		return nil, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select m.user_id::text,p.display_name,m.role::text,a.id::text,a.owner_id::text,a.sheet from campaign_members m join profiles p on p.id=m.user_id left join actors a on a.campaign_id=m.campaign_id and a.owner_id=m.user_id and a.kind='character' where m.campaign_id=$1 order by m.joined_at`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Participant{}
	for rows.Next() {
		var item Participant
		var characterID, ownerID *string
		var raw []byte
		if err := rows.Scan(&item.UserID, &item.DisplayName, &item.Role, &characterID, &ownerID, &raw); err != nil {
			return nil, err
		}
		if characterID != nil {
			character := Character{ID: *characterID, CampaignID: campaignID, OwnerID: *ownerID}
			if err := json.Unmarshal(raw, &character.Sheet); err != nil {
				return nil, fmt.Errorf("decode participant sheet: %w", err)
			}
			item.Character = &character
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
