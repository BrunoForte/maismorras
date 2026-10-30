package scenes

import "vtt-backend/internal/characters"
import "strings"
import "math"
import "hash/fnv"
import "fmt"
import "errors"
import "encoding/json"
import "context"
import "github.com/jackc/pgx/v5"

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

	var ownerID *string
	var actorName string
	var raw []byte
	err = r.pool.QueryRow(ctx, `select a.owner_id::text,a.name,a.sheet from actors a join scenes s on s.campaign_id=a.campaign_id where a.id=$1 and s.id=$2 and a.kind='character' and (a.owner_id is not null or a.full_npc)`, actorID, sceneID).Scan(&ownerID, &actorName, &raw)
	if err != nil {
		return Token{}, fmt.Errorf("load character actor: %w", err)
	}
	var sheet characters.Sheet
	if err := json.Unmarshal(raw, &sheet); err != nil {
		return Token{}, fmt.Errorf("decode character actor: %w", err)
	}
	name := sheet.Name
	if name == "" {
		name = actorName
	}
	var portrait *string
	portraitPath := sheet.TokenPortraitPath
	if strings.TrimSpace(portraitPath) == "" {
		portraitPath = sheet.PortraitPath
	}
	if value := strings.TrimSpace(portraitPath); value != "" {
		portrait = &value
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Token{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended((select campaign_id::text from scenes where id=$1),0))`, sceneID); err != nil {
		return Token{}, err
	}
	var characterAlreadyLinked bool
	if err = tx.QueryRow(ctx, `select exists(select 1 from scene_tokens where scene_id=$1 and actor_id=$2)`, sceneID, actorID).Scan(&characterAlreadyLinked); err != nil {
		return Token{}, err
	}
	if characterAlreadyLinked {
		return Token{}, ErrAlreadyLinked
	}
	color := actorTokenColor(actorID)
	if ownerID != nil {
		color, err = availablePlayerTokenColor(ctx, tx, sceneID, *ownerID, actorID)
		if err != nil {
			return Token{}, err
		}
	}
	t := Token{ActorID: &actorID, OwnerID: ownerID, Name: name, ImageURL: portrait, Color: color, X: 70, Y: 70, Size: 1, HPCurrent: sheet.HitPointsCurrent, HPMax: sheet.HitPointsMax, ArmorClass: sheet.ArmorClass, MovementLimit: characters.MovementLimitSquares(sheet.Speed), Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	if err = tx.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,owner_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,statuses,is_hidden,visibility,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id::text`, sceneID, actorID, ownerID, name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, statuses, false, visibility, t.MovementLimit).Scan(&t.ID); err != nil {
		return Token{}, err
	}
	t.InitiativeBonus = abilityModifier(sheet.AbilityScores.Dexterity)
	if _, err = tx.Exec(ctx, `update scene_tokens set initiative_bonus=$1 where id=$2`, t.InitiativeBonus, t.ID); err != nil {
		return Token{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Token{}, err
	}
	if err = r.revealTokenVision(ctx, sceneID, t); err != nil {
		return Token{}, err
	}
	return t, nil
}

func actorTokenColor(actorID string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(actorID))
	return playerTokenPalette[int(h.Sum32())%len(playerTokenPalette)]
}

