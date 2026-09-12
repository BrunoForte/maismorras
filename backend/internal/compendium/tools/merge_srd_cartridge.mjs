import fs from 'node:fs';
import path from 'node:path';

const [root, packPath] = process.argv.slice(2);
if (!root || !packPath) throw new Error('usage: node merge_srd_cartridge.mjs CARTRIDGE_DIR PACK_JSON');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const merged = new Map();
const add = (kind, item, rules = item) => {
  const name = String(item.name ?? '').trim();
  if (!name) return;
  merged.set(`${kind}\0${name}`, {
    entryType: kind,
    name,
    summary: String(item.description ?? 'Entrada estruturada do System Reference Document 5.2.1.'),
    translations: { 'pt-BR': name },
    rules: { source: 'D&D SRD 5.2.1', ...rules }
  });
};
const old = JSON.parse(fs.readFileSync(packPath, 'utf8'));
for (const entry of old.entries ?? []) merged.set(`${entry.entryType}\0${entry.name}`, entry);
for (const [kind, file, key] of [
  ['class', 'classes/classes.json', 'classes'], ['subclass', 'classes/subclasses.json', 'subclasses'],
  ['background', 'backgrounds/backgrounds.json', 'backgrounds'], ['feat', 'feats/feats.json', 'feats'],
  ['species', 'races/races.json', 'races'], ['spell', 'spells/spells.json', 'spells']
]) for (const item of (read(file)[key] ?? [])) add(kind, item);
const equipment = read('equipment/equipment.json');
for (const key of ['weapons', 'armor', 'adventuringGear', 'equipmentPacks', 'magicItems'])
  for (const item of equipment[key] ?? []) add('item', item, { catalog: key, ...item });
for (const [kind, file, key] of [['feature', 'rules/skills.json', 'skills'], ['other', 'rules/conditions.json', 'conditions']])
  for (const item of (read(file)[key] ?? [])) add(kind, item, { catalog: key, ...item });
old.version = '5.2.1';
old.revision = 'cartridge-import-1';
old.attribution = 'D&D System Reference Document 5.2.1 © Wizards of the Coast LLC, CC-BY-4.0. Structured cartridge: NatOneApp/sdr-5.2.1.';
old.entries = [...merged.values()].sort((a, b) => a.entryType.localeCompare(b.entryType) || a.name.localeCompare(b.name));
fs.writeFileSync(packPath, JSON.stringify(old, null, 2) + '\n');
console.log(`merged ${old.entries.length} entries`);
