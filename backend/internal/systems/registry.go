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

// Dnd2024CharacterRules is intentionally specific to the current D&D 2024
// sheet contract. Other systems are not required to implement six ability
// scores, proficiency bonus, or d20 rolls.
type Dnd2024CharacterRules interface {
	AbilityModifier(score int) int
	ProficiencyBonus(level int) int
	RollD20(mode D20Mode, modifier int, roll DiceRoller) (D20Result, error)
}

// CharacterTokenInitiativeRules calculates the persisted initiative bonus when
// a character sheet is first placed on a scene. It is deliberately narrower
// than the general character rules contract.
type CharacterTokenInitiativeRules interface {
	InitiativeBonus(dexterity int) int
}

// CombatTurnTransitionPolicy decides only the state changes caused by
// Repository.SetCombat. It does not own persistence, effect definitions, or
// event delivery.
type CombatTurnTransitionPolicy interface {
	PlanTurnTransition(previousTokenID, nextTokenID string) CombatTurnTransition
}

type CombatTurnTransitionKind uint8

const (
	CombatTurnUnchanged CombatTurnTransitionKind = iota
	CombatStarted
	CombatTurnAdvanced
	CombatEnded
)

// CombatTurnTransition is a typed plan for the side effects of one active
// token change. Empty token IDs represent an empty combat state.
type CombatTurnTransition struct {
	Kind              CombatTurnTransitionKind
	EndPreviousTurn   bool
	StartNextTurn     bool
	ResetNextMovement bool
}

type ID string
type Version string

// Ref pins a campaign to an immutable ruleset release. New ruleset revisions
// must be registered explicitly so existing campaigns never change behavior by
// silently inheriting the latest implementation.
type Ref struct {
	ID      ID      `json:"systemId"`
	Version Version `json:"systemVersion"`
}

const (
	Dnd2024   ID      = "dnd2024"
	Dnd2024V1 Version = "1.0.0"
)

// Definition contains the versioned, system-owned metadata consumed by the
// shared application shell. Schema IDs point to reviewed UI schemas; rule
// engines remain executable backend code and are never loaded from user PDFs.
type Definition struct {
	Ref          Ref                  `json:"ref"`
	DisplayName  string               `json:"displayName"`
	Capabilities Capabilities         `json:"capabilities"`
	Sheet        SheetDefinition      `json:"sheet"`
	Resources    []ResourceDefinition `json:"resources"`
	Dice         DiceDefinition       `json:"dice"`
	Rules        RuleEngineDefinition `json:"rules"`
}

type SheetDefinition struct {
	SchemaID string `json:"schemaId"`
	Version  int    `json:"version"`
}

type ResourceDefinition struct {
	ID              string `json:"id"`
	LabelKey        string `json:"labelKey"`
	RecoveryRuleKey string `json:"recoveryRuleKey,omitempty"`
}

type DiceDefinition struct {
	Sides        []int    `json:"sides"`
	SuccessFaces []int    `json:"successFaces,omitempty"`
	Modes        []string `json:"modes"`
}

type RuleEngineDefinition struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

type Adapter interface {
	Definition() Definition
}

type Capabilities struct {
	CharacterSheet bool `json:"characterSheet"`
	Compendium     bool `json:"compendium"`
	Combat         bool `json:"combat"`
	Spells         bool `json:"spells"`
}

var adapters = map[Ref]Adapter{
	{ID: Dnd2024, Version: Dnd2024V1}: Dnd2024Adapter{},
}

var dnd2024CharacterRules = map[Ref]Dnd2024CharacterRules{
	{ID: Dnd2024, Version: Dnd2024V1}: Dnd2024Rules{},
}

var characterTokenInitiativeRules = map[Ref]CharacterTokenInitiativeRules{
	{ID: Dnd2024, Version: Dnd2024V1}: Dnd2024Rules{},
}

var combatTurnTransitionPolicies = map[Ref]CombatTurnTransitionPolicy{
	{ID: Dnd2024, Version: Dnd2024V1}: Dnd2024CombatTurnTransitionPolicy{},
}

var currentVersions = map[ID]Version{Dnd2024: Dnd2024V1}

func Parse(value string) (ID, error) {
	id := ID(value)
	if _, ok := currentVersions[id]; !ok {
		return "", fmt.Errorf("unsupported game system: %s", value)
	}
	return id, nil
}

func ParseRef(idValue, versionValue string) (Ref, error) {
	id, err := Parse(idValue)
	if err != nil {
		return Ref{}, err
	}
	version := Version(versionValue)
	if version == "" {
		version = currentVersions[id]
	}
	ref := Ref{ID: id, Version: version}
	if _, ok := adapters[ref]; !ok {
		return Ref{}, fmt.Errorf("unsupported game system version: %s@%s", id, version)
	}
	return ref, nil
}

func Default() ID     { return Dnd2024 }
func DefaultRef() Ref { return Ref{ID: Dnd2024, Version: Dnd2024V1} }

func ResolveRef(ref Ref) (Adapter, bool) {
	adapter, ok := adapters[ref]
	return adapter, ok
}

// ResolveDnd2024CharacterRules resolves only the currently supported D&D 2024
// sheet rules; it does not expose a generic operation dispatcher.
func ResolveDnd2024CharacterRules(ref Ref) (Dnd2024CharacterRules, bool) {
	rules, ok := dnd2024CharacterRules[ref]
	return rules, ok
}

// ResolveCharacterTokenInitiativeRules resolves the rules for seeding a
// character token's persisted initiative bonus from its campaign reference.
func ResolveCharacterTokenInitiativeRules(ref Ref) (CharacterTokenInitiativeRules, bool) {
	rules, ok := characterTokenInitiativeRules[ref]
	return rules, ok
}

// ResolveCombatTurnTransitionPolicy resolves the policy registered for the
// campaign's immutable system reference. Unsupported references never fall
// back to the current system.
func ResolveCombatTurnTransitionPolicy(ref Ref) (CombatTurnTransitionPolicy, bool) {
	policy, ok := combatTurnTransitionPolicies[ref]
	return policy, ok
}

// Resolve remains as a compatibility helper for call sites that still use the
// active version. Campaign-aware code should resolve its persisted Ref instead.
func Resolve(id ID) (Adapter, bool) {
	version, ok := currentVersions[id]
	if !ok {
		return nil, false
	}
	return ResolveRef(Ref{ID: id, Version: version})
}

func All() []Adapter { return []Adapter{adapters[DefaultRef()]} }

// DefaultCharacterRules is a compatibility boundary for legacy call sites
// that do not yet carry their campaign reference. New campaign-aware flows
// should resolve rules with ResolveDnd2024CharacterRules(campaignRef).
func DefaultCharacterRules() Dnd2024CharacterRules {
	rules, _ := ResolveDnd2024CharacterRules(DefaultRef())
	return rules
}
