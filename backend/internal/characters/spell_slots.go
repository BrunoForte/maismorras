package characters

// dnd2024SpellSlots mirrors the D&D 2024 full-/half-caster progression used by
// the character sheet. Current uses are preserved server-side; submitted max
// and current values are never accepted as authority during a sheet save.
func dnd2024SpellSlots(className string, level int, previous []SpellSlot) []SpellSlot {
	class := canonicalClass(className)
	full := map[string]bool{"bard": true, "cleric": true, "druid": true, "sorcerer": true, "wizard": true}[class]
	half := class == "paladin" || class == "ranger"
	casterLevel := 0
	if full {
		casterLevel = level
	} else if half {
		casterLevel = (level + 1) / 2
	}
	progression := [][]int{
		{2}, {3}, {4, 2}, {4, 3}, {4, 3, 2}, {4, 3, 3}, {4, 3, 3, 1}, {4, 3, 3, 2},
		{4, 3, 3, 3, 1}, {4, 3, 3, 3, 2}, {4, 3, 3, 3, 2, 1}, {4, 3, 3, 3, 2, 1},
		{4, 3, 3, 3, 2, 1, 1}, {4, 3, 3, 3, 2, 1, 1}, {4, 3, 3, 3, 2, 1, 1, 1},
		{4, 3, 3, 3, 2, 1, 1, 1}, {4, 3, 3, 3, 2, 1, 1, 1, 1},
		{4, 3, 3, 3, 3, 1, 1, 1, 1}, {4, 3, 3, 3, 3, 2, 1, 1, 1}, {4, 3, 3, 3, 3, 2, 2, 1, 1},
	}
	var maxima []int
	if casterLevel >= 1 && casterLevel <= len(progression) {
		maxima = progression[casterLevel-1]
	}
	previousCurrent := map[int]int{}
	for _, slot := range previous {
		previousCurrent[slot.Level] = slot.Current
	}
	result := make([]SpellSlot, 0, len(maxima))
	for index, maximum := range maxima {
		current, existed := previousCurrent[index+1]
		if !existed {
			current = maximum
		}
		result = append(result, SpellSlot{Level: index + 1, Current: min(maximum, max(0, current)), Max: maximum})
	}
	return result
}
