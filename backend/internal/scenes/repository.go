package scenes

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math"
	"math/big"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"vtt-backend/internal/characters"
)

type Scene struct {
	ID                         string  `json:"id"`
	CampaignID                 string  `json:"campaignId"`
	Name                       string  `json:"name"`
	BackgroundURL              *string `json:"backgroundUrl"`
	GridSize                   int     `json:"gridSize"`
	PlayerAccess               string  `json:"playerAccess"`
	FogEnabled                 bool    `json:"fogEnabled"`
	VisionMode                 string  `json:"visionMode"`
	AllowPlayerMovement        bool    `json:"allowPlayerMovement"`
	AllowPlayerDoorInteraction bool    `json:"allowPlayerDoorInteraction"`
	EnforceTurnOrder           bool    `json:"enforceTurnOrder"`
}
type CombatState struct {
	ActiveTokenID *string `json:"activeTokenId"`
	Message       string  `json:"message,omitempty"`
}

// InitiativeResult is the authoritative result of an individual initiative
// roll. The die is returned so the client can show the same result without
// performing a second, client-side random roll.
type InitiativeResult struct {
	TokenID    string `json:"tokenId"`
	Roll       int    `json:"roll"`
	Bonus      int    `json:"bonus"`
	Initiative int    `json:"initiative"`
}
type FogState struct {
	VisibleCells  []string `json:"visibleCells"`
	RevealedCells []string `json:"revealedCells"`
	HiddenCells   []string `json:"hiddenCells"`
}
type Area struct {
	ID               string `json:"id"`
	Shape            string `json:"shape"`
	StartX           int    `json:"startX"`
	StartY           int    `json:"startY"`
	EndX             int    `json:"endX"`
	EndY             int    `json:"endY"`
	Color            int    `json:"color"`
	Label            string `json:"label"`
	VisibleToPlayers bool   `json:"visibleToPlayers"`
}

// Wall is a GM-only line segment. It participates in the server-side line of
// sight calculation, so a player cannot inspect the map geometry in DevTools.
type Wall struct {
	ID     string `json:"id"`
	StartX int    `json:"startX"`
	StartY int    `json:"startY"`
	EndX   int    `json:"endX"`
	EndY   int    `json:"endY"`
	Kind   string `json:"kind"`
	Open   bool   `json:"open"`
}
type Effect struct {
	ID             string `json:"id"`
	TokenID        string `json:"tokenId"`
	Name           string `json:"name"`
	Source         string `json:"source"`
	RemainingTurns *int   `json:"remainingTurns"`
	TickAt         string `json:"tickAt"`
}

