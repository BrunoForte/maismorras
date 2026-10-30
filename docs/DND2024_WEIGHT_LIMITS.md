# D&D 2024 carrying and hauling limits

The Equipment tab displays carried weight against carrying capacity and the
separate maximum for pushing, dragging, or lifting. All values are shown in
pounds and calculated from Strength and effective creature size.

| Size            |             Carry | Push, drag, or lift |
| --------------- | ----------------: | ------------------: |
| Tiny            | Strength × 7.5 lb |    Strength × 15 lb |
| Small or Medium |  Strength × 15 lb |    Strength × 30 lb |
| Large           |  Strength × 30 lb |    Strength × 60 lb |
| Huge            |  Strength × 60 lb |   Strength × 120 lb |
| Gargantuan      | Strength × 120 lb |   Strength × 240 lb |

Large Form changes the character's actual size to Large while its existing
temporary toggle is active. Its expiration is represented by turning that
toggle off; the calculation then returns to the recorded size. Powerful Build
is applied once to carrying capacity only: for that calculation, the character
counts as one size larger. The push/drag/lift limit continues to use actual
size, including Large Form. The numeric values can coincide because the
push/drag/lift multiplier for one actual size equals the carry multiplier for
the next size.

When a creature pushes, drags, or lifts more than its carrying capacity, its
Speed cannot exceed 5 feet. The interface displays this rule as guidance and
does not change Speed or apply a movement penalty automatically.

## SRD feature audit

The project's loaded `backend/internal/compendium/packs/srd_5_2_1.json` was
searched across species, class, subclass, and feat rules for carrying-capacity,
weight, pushing, dragging, and lifting modifiers. The only matching character
feature is the Goliath's Powerful Build; Large Form is also present and changes
actual size. No class, subclass, or feat in the loaded SRD provides another
explicit modifier to these limits. No effect is inferred from names or
ambiguous descriptions.

The loaded Goliath entry's Powerful Build text differs from the current 2024
species wording for its Grappled benefit, but its carrying-capacity clause is
present. This change uses the official 2024 rule: Powerful Build counts as one
size larger **when determining carrying capacity**, and does not modify the
push/drag/lift limit.

## Sources

- [D&D 2024 Rules Glossary — Carrying Capacity](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary)
- [D&D Beyond — Goliath species](https://www.dndbeyond.com/species/1751439-goliath)
- [SRD 5.2.1 project cartridge](../backend/internal/compendium/packs/srd_5_2_1.json)
