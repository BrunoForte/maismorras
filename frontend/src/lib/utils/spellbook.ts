export type SpellbookSpell = { entryId?: string; name: string };

const normalizeSpellName = (name: string) =>
	name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase();

export function spellIsOnSheet(
	entryId: string,
	entryName: string,
	entryLabel: string,
	spells: SpellbookSpell[]
) {
	const names = new Set([entryName, entryLabel].map(normalizeSpellName));
	return spells.some(
		(spell) => spell.entryId === entryId || names.has(normalizeSpellName(spell.name))
	);
}
