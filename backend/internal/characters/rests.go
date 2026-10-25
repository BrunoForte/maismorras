package characters

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"vtt-backend/internal/sheetcompat"
	"vtt-backend/internal/systems"
)

var hitDieFormula = regexp.MustCompile(`^1d(\d+)$`)

var (
	ErrInvalidHitDiceCount = errors.New("invalid hit dice count")
	ErrInvalidRestState    = errors.New("invalid persisted character rest state")
)

type RestResult struct {
	EventID     int64  `json:"eventId,omitempty"`
	Sheet       Sheet  `json:"sheet"`
	Kind        string `json:"kind"`
	Dice        []int  `json:"dados,omitempty"`
	Modifier    int    `json:"modificador,omitempty"`
	Total       int    `json:"total,omitempty"`
	HPRecovered int    `json:"hpRecovered,omitempty"`
	Label       string `json:"label,omitempty"`
}

// RestCharacter applies recovery against the stored sheet under a row lock.
// It preserves the legacy one-die default for older short-rest clients. Clients
// can choose a count, but never submit die results or a final HP value.
func (r *Repository) RestCharacter(ctx context.Context, campaignID, userID, characterID, kind string) (RestResult, error) {
	return r.RestCharacterWithHitDiceCount(ctx, campaignID, userID, characterID, kind, nil)
}

