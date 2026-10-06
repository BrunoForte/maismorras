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
	"vtt-backend/internal/systems"
)

var hitDieFormula = regexp.MustCompile(`^1d(\d+)$`)

type RestResult struct {
	EventID  int64  `json:"eventId,omitempty"`
	Sheet    Sheet  `json:"sheet"`
	Kind     string `json:"kind"`
	Dice     []int  `json:"dados,omitempty"`
	Modifier int    `json:"modificador,omitempty"`
	Total    int    `json:"total,omitempty"`
	Label    string `json:"label,omitempty"`
}

// RestCharacter applies recovery against the stored sheet under a row lock.
// Clients choose only the rest kind; they cannot submit recovery amounts.
func (r *Repository) RestCharacter(ctx context.Context, campaignID, userID, characterID, kind string) (RestResult, error) {
	if kind != "short" && kind != "long" {
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
	sheet = normalizeDerivedFields(sheet, rules)
	sheet.CampaignFeatSpellGrants, err = recoverCampaignFeatSpellGrantUses(ctx, tx, campaignID, kind, sheet.CampaignFeatSpellGrants)
	if err != nil {
		return RestResult{}, fmt.Errorf("recover campaign feat spell uses: %w", err)
	}
	result := RestResult{Sheet: sheet, Kind: kind}
	if kind == "short" {
		if sheet.HitDiceSpent >= sheet.Level {
			return RestResult{}, ErrNoHitDice
		}
		match := hitDieFormula.FindStringSubmatch(strings.TrimSpace(sheet.HitDice))
		if match == nil {
			return RestResult{}, ErrInvalidRest
		}
		sides, parseErr := strconv.Atoi(match[1])
		if parseErr != nil || sides < 2 || sides > 100 {
			return RestResult{}, ErrInvalidRest
		}
		roll, rollErr := rand.Int(rand.Reader, big.NewInt(int64(sides)))
		if rollErr != nil {
			return RestResult{}, rollErr
		}
		rolled := int(roll.Int64()) + 1
		modifier := abilityModifier(sheet.AbilityScores.Constitution, rules)
		sheet.HitDiceSpent++
		result.Dice = []int{rolled}
		result.Modifier = modifier
		result.Total = max(0, rolled+modifier)
		result.Label = "Dado de vida · " + sheet.Name
	}

	sheet = applyRestRecovery(sheet, kind, result.Total, rules)
	result.Sheet = sheet
	raw, err = json.Marshal(sheet)
	if err != nil {
		return RestResult{}, err
	}
	if _, err = tx.Exec(ctx, `update actors set sheet=$1,name=$2 where id=$3`, raw, sheet.Name, storedID); err != nil {
		return RestResult{}, err
	}
	if kind == "short" {
		payload, marshalErr := json.Marshal(map[string]any{
			"expressao": strings.TrimSpace(sheet.HitDice), "dados": result.Dice, "modo": "normal",
			"modificador": result.Modifier, "total": result.Total, "label": result.Label,
			"text":    fmt.Sprintf("%s · descanso curto · dado [%s] · Constituição %+d · recuperação %d PV", result.Label, joinDice(result.Dice), result.Modifier, result.Total),
			"channel": "combat", "hitDie": true,
		})
		if marshalErr != nil {
			return RestResult{}, marshalErr
		}
		if err = tx.QueryRow(ctx, `insert into game_events(campaign_id,actor_id,event_type,payload) values($1,$2,'dice.roll',$3) returning id`, campaignID, userID, payload).Scan(&result.EventID); err != nil {
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
		sheet.FeatSpellGrants = recoverFeatSpellGrantUses(sheet.FeatSpellGrants, kind)
	}
	return normalizeDerivedFields(sheet, rules)
}

func recoverFeatSpellGrantUses(grants []FeatSpellGrant, kind string) []FeatSpellGrant {
	if kind != "long" {
		return grants
	}
	for i := range grants {
		if rule, ok := dnd2024FeatSpellRules[grants[i].FeatID]; ok && rule.Recovery == kind {
			grants[i].FreeCastsRemaining = rule.FreeCasts
		}
	}
	return grants
}
