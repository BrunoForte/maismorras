export type SpellbookSpell = { entryId?: string; name: string };

export function unlockedSpellCircles(slots: { level: number; max: number }[]) {
	return [...new Set([0, ...slots.filter((slot) => slot.max > 0).map((slot) => slot.level)])].sort(
		(a, b) => a - b
	);
}

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
