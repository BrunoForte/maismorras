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
	Name               string          `json:"name"`
	Class              string          `json:"class"`
	Subclass           string          `json:"subclass"`
	Level              int             `json:"level"`
	Species            string          `json:"species"`
	SpeciesLineage     string          `json:"speciesLineage"`
	Background         string          `json:"background"`
	Alignment          string          `json:"alignment"`
	AbilityScores      AbilityScores   `json:"abilityScores"`
	ProficiencyBonus   int             `json:"proficiencyBonus"`
	SavingThrows       []string        `json:"savingThrows"`
	SkillProficiencies []string        `json:"skillProficiencies"`
	SkillExpertise     []string        `json:"skillExpertise"`
	ArmorClass         int             `json:"armorClass"`
	Speed              int             `json:"speed"`
	HitPointsCurrent   int             `json:"hitPointsCurrent"`
	HitPointsMax       int             `json:"hitPointsMax"`
	TemporaryHP        int             `json:"temporaryHP"`
	HitDice            string          `json:"hitDice"`
	HitDiceSpent       int             `json:"hitDiceSpent"`
	PassivePerception  int             `json:"passivePerception"`
	Attacks            []Attack        `json:"attacks"`
	Spells             []Spell         `json:"spells"`
	Features           string          `json:"features"`
	Feats              string          `json:"feats"`
	Equipment          string          `json:"equipment"`
	Inventory          []InventoryItem `json:"inventory"`
	Resources          []Resource      `json:"resources"`
	SpellSlots         []SpellSlot     `json:"spellSlots"`
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
type Resource struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Current   int    `json:"current"`
	Max       int    `json:"max"`
	RestoreOn string `json:"restoreOn"`
}
type SpellSlot struct {
	Level   int `json:"level"`
	Current int `json:"current"`
	Max     int `json:"max"`
}

// InventoryItem keeps a compact snapshot of the mechanic selected from the
// compendium. The entry ID preserves its source while the snapshot keeps old
// characters readable if a private compendium entry is later edited.
type InventoryItem struct {
	EntryID  string          `json:"entryId"`
	Name     string          `json:"name"`
	Quantity int             `json:"quantity"`
	Equipped bool            `json:"equipped"`
	Rules    json.RawMessage `json:"rules"`
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
	if err := r.syncSceneTokens(ctx, item.ID, item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

// GetForGM lets the campaign narrator open a character already linked to this
// campaign. A player never receives this route, so a sheet remains private
// from other players even when they share a table.
func (r *Repository) GetForGM(ctx context.Context, campaignID, characterID, userID string) (Character, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Character{}, err
	}
	var item Character
	var raw []byte
	err := r.pool.QueryRow(ctx, `select id::text,campaign_id::text,owner_id::text,sheet from actors where id=$1 and campaign_id=$2 and kind='character'`, characterID, campaignID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("get character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, fmt.Errorf("decode character sheet: %w", err)
	}
	return item, nil
}

// SaveForGM is deliberately separate from SaveMine. This makes the authority
// boundary explicit: only the GM can update another member's linked sheet.
func (r *Repository) SaveForGM(ctx context.Context, campaignID, characterID, userID string, sheet Sheet) (Character, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Character{}, err
	}
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `update actors set name=$1,sheet=$2 where id=$3 and campaign_id=$4 and kind='character' returning id::text,campaign_id::text,owner_id::text,sheet`, sheet.Name, raw, characterID, campaignID).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNotFound
	}
	if err != nil {
		return Character{}, fmt.Errorf("save character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	if err := r.syncSceneTokens(ctx, item.ID, item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

// Tokens linked to a character are instances for position and conditions, but
// their sheet-derived combat numbers must follow the character sheet.
func (r *Repository) syncSceneTokens(ctx context.Context, actorID string, sheet Sheet) error {
	_, err := r.pool.Exec(ctx, `update scene_tokens set hp_current=$1,hp_max=$2,armor_class=$3,updated_at=now() where actor_id=$4`, sheet.HitPointsCurrent, sheet.HitPointsMax, sheet.ArmorClass, actorID)
	if err != nil {
		return fmt.Errorf("sync character tokens: %w", err)
	}
	return nil
}

// CreateForGM creates the one character slot assigned to a campaign member.
// It is useful when the GM is preparing a sheet with the player at the table.
func (r *Repository) CreateForGM(ctx context.Context, campaignID, ownerID, userID string) (Character, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Character{}, err
	}
	var member bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)`, campaignID, ownerID).Scan(&member); err != nil || !member {
		return Character{}, ErrForbidden
	}
	sheet := Sheet{Name: "Novo personagem", Level: 1, AbilityScores: AbilityScores{Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10}, ProficiencyBonus: 2, ArmorClass: 10, Speed: 9, HitPointsCurrent: 10, HitPointsMax: 10, HitDice: "1d8", PassivePerception: 10, Attacks: []Attack{}, Spells: []Spell{}, Inventory: []InventoryItem{}, SavingThrows: []string{}, SkillProficiencies: []string{}}
	raw, err := json.Marshal(sheet)
	if err != nil {
		return Character{}, err
	}
	var item Character
	err = r.pool.QueryRow(ctx, `insert into actors(campaign_id,owner_id,kind,name,sheet) values($1,$2,'character',$3,$4) returning id::text,campaign_id::text,owner_id::text,sheet`, campaignID, ownerID, sheet.Name, raw).Scan(&item.ID, &item.CampaignID, &item.OwnerID, &raw)
	if err != nil {
		return Character{}, fmt.Errorf("create character for gm: %w", err)
	}
	if err := json.Unmarshal(raw, &item.Sheet); err != nil {
		return Character{}, err
	}
	return item, nil
}

func (r *Repository) requireGM(ctx context.Context, campaignID, userID string) error {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil || role != "gm" {
		return ErrForbidden
	}
	return nil
}

// ListForGM exposes only enough sheet data for table management. It is intentionally
// restricted to the campaign GM; players continue using GetMine for their own sheet.
func (r *Repository) ListForGM(ctx context.Context, campaignID, userID string) ([]Participant, error) {
	if err := r.requireGM(ctx, campaignID, userID); err != nil {
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
