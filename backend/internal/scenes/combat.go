package scenes

import "strings"
import "math/big"
import "fmt"
import "errors"
import "encoding/json"
import "crypto/rand"
import "context"
import "github.com/jackc/pgx/v5"
import "vtt-backend/internal/systems"

func (r *Repository) Combat(ctx context.Context, sceneID, userID string, overlayOnly ...bool) (CombatState, error) {
	if _, err := r.memberRole(ctx, sceneID, userID); err != nil {
		return CombatState{}, ErrForbidden
	}
	var state CombatState
	state.Initiatives = []CombatInitiative{}
	if err := r.pool.QueryRow(ctx, `select active_token_id::text from scenes where id=$1`, sceneID).Scan(&state.ActiveTokenID); err != nil {
		return CombatState{}, err
	}
	_, visibleTokens, _, _, _, err := r.Detail(ctx, sceneID, userID, overlayOnly...)
	if err != nil {
		return CombatState{}, err
	}
	visible := make(map[string]struct{}, len(visibleTokens))
	for _, token := range visibleTokens {
		visible[token.ID] = struct{}{}
		state.Initiatives = append(state.Initiatives, CombatInitiative{TokenID: token.ID, Initiative: token.Initiative})
	}
	if state.ActiveTokenID != nil {
		if _, ok := visible[*state.ActiveTokenID]; !ok {
			state.ActiveTokenID = nil
		}
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
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `select id::text,name,initiative_bonus,actor_id::text from scene_tokens where scene_id=$1 order by id for update`, sceneID)
	if err != nil {
		return nil, err
	}
	type rollTarget struct {
		token   Token
		actorID *string
	}
	targets := []rollTarget{}
	for rows.Next() {
		var target rollTarget
		if err := rows.Scan(&target.token.ID, &target.token.Name, &target.token.InitiativeBonus, &target.actorID); err != nil {
			rows.Close()
			return nil, err
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	items := []Token{}
	logResults := []string{}
	for _, target := range targets {
		item := target.token
		advantage := false
		if target.actorID != nil {
			var raw []byte
			if err := tx.QueryRow(ctx, `select sheet from actors where id=$1 for update`, *target.actorID).Scan(&raw); err == nil {
				var initiativePreference struct {
					Advantage bool `json:"initiativeAdvantage"`
				}
				if err := json.Unmarshal(raw, &initiativePreference); err != nil {
					return nil, err
				}
				advantage = initiativePreference.Advantage
				if advantage {
					if _, err := tx.Exec(ctx, `update actors set sheet=jsonb_set(sheet,'{initiativeAdvantage}','false'::jsonb,true) where id=$1`, *target.actorID); err != nil {
						return nil, err
					}
				}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
		}
		mode := systems.RollNormal
		if advantage {
			mode = systems.RollAdvantage
		}
		rolled, err := rollD20(mode)
		if err != nil {
			return nil, fmt.Errorf("roll initiative: %w", err)
		}
		item.InitiativeRolls = rolled.Rolls
		item.InitiativeAdvantage = advantage
		item.Initiative = rolled.Kept + item.InitiativeBonus
		if _, err := tx.Exec(ctx, `update scene_tokens set initiative=$1,updated_at=now() where id=$2 and scene_id=$3`, item.Initiative, item.ID, sceneID); err != nil {
			return nil, err
		}
		if advantage {
			logResults = append(logResults, fmt.Sprintf("%s: %v (vantagem) %+d = %d", item.Name, rolled.Rolls, item.InitiativeBonus, item.Initiative))
		} else {
			logResults = append(logResults, fmt.Sprintf("%s: %d %+d = %d", item.Name, rolled.Rolls[0], item.InitiativeBonus, item.Initiative))
		}
		items = append(items, item)
	}
	if _, err := tx.Exec(ctx, `delete from scene_token_turn_movement where scene_id=$1`, sceneID); err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]string{"text": fmt.Sprintf("⚔️ Iniciativa rolada: %s", strings.Join(logResults, " · "))})
	if _, err := tx.Exec(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) select campaign_id,$1,'combat.log',$2 from scenes where id=$3`, userID, payload, sceneID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
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
	var ownerID, actorID *string
	var bonus int
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return InitiativeResult{}, err
	}
	defer tx.Rollback(ctx)
	if err := tx.QueryRow(ctx, `select coalesce(st.owner_id,a.owner_id)::text,st.actor_id::text,st.initiative_bonus from scene_tokens st left join actors a on a.id=st.actor_id where st.id=$1 and st.scene_id=$2 for update of st`, tokenID, sceneID).Scan(&ownerID, &actorID, &bonus); err != nil {
		if err == pgx.ErrNoRows {
			return InitiativeResult{}, ErrForbidden
		}
		return InitiativeResult{}, err
	}
	if role != "gm" && (ownerID == nil || *ownerID != userID) {
		return InitiativeResult{}, ErrForbidden
	}
	advantage := false
	if actorID != nil {
		var raw []byte
		if err := tx.QueryRow(ctx, `select sheet from actors where id=$1 for update`, *actorID).Scan(&raw); err != nil {
			return InitiativeResult{}, err
		}
		var initiativePreference struct {
			Advantage bool `json:"initiativeAdvantage"`
		}
		if err := json.Unmarshal(raw, &initiativePreference); err != nil {
			return InitiativeResult{}, err
		}
		advantage = initiativePreference.Advantage
		if advantage {
			if _, err := tx.Exec(ctx, `update actors set sheet=jsonb_set(sheet,'{initiativeAdvantage}','false'::jsonb,true) where id=$1`, *actorID); err != nil {
				return InitiativeResult{}, err
			}
		}
	}
	mode := systems.RollNormal
	if advantage {
		mode = systems.RollAdvantage
	}
	rolled, err := rollD20(mode)
	if err != nil {
		return InitiativeResult{}, fmt.Errorf("roll token initiative: %w", err)
	}
	result := InitiativeResult{TokenID: tokenID, Rolls: rolled.Rolls, Roll: rolled.Kept, Advantage: advantage, Bonus: bonus}
	result.Initiative = result.Roll + result.Bonus
	if _, err := tx.Exec(ctx, `update scene_tokens set initiative=$1,updated_at=now() where id=$2 and scene_id=$3`, result.Initiative, tokenID, sceneID); err != nil {
		return InitiativeResult{}, err
	}
	rollLabel := fmt.Sprintf("%d", result.Roll)
	if advantage {
		rollLabel = fmt.Sprintf("%v (vantagem)", rolled.Rolls)
	}
	payload, _ := json.Marshal(map[string]string{"text": fmt.Sprintf("⚔️ Iniciativa rolada: %s %+d = %d.", rollLabel, result.Bonus, result.Initiative)})
	if _, err := tx.Exec(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) select campaign_id,$1,'combat.log',$2 from scenes where id=$3`, userID, payload, sceneID); err != nil {
		return InitiativeResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return InitiativeResult{}, err
	}
	return result, nil
}

func rollD20(mode systems.D20Mode) (systems.D20Result, error) {
	return systems.DefaultCharacterRules().RollD20(mode, 0, func(sides int) (int, error) {
		roll, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
		if err != nil {
			return 0, err
		}
		return int(roll.Int64()) + 1, nil
	})
}