func (r *Repository) RestCharacterWithHitDiceCount(ctx context.Context, campaignID, userID, characterID, kind string, requestedHitDice *int) (RestResult, error) {
	if kind != "short" && kind != "long" {
		return RestResult{}, ErrInvalidRest
	}
	if kind == "long" && requestedHitDice != nil && *requestedHitDice != 0 {
		return RestResult{}, ErrInvalidRest
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return RestResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	query := `select id::text,sheet from actors where campaign_id=$1 and owner_id=$2 and kind='character' for update`
	args := []any{campaignID, userID}
	if characterID != "" {
		query = `select id::text,sheet from actors where id=$3 and campaign_id=$1 and kind='character' and ((owner_id=$2 and exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2)) or exists(select 1 from campaign_members where campaign_id=$1 and user_id=$2 and role='gm')) for update`
		args = append(args, characterID)
	} else {
		member, memberErr := r.isMember(ctx, campaignID, userID)
		if memberErr != nil {
			return RestResult{}, memberErr
		}
		if !member {
			return RestResult{}, ErrForbidden
		}
	}
	var storedID string
	var raw []byte
	if err = tx.QueryRow(ctx, query, args...).Scan(&storedID, &raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RestResult{}, ErrNotFound
		}
		return RestResult{}, err
	}
	rules, err := dnd2024RulesForCampaign(ctx, campaignID, tx)
	if err != nil {
		return RestResult{}, err
	}
	var sheet Sheet
	if err = json.Unmarshal(raw, &sheet); err != nil {
		return RestResult{}, err
	}
	if err = validatePersistedRestState(sheet); err != nil {
		return RestResult{}, err
	}
	sheet = normalizeDerivedFields(sheet, rules)
	sheet.SpeciesSpellGrants, err = reconcileSpeciesSpellGrants(ctx, tx, campaignID, sheet, sheet)
	if err != nil {
		return RestResult{}, fmt.Errorf("validate species spell uses: %w", err)
	}
	sheet.CampaignFeatSpellGrants, err = recoverCampaignFeatSpellGrantUses(ctx, tx, campaignID, kind, sheet.CampaignFeatSpellGrants)
	if err != nil {
		return RestResult{}, fmt.Errorf("recover campaign feat spell uses: %w", err)
	}
	sheet.FeatSpellGrants, err = recoverFeatSpellGrantUses(sheet.FeatSpellGrants, kind)
	if err != nil {
		return RestResult{}, err
	}
	sheet.SpeciesSpellGrants, err = recoverSpeciesSpellGrantUses(sheet.SpeciesSpellGrants, kind)
	if err != nil {
		return RestResult{}, err
	}
	result := RestResult{Sheet: sheet, Kind: kind}
	if kind == "short" {
		count, _, countErr := resolveShortRestHitDice(sheet.Level, sheet.HitDiceSpent, requestedHitDice)
		if countErr != nil {
			return RestResult{}, countErr
		}
		if count > 0 {
			match := hitDieFormula.FindStringSubmatch(strings.TrimSpace(sheet.HitDice))
			if match == nil {
				return RestResult{}, ErrInvalidRest
			}
			sides, parseErr := strconv.Atoi(match[1])
			if parseErr != nil || sides < 2 || sides > 100 {
				return RestResult{}, ErrInvalidRest
			}
			modifier := abilityModifier(sheet.AbilityScores.Constitution, rules)
			dice, healing, rollErr := rollShortRestHitDice(count, sides, modifier, rollHitDie)
			if rollErr != nil {
				return RestResult{}, rollErr
			}
			sheet.HitDiceSpent += count
			result.Dice = dice
			result.Modifier = modifier
			result.Total = healing
			result.Label = "Dados de vida · " + sheet.Name
		}
	}

	previousHP := sheet.HitPointsCurrent
	sheet = applyRestRecovery(sheet, kind, result.Total, rules)
	result.HPRecovered = sheet.HitPointsCurrent - previousHP
	result.Sheet = sheet
	raw, err = sheetcompat.MarshalPreservingUnknown(raw, sheet)
	if err != nil {
		return RestResult{}, err
	}
	if _, err = tx.Exec(ctx, `update actors set sheet=$1,name=$2 where id=$3`, raw, sheet.Name, storedID); err != nil {
		return RestResult{}, err
	}
	if kind == "short" && len(result.Dice) > 0 {
		match := hitDieFormula.FindStringSubmatch(strings.TrimSpace(sheet.HitDice))
		expression := fmt.Sprintf("%dd%s", len(result.Dice), match[1])
		payload, marshalErr := json.Marshal(map[string]any{
			"expressao": expression, "dados": result.Dice, "modo": "normal",
			"modificador": result.Modifier, "total": result.Total, "hpRecovered": result.HPRecovered, "label": result.Label,
			"text":    fmt.Sprintf("%s · descanso curto · dados [%s] · Constituição %+d por dado · recuperação %d PV", result.Label, joinDice(result.Dice), result.Modifier, result.HPRecovered),
			"channel": "combat", "hitDie": true,
		})
		if marshalErr != nil {
			return RestResult{}, marshalErr
		}
		if err = tx.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'dice.roll',$3) returning id`, campaignID, userID, payload).Scan(&result.EventID); err != nil {
			return RestResult{}, err
		}
	} else if kind == "short" {
		payload, marshalErr := json.Marshal(map[string]any{
			"text": fmt.Sprintf("%s concluiu um descanso curto sem gastar Dados de Vida.", sheet.Name),
		})
		if marshalErr != nil {
			return RestResult{}, marshalErr
		}
		if err = tx.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'system.info',$3) returning id`, campaignID, userID, payload).Scan(&result.EventID); err != nil {
			return RestResult{}, err
		}
	}
	portrait := sheet.TokenPortraitPath
	if strings.TrimSpace(portrait) == "" {
		portrait = sheet.PortraitPath
	}
	if _, err = tx.Exec(ctx, `update scene_tokens set name=$1,hp_current=$2,hp_max=$3,armor_class=$4,initiative_bonus=$5,image_url=nullif($6,''),updated_at=now() where actor_id=$7`, sheet.Name, sheet.HitPointsCurrent, sheet.HitPointsMax, sheet.ArmorClass, sheet.Initiative, portrait, storedID); err != nil {
		return RestResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return RestResult{}, err
	}
	return result, nil
}

func validatePersistedRestState(sheet Sheet) error {
	// A corrupt stored HP/Hit-Dice value is a conflict (HTTP 409); a rest never
	// repairs it by clamping HP downward or consuming more dice.
	if sheet.HitPointsMax < 1 || sheet.HitPointsCurrent < 0 || sheet.HitPointsCurrent > sheet.HitPointsMax ||
		sheet.Level < 1 || sheet.Level > 20 || sheet.HitDiceSpent < 0 || sheet.HitDiceSpent > sheet.Level {
		return ErrInvalidRestState
	}
	return nil
}

