# SRD 5.2.1 spell mechanics audit

## Scope and source

This audit covers the 338 `entryType: spell` records in `backend/internal/compendium/packs/srd_5_2_1.json`. The reference is the official [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), with the official [D&D Beyond 2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions) as a searchable companion. Rules text and structured values must be checked against those sources; existing package values are not evidence of completeness.

## Current coverage

| Package field | Current coverage |
| --- | ---: |
| Spell records | 338 |
| Level 0 and 1 records audited in this batch | 85 (28 level 0 package records, 57 level 1) |
| Audited records with structured `rules.damage.components` | 31 |
| Audited records with character-level progression | 16 |
| Audited records with spell-slot effects | 29 |
| Audited records where damage does not apply | 54 |
| Audited records where scaling does not apply | 40 |
| Level 0 and 1 records still unaudited | 0 |
| Level 2–9 records still unaudited | 253 |

Level distribution: 28 cantrips, 57 first-level, 56 second-level, 42 third-level, 34 fourth-level, 38 fifth-level, 31 sixth-level, 20 seventh-level, 16 eighth-level, and 16 ninth-level spells.

The 85 audited records now explicitly distinguish non-applicable values from pending audit: `rules.mechanicsAudit` records reviewed source and status; `rules.damage` is either `null` or a typed list of damage components; `rules.scaling` is either `null` or has distinct `characterLevel` and `spellSlot` branches. The 31 damage records include multi-component damage, variable types, repeated instances, triggers, and Sorcerous Burst's capped exploding d8. Counts are per package record, so the case-variant duplicate Acid Splash is included in level 0 totals.

## Interface paths

- `CompendiumEntry.rules` is currently `Record<string, unknown>` in `frontend/src/lib/services/compendiumApi.ts`. `CompendiumEntryDetails.svelte` shows a spell's level, classes, school, and range, but no structured damage or scaling data.
- `projectCharacterSpells` in `frontend/src/lib/utils/character/characterSpellRules.ts` still supports older records by copying legacy `rules.damage.dice` and `rules.higherLevels` / `rules.atHigherLevels` into character sheet fields. The level 0/1 mechanics display reads the catalog's audited `rules` directly and does not copy mechanics into saved character data.
- `CharacterSpellsTab.svelte` exposes `diceFormula` and a manually configurable `scalingDicePerLevel` for custom spells. That numeric value models a simple per-slot damage increase only; it cannot represent cantrip progression by total character level or non-damage higher-slot effects.
- Spell descriptions are read through `translations["pt-BR.rules.description"]` (and the corresponding English `rules.description`). Mechanical presentation should use typed `rules` data, not prose parsing or translated values.

## Data model and presentation implemented for levels 0–1

For the reviewed records, `rules.damage.components` stores formula, canonical damage-type code, optional damage trigger, alternatives, instance count, and nested/conditional components. `rules.scaling.characterLevel` stores explicit character-level milestones and typed changes. `rules.scaling.spellSlot` stores its base slot level and typed effects with explicit thresholds and increments. An explicit `rules.damage: null` or `rules.scaling: null`, together with the audit status, means the feature was checked and does not apply. Older records without an audit marker remain pending and backward compatible. The TypeScript presentation types and `presentSpellMechanics` formatter localize only labels and map canonical codes for display; they do not calculate rolls or modify casting.

The same presentation appears in `CompendiumEntryDetails.svelte` and the character spell tab. It shows base damage/type, character-level changes, and slot-level effects in separate rows, including the explicit “Não se aplica” state. Fields for levels 2–9 have not been changed and continue to show no new audited mechanics.

## Completion criteria

For this batch, tests assert 85 reviewed entries, 31 damage records and exact formulas/types, every cantrip milestone, all 29 spell-slot scaling entries and effects, and explicit not-applicable values. Frontend tests exercise PT-BR presentation and confirm both views use it. The remaining 253 records (levels 2–9) still require the same source-by-source review before the whole SRD audit can be called complete.

## Editorial notes for this batch

- The source is the official [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), spell descriptions section, with checks against the official searchable [2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions). Cantrip entries use the character's total level, with milestones at 5, 11, and 17 where specified. Spell-slot effects retain their base slot and threshold separately.
- Fifteen cantrip records whose Portuguese summary had been used as a synopsis now have full `pt-BR.rules.description` translations: the case-variant Acid Splash record, Chill Touch, Dancing Lights, Druidcraft, Mending, Message, Minor Illusion, Poison Spray, Produce Flame, Ray of Frost, Resistance, Shillelagh, Shocking Grasp, Spare the Dying, and True Strike. The other 13 cantrip descriptions and all 57 first-level descriptions were retained.
- The package's `Acid SplASh` casing variant is preserved as source data; it receives the same reviewed mechanics and translation as Acid Splash. No IDs, English descriptions, summaries, or other level/category source fields were edited.
- Canonical damage type codes remain English identifiers in the data. Presentation uses PT-BR labels, including “energia” for force damage, “elétrico” for lightning, and “trovejante” for thunder. Damage formulas remain strings from the SRD; no roll/casting behavior was added.
- The pack revision advances from `cartridge-import-2` to `cartridge-import-3` so a future controlled synchronization can detect the updated package. No synchronization was run in this task.

## Audit status

The level 0 and 1 batch is implemented and source-checked. The remaining 253 spells are still pending; do not treat missing mechanics markers for those levels as a verified “not applicable” result. No database was accessed, and no migration or synchronization was run.