func availablePlayerTokenColor(ctx context.Context, tx pgx.Tx, sceneID, ownerID, actorID string) (int, error) {
	rows, err := tx.Query(ctx, `select distinct other.color from scene_tokens other join scenes other_scene on other_scene.id=other.scene_id join scenes target_scene on target_scene.id=$1 where other_scene.campaign_id=target_scene.campaign_id and other.owner_id is not null and other.owner_id<>$2`, sceneID, ownerID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	used := make(map[int]bool)
	for rows.Next() {
		var color int
		if err = rows.Scan(&color); err != nil {
			return 0, err
		}
		used[color] = true
	}
	if err = rows.Err(); err != nil {
		return 0, err
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(actorID))
	start := int(h.Sum32()) % len(playerTokenPalette)
	for offset := range len(playerTokenPalette) {
		color := playerTokenPalette[(start+offset)%len(playerTokenPalette)]
		if !used[color] {
			return color, nil
		}
	}

	for offset := range 360 {
		color := tokenColorFromHue((int(h.Sum32()%360) + offset) % 360)
		if !used[color] {
			return color, nil
		}
	}
	return 0, fmt.Errorf("all player token colors are currently in use")
}

func tokenColorFromHue(hue int) int {
	h := float64((hue%360+360)%360) / 60
	chroma := 0.68
	x := chroma * (1 - math.Abs(math.Mod(h, 2)-1))
	var red, green, blue float64
	switch {
	case h < 1:
		red, green = chroma, x
	case h < 2:
		red, green = x, chroma
	case h < 3:
		green, blue = chroma, x
	case h < 4:
		green, blue = x, chroma
	case h < 5:
		red, blue = x, chroma
	default:
		red, blue = chroma, x
	}
	match := 0.16
	r := int(math.Round((red + match) * 255))
	g := int(math.Round((green + match) * 255))
	b := int(math.Round((blue + match) * 255))
	return r<<16 | g<<8 | b
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

// CreateTokenFromCompendiumMonster snapshots an SRD monster into a campaign NPC
// before placing it. The compendium remains immutable, while every placement
// receives its own independently editable combat instance and action list.
func (r *Repository) CreateTokenFromCompendiumMonster(ctx context.Context, sceneID, entryID, userID string) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return Token{}, ErrForbidden
	}
	var name string
	var raw []byte
	err = r.pool.QueryRow(ctx, `select e.name,e.rules from srd_catalog_entries e join srd_catalog_sources src on src.id=e.source_id join scenes s on s.id=$2 join campaign_srd_catalog_sources cs on cs.campaign_id=s.campaign_id and cs.source_id=e.source_id where e.id::text=$1 and src.slug='dnd-srd' and e.entry_type='other' and coalesce(e.rules->>'kind',e.rules->>'catalog')='monster'
		union all select e.name,e.rules from compendium_entries e join scenes s on s.campaign_id=e.campaign_id where e.id::text=$1 and s.id=$2 and e.entry_type='other' and coalesce(e.rules->>'kind',e.rules->>'catalog')='monster'
		union all select e.name,e.rules from srd_catalog_entry_aliases a join srd_catalog_entries e on e.id=a.catalog_entry_id join scenes s on s.campaign_id=a.campaign_id where a.legacy_entry_id::text=$1 and s.id=$2 and e.entry_type='other' and coalesce(e.rules->>'kind',e.rules->>'catalog')='monster' limit 1`, entryID, sceneID).Scan(&name, &raw)
	if err != nil {
		return Token{}, fmt.Errorf("load compendium monster: %w", err)
	}
	stats, err := decodeCompendiumMonsterSheet(raw)
	if err != nil {
		return Token{}, fmt.Errorf("decode compendium monster: %w", err)
	}
	if stats.HitPointsMax < 1 || stats.ArmorClass < 0 || stats.ArmorClass > 99 {
		return Token{}, fmt.Errorf("monster has no usable stat block")
	}
	if stats.Size < 1 || stats.Size > 6 {
		stats.Size = 1
	}
	if stats.Color < 0 || stats.Color > 16777215 {
		stats.Color = 4921830
	}
	stats.HitPointsCurrent = stats.HitPointsMax
	t := Token{Name: name, Color: stats.Color, X: 70, Y: 70, Size: stats.Size, HPCurrent: stats.HitPointsCurrent, HPMax: stats.HitPointsMax, ArmorClass: stats.ArmorClass, Initiative: stats.Initiative, InitiativeBonus: stats.Initiative, MovementLimit: 6, Statuses: []string{}, Visibility: Visibility{ShowName: true}}
	if stats.ImageURL != "" {
		t.ImageURL = &stats.ImageURL
	}
	actorSheet, err := json.Marshal(stats)
	if err != nil {
		return Token{}, fmt.Errorf("encode monster actor: %w", err)
	}
	statuses, _ := json.Marshal(t.Statuses)
	visibility, _ := json.Marshal(t.Visibility)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Token{}, err
	}
	defer tx.Rollback(ctx)
	var actorID string
	if err = tx.QueryRow(ctx, `insert into actors(campaign_id,kind,name,sheet) select campaign_id,'npc',$1,$2 from scenes where id=$3 returning id::text`, name, actorSheet, sceneID).Scan(&actorID); err != nil {
		return Token{}, fmt.Errorf("create monster actor: %w", err)
	}
	t.ActorID = &actorID
	err = tx.QueryRow(ctx, `insert into scene_tokens(scene_id,actor_id,name,image_url,color,position_x,position_y,size,hp_current,hp_max,armor_class,initiative,initiative_bonus,statuses,is_hidden,visibility,movement_limit) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id::text`, sceneID, actorID, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, t.InitiativeBonus, statuses, false, visibility, t.MovementLimit).Scan(&t.ID)
	if err != nil {
		return Token{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Token{}, err
	}
	return t, nil
}
func (r *Repository) UpdateToken(ctx context.Context, sceneID, tokenID, userID string, t Token) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	if role != "gm" {
		return Token{}, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Token{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// RestCharacter locks the actor before its scene token. Use the same order
	// here, and take HP from the locked actor rather than a stale token snapshot.
	var linkedActorID *string
	if err = tx.QueryRow(ctx, `select actor_id::text from scene_tokens where id=$1 and scene_id=$2`, tokenID, sceneID).Scan(&linkedActorID); errors.Is(err, pgx.ErrNoRows) {
		return Token{}, ErrTokenNotFound
	} else if err != nil {
		return Token{}, fmt.Errorf("load token actor: %w", err)
	}
	if linkedActorID != nil {
		var actorKind string
		var actorSheet []byte
		if err = tx.QueryRow(ctx, `select kind::text,sheet from actors where id=$1 for update`, *linkedActorID).Scan(&actorKind, &actorSheet); err != nil {
			return Token{}, fmt.Errorf("lock linked token actor: %w", err)
		}
		if actorKind == "character" {
			var actorHP struct {
				Current *int `json:"hitPointsCurrent"`
				Maximum *int `json:"hitPointsMax"`
			}
			if err = json.Unmarshal(actorSheet, &actorHP); err != nil {
				return Token{}, fmt.Errorf("read linked character HP: %w", err)
			}
			var tokenHPCurrent, tokenHPMax int
			if err = tx.QueryRow(ctx, `select hp_current,hp_max from scene_tokens where id=$1 and scene_id=$2 for update`, tokenID, sceneID).Scan(&tokenHPCurrent, &tokenHPMax); err != nil {
				return Token{}, fmt.Errorf("lock linked character token: %w", err)
			}
			t.HPCurrent, t.HPMax = tokenHPCurrent, tokenHPMax
			if actorHP.Current != nil {
				t.HPCurrent = *actorHP.Current
			}
			if actorHP.Maximum != nil {
				t.HPMax = *actorHP.Maximum
			}
		}
	}
	var previousX, previousY, previousSize, gridSize int
	var activeTokenID *string
	if err = tx.QueryRow(ctx, `select st.position_x,st.position_y,st.size,s.grid_size,s.active_token_id::text from scene_tokens st join scenes s on s.id=st.scene_id where st.id=$1 and st.scene_id=$2 for update of st`, tokenID, sceneID).Scan(&previousX, &previousY, &previousSize, &gridSize, &activeTokenID); errors.Is(err, pgx.ErrNoRows) {
		return Token{}, fmt.Errorf("load current token position: %w", ErrTokenNotFound)
	} else if err != nil {
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
	err = tx.QueryRow(ctx, `update scene_tokens set name=$1,image_url=$2,color=$3,position_x=$4,position_y=$5,size=$6,hp_current=$7,hp_max=$8,armor_class=$9,initiative=$10,statuses=$11,is_hidden=$12,visibility=$13,vision_range=$14,light_range=$15,movement_limit=$16,updated_at=now() where id=$17 and scene_id=$18 returning id::text,actor_id::text,owner_id::text,vision_range,light_range,movement_limit`, t.Name, t.ImageURL, t.Color, t.X, t.Y, t.Size, t.HPCurrent, t.HPMax, t.ArmorClass, t.Initiative, raw, t.Hidden, visibility, t.VisionRange, t.LightRange, t.MovementLimit, tokenID, sceneID).Scan(&t.ID, &t.ActorID, &t.OwnerID, &t.VisionRange, &t.LightRange, &t.MovementLimit)
	if errors.Is(err, pgx.ErrNoRows) {
		return Token{}, fmt.Errorf("update token: %w", ErrTokenNotFound)
	}
	if err != nil {
		return Token{}, fmt.Errorf("update token: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return Token{}, err
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

// UpdateTokenHitPoints is deliberately narrower than UpdateToken: a player may
// change only HP on their own character token, never an NPC or another player's
// token. Token and linked character sheet are committed atomically.
func (r *Repository) UpdateTokenHitPoints(ctx context.Context, sceneID, tokenID, userID string, input hitPointsUpdate) (Token, error) {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Token{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Token{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var actorOwnerID, actorID *string
	var actorKind string
	if err = tx.QueryRow(ctx, `select actor_id::text from scene_tokens where id=$1 and scene_id=$2`, tokenID, sceneID).Scan(&actorID); errors.Is(err, pgx.ErrNoRows) {
		return Token{}, ErrTokenNotFound
	} else if err != nil {
		return Token{}, fmt.Errorf("load token actor for HP update: %w", err)
	}
	if actorID != nil {
		var ownerID string
		if err = tx.QueryRow(ctx, `select coalesce(owner_id::text,''),kind::text from actors where id=$1 for update`, *actorID).Scan(&ownerID, &actorKind); err != nil {
			return Token{}, fmt.Errorf("lock actor for HP update: %w", err)
		}
		if ownerID != "" {
			actorOwnerID = &ownerID
		}
	}
	var current, maximum int
	err = tx.QueryRow(ctx, `select st.actor_id::text,st.hp_current,st.hp_max from scene_tokens st where st.id=$1 and st.scene_id=$2 for update`, tokenID, sceneID).Scan(&actorID, &current, &maximum)
	if errors.Is(err, pgx.ErrNoRows) {
		return Token{}, ErrTokenNotFound
	}
	if err != nil {
		return Token{}, fmt.Errorf("lock token hit points: %w", err)
	}
	if !canEditCharacterTokenHitPoints(role, actorKind, actorOwnerID, userID) {
		return Token{}, ErrForbidden
	}
	next := current
	if input.HPCurrent != nil {
		next = *input.HPCurrent
	} else if input.Delta != nil {
		next += *input.Delta
	}
	next = clampHitPoints(next, maximum)
	if _, err = tx.Exec(ctx, `update scene_tokens set hp_current=$1,updated_at=now() where id=$2 and scene_id=$3`, next, tokenID, sceneID); err != nil {
		return Token{}, fmt.Errorf("update token hit points: %w", err)
	}
	if actorID != nil && actorKind == "character" {
		if _, err = tx.Exec(ctx, `update actors set sheet=jsonb_set(coalesce(sheet,'{}'::jsonb),'{hitPointsCurrent}',to_jsonb($1::int),true) where id=$2 and kind='character'`, next, *actorID); err != nil {
			return Token{}, fmt.Errorf("sync hit points to character: %w", err)
		}
	}
	var token Token
	var raw, visibility []byte
	err = tx.QueryRow(ctx, `select st.id::text,st.actor_id::text,coalesce(st.owner_id,a.owner_id)::text,st.name,st.image_url,st.color,st.position_x,st.position_y,st.size,st.hp_current,st.hp_max,st.armor_class,st.initiative,st.initiative_bonus,st.vision_range,st.light_range,st.movement_limit,coalesce(tm.spent_squares,0),st.statuses,st.is_hidden,st.visibility from scene_tokens st left join actors a on a.id=st.actor_id left join scene_token_turn_movement tm on tm.scene_id=st.scene_id and tm.token_id=st.id where st.id=$1 and st.scene_id=$2`, tokenID, sceneID).Scan(&token.ID, &token.ActorID, &token.OwnerID, &token.Name, &token.ImageURL, &token.Color, &token.X, &token.Y, &token.Size, &token.HPCurrent, &token.HPMax, &token.ArmorClass, &token.Initiative, &token.InitiativeBonus, &token.VisionRange, &token.LightRange, &token.MovementLimit, &token.MovementSpent, &raw, &token.Hidden, &visibility)
	if err != nil {
		return Token{}, fmt.Errorf("read updated hit points: %w", err)
	}
	if err = json.Unmarshal(raw, &token.Statuses); err != nil {
		return Token{}, err
	}
	if err = json.Unmarshal(visibility, &token.Visibility); err != nil {
		return Token{}, err
	}
	token.IsOwner = token.OwnerID != nil && *token.OwnerID == userID
	if err = tx.Commit(ctx); err != nil {
		return Token{}, err
	}
	return token, nil
}

func canEditCharacterTokenHitPoints(role, actorKind string, actorOwnerID *string, userID string) bool {
	if role == "gm" {
		return true
	}
	return role == "player" && actorKind == "character" && actorOwnerID != nil && *actorOwnerID == userID
}

func clampHitPoints(value, maximum int) int {
	if value < 0 {
		return 0
	}
	if value > maximum {
		return maximum
	}
	return value
}

func (r *Repository) UpdateTokenAppearance(ctx context.Context, sceneID, tokenID, userID string, imageURL *string, color int, visibility Visibility) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var ownerID *string
	var currentColor int
	if err = tx.QueryRow(ctx, `select owner_id::text,color from scene_tokens where id=$1 and scene_id=$2 for update`, tokenID, sceneID).Scan(&ownerID, &currentColor); err != nil {
		return err
	}
	if role != "gm" && (ownerID == nil || *ownerID != userID) {
		return ErrForbidden
	}
	if ownerID != nil && color != currentColor {

		if _, err = tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended((select campaign_id::text from scenes where id=$1),0))`, sceneID); err != nil {
			return err
		}
		var colorInUse bool
		if err = tx.QueryRow(ctx, `select exists(select 1 from scene_tokens other join scenes other_scene on other_scene.id=other.scene_id join scenes target_scene on target_scene.id=$1 where other_scene.campaign_id=target_scene.campaign_id and other.owner_id is not null and other.owner_id<>$4 and other.color=$2 and other.id<>$3)`, sceneID, color, tokenID, *ownerID).Scan(&colorInUse); err != nil {
			return err
		}
		if colorInUse {
			return ErrTokenColorInUse
		}
	}
	_, err = tx.Exec(ctx, `update scene_tokens set image_url=$1,color=$2,visibility=jsonb_set(jsonb_set(jsonb_set(visibility,'{transparentBackground}',to_jsonb($3::boolean),true),'{imageScale}',to_jsonb($4::numeric),true),'{imageOffsetX}',to_jsonb($5::numeric),true)||jsonb_build_object('imageOffsetY',$6::numeric),updated_at=now() where id=$7 and scene_id=$8`, imageURL, color, visibility.TransparentBackground, visibility.ImageScale, visibility.ImageOffsetX, visibility.ImageOffsetY, tokenID, sceneID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetTokenInitiative stores a GM's manual initiative edit without requiring
// the client to send the complete token snapshot.
func (r *Repository) SetTokenInitiative(ctx context.Context, sceneID, tokenID, userID string, initiative int) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	result, err := r.pool.Exec(ctx, `update scene_tokens set initiative=$1,updated_at=now() where id=$2 and scene_id=$3`, initiative, tokenID, sceneID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("token not found")
	}
	return nil
}

// DeleteToken removes only the scene placement. The linked actor (character or
// NPC) remains available in the campaign and can be placed again later.
func (r *Repository) DeleteToken(ctx context.Context, sceneID, tokenID, userID string) error {
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil || role != "gm" {
		return ErrForbidden
	}
	result, err := r.pool.Exec(ctx, `delete from scene_tokens where id=$1 and scene_id=$2`, tokenID, sceneID)
	if err != nil {
		return fmt.Errorf("delete token: %w", err)
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("token not found")
	}
	return nil
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
	err = r.pool.QueryRow(ctx, `select coalesce(st.owner_id,a.owner_id)::text,st.position_x,st.position_y,st.size,st.is_hidden,st.vision_range,st.light_range,st.movement_limit,s.allow_player_movement,s.enforce_turn_order,s.active_token_id::text,s.grid_size from scene_tokens st join scenes s on s.id=st.scene_id left join actors a on a.id=st.actor_id where st.id=$1 and st.scene_id=$2`, tokenID, sceneID).Scan(&t.OwnerID, &t.X, &t.Y, &t.Size, &t.Hidden, &t.VisionRange, &t.LightRange, &t.MovementLimit, &allowed, &enforceTurnOrder, &activeTokenID, new(int))
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

func abilityModifier(score int) int {
	if score >= 10 {
		return (score - 10) / 2
	}
	return (score - 11) / 2
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
