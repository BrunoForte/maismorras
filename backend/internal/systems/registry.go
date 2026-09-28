package systems

import "fmt"

type D20Mode string

const (
	RollNormal       D20Mode = "normal"
	RollAdvantage    D20Mode = "advantage"
	RollDisadvantage D20Mode = "disadvantage"
)

type D20Result struct {
	Rolls []int
	Kept  int
	Total int
	Mode  D20Mode
}

// DiceRoller is supplied by the application so each ruleset can share the
// authoritative secure RNG without owning persistence or transport concerns.
type DiceRoller func(sides int) (int, error)

// CharacterRules contains the rules that affect authoritative sheet rolls.
// New game systems implement this contract instead of leaking system-specific
// formulas into HTTP handlers or persistence code.
type CharacterRules interface {
	AbilityModifier(score int) int
	ProficiencyBonus(level int) int
	RollD20(mode D20Mode, modifier int, roll DiceRoller) (D20Result, error)
}

type ID string

const (
	Dnd2024 ID = "dnd2024"
)

type Adapter interface {
	ID() ID
	DisplayName() string
	Capabilities() Capabilities
	CharacterRules() CharacterRules
}

type Capabilities struct {
	CharacterSheet bool `json:"characterSheet"`
	Compendium     bool `json:"compendium"`
	Combat         bool `json:"combat"`
	Spells         bool `json:"spells"`
}

type Dnd2024Adapter struct{}

func (Dnd2024Adapter) ID() ID              { return Dnd2024 }
func (Dnd2024Adapter) DisplayName() string { return "D&D 2024" }
func (Dnd2024Adapter) Capabilities() Capabilities {
	return Capabilities{CharacterSheet: true, Compendium: true, Combat: true, Spells: true}
}
func (Dnd2024Adapter) CharacterRules() CharacterRules { return Dnd2024Rules{} }

type Dnd2024Rules struct{}

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

var adapters = map[ID]Adapter{Dnd2024: Dnd2024Adapter{}}

func Parse(value string) (ID, error) {
	id := ID(value)
	if _, ok := adapters[id]; !ok {
		return "", fmt.Errorf("unsupported game system: %s", value)
	}
	return id, nil
}
func Default() ID                           { return Dnd2024 }
func Resolve(id ID) (Adapter, bool)         { adapter, ok := adapters[id]; return adapter, ok }
func All() []Adapter                        { return []Adapter{adapters[Dnd2024]} }
func DefaultCharacterRules() CharacterRules { return adapters[Dnd2024].CharacterRules() }
