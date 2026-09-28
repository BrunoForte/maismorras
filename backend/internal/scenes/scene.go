package scenes

import "encoding/json"
import "context"

func (r *Repository) memberRole(ctx context.Context, sceneID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx, `select case when exists(select 1 from profiles p where p.id=$2 and p.is_admin) then 'gm' else m.role::text end from scenes s left join campaign_members m on m.campaign_id=s.campaign_id and m.user_id=$2 where s.id=$1 and (m.user_id is not null or exists(select 1 from profiles p where p.id=$2 and p.is_admin))`, sceneID, userID).Scan(&role)
	return role, err
}
func (r *Repository) List(ctx context.Context, campaignID, userID string) ([]Scene, error) {
	var role string
	if err := r.pool.QueryRow(ctx, `select case when exists(select 1 from profiles p where p.id=$2 and p.is_admin) then 'gm' else role::text end from campaign_members where campaign_id=$1 and user_id=$2 union all select 'gm' where exists(select 1 from profiles p where p.id=$2 and p.is_admin) limit 1`, campaignID, userID).Scan(&role); err != nil {
		return nil, ErrForbidden
	}
	query := `select id::text,campaign_id::text,name,background_url,ambient_audio_path,ambient_audio_enabled,ambient_audio_volume,ambient_audio_position_ms,ambient_audio_started_at,ambient_audio_revision,ambient_effect_path,ambient_effect_enabled,ambient_effect_volume,ambient_effect_position_ms,ambient_effect_started_at,ambient_effect_revision,grid_size,map_width_cells,map_height_cells,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order from scenes where campaign_id=$1`
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
		if err := rows.Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.AmbientAudioPath, &s.AmbientAudioEnabled, &s.AmbientAudioVolume, &s.AmbientAudioPositionMs, &s.AmbientAudioStartedAt, &s.AmbientAudioRevision, &s.AmbientEffectPath, &s.AmbientEffectEnabled, &s.AmbientEffectVolume, &s.AmbientEffectPositionMs, &s.AmbientEffectStartedAt, &s.AmbientEffectRevision, &s.GridSize, &s.MapWidthCells, &s.MapHeightCells, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder); err != nil {
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
	err := r.pool.QueryRow(ctx, `insert into scenes(campaign_id,name,player_access,allow_player_movement) values($1,$2,'available',true) returning id::text,campaign_id::text,name,background_url,ambient_audio_path,ambient_audio_enabled,ambient_audio_volume,ambient_audio_position_ms,ambient_audio_started_at,ambient_audio_revision,ambient_effect_path,ambient_effect_enabled,ambient_effect_volume,ambient_effect_position_ms,ambient_effect_started_at,ambient_effect_revision,grid_size,map_width_cells,map_height_cells,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order`, campaignID, name).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.AmbientAudioPath, &s.AmbientAudioEnabled, &s.AmbientAudioVolume, &s.AmbientAudioPositionMs, &s.AmbientAudioStartedAt, &s.AmbientAudioRevision, &s.AmbientEffectPath, &s.AmbientEffectEnabled, &s.AmbientEffectVolume, &s.AmbientEffectPositionMs, &s.AmbientEffectStartedAt, &s.AmbientEffectRevision, &s.GridSize, &s.MapWidthCells, &s.MapHeightCells, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder)
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
	err = tx.QueryRow(ctx, `update scenes set name=$1,background_url=nullif($2,''),ambient_audio_path=nullif($3,''),ambient_audio_enabled=$4,ambient_audio_volume=$5,ambient_audio_position_ms=$6,ambient_audio_started_at=$7,ambient_audio_revision=$8,ambient_effect_path=nullif($9,''),ambient_effect_enabled=$10,ambient_effect_volume=$11,ambient_effect_position_ms=$12,ambient_effect_started_at=$13,ambient_effect_revision=$14,grid_size=$15,map_width_cells=$16,map_height_cells=$17,player_access=$18,fog_enabled=$19,vision_mode=$20,allow_player_movement=$21,allow_player_door_interaction=$22,enforce_turn_order=$23,updated_at=now() where id=$24 returning id::text,campaign_id::text,name,background_url,ambient_audio_path,ambient_audio_enabled,ambient_audio_volume,ambient_audio_position_ms,ambient_audio_started_at,ambient_audio_revision,ambient_effect_path,ambient_effect_enabled,ambient_effect_volume,ambient_effect_position_ms,ambient_effect_started_at,ambient_effect_revision,grid_size,map_width_cells,map_height_cells,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order`, input.Name, input.BackgroundURL, input.AmbientAudioPath, input.AmbientAudioEnabled, input.AmbientAudioVolume, input.AmbientAudioPositionMs, input.AmbientAudioStartedAt, input.AmbientAudioRevision, input.AmbientEffectPath, input.AmbientEffectEnabled, input.AmbientEffectVolume, input.AmbientEffectPositionMs, input.AmbientEffectStartedAt, input.AmbientEffectRevision, input.GridSize, input.MapWidthCells, input.MapHeightCells, input.PlayerAccess, input.FogEnabled, input.VisionMode, input.AllowPlayerMovement, input.AllowPlayerDoorInteraction, input.EnforceTurnOrder, sceneID).Scan(&scene.ID, &scene.CampaignID, &scene.Name, &scene.BackgroundURL, &scene.AmbientAudioPath, &scene.AmbientAudioEnabled, &scene.AmbientAudioVolume, &scene.AmbientAudioPositionMs, &scene.AmbientAudioStartedAt, &scene.AmbientAudioRevision, &scene.AmbientEffectPath, &scene.AmbientEffectEnabled, &scene.AmbientEffectVolume, &scene.AmbientEffectPositionMs, &scene.AmbientEffectStartedAt, &scene.AmbientEffectRevision, &scene.GridSize, &scene.MapWidthCells, &scene.MapHeightCells, &scene.PlayerAccess, &scene.FogEnabled, &scene.VisionMode, &scene.AllowPlayerMovement, &scene.AllowPlayerDoorInteraction, &scene.EnforceTurnOrder)
	if err != nil {
		return Scene{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Scene{}, err
	}
	return scene, nil
}
func (r *Repository) Detail(ctx context.Context, sceneID, userID string, overlayOnly ...bool) (Scene, []Token, FogState, []Area, []Wall, error) {
	overlay := len(overlayOnly) > 0 && overlayOnly[0]
	role, err := r.memberRole(ctx, sceneID, userID)
	if err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	var s Scene
	if err = r.pool.QueryRow(ctx, `select id::text,campaign_id::text,name,background_url,ambient_audio_path,ambient_audio_enabled,ambient_audio_volume,ambient_audio_position_ms,ambient_audio_started_at,ambient_audio_revision,ambient_effect_path,ambient_effect_enabled,ambient_effect_volume,ambient_effect_position_ms,ambient_effect_started_at,ambient_effect_revision,grid_size,map_width_cells,map_height_cells,player_access,fog_enabled,vision_mode,allow_player_movement,allow_player_door_interaction,enforce_turn_order from scenes where id=$1`, sceneID).Scan(&s.ID, &s.CampaignID, &s.Name, &s.BackgroundURL, &s.AmbientAudioPath, &s.AmbientAudioEnabled, &s.AmbientAudioVolume, &s.AmbientAudioPositionMs, &s.AmbientAudioStartedAt, &s.AmbientAudioRevision, &s.AmbientEffectPath, &s.AmbientEffectEnabled, &s.AmbientEffectVolume, &s.AmbientEffectPositionMs, &s.AmbientEffectStartedAt, &s.AmbientEffectRevision, &s.GridSize, &s.MapWidthCells, &s.MapHeightCells, &s.PlayerAccess, &s.FogEnabled, &s.VisionMode, &s.AllowPlayerMovement, &s.AllowPlayerDoorInteraction, &s.EnforceTurnOrder); err != nil {
		return Scene{}, nil, FogState{}, nil, nil, err
	}
	if role != "gm" && s.PlayerAccess == "hidden" {
		return Scene{}, nil, FogState{}, nil, nil, ErrForbidden
	}
	query := `select st.id::text,st.actor_id::text,coalesce(st.owner_id,a.owner_id)::text,st.name,st.image_url,st.color,st.position_x,st.position_y,st.size,st.hp_current,st.hp_max,st.armor_class,st.initiative,st.initiative_bonus,st.vision_range,st.light_range,st.movement_limit,coalesce(tm.spent_squares,0),st.statuses,st.is_hidden,st.visibility from scene_tokens st left join actors a on a.id=st.actor_id left join scene_token_turn_movement tm on tm.scene_id=st.scene_id and tm.token_id=st.id where st.scene_id=$1`
	if role != "gm" || overlay {
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
		if overlay {
			visibleToken := applyVisibility(t, "player", "")
			visibleToken.OwnerID = nil
			visibleToken.IsOwner = false
			filtered = append(filtered, visibleToken)
		} else {
			filtered = append(filtered, applyVisibility(t, role, userID))
		}
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
