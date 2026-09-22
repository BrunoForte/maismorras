package systems

import "fmt"

type ID string

const (
	Dnd2024 ID = "dnd2024"
	Dnd35   ID = "dnd35"
)

type Adapter interface {
	ID() ID
	DisplayName() string
	CharacterRules() CharacterRules
	ProgressionRules() ProgressionRules
	RollRules() RollRules
	CompendiumRules() CompendiumRules
	CombatRules() CombatRules
	ResourceRules() ResourceRules
	Capabilities() Capabilities
}
type CharacterRules interface{}
type ProgressionRules interface{}
type RollRules interface{}
type CompendiumRules interface{}
type CombatRules interface{}
type ResourceRules interface{}
type Capabilities struct {
	CharacterSheet bool `json:"characterSheet"`
	Compendium     bool `json:"compendium"`
	Combat         bool `json:"combat"`
	Spells         bool `json:"spells"`
}

type Dnd2024Adapter struct{}

func (Dnd2024Adapter) ID() ID                             { return Dnd2024 }
func (Dnd2024Adapter) DisplayName() string                { return "D&D 2024" }
func (Dnd2024Adapter) CharacterRules() CharacterRules     { return struct{}{} }
func (Dnd2024Adapter) ProgressionRules() ProgressionRules { return struct{}{} }
func (Dnd2024Adapter) RollRules() RollRules               { return struct{}{} }
func (Dnd2024Adapter) CompendiumRules() CompendiumRules   { return struct{}{} }
func (Dnd2024Adapter) CombatRules() CombatRules           { return struct{}{} }
func (Dnd2024Adapter) ResourceRules() ResourceRules       { return struct{}{} }
func (Dnd2024Adapter) Capabilities() Capabilities {
	return Capabilities{CharacterSheet: true, Compendium: true, Combat: true, Spells: true}
}

var adapters = map[ID]Adapter{Dnd2024: Dnd2024Adapter{}}

func Parse(value string) (ID, error) {
	id := ID(value)
	if _, ok := adapters[id]; !ok {
		return "", fmt.Errorf("unsupported game system: %s", value)
	}
	return id, nil
}
func Default() ID                   { return Dnd2024 }
func Resolve(id ID) (Adapter, bool) { adapter, ok := adapters[id]; return adapter, ok }
func All() []Adapter                { return []Adapter{adapters[Dnd2024]} }

