package systems

import "fmt"

type ID string

const (
	Dnd2024 ID = "dnd2024"
	Dnd35   ID = "dnd35"
)

type Definition struct {
	ID          ID
	DisplayName string
	Status      string
}

var definitions = map[ID]Definition{
	Dnd2024: {ID: Dnd2024, DisplayName: "D&D 2024", Status: "stable"},
	Dnd35:   {ID: Dnd35, DisplayName: "D&D 3.5", Status: "foundation"},
}

func Parse(value string) (ID, error) {
	id := ID(value)
	if _, ok := definitions[id]; !ok {
		return "", fmt.Errorf("unsupported game system: %s", value)
	}
	return id, nil
}

func Default() ID { return Dnd2024 }

func Get(id ID) (Definition, bool) {
	definition, ok := definitions[id]
	return definition, ok
}

func All() []Definition {
	return []Definition{definitions[Dnd2024], definitions[Dnd35]}
}
