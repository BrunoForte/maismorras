package scenes

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/characters"
)

type Scene struct {
	ID            string  `json:"id"`
	CampaignID    string  `json:"campaignId"`
	Name          string  `json:"name"`
	BackgroundURL *string `json:"backgroundUrl"`
	GridSize      int     `json:"gridSize"`
	PlayerAccess  string  `json:"playerAccess"`
	FogEnabled    bool    `json:"fogEnabled"`
	VisionMode    string  `json:"visionMode"`
}
type CombatState struct {
	ActiveTokenID *string `json:"activeTokenId"`
}
type Token struct {
	ID         string     `json:"id"`
	ActorID    *string    `json:"actorId"`
	OwnerID    *string    `json:"-"`
	Name       string     `json:"name"`
	ImageURL   *string    `json:"imageUrl"`
	Color      int        `json:"color"`
	X          int        `json:"x"`
	Y          int        `json:"y"`
	Size       int        `json:"size"`
	HPCurrent  int        `json:"hpCurrent"`
	HPMax      int        `json:"hpMax"`
	ArmorClass int        `json:"armorClass"`
	Initiative int        `json:"initiative"`
	Statuses   []string   `json:"statuses"`
	Hidden     bool       `json:"hidden"`
	Visibility Visibility `json:"visibility"`
}

// Visibility defines exactly which private attributes a non-owner player may receive.
// The server applies this policy before serialising the response; the browser never
// receives hidden HP, AC or conditions and therefore cannot reveal them locally.
type Visibility struct {
	ShowName     bool `json:"showName"`
	ShowHP       bool `json:"showHP"`
	ShowAC       bool `json:"showAC"`
	ShowStatuses bool `json:"showStatuses"`
}
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool} }

func (r *Repository) memberRole(ctx context.Context, sceneID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx, `select m.role::text from scenes s join campaign_members m on m.campaign_id=s.campaign_id where s.id=$1 and m.user_id=$2`, sceneID, userID).Scan(&role)
	return role, err
}
func (r *Repository) List(ctx context.Context, campaignID, userID string) ([]Scene, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil {
		return nil, ErrForbidden
	}
	query := `select id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode from scenes where campaign_id=$1`
	if role != "gm" {
		query += ` and player_access <> 'hidden'`
	}
	rows, err := r.pool.Query(ctx, query+` order by created_at`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Scene{}
	for rows.Next() {
		var s Scene
		if err := rows.Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode); err != nil {
			return nil, err
		}
		items = append(items, s)
	}
	return items, rows.Err()
}
func (r *Repository) Create(ctx context.Context, campaignID, userID, name string) (Scene, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role); err != nil {
		return Scene{}, err
	}
	if role != "gm" {
		return Scene{}, ErrForbidden
	}
	var s Scene
	err := r.pool.QueryRow(ctx, `insert into scenes(campaign_id,name,player_access) values($1,$2,'hidden') returning id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode`, campaignID, name).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode)
	return s, err
}
func (r *Repository) UpdateScene(ctx context.Context, sceneID, userID string, input Scene) (Scene, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Scene{}, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Scene{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if input.PlayerAccess == "active" {
		if _, err = tx.Exec(ctx, `update scenes set player_access='available',updated_at=now() where campaign_id=(select campaign_id from scenes where id=$1) and player_access='active'`, sceneID); err != nil {
			return Scene{}, err
		}
	}
	var scene Scene
	err = tx.QueryRow(ctx, `update scenes set name=$1,background_url=nullif($2,''),grid_size=$3,player_access=$4,fog_enabled=$5,vision_mode=$6,updated_at=now() where id=$7 returning id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode`, input.Name, input.BackgroundURL, input.GridSize, input.PlayerAccess, input.FogEnabled, input.VisionMode, sceneID).Scan(&scene.ID, &scene.CampaignID, &scene.Name, &scene.BackgroundURL, &scene.GridSize, &scene.PlayerAccess, &scene.FogEnabled, &scene.VisionMode)
	if err != nil {
		return Scene{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Scene{}, err
	}
	return scene, nil
}
func (r *Repository) Detail(ctx context.Context, sceneID, userID string) (Scene, []Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Scene{}, nil, err
	}
	var s Scene
	if err = r.pool.QueryRow(ctx, `select id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode from scenes where id=$1`, sceneID).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode); err != nil {
		return Scene{}, nil, err
	}
	if role != "gm" && s.PlayerAccess == "hidden" {
		return Scene{}, nil, ErrForbidden
	}
	query := `select id::text,actor_id::text,owner_id::text,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility from scene_tokens where scene_id=$1`
	if role != "gm" {
		query += ` and is_hidden=false`
	}
	rows, err := r.pool.Query(ctx, query, sceneID)
	if err != nil {
		return Scene{}, nil, err
	}
	defer rows.Close()
	items := []Token{}
	for rows.Next() {
		var t Token
		var raw, visibility []byte
		if err := rows.Scan(&t.ID, &t.ActorID, &t.OwnerID, &t.Name, &t.ImageURL, &t.Color, &t.X, &t.Y, &t.Size, &t.HPCurrent, &t.HPMax, &t.ArmorClass, &t.Initiative, &raw, &t.Hidden, &visibility); err != nil {
			return Scene{}, nil, err
		}
		if err := json.Unmarshal(raw, &t.Statuses); err != nil {
			return Scene{}, nil, err
		}
		if err := json.Unmarshal(visibility, &t.Visibility); err != nil {
			return Scene{}, nil, err
		}
		items = append(items, applyVisibility(t, role, userID))
	}
	return s, items, rows.Err()
}