// EffectDefinition is a read-only entry from the SRD condition catalogue. It
// is intentionally separate from Effect: definitions are reusable rules,
// while effects are instances currently applied to a token in a scene.
type EffectDefinition struct {
	Slug    string `json:"slug"`
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Source  string `json:"source"`
}
type Token struct {
	ID      string  `json:"id"`
	ActorID *string `json:"actorId"`
	OwnerID *string `json:"-"`
	// IsOwner is deliberately a boolean instead of exposing OwnerID to browsers.
	// It lets a player open only the sheet tied to their own token.
	IsOwner         bool       `json:"isOwner"`
	Name            string     `json:"name"`
	ImageURL        *string    `json:"imageUrl"`
	Color           int        `json:"color"`
	X               int        `json:"x"`
	Y               int        `json:"y"`
	Size            int        `json:"size"`
	HPCurrent       int        `json:"hpCurrent"`
	HPMax           int        `json:"hpMax"`
	ArmorClass      int        `json:"armorClass"`
	Initiative      int        `json:"initiative"`
	InitiativeBonus int        `json:"initiativeBonus"`
	VisionRange     int        `json:"visionRange"`
	LightRange      int        `json:"lightRange"`
	MovementLimit   int        `json:"movementLimit"`
	MovementSpent   float64    `json:"movementSpent"`
	Statuses        []string   `json:"statuses"`
	Hidden          bool       `json:"hidden"`
	Visibility      Visibility `json:"visibility"`
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
	query := `select id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order from scenes where campaign_id=$1`
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
		if err := rows.Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder); err != nil {
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
	err := r.pool.QueryRow(ctx, `insert into scenes(campaign_id,name,player_access) values($1,$2,'hidden') returning id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order`, campaignID, name).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder)
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
	err = tx.QueryRow(ctx, `update scenes set name=$1,background_url=nullif($2,''),grid_size=$3,player_access=$4,fog_enabled=$5,vision_mode=$6,allow_player_movement=$7,allow_player_door_interaction=$8,enforce_turn_order=$9,updated_at=now() where id=$10 returning id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order`, input.Name, input.BackgroundURL, input.GridSize, input.PlayerAccess, input.FogEnabled, input.VisionMode, input.AllowPlayerMovement, input.AllowPlayerDoorInteraction, input.EnforceTurnOrder, sceneID).Scan(&scene.ID, &scene.CampaignID, &scene.Name, &scene.BackgroundURL, &scene.GridSize, &scene.PlayerAccess, &scene.FogEnabled, &scene.VisionMode, &scene.AllowPlayerMovement, &scene.AllowPlayerDoorInteraction, &scene.EnforceTurnOrder)
	if err != nil {
		return Scene{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Scene{}, err
	}
	return scene, nil
}
func (r *Repository) Detail(ctx context.Context, sceneID, userID string) (Scene, []Token, FogState, []Area, []Wall, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	var s Scene
	if err = r.pool.QueryRow(ctx, `select id::text,campaign_id::text,name,background_url,grid_size,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order from scenes where id=$1`, sceneID).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.GridSize, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder); err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	if role != "gm" && s.PlayerAccess == "hidden" {
		return Scene{}, nil, FogState{}, nil, nil, ErrForbidden
	}
	query := `select st.id::text,st.actor_id::text,st.owner_id::text,st.name,st.image_url,st.color,st.position_x,st.position_y,st.size,st.hp_current,st.hp_max,st.armor_class,st.initiative,st.initiative_bonus,st.vision_range,st.light_range,st.movement_limit,coalesce(tm.spent_squares,0),st.statuses,st.is_hidden,st.visibility from scene_tokens st left join scene_token_turn_movement tm on tm.scene_id=st.scene_id and tm.token_id=st.id where st.scene_id=$1`
	if role != "gm" {
		query += ` and is_hidden=false`
	}
	rows, err := r.pool.Query(ctx, query, sceneID)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	defer rows.Close()
	items := []Token{}
	for rows.Next() {
		var t Token
		var raw, visibility []byte
		if err := rows.Scan(&t.ID, &t.ActorID, &t.OwnerID, &t.Name, &t.ImageURL, &t.Color, &t.X, &t.Y, &t.Size, &t.HPCurrent, &t.HPMax, &t.ArmorClass, &t.Initiative, &t.InitiativeBonus, &t.VisionRange, &t.LightRange, &t.MovementLimit, &t.MovementSpent, &raw, &t.Hidden, &visibility); err != nil {
			return Scene{}, nil, FogState{}, nil, nil, err
		}
		if err := json.Unmarshal(raw, &t.Statuses); err != nil {
			return Scene{}, nil, FogState{}, nil, nil, err
		}
		if err := json.Unmarshal(visibility, &t.Visibility); err != nil {
			return Scene{}, nil, FogState{}, nil, nil, err
		}
		t.IsOwner = t.OwnerID != nil && *t.OwnerID == userID
		items = append(items, t)
	}
	if err := rows.Err(); err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	walls, err := r.Walls(ctx, sceneID, userID)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	// A player deliberately receives an empty list, while the same server-side
	// walls still constrain the calculated field of view below.
	visionWalls := walls
	if role != "gm" {
		visionWalls, err = r.wallsForVision(ctx, sceneID)
		if err != nil {
			return Scene{}, nil, FogState{}, nil, nil, err
		}
	}
	fog, err := r.fogState(ctx, sceneID, s.GridSize, items, visionWalls)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	filtered := make([]Token, 0, len(items))
	visible := make(map[string]bool, len(fog.VisibleCells))
	for _, cell := range fog.VisibleCells {
		visible[cell] = true
	}
	for _, t := range items {
		if role != "gm" && s.FogEnabled && !tokenIsVisible(t, s.GridSize, visible) {
			continue
		}
		filtered = append(filtered, applyVisibility(t, role, userID))
	}
	if role == "gm" {
		fog = FogState{}
	}
	areas, err := r.Areas(ctx, sceneID, userID)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	return s, filtered, fog, areas, walls, nil
}

func (r *Repository) wallsForVision(ctx context.Context, sceneID string) ([]Wall, error) {
	rows, err := r.pool.Query(ctx, `select id::text,start_x,start_y,end_x,end_y,kind,is_open from scene_walls where scene_id=$1 order by created_at`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Wall{}
	for rows.Next() {
		var item Wall
		if err := rows.Scan(&item.ID, &item.StartX, &item.StartY, &item.EndX, &item.EndY, &item.Kind, &item.Open); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) Walls(ctx context.Context, sceneID, userID string) ([]Wall, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return nil, ErrForbidden
	}
	if role != "gm" {
		return []Wall{}, nil
	}
	return r.wallsForVision(ctx, sceneID)
}

func (r *Repository) CreateWall(ctx context.Context, sceneID, userID string, wall Wall) (Wall, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Wall{}, ErrForbidden
	}
	if wall.Kind != "door" {
		wall.Kind = "wall"
		wall.Open = false
	}
	err = r.pool.QueryRow(ctx, `insert into scene_walls(scene_id,start_x,start_y,end_x,end_y,kind,is_open) values($1,$2,$3,$4,$5,$6,$7) returning id::text`, sceneID, wall.StartX, wall.StartY, wall.EndX, wall.EndY, wall.Kind, wall.Open).Scan(&wall.ID)
	return wall, err
}

