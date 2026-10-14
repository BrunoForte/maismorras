package systems

import (
	"fmt"
)

// Dnd2024Adapter is one versioned module registered with the shared ruleset
// host. Keep D&D-specific schema and resource metadata in this file rather
// than growing the registry around one game's vocabulary.
type Dnd2024Adapter struct{}

func (Dnd2024Adapter) Definition() Definition {
	return Definition{
		Ref:          Ref{ID: Dnd2024, Version: Dnd2024V1},
		DisplayName:  "D&D 2024",
		Capabilities: Capabilities{CharacterSheet: true, Compendium: true, Combat: true, Spells: true},
		Sheet:        SheetDefinition{SchemaID: "dnd2024.character", Version: 1},
		Resources: []ResourceDefinition{
			{ID: "hit-points", LabelKey: "character.resource.hitPoints"},
			{ID: "hit-dice", LabelKey: "character.resource.hitDice", RecoveryRuleKey: "rest.long"},
			{ID: "spell-slots", LabelKey: "character.resource.spellSlots", RecoveryRuleKey: "rest.long"},
		},
		Dice:  DiceDefinition{Sides: []int{4, 6, 8, 10, 12, 20, 100}, Modes: []string{"normal", "advantage", "disadvantage"}},
		Rules: RuleEngineDefinition{ID: "dnd2024.core", Version: "1"},
	}
}

// Dnd2024Rules contains the currently-supported typed D&D 2024 roll rules.
type Dnd2024Rules struct{}

func (Dnd2024Rules) InitiativeBonus(dexterity int) int {
	return (Dnd2024Rules{}).AbilityModifier(dexterity)
}

// Dnd2024CombatTurnTransitionPolicy preserves the existing SetCombat turn
// boundaries: ending an active token ticks turn_end, entering one resets its
// movement and ticks turn_start, and an unchanged active token has no effects.
type Dnd2024CombatTurnTransitionPolicy struct{}

func (Dnd2024CombatTurnTransitionPolicy) PlanTurnTransition(previousTokenID, nextTokenID string) CombatTurnTransition {
	if previousTokenID == nextTokenID {
		return CombatTurnTransition{Kind: CombatTurnUnchanged}
	}

	transition := CombatTurnTransition{}
	switch {
	case previousTokenID == "":
		transition.Kind = CombatStarted
	case nextTokenID == "":
		transition.Kind = CombatEnded
	default:
		transition.Kind = CombatTurnAdvanced
	}

	transition.EndPreviousTurn = previousTokenID != ""
	transition.StartNextTurn = nextTokenID != ""
	transition.ResetNextMovement = transition.StartNextTurn
	return transition
}

func (Dnd2024Rules) AbilityModifier(score int) int {
	if score >= 10 {
		return (score - 10) / 2
	}
	return -((11 - score) / 2)
}

func (Dnd2024Rules) ProficiencyBonus(level int) int {
	if level < 1 {
		level = 1
	}
	return 2 + (level-1)/4
}

func (Dnd2024Rules) RollD20(mode D20Mode, modifier int, roll DiceRoller) (D20Result, error) {
	if mode != RollNormal && mode != RollAdvantage && mode != RollDisadvantage {
		return D20Result{}, fmt.Errorf("invalid d20 mode: %s", mode)
	}
	if roll == nil {
		return D20Result{}, fmt.Errorf("d20 roller is required")
	}
	count := 1
	if mode != RollNormal {
		count = 2
	}
	result := D20Result{Rolls: make([]int, 0, count), Mode: mode}
	for range count {
		value, err := roll(20)
		if err != nil {
			return D20Result{}, err
		}
		if value < 1 || value > 20 {
			return D20Result{}, fmt.Errorf("d20 roller returned an out-of-range result")
		}
		result.Rolls = append(result.Rolls, value)
	}
	result.Kept = result.Rolls[0]
	for _, value := range result.Rolls[1:] {
		if (mode == RollAdvantage && value > result.Kept) || (mode == RollDisadvantage && value < result.Kept) {
			result.Kept = value
		}
	}
	result.Total = result.Kept + modifier
	return result, nil
}

var _ Dnd2024CharacterRules = Dnd2024Rules{}
var _ CombatTurnTransitionPolicy = Dnd2024CombatTurnTransitionPolicy{}
