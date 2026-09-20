package systems

import "fmt"

type ID string

const (
	Dnd2024 ID = "dnd2024"
	Dnd35   ID = "dnd35" // Reserved for a future adapter; not enabled yet.
)

type Adapter interface {
	ID() ID
	DisplayName() string
}

type Dnd2024Adapter struct{}

func (Dnd2024Adapter) ID() ID              { return Dnd2024 }
func (Dnd2024Adapter) DisplayName() string { return "D&D 2024" }

var adapters = map[ID]Adapter{
	Dnd2024: Dnd2024Adapter{},
}

func Parse(value string) (ID, error) {
	id := ID(value)
	if _, ok := adapters[id]; !ok {
		return "", fmt.Errorf("unsupported game system: %s", value)
	}
	return id, nil
}

func Default() ID { return Dnd2024 }

func Resolve(id ID) (Adapter, bool) {
	adapter, ok := adapters[id]
	return adapter, ok
}

func All() []Adapter {
	return []Adapter{adapters[Dnd2024]}
}
