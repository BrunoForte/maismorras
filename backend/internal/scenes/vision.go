package scenes

import "math"
import "fmt"
import "context"
import "github.com/jackc/pgx/v5"

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

	return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
}

func wallBlocksMovement(fromX, fromY, size, toX, toY, gridSize int, walls []Wall) bool {
	if len(walls) == 0 {
		return false
	}

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