func (r *Repository) SetWallOpen(ctx context.Context, sceneID, wallID, userID string, open bool) (Wall, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Wall{}, ErrForbidden
	}
	var wall Wall
	err = r.pool.QueryRow(ctx, `update scene_walls set is_open=$1 where id=$2 and scene_id=$3 and kind='door' returning id::text,start_x,start_y,end_x,end_y,kind,is_open`, open, wallID, sceneID).Scan(&wall.ID, &wall.StartX, &wall.StartY, &wall.EndX, &wall.EndY, &wall.Kind, &wall.Open)
	if err == pgx.ErrNoRows {
		return Wall{}, fmt.Errorf("door not found")
	}
	return wall, err
}

// InteractDoor lets a player toggle only a door beside one of their own tokens.
// The client never supplies a door ID, so it cannot probe the hidden dungeon
// geometry. The GM may disable this per scene at any time.
func (r *Repository) InteractDoor(ctx context.Context, sceneID, userID string) (Wall, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Wall{}, err
	}
	if role == "gm" {
		return Wall{}, ErrForbidden
	}
	var allowed bool
	var gridSize int
	if err = r.pool.QueryRow(ctx, `select allow_player_door_interaction,grid_size from scenes where id=$1`, sceneID).Scan(&allowed, &gridSize); err != nil {
		return Wall{}, err
	}
	if !allowed {
		return Wall{}, ErrForbidden
	}
	tokens, err := r.pool.Query(ctx, `select position_x,position_y,size from scene_tokens where scene_id=$1 and owner_id=$2 and is_hidden=false`, sceneID, userID)
	if err != nil {
		return Wall{}, err
	}
	defer tokens.Close()
	type point struct{ x, y float64 }
	points := []point{}
	for tokens.Next() {
		var x, y, size int
		if err = tokens.Scan(&x, &y, &size); err != nil {
			return Wall{}, err
		}
		offset := float64(size*gridSize) / 2
		points = append(points, point{float64(x) + offset, float64(y) + offset})
	}
	if err = tokens.Err(); err != nil {
		return Wall{}, err
	}
	if len(points) == 0 {
		return Wall{}, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select id::text,start_x,start_y,end_x,end_y,kind,is_open from scene_walls where scene_id=$1 and kind='door' order by created_at`, sceneID)
	if err != nil {
		return Wall{}, err
	}
	defer rows.Close()
	var closest *Wall
	best := float64(gridSize) * 1.25
	for rows.Next() {
		var wall Wall
		if err = rows.Scan(&wall.ID, &wall.StartX, &wall.StartY, &wall.EndX, &wall.EndY, &wall.Kind, &wall.Open); err != nil {
			return Wall{}, err
		}
		for _, p := range points {
			distance := pointSegmentDistance(p.x, p.y, float64(wall.StartX), float64(wall.StartY), float64(wall.EndX), float64(wall.EndY))
			if distance <= best {
				copy := wall
				closest = &copy
				best = distance
			}
		}
	}
	if err = rows.Err(); err != nil {
		return Wall{}, err
	}
	if closest == nil {
		return Wall{}, fmt.Errorf("no door nearby")
	}
	closest.Open = !closest.Open
	err = r.pool.QueryRow(ctx, `update scene_walls set is_open=$1 where id=$2 and scene_id=$3 and kind='door' returning id::text,start_x,start_y,end_x,end_y,kind,is_open`, closest.Open, closest.ID, sceneID).Scan(&closest.ID, &closest.StartX, &closest.StartY, &closest.EndX, &closest.EndY, &closest.Kind, &closest.Open)
	return *closest, err
}

func pointSegmentDistance(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	if dx == 0 && dy == 0 {
		return math.Hypot(px-ax, py-ay)
	}
	t := ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

func (r *Repository) DeleteWall(ctx context.Context, sceneID, wallID, userID string) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	result, err := r.pool.Exec(ctx, `delete from scene_walls where id=$1 and scene_id=$2`, wallID, sceneID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("wall not found")
	}
	return nil
}

func (r *Repository) Areas(ctx context.Context, sceneID, userID string) ([]Area, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return nil, ErrForbidden
	}
	query := `select id::text,shape,start_x,start_y,end_x,end_y,color,label,visible_to_players from scene_areas where scene_id=$1`
	if role != "gm" {
		query += ` and visible_to_players=true`
	}
	rows, err := r.pool.Query(ctx, query+` order by created_at`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Area{}
	for rows.Next() {
		var item Area
		if err := rows.Scan(&item.ID, &item.Shape, &item.StartX, &item.StartY, &item.EndX, &item.EndY, &item.Color, &item.Label, &item.VisibleToPlayers); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (r *Repository) CreateArea(ctx context.Context, sceneID, userID string, area Area) (Area, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Area{}, ErrForbidden
	}
	err = r.pool.QueryRow(ctx, `insert into scene_areas(scene_id,shape,start_x,start_y,end_x,end_y,color,label,visible_to_players) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text`, sceneID, area.Shape, area.StartX, area.StartY, area.EndX, area.EndY, area.Color, area.Label, area.VisibleToPlayers).Scan(&area.ID)
	return area, err
}
func (r *Repository) DeleteArea(ctx context.Context, sceneID, areaID, userID string) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	result, err := r.pool.Exec(ctx, `delete from scene_areas where id=$1 and scene_id=$2`, areaID, sceneID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("area not found")
	}
	return nil
}

func cellKey(x, y int) string          { return fmt.Sprintf("%d:%d", x, y) }
func gridCell(pixel, gridSize int) int { return int(math.Floor(float64(pixel) / float64(gridSize))) }
func tokenIsVisible(t Token, gridSize int, visible map[string]bool) bool {
	return visible[cellKey(gridCell(t.X, gridSize), gridCell(t.Y, gridSize))]
}
func (r *Repository) fogState(ctx context.Context, sceneID string, gridSize int, tokens []Token, walls []Wall) (FogState, error) {
	state := FogState{VisibleCells: []string{}, RevealedCells: []string{}, HiddenCells: []string{}}
	visible := map[string]bool{}
	for _, token := range tokens {
		if token.Hidden {
			continue
		}
		vision := token.LightRange
		if token.OwnerID != nil && token.VisionRange > vision {
			vision = token.VisionRange
		}
		if vision <= 0 {
			continue
		}
		cx, cy := gridCell(token.X, gridSize), gridCell(token.Y, gridSize)
		for x := cx - vision; x <= cx+vision; x++ {
			for y := cy - vision; y <= cy+vision; y++ {
				if (x-cx)*(x-cx)+(y-cy)*(y-cy) <= vision*vision {
					if hasLineOfSight(cx, cy, x, y, gridSize, walls) {
						visible[cellKey(x, y)] = true
					}
				}
			}
		}
	}
	rows, err := r.pool.Query(ctx, `select cell_x,cell_y from scene_revealed_cells where scene_id=$1`, sceneID)
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var x, y int
		if err := rows.Scan(&x, &y); err != nil {
			return state, err
		}
		state.RevealedCells = append(state.RevealedCells, cellKey(x, y))
	}
	if err := rows.Err(); err != nil {
		return state, err
	}
	overrides, err := r.pool.Query(ctx, `select cell_x,cell_y,mode from scene_fog_overrides where scene_id=$1`, sceneID)
	if err != nil {
		return state, err
	}
	defer overrides.Close()
	for overrides.Next() {
		var x, y int
		var mode string
		if err := overrides.Scan(&x, &y, &mode); err != nil {
			return state, err
		}
		key := cellKey(x, y)
		if mode == "reveal" {
			visible[key] = true
		} else {
			delete(visible, key)
			state.HiddenCells = append(state.HiddenCells, key)
		}
	}
	if err := overrides.Err(); err != nil {
		return state, err
	}
	for key := range visible {
		state.VisibleCells = append(state.VisibleCells, key)
	}
	return state, nil
}

func hasLineOfSight(fromX, fromY, toX, toY, gridSize int, walls []Wall) bool {
	if fromX == toX && fromY == toY {
		return true
	}
	ax, ay := float64(fromX*gridSize+gridSize/2), float64(fromY*gridSize+gridSize/2)
	bx, by := float64(toX*gridSize+gridSize/2), float64(toY*gridSize+gridSize/2)
	for _, wall := range walls {
		if wall.Kind == "door" && wall.Open {
			continue
		}
		if segmentsIntersect(ax, ay, bx, by, float64(wall.StartX), float64(wall.StartY), float64(wall.EndX), float64(wall.EndY)) {
			return false
		}
	}
	return true
}

func orientation(ax, ay, bx, by, cx, cy float64) float64 { return (bx-ax)*(cy-ay) - (by-ay)*(cx-ax) }
func segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy float64) bool {
	o1, o2 := orientation(ax, ay, bx, by, cx, cy), orientation(ax, ay, bx, by, dx, dy)
	o3, o4 := orientation(cx, cy, dx, dy, ax, ay), orientation(cx, cy, dx, dy, bx, by)
	// Collinear sight exactly along a wall is kept visible; only a crossing
	// blocks vision, avoiding flicker when a token stands beside a wall.
	return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
}

func wallBlocksMovement(fromX, fromY, size, toX, toY, gridSize int, walls []Wall) bool {
	if len(walls) == 0 {
		return false
	}
	// Token positions describe their upper-left grid corner. Moving the centre
	// gives a creature larger than 1x1 the same rule as a regular token.
	offset := float64(size*gridSize) / 2
	ax, ay := float64(fromX)+offset, float64(fromY)+offset
	bx, by := float64(toX)+offset, float64(toY)+offset
	for _, wall := range walls {
		if wall.Kind == "door" && wall.Open {
			continue
		}
		if segmentsIntersect(ax, ay, bx, by, float64(wall.StartX), float64(wall.StartY), float64(wall.EndX), float64(wall.EndY)) {
			return true
		}
	}
	return false
}

func (r *Repository) UpdateFog(ctx context.Context, sceneID, userID, mode string, cells [][2]int) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	if (mode != "reveal" && mode != "hide") || len(cells) == 0 || len(cells) > 121 {
		return fmt.Errorf("invalid fog update")
	}
	for _, cell := range cells {
		if _, err := r.pool.Exec(ctx, `insert into scene_fog_overrides(scene_id,cell_x,cell_y,mode) values($1,$2,$3,$4) on conflict(scene_id,cell_x,cell_y) do update set mode=excluded.mode,updated_at=now()`, sceneID, cell[0], cell[1], mode); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) revealTokenVision(ctx context.Context, sceneID string, token Token) error {
	vision := token.LightRange
	if token.OwnerID != nil && token.VisionRange > vision {
		vision = token.VisionRange
	}
	if token.Hidden || vision <= 0 {
		return nil
	}
	var gridSize int
	if err := r.pool.QueryRow(ctx, `select grid_size from scenes where id=$1`, sceneID).Scan(&gridSize); err != nil {
		return err
	}
	walls, err := r.wallsForVision(ctx, sceneID)
	if err != nil {
		return err
	}
	cx, cy := gridCell(token.X, gridSize), gridCell(token.Y, gridSize)
	for x := cx - vision; x <= cx+vision; x++ {
		for y := cy - vision; y <= cy+vision; y++ {
			if (x-cx)*(x-cx)+(y-cy)*(y-cy) > vision*vision {
				continue
			}
			if !hasLineOfSight(cx, cy, x, y, gridSize, walls) {
				continue
			}
			if _, err := r.pool.Exec(ctx, `insert into scene_revealed_cells(scene_id,cell_x,cell_y) values($1,$2,$3) on conflict do nothing`, sceneID, x, y); err != nil {
				return err
			}
		}
	}
	return nil
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
func (r *Repository) Effects(ctx context.Context, sceneID, userID string) ([]Effect, error) {
	if _, err := r.memberRole(ctx, sceneID, userID); err != nil {
		return nil, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select id::text,token_id::text,name,source,remaining_turns,tick_at::text from scene_token_effects where scene_id=$1 order by created_at`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Effect{}
	for rows.Next() {
		var e Effect
		if err := rows.Scan(&e.ID, &e.TokenID, &e.Name, &e.Source, &e.RemainingTurns, &e.TickAt); err != nil {
			return nil, err
		}
		items = append(items, e)
	}
	return items, rows.Err()
}

