# SRD 5.2.1 spell mechanics audit

## Scope and source

This audit covers the 338 `entryType: spell` records in `backend/internal/compendium/packs/srd_5_2_1.json`. The reference is the official [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), with the official [D&D Beyond 2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions) as a searchable companion. Rules text and structured values must be checked against those sources; existing package values are not evidence of completeness.

## Current coverage

| Package field                                             |                                                                         Current coverage |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------: |
| Spell records                                             |                                                                                      338 |
| Level 0–6 records audited                                 | 286 (28 level 0, 57 level 1, 56 level 2, 42 level 3, 34 level 4, 38 level 5, 31 level 6) |
| Audited records with structured `rules.damage.components` |                                                                                       94 |
| Audited records with character-level progression          |                                                                                       16 |
| Audited records with spell-slot effects                   |                                                                                      105 |
| Audited records where damage does not apply               |                                                                                      192 |
| Audited records where scaling does not apply              |                                                                                      165 |
| Level 0–6 records still unaudited                         |                                                                                        0 |
| Level 7–9 records still unaudited                         |                                                                                       52 |

Level distribution: 28 cantrips, 57 first-level, 56 second-level, 42 third-level, 34 fourth-level, 38 fifth-level, 31 sixth-level, 20 seventh-level, 16 eighth-level, and 16 ninth-level spells.

The 286 audited records explicitly distinguish non-applicable values from pending audit: `rules.mechanicsAudit` records reviewed source and status; `rules.damage` is either `null` or a typed list of damage components; `rules.scaling` is either `null` or has distinct `characterLevel` and `spellSlot` branches. The damage records include multi-component damage, variable types, repeated instances, triggers, and Sorcerous Burst's capped exploding d8. Counts are per package record, so case-variant duplicate records are included.

## Interface paths

- `CompendiumEntry.rules` is currently `Record<string, unknown>` in `frontend/src/lib/services/compendiumApi.ts`. `CompendiumEntryDetails.svelte` shows a spell's level, classes, school, and range, but no structured damage or scaling data.
- `projectCharacterSpells` in `frontend/src/lib/utils/character/characterSpellRules.ts` still supports older records by copying legacy `rules.damage.dice` and `rules.higherLevels` / `rules.atHigherLevels` into character sheet fields. The level 0/1 mechanics display reads the catalog's audited `rules` directly and does not copy mechanics into saved character data.
- `CharacterSpellsTab.svelte` exposes `diceFormula` and a manually configurable `scalingDicePerLevel` for custom spells. That numeric value models a simple per-slot damage increase only; it cannot represent cantrip progression by total character level or non-damage higher-slot effects.
- Spell descriptions are read through `translations["pt-BR.rules.description"]` (and the corresponding English `rules.description`). Mechanical presentation should use typed `rules` data, not prose parsing or translated values.

## Data model and presentation implemented for levels 0–1

For the reviewed records, `rules.damage.components` stores formula, canonical damage-type code, optional damage trigger, alternatives, instance count, and nested/conditional components. `rules.scaling.characterLevel` stores explicit character-level milestones and typed changes. `rules.scaling.spellSlot` stores its base slot level and typed effects with explicit thresholds and increments. An explicit `rules.damage: null` or `rules.scaling: null`, together with the audit status, means the feature was checked and does not apply. Older records without an audit marker remain pending and backward compatible. The TypeScript presentation types and `presentSpellMechanics` formatter localize only labels and map canonical codes for display; they do not calculate rolls or modify casting.

The same presentation appears in `CompendiumEntryDetails.svelte` and the character spell tab. It shows base damage/type, character-level changes, and slot-level effects in separate rows, including the explicit “Não se aplica” state. Level 7–9 fields remain unaudited.

## Completion criteria

Tests assert coverage for the 286 reviewed entries, typed damage and scaling applicability, cantrip milestones, spell-slot effects and explicit not-applicable values. Frontend tests exercise PT-BR presentation and confirm both views use it. The remaining 52 spells (levels 7–9) still require source-by-source review before the whole SRD audit is complete.

## Editorial notes for this batch

- The source is the official [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), spell descriptions section, with checks against the official searchable [2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions). Cantrip entries use the character's total level, with milestones at 5, 11, and 17 where specified. Spell-slot effects retain their base slot and threshold separately.
- Fifteen cantrip records whose Portuguese summary had been used as a synopsis now have full `pt-BR.rules.description` translations: the case-variant Acid Splash record, Chill Touch, Dancing Lights, Druidcraft, Mending, Message, Minor Illusion, Poison Spray, Produce Flame, Ray of Frost, Resistance, Shillelagh, Shocking Grasp, Spare the Dying, and True Strike. The other 13 cantrip descriptions and all 57 first-level descriptions were retained.
- The package's `Acid SplASh` casing variant is preserved as source data; it receives the same reviewed mechanics and translation as Acid Splash. No IDs, English descriptions, summaries, or other level/category source fields were edited.
- Circles 2–6 were checked against the spell entries in the official SRD 5.2.1 PDF. Their PT-BR descriptions include the higher-slot paragraphs; 76 higher-slot effects keep their English source and Portuguese presentation text together in a typed `rule-text` effect. The UI displays those effects without calculating rolls or changing casting.
- Circles 2–6 have 63 records with typed damage components and 138 explicitly marked `damage: null`; 76 records have spell-slot scaling and 125 explicitly use `scaling: null`. No character-level progression applies to levels 2–6.
- Imperial distances in PT-BR prose were converted to metric units. Structured English range values remain canonical and use the existing `distanceText` presentation path. IDs, source names, and source descriptions were left unchanged.
- The owner selected these names: Alter Self → **Alterar-se**, Haste → **Acelerar**, Shining Smite → **Golpe Resplandecente**, Call Lightning → **Invocar Relâmpagos**, Counterspell → **Contramágica**, Glyph of Warding → **Glifo de Proteção**, Find Steed → **Convocar Montaria**, Warding Bond → **Vínculo Guardião**, and Conjure Fey → **Conjurar Seres Feéricos**. Conjure Woodland Beings is titled **Conjurar Seres da Floresta** to distinguish the spells.
- The owner selected these additional forms: _Bestow Curse_ → **Rogar Maldição**, _Geas_ → **Geas**, _Harm_ → **Ferir**, _Hallow_ → **Consagrar**, _Flame Strike_ → **Golpe Flamejante**, _Otherworldly Slam_ → **Impacto Sobrenatural**, _Fell Glare_ → **Olhar Cruel**, and the _Animated Object_ action _Slam_ → **Impacto**.
- PDF text flow crossed the next spell boundary in Fireball, Animate Objects, and Find Steed. Those descriptions now stop at the end of the official spell text; their complete higher-slot clauses are retained.
- Canonical damage type codes remain English identifiers in the data. Presentation uses PT-BR labels, including “energia” for force damage, “elétrico” for lightning, and “trovejante” for thunder. Damage formulas remain strings from the SRD; no roll/casting behavior was added.
- The pack revision advances from `cartridge-import-3` to `cartridge-import-4` so a future controlled synchronization can detect these package updates. No synchronization was run in this task.

## Audit status

Levels 0–6 are implemented and source-checked. The remaining 52 spells at levels 7–9 are pending; missing mechanics markers for those levels do not mean “not applicable.” No database was accessed, and no migration or synchronization was run.
