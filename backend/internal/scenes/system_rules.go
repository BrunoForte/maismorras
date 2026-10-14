package scenes

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"vtt-backend/internal/systems"
)

var ErrUnsupportedCampaignSystem = errors.New("scene campaign ruleset is not supported")

type campaignReferenceQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// dnd2024RulesForScene reads the immutable ruleset reference associated with
// the scene's campaign. Callers must authorize the user before resolving it.
func dnd2024RulesForScene(ctx context.Context, sceneID string, queryer campaignReferenceQueryer) (systems.Dnd2024CharacterRules, error) {
	var systemID, systemVersion string
	if err := queryer.QueryRow(ctx, `select c.system_id,c.system_version from scenes s join campaigns c on c.id=s.campaign_id where s.id=$1`, sceneID).Scan(&systemID, &systemVersion); err != nil {
		return nil, fmt.Errorf("load scene campaign system reference: %w", err)
	}
	return resolveDnd2024Rules(systems.Ref{ID: systems.ID(systemID), Version: systems.Version(systemVersion)})
}

func resolveDnd2024Rules(ref systems.Ref) (systems.Dnd2024CharacterRules, error) {
	rules, ok := systems.ResolveDnd2024CharacterRules(ref)
	if !ok {
		return nil, ErrUnsupportedCampaignSystem
	}
	return rules, nil
}

func combatTurnTransitionPolicyForScene(ctx context.Context, sceneID string, queryer campaignReferenceQueryer) (systems.CombatTurnTransitionPolicy, error) {
	var systemID, systemVersion string
	if err := queryer.QueryRow(ctx, `select c.system_id,c.system_version from scenes s join campaigns c on c.id=s.campaign_id where s.id=$1`, sceneID).Scan(&systemID, &systemVersion); err != nil {
		return nil, fmt.Errorf("load scene campaign system reference: %w", err)
	}
	return resolveCombatTurnTransitionPolicy(systems.Ref{ID: systems.ID(systemID), Version: systems.Version(systemVersion)})
}

func resolveCombatTurnTransitionPolicy(ref systems.Ref) (systems.CombatTurnTransitionPolicy, error) {
	policy, ok := systems.ResolveCombatTurnTransitionPolicy(ref)
	if !ok {
		return nil, ErrUnsupportedCampaignSystem
	}
	return policy, nil
}