func (r *Repository) EffectDefinitions(ctx context.Context, sceneID, userID string) ([]EffectDefinition, error) {
	if _, err := r.memberRole(ctx, sceneID, userID); err != nil {
		return nil, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select slug,name,summary,source from effect_definitions order by name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []EffectDefinition{}
	for rows.Next() {
		var item EffectDefinition
		if err := rows.Scan(&item.Slug, &item.Name, &item.Summary, &item.Source); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (r *Repository) AddEffect(ctx context.Context, sceneID, userID string, e Effect) (Effect, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Effect{}, ErrForbidden
	}
	err = r.pool.QueryRow(ctx, `insert into scene_token_effects(scene_id,token_id,name,source,remaining_turns,tick_at) select $1,$2,$3,$4,$5,$6::effect_tick where exists(select 1 from scene_tokens where id=$2 and scene_id=$1) returning id::text,token_id::text,name,source,remaining_turns,tick_at::text`, sceneID, e.TokenID, e.Name, e.Source, e.RemainingTurns, e.TickAt).Scan(&e.ID, &e.TokenID, &e.Name, &e.Source, &e.RemainingTurns, &e.TickAt)
	return e, err
}

func (r *Repository) RemoveEffect(ctx context.Context, sceneID, effectID, userID string) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	command, err := r.pool.Exec(ctx, `delete from scene_token_effects where id=$1 and scene_id=$2`, effectID, sceneID)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return fmt.Errorf("effect not found")
	}
	return nil
}

