# D&D 2024 feat-granted spell mappings

Feat-to-spell mappings are deliberately curated, not inferred from prose. The
current reviewed mapping is **Magic Initiate** from the project's SRD 5.2.1
compendium pack (`magic-initiate`): two cantrips and one 1st-level spell from
one of Bard, Cleric, Druid, Sorcerer, Warlock, or Wizard; choose Intelligence,
Wisdom, or Charisma; the chosen 1st-level spell can use existing compatible
slots and has one additional free cast restored by a long rest. The feat does
not add spell slots.

When reviewing or adding a mapping, update both curated catalogs:

- `frontend/src/lib/data/dnd2024FeatSpells.ts` controls the choice editor and
  spell-origin projection.
- `backend/internal/characters/feat_spell_rules.go` is authoritative for
  validating choices, use limits, free casting, and rest recovery.

Keep the catalogs aligned and add frontend/backend tests for choices, eligible
spell level/list, slot behavior, uses, recovery, and forged client counters.
Never derive an active mapping from a feat description, accept usage counts or
permissions from the client, or grant slots unless the reviewed feat expressly
does so. The compendium editor remains responsible only for maintaining the
feat's text and stable `rules.id`; the rule mechanics belong in the catalogs.

Money is stored separately on the D&D character sheet as integer `cp`, `sp`,
`ep`, `gp`, and `pp` fields. It is not an inventory item and does not add weight.