func (r *Repository) Combat(ctx context.Context, sceneID, userID string) (CombatState, error) {
	if _, err := r.memberRole(ctx, sceneID, userID); err != nil {
		return CombatState{}, ErrForbidden
	}
	var state CombatState
	if err := r.pool.QueryRow(ctx, `select active_token_id::text from scenes where id=$1`, sceneID).Scan(&state.ActiveTokenID); err != nil {
		return CombatState{}, err
	}
	return state, nil
}

func (r *Repository) SetCombat(ctx context.Context, sceneID, tokenID, userID string) (CombatState, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return CombatState{}, ErrForbidden
	}
	if tokenID != "" {
		var exists bool
		if err := r.pool.QueryRow(ctx, `select exists(select 1 from scene_tokens where id=$1 and scene_id=$2)`, tokenID, sceneID).Scan(&exists); err != nil || !exists {
			return CombatState{}, fmt.Errorf("token not found")
		}
	}
	var state CombatState
	if err := r.pool.QueryRow(ctx, `update scenes set active_token_id=nullif($1,'')::uuid,updated_at=now() where id=$2 returning active_token_id::text`, tokenID, sceneID).Scan(&state.ActiveTokenID); err != nil {
		return CombatState{}, err
	}
	return state, nil
}
func (r *Repository) CreateToken(ctx context.Context, sceneID, userID string, t Token) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	if role != "gm" {
		return Token{}, ErrForbidden
	}
	raw, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id::text`, sceneID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, raw, t.Hidden, visibility).Scan(&t.ID)
	return t, err
}

// CreateTokenFromCharacter places a persisted character on this scene and records
// its actor and owner IDs. Those IDs are the basis for future player permissions.
func (r *Repository) CreateTokenFromCharacter(ctx context.Context, sceneID, actorID, userID string) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	if role != "gm" {
		return Token{}, ErrForbidden
	}

	var ownerID, actorName string
	var raw []byte
	err = r.pool.QueryRow(ctx, `select a.owner_id::text,a.name,a.sheet from actors a join scenes s on s.campaign_id=a.campaign_id where a.id=$1 and s.id=$2 and a.kind='character'`, actorID, sceneID).Scan(&ownerID, &actorName, &raw)
	if err != nil {
		return Token{}, fmt.Errorf("load character actor: %w", err)
	}
	var sheet characters.Sheet
	if err := json.Unmarshal(raw, &sheet); err != nil {
		return Token{}, fmt.Errorf("decode character actor: %w", err)
	}
	var alreadyLinked bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from scene_tokens where scene_id=$1 and actor_id=$2)`, sceneID, actorID).Scan(&alreadyLinked); err != nil {
		return Token{}, err
	}
	if alreadyLinked {
		return Token{}, ErrAlreadyLinked
	}
	name := sheet.Name
	if name == "" {
		name = actorName
	}
	owner := ownerID
	t := Token{ActorID: &actorID, OwnerID: &owner, Name: name, Color: 3381504, X: 70, Y: 70, Size: 1, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax, ArmorClass: sheet.ArmorClass, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,owner_id,name,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id::text`, sceneID, actorID, ownerID, name, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility).Scan(&t.ID)
	return t, err
}

// CreateTokenFromNPC creates a scene token from a campaign NPC. NPCs deliberately
// have no owner, so all visibility settings are controlled by the GM.
func (r *Repository) CreateTokenFromNPC(ctx context.Context, sceneID, actorID, userID string) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	if role != "gm" {
		return Token{}, ErrForbidden
	}
	var actorName string
	var raw []byte
	err = r.pool.QueryRow(ctx, `select a.name,a.sheet from actors a join scenes s on s.campaign_id=a.campaign_id where a.id=$1 and s.id=$2 and a.kind='npc'`, actorID, sceneID).Scan(&actorName, &raw)
	if err != nil {
		return Token{}, fmt.Errorf("load npc actor: %w", err)
	}
	var sheet struct {
		HitPointsCurrent int    `json:"hitPointsCurrent"`
		HitPointsMax     int    `json:"hitPointsMax"`
		ArmorClass       int    `json:"armorClass"`
		Initiative       int    `json:"initiative"`
		Size             int    `json:"size"`
		Color            int    `json:"color"`
		ImageURL         string `json:"imageUrl"`
	}
	if err := json.Unmarshal(raw, &sheet); err != nil {
		return Token{}, fmt.Errorf("decode npc actor: %w", err)
	}
	var alreadyLinked bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from scene_tokens where scene_id=$1 and actor_id=$2)`, sceneID, actorID).Scan(&alreadyLinked); err != nil {
		return Token{}, err
	}
	if alreadyLinked {
		return Token{}, ErrAlreadyLinked
	}
	imageURL := sheet.ImageURL
	t := Token{ActorID: &actorID, Name: actorName, ImageURL: &imageURL, Color: sheet.Color, X: 70, Y: 70, Size: sheet.Size, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax, ArmorClass: sheet.ArmorClass, Initiative: sheet.Initiative, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id::text`, sceneID, actorID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility).Scan(&t.ID)
	return t, err
}

// CreateTokenFromCompendiumMonster only accepts a fully-described monster card.
// This keeps the hundreds of SRD index references searchable without presenting
// invented statistics when the GM has not yet registered a usable stat block.
func (r *Repository) CreateTokenFromCompendiumMonster(ctx context.Context, sceneID, entryID, userID string) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Token{}, ErrForbidden
	}
	var name string
	var raw []byte
	err = r.pool.QueryRow(ctx, `select e.name,e.rules from compendium_entries e join scenes s on s.campaign_id=e.campaign_id where e.id=$1 and s.id=$2 and e.entry_type='other' and coalesce(e.rules->>'kind', e.rules->>'catalog')='monster'`, entryID, sceneID).Scan(&name, &raw)
	if err != nil {
		return Token{}, fmt.Errorf("load compendium monster: %w", err)
	}
	var stats struct {
		HPMax      int    `json:"hpMax"`
		ArmorClass int    `json:"armorClass"`
		Initiative int    `json:"initiative"`
		Size       int    `json:"size"`
		Color      int    `json:"color"`
		ImageURL   string `json:"imageUrl"`
	}
	if err := json.Unmarshal(raw, &stats); err != nil {
		return Token{}, fmt.Errorf("decode compendium monster: %w", err)
	}
	if stats.HPMax < 1 || stats.ArmorClass < 0 || stats.ArmorClass > 99 {
		return Token{}, fmt.Errorf("monster has no usable stat block")
	}
	if stats.Size < 1 || stats.Size > 6 {
		stats.Size = 1
	}
	if stats.Color < 0 || stats.Color > 16777215 {
		stats.Color = 4921830
	}
	t := Token{Name: name, Color: stats.Color, X: 70, Y: 70, Size: stats.Size, HPCurrent: stats.HPMax, HPMax: stats.HPMax, ArmorClass: stats.ArmorClass, Initiative: stats.Initiative, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	if stats.ImageURL != "" {
		t.ImageURL = &stats.ImageURL
	}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id::text`, sceneID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility).Scan(&t.ID)
	return t, err
}
func (r *Repository) UpdateToken(ctx context.Context, sceneID, tokenID, userID string, t Token) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	if role != "gm" {
		return Token{}, ErrForbidden
	}
	raw, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `update scene_tokens set name=$1,image_url=$2,color=$3,position_x=$4,position_y=$5,size=$6,hp_current=$7,hp_max=$8,armor_class=$9,initiative=$10,statuses=$11,is_hidden=$12,visibility=$13,updated_at=now() where id=$14 and scene_id=$15 returning id::text`, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, raw, t.Hidden, visibility, tokenID, sceneID).Scan(&t.ID)
	if err != nil {
		return Token{}, fmt.Errorf("update token: %w", err)
	}
	return t, nil
}

func applyVisibility(t Token, role, userID string) Token {
	if role == "gm" || (t.OwnerID != nil && *t.OwnerID == userID) {
		return t
	}
	if !t.Visibility.ShowName {
		t.Name = "Desconhecido"
	}
	if !t.Visibility.ShowHP {
		t.HPCurrent, t.HPMax = 0, 0
	}
	if !t.Visibility.ShowAC {
		t.ArmorClass = 0
	}
	if !t.Visibility.ShowStatuses {
		t.Statuses = nil
	}
	return t
}

var (
	ErrForbidden     = fmt.Errorf("forbidden")
	ErrAlreadyLinked = fmt.Errorf("character already linked to scene")
)