func resolveShortRestHitDice(level, spent int, requested *int) (int, int, error) {
	if level < 1 || level > 20 || spent < 0 || spent > level {
		return 0, 0, ErrInvalidRestState
	}
	available := level - spent
	if requested == nil {
		if available > 0 {
			return 1, available, nil
		}
		return 0, 0, nil
	}
	if *requested < 0 || *requested > available {
		return 0, available, ErrInvalidHitDiceCount
	}
	return *requested, available, nil
}

func rollHitDie(sides int) (int, error) {
	roll, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
	if err != nil {
		return 0, err
	}
	return int(roll.Int64()) + 1, nil
}

func rollShortRestHitDice(count, sides, modifier int, roll func(int) (int, error)) ([]int, int, error) {
	if count < 0 || sides < 2 || sides > 100 || roll == nil {
		return nil, 0, ErrInvalidRest
	}
	dice := make([]int, 0, count)
	healing := 0
	for range count {
		result, err := roll(sides)
		if err != nil {
			return nil, 0, err
		}
		if result < 1 || result > sides {
			return nil, 0, ErrInvalidRest
		}
		dice = append(dice, result)
		healing += max(1, result+modifier)
	}
	return dice, healing, nil
}

func recoverResources(resources []Resource, kind string) []Resource {
	for i := range resources {
		resource := &resources[i]
		switch {
		case kind == "long", resource.RestoreOn == "short":
			resource.Current = resource.Max
		case kind == "short" && resource.ShortRestRecovery > 0:
			resource.Current = min(resource.Max, resource.Current+resource.ShortRestRecovery)
		}
	}
	return resources
}

func applyRestRecovery(sheet Sheet, kind string, hitPointHealing int, rules systems.Dnd2024CharacterRules) Sheet {
	if kind == "short" {
		sheet.HitPointsCurrent = min(sheet.HitPointsMax, sheet.HitPointsCurrent+hitPointHealing)
	}
	sheet.Resources = recoverResources(sheet.Resources, kind)
	for i := range sheet.SpellSlots {
		if kind == "long" || (kind == "short" && canonicalClass(sheet.Class) == "warlock") {
			sheet.SpellSlots[i].Current = sheet.SpellSlots[i].Max
		}
	}
	if kind == "long" {
		sheet.HitPointsCurrent = sheet.HitPointsMax
		sheet.TemporaryHP = 0
		sheet.HitDiceSpent = 0
	}
	return normalizeDerivedFields(sheet, rules)
}

func recoverFeatSpellGrantUses(grants []FeatSpellGrant, kind string) ([]FeatSpellGrant, error) {
	for i := range grants {
		if !grants[i].Active {
			continue
		}
		if rule, ok := dnd2024FeatSpellRules[grants[i].FeatID]; ok {
			maximum, recovery, err := validateSavedSpellUseConfig(rule.FreeCasts, rule.Recovery, grants[i].FreeCastsMaxOverride, grants[i].FreeCastsRecovery)
			if err != nil || grants[i].FreeCastsRemaining < 0 || grants[i].FreeCastsRemaining > maximum {
				return nil, ErrInvalidSpellGrantState
			}
			if recovery == kind || (kind == "long" && recovery == "short") {
				grants[i].FreeCastsRemaining = maximum
			}
		}
	}
	return grants, nil
}

func recoverSpeciesSpellGrantUses(grants []SpeciesSpellGrant, kind string) ([]SpeciesSpellGrant, error) {
	for i := range grants {
		grant := &grants[i]
		maximum, recovery, err := validateSavedSpellUseConfig(grant.DefaultFreeCasts, "long", grant.FreeCastsMaxOverride, grant.FreeCastsRecovery)
		if err != nil || grant.FreeCastsMax != maximum || grant.FreeCastsRemaining < 0 || grant.FreeCastsRemaining > maximum {
			return nil, ErrInvalidSpellGrantState
		}
		if grant.Active && (recovery == kind || (kind == "long" && recovery == "short")) {
			grant.FreeCastsRemaining = maximum
		}
	}
	return grants, nil
}
