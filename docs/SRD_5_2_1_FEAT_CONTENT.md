# SRD 5.2.1 feat record corrections

This note records the source-to-record decisions for the feat index correction.
The wording below was checked against the official SRD 5.2.1 and D&D Basic
Rules 2024 feat entries. It is a text and catalog identity check, not an
independent validation of the game's mechanics.

Official references:

- Basic Rules 2024, Feats: <https://www.dndbeyond.com/sources/dnd/br-2024/feats>
- SRD 5.2.1, Feats, pp. 86–87: <https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf>

| SRD name | Official identity | Package record decision |
| --- | --- | --- |
| Grappler | General Feat; Level 4+, Strength or Dexterity 13+ prerequisite; four benefits. Source: Basic Rules 2024, “Grappler”; SRD 5.2.1, p. 86. | Add a full `feat:Grappler` record with source fields and reviewed PT-BR benefit text. “Agarrador (Grappler)” is a project editorial display name, not an official Portuguese translation. |
| Archery | Fighting Style Feat; prerequisite Fighting Style Feature. Source: Basic Rules 2024, “Archery”; SRD 5.2.1, p. 86. | Short index label resolves to the complete `Fighting Style: Archery` record. |
| Defense | Fighting Style Feat; prerequisite Fighting Style Feature. Source: Basic Rules 2024, “Defense”; SRD 5.2.1, p. 87. | Short index label resolves to the complete `Fighting Style: Defense` record. |
| Great Weapon Fighting | Fighting Style Feat; prerequisite Fighting Style Feature. Source: Basic Rules 2024, “Great Weapon Fighting”; SRD 5.2.1, p. 87. | Short index label resolves to the complete `Fighting Style: Great Weapon Fighting` record. |
| Two-Weapon Fighting | Fighting Style Feat; prerequisite Fighting Style Feature. Source: Basic Rules 2024, “Two-Weapon Fighting”; SRD 5.2.1, p. 87. | Short index label resolves to the complete `Fighting Style: Two-Weapon Fighting` record. Its PT-BR `rules.description` adds the official “if you aren’t already adding it” condition. This is a textual correction; no independent mechanical validation is claimed. |

The short-name index rows are not deleted from persisted campaign data. The
interface prefers the complete SRD records when both exist, while legacy feat
names saved on sheets are resolved to the corresponding complete record.
The embedded package revision advances from `cartridge-import-7` to
`cartridge-import-8` so the next normal catalog initialization can upsert the
corrected records. No catalog synchronization was run as part of this change.