// tickEffects consumes timed effects at the configured boundary. Untimed effects
// intentionally remain until the GM removes them: duration is a game decision,
// not an implicit timeout hidden from the table.
func tickEffects(ctx context.Context, tx pgx.Tx, sceneID, tokenID, boundary string) error {
	if tokenID == "" {
		return nil
	}
	if _, err := tx.Exec(ctx, `update scene_token_effects set remaining_turns=remaining_turns-1 where scene_id=$1 and token_id=$2 and tick_at=$3::effect_tick and remaining_turns is not null`, sceneID, tokenID, boundary); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `delete from scene_token_effects where scene_id=$1 and token_id=$2 and tick_at=$3::effect_tick and remaining_turns is not null and remaining_turns <= 0`, sceneID, tokenID, boundary)
	return err
}

func (r *Repository) SetCombat(ctx context.Context, sceneID, tokenID, userID string) (CombatState, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return CombatState{}, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return CombatState{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var previousID *string
	if err := tx.QueryRow(ctx, `select active_token_id::text from scenes where id=$1 for update`, sceneID).Scan(&previousID); err != nil {
		return CombatState{}, err
	}
	if tokenID != "" {
		var exists bool
		if err := tx.QueryRow(ctx, `select exists(select 1 from scene_tokens where id=$1 and scene_id=$2)`, tokenID, sceneID).Scan(&exists); err != nil || !exists {
			return CombatState{}, fmt.Errorf("token not found")
		}
	}
	if previousID != nil && *previousID != tokenID {
		if err := tickEffects(ctx, tx, sceneID, *previousID, "turn_end"); err != nil {
			return CombatState{}, err
		}
	}
	var state CombatState
	if err := tx.QueryRow(ctx, `update scenes set active_token_id=nullif($1,'')::uuid,updated_at=now() where id=$2 returning active_token_id::text`, tokenID, sceneID).Scan(&state.ActiveTokenID); err != nil {
		return CombatState{}, err
	}
	if state.ActiveTokenID != nil && (previousID == nil || *previousID != *state.ActiveTokenID) {
		// A budget belongs to a turn, not to a token forever. Reset it only when
		// this actor becomes active; the previous actor's spent value remains
		// visible in the tracker until its next turn.
		if _, err := tx.Exec(ctx, `insert into scene_token_turn_movement(scene_id,token_id,spent_squares) values($1,$2,0) on conflict(scene_id,token_id) do update set spent_squares=0,updated_at=now()`, sceneID, *state.ActiveTokenID); err != nil {
			return CombatState{}, err
		}
		if err := tickEffects(ctx, tx, sceneID, *state.ActiveTokenID, "turn_start"); err != nil {
			return CombatState{}, err
		}
	}
	if (previousID == nil && state.ActiveTokenID != nil) || (previousID != nil && state.ActiveTokenID == nil) || (previousID != nil && state.ActiveTokenID != nil && *previousID != *state.ActiveTokenID) {
		if state.ActiveTokenID == nil {
			state.Message = "⚔️ Combate encerrado."
		} else {
			var name string
			if err := tx.QueryRow(ctx, `select name from scene_tokens where id=$1`, *state.ActiveTokenID).Scan(&name); err != nil {
				return CombatState{}, err
			}
			if previousID == nil {
				state.Message = fmt.Sprintf("⚔️ Combate iniciado — turno de %s.", name)
			} else {
				state.Message = fmt.Sprintf("⚔️ Turno de %s.", name)
			}
		}
		payload, _ := json.Marshal(map[string]string{"text": state.Message})
		if _, err := tx.Exec(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) select campaign_id,$1,'combat.log',$2 from scenes where id=$3`, userID, payload, sceneID); err != nil {
			return CombatState{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return CombatState{}, err
	}
	return state, nil
}

// RollInitiative assigns a fresh d20 result to every token in a scene. The roll
// happens on the server so all connected clients receive the same combat order.
func (r *Repository) RollInitiative(ctx context.Context, sceneID, userID string) ([]Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return nil, ErrForbidden
	}
	rows, err := r.pool.Query(ctx, `select id::text,initiative_bonus from scene_tokens where scene_id=$1 order by id`, sceneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Token{}
	for rows.Next() {
		var item Token
		if err := rows.Scan(&item.ID, &item.InitiativeBonus); err != nil {
			return nil, err
		}
		roll, err := rand.Int(rand.Reader, big.NewInt(20))
		if err != nil {
			return nil, fmt.Errorf("roll initiative: %w", err)
		}
		item.Initiative = int(roll.Int64()) + 1 + item.InitiativeBonus
		if _, err := r.pool.Exec(ctx, `update scene_tokens set initiative=$1,updated_at=now() where id=$2 and scene_id=$3`, item.Initiative, item.ID, sceneID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	if _, err := r.pool.Exec(ctx, `delete from scene_token_turn_movement where scene_id=$1`, sceneID); err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]string{"text": fmt.Sprintf("⚔️ Iniciativa rolada para %d combatentes.", len(items))})
	if _, err := r.pool.Exec(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) select campaign_id,$1,'combat.log',$2 from scenes where id=$3`, userID, payload, sceneID); err != nil {
		return nil, err
	}
	return items, nil
}

// RollTokenInitiative lets a player roll only the initiative of a token they
// own. The ownership check lives here (rather than in the browser) so a
// modified request cannot roll an ally's or NPC's initiative.
func (r *Repository) RollTokenInitiative(ctx context.Context, sceneID, tokenID, userID string) (InitiativeResult, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return InitiativeResult{}, ErrForbidden
	}
	var ownerID *string
	var bonus int
	if err := r.pool.QueryRow(ctx, `select owner_id::text,initiative_bonus from scene_tokens where id=$1 and scene_id=$2`, tokenID, sceneID).Scan(&ownerID, &bonus); err != nil {
		if err == pgx.ErrNoRows {
			return InitiativeResult{}, ErrForbidden
		}
		return InitiativeResult{}, err
	}
	if role != "gm" && (ownerID == nil || *ownerID != userID) {
		return InitiativeResult{}, ErrForbidden
	}
	rolled, err := rand.Int(rand.Reader, big.NewInt(20))
	if err != nil {
		return InitiativeResult{}, fmt.Errorf("roll token initiative: %w", err)
	}
	result := InitiativeResult{TokenID: tokenID, Roll: int(rolled.Int64()) + 1, Bonus: bonus}
	result.Initiative = result.Roll + result.Bonus
	if _, err := r.pool.Exec(ctx, `update scene_tokens set initiative=$1,updated_at=now() where id=$2 and scene_id=$3`, result.Initiative, tokenID, sceneID); err != nil {
		return InitiativeResult{}, err
	}
	payload, _ := json.Marshal(map[string]string{"text": fmt.Sprintf("⚔️ Iniciativa rolada: %d %+d = %d.", result.Roll, result.Bonus, result.Initiative)})
	if _, err := r.pool.Exec(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) select campaign_id,$1,'combat.log',$2 from scenes where id=$3`, userID, payload, sceneID); err != nil {
		return InitiativeResult{}, err
	}
	return result, nil
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
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility,vision_range,light_range,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id::text`, sceneID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, raw, t.Hidden, visibility, t.VisionRange, t.LightRange, t.MovementLimit).Scan(&t.ID)
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
	var characterAlreadyLinked bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from scene_tokens where scene_id=$1 and actor_id=$2)`, sceneID, actorID).Scan(&characterAlreadyLinked); err != nil {
		return Token{}, err
	}
	if characterAlreadyLinked {
		return Token{}, ErrAlreadyLinked
	}
	name := sheet.Name
	if name == "" {
		name = actorName
	}
	owner := ownerID
	t := Token{ActorID: &actorID, OwnerID: &owner, Name: name, Color: 3381504, X: 70, Y: 70, Size: 1, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax, ArmorClass: sheet.ArmorClass, MovementLimit: movementSquares(sheet.Speed), Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,owner_id,name,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id::text`, sceneID, actorID, ownerID, name, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility, t.MovementLimit).Scan(&t.ID)
	if err == nil {
		t.InitiativeBonus = abilityModifier(sheet.AbilityScores.Dexterity)
		_, err = r.pool.Exec(ctx, `update scene_tokens set initiative_bonus=$1 where id=$2`, t.InitiativeBonus, t.ID)
	}
	if err == nil {
		err = r.revealTokenVision(ctx, sceneID, t)
	}
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
	var npcAlreadyLinked bool
	if err := r.pool.QueryRow(ctx, `select exists(select 1 from scene_tokens where scene_id=$1 and actor_id=$2)`, sceneID, actorID).Scan(&npcAlreadyLinked); err != nil {
		return Token{}, err
	}
	if npcAlreadyLinked {
		return Token{}, ErrAlreadyLinked
	}
	imageURL := sheet.ImageURL
	t := Token{ActorID: &actorID, Name: actorName, ImageURL: &imageURL, Color: sheet.Color, X: 70, Y: 70, Size: sheet.Size, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax, ArmorClass: sheet.ArmorClass, InitiativeBonus: sheet.Initiative, MovementLimit: 6, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id::text`, sceneID, actorID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility, t.MovementLimit).Scan(&t.ID)
	if err == nil {
		_, err = r.pool.Exec(ctx, `update scene_tokens set initiative_bonus=$1 where id=$2`, t.InitiativeBonus, t.ID)
	}
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
	t := Token{Name: name, Color: stats.Color, X: 70, Y: 70, Size: stats.Size, HPCurrent: stats.HPMax, HPMax: stats.HPMax, ArmorClass: stats.ArmorClass, Initiative: stats.Initiative, MovementLimit: 6, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	if stats.ImageURL != "" {
		t.ImageURL = &stats.ImageURL
	}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `insert into scene_tokens(scene_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id::text`, sceneID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility, t.MovementLimit).Scan(&t.ID)
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
	var previousX, previousY, previousSize, gridSize int
	var activeTokenID *string
	if err = r.pool.QueryRow(ctx, `select st.position_x,st.position_y,st.size,s.grid_size,s.active_token_id::text from scene_tokens st join scenes s on s.id=st.scene_id where st.id=$1 and st.scene_id=$2`, tokenID, sceneID).Scan(&previousX, &previousY, &previousSize, &gridSize, &activeTokenID); err != nil {
		return Token{}, fmt.Errorf("load current token position: %w", err)
	}
	if previousX != t.X || previousY != t.Y {
		walls, wallErr := r.wallsForVision(ctx, sceneID)
		if wallErr != nil {
			return Token{}, wallErr
		}
		if wallBlocksMovement(previousX, previousY, previousSize, t.X, t.Y, gridSize, walls) {
			return Token{}, ErrBlockedMovement
		}
	}
	raw, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	err = r.pool.QueryRow(ctx, `update scene_tokens set name=$1,image_url=$2,color=$3,position_x=$4,position_y=$5,size=$6,hp_current=$7,hp_max=$8,armor_class=$9,initiative=$10,statuses=$11,is_hidden=$12,visibility=$13,vision_range=$14,light_range=$15,movement_limit=$16,updated_at=now() where id=$17 and scene_id=$18 returning id::text,actor_id::text,owner_id::text,vision_range,light_range,movement_limit`, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, raw, t.Hidden, visibility, t.VisionRange, t.LightRange, t.MovementLimit, tokenID, sceneID).Scan(&t.ID, &t.ActorID, &t.OwnerID, &t.VisionRange, &t.LightRange, &t.MovementLimit)
	if err != nil {
		return Token{}, fmt.Errorf("update token: %w", err)
	}
	if t.ActorID != nil {
		if _, err = r.pool.Exec(ctx, `update actors set sheet=jsonb_set(sheet,'{hitPointsCurrent}',to_jsonb($1::int),true) where id=$2 and kind='character'`, t.HPCurrent, *t.ActorID); err != nil {
			return Token{}, fmt.Errorf("sync token HP to character: %w", err)
		}
	}
	if err = r.revealTokenVision(ctx, sceneID, t); err != nil {
		return Token{}, fmt.Errorf("reveal token vision: %w", err)
	}
	if activeTokenID != nil && *activeTokenID == tokenID {
		if err = r.recordTurnMovement(ctx, sceneID, tokenID, previousX, previousY, t.X, t.Y, gridSize); err != nil {
			return Token{}, err
		}
	}
	return t, nil
}

// MoveToken is intentionally narrower than UpdateToken. A player may only
// request a position for their own character token; all combat statistics and
// visibility fields remain under the GM's control.
func (r *Repository) MoveToken(ctx context.Context, sceneID, tokenID, userID string, x, y int) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	var allowed, enforceTurnOrder bool
	var activeTokenID *string
	var t Token
	err = r.pool.QueryRow(ctx, `select st.owner_id::text,st.position_x,st.position_y,st.size,st.is_hidden,st.vision_range,st.light_range,st.movement_limit,s.allow_player_movement,s.enforce_turn_order,s.active_token_id::text,s.grid_size from scene_tokens st join scenes s on s.id=st.scene_id where st.id=$1 and st.scene_id=$2`, tokenID, sceneID).Scan(&t.OwnerID, &t.X, &t.Y, &t.Size, &t.Hidden, &t.VisionRange, &t.LightRange, &t.MovementLimit, &allowed, &enforceTurnOrder, &activeTokenID, new(int))
	if err != nil {
		return Token{}, fmt.Errorf("load token movement: %w", err)
	}
	if role != "gm" && (!allowed || t.OwnerID == nil || *t.OwnerID != userID) {
		return Token{}, ErrForbidden
	}
	walls, err := r.wallsForVision(ctx, sceneID)
	if err != nil {
		return Token{}, err
	}
	var gridSize int
	if err = r.pool.QueryRow(ctx, `select grid_size from scenes where id=$1`, sceneID).Scan(&gridSize); err != nil {
		return Token{}, err
	}
	if wallBlocksMovement(t.X, t.Y, t.Size, x, y, gridSize, walls) {
		return Token{}, ErrBlockedMovement
	}
	t.X, t.Y = x, y
	if _, err = r.pool.Exec(ctx, `update scene_tokens set position_x=$1,position_y=$2,updated_at=now() where id=$3 and scene_id=$4`, x, y, tokenID, sceneID); err != nil {
		return Token{}, err
	}
	if err = r.revealTokenVision(ctx, sceneID, t); err != nil {
		return Token{}, fmt.Errorf("reveal token vision: %w", err)
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
	ErrForbidden       = fmt.Errorf("forbidden")
	ErrAlreadyLinked   = fmt.Errorf("character already linked to scene")
	ErrBlockedMovement = fmt.Errorf("movement blocked by wall")
)

func abilityModifier(score int) int {
	if score >= 10 {
		return (score - 10) / 2
	}
	return (score - 11) / 2
}

// movementSquares converts the speed stored by a character sheet in feet into
// grid squares. A missing speed keeps the table's safe default of 6.
func movementSquares(speed int) int {
	if speed <= 0 {
		return 6
	}
	// A speed that is not a multiple of five remains usable on the grid.
	return int(math.Ceil(float64(speed) / 5))
}

// recordTurnMovement keeps the combat budget in a dedicated table, so moving
// a token never mutates the actor's base speed. Diagonals use the VTT's
// existing one-square diagonal rule (the greater axis determines distance).
func (r *Repository) recordTurnMovement(ctx context.Context, sceneID, tokenID string, fromX, fromY, toX, toY, gridSize int) error {
	if gridSize <= 0 {
		return fmt.Errorf("invalid scene grid size")
	}
	dx := math.Abs(float64(toX - fromX))
	dy := math.Abs(float64(toY - fromY))
	spent := math.Max(dx, dy) / float64(gridSize)
	if spent == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `insert into scene_token_turn_movement(scene_id,token_id,spent_squares) values($1,$2,$3) on conflict(scene_id,token_id) do update set spent_squares=scene_token_turn_movement.spent_squares + excluded.spent_squares,updated_at=now()`, sceneID, tokenID, spent)
	return err
}
