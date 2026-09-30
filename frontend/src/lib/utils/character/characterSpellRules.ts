import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { Spell, SpellSlot } from '$lib/services/characterApi';
import { canonicalClass } from '$lib/data/classProgression';
import { spellIsOnSheet, unlockedSpellCircles } from '$lib/utils/spellbook';

export type SpellOrigin = NonNullable<Spell['origin']>;
export type SpellCircleEntry = { spell: Spell; index: number };
export type SpellSourceText = { origin: Exclude<SpellOrigin, 'class'>; text: string };

export type SpellbookProjection = {
	addableCircles: () => number[];
	availableCircles: () => number[];
	slotForCircle: (circle: number) => SpellSlot | undefined;
	spellsForCircle: (circle: number) => SpellCircleEntry[];
	entriesForCircle: (circle?: number) => CompendiumEntry[];
	compatibleSlots: (spell: Spell) => SpellSlot[];
	selectedSlot: (spell: Spell, index: number) => number;
};

export type SpellPresentation = {
	optionLabel: (entry: CompendiumEntry) => string;
	circleLabel: (circle: number) => string;
	displayName: (spell: Spell) => string;
	description: (spell: Spell) => string;
	higherLevels: (spell: Spell) => string;
	hasAITranslation: (spell: Spell) => boolean;
};

export type SpellTabActions = {
	setNewSpellName: (value: string) => void;
	setNewSpellLevel: (value: number) => void;
	setExpandedSpell: (value: number | null) => void;
	chooseSlot: (index: number, value: number) => void;
	add: () => void;
	remove: (index: number) => void;
	change: (index: number, changes: Partial<Spell>) => void;
	present: (spell: Spell) => void;
	rollEffect: (spell: Spell) => void;
	cast: (spell: Spell, index: number) => void;
};

export function normalizeSpellName(value: string): string {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('pt-BR');
}

export function eligibleSpellEntries(
	entries: readonly CompendiumEntry[],
	spells: readonly Spell[],
	label: (entry: CompendiumEntry) => string,
	className: string,
	circle?: number
): CompendiumEntry[] {
	const classKey = canonicalClass(className);
	return entries.filter((entry) => {
		if (entry.entryType !== 'spell') return false;
		if (spellIsOnSheet(entry.id, entry.name, label(entry), [...spells])) return false;
		const level = Number(entry.rules.level ?? 0);
		if (!Number.isFinite(level) || (circle !== undefined && level !== circle)) return false;
		const classes = Array.isArray(entry.rules.classes) ? entry.rules.classes.map(String) : [];
		return (
			(circle === undefined || level === circle) &&
			(!classKey ||
				classes.length === 0 ||
				classes.some((name) => canonicalClass(name) === classKey))
		);
	});
}

export function availableSpellCircles(
	slots: readonly SpellSlot[],
	spells: readonly Spell[]
): number[] {
	return [
		...new Set([
			0,
			...slots
				.filter((slot) => Number.isFinite(slot.level) && Number(slot.max) > 0)
				.map((slot) => Number(slot.level)),
			...spells.map((spell) => Number(spell.level)).filter(Number.isFinite)
		])
	].sort((a, b) => a - b);
}

export function addableSpellCircles(slots: readonly SpellSlot[]): number[] {
	return unlockedSpellCircles([...slots]);
}

export function groupSpellsByCircle(spells: readonly Spell[], circle: number): SpellCircleEntry[] {
	return spells.flatMap((spell, index) => (spell.level === circle ? [{ spell, index }] : []));
}

export function compatibleSpellSlots(spell: Spell, slots: readonly SpellSlot[]): SpellSlot[] {
	return slots.filter((slot) => slot.level >= spell.level && slot.current > 0);
}

export function defaultSpellSlot(
	spell: Spell,
	index: number,
	choices: Readonly<Record<number, number>>,
	slots: readonly SpellSlot[]
): number {
	const compatible = compatibleSpellSlots(spell, slots);
	const chosen = choices[index];
	return compatible.some((slot) => slot.level === chosen)
		? chosen
		: (compatible[0]?.level ?? spell.level);
}

export function resolveSpellOrigin(spell: Spell, rules: Record<string, unknown> = {}): SpellOrigin {
	if (spell.origin) return spell.origin;
	const origin = String(
		rules.origin ?? rules.originType ?? rules.sourceType ?? rules.featureSource ?? ''
	).toLowerCase();
	if (/species|race|racial|ancestr|ra[cç]a/.test(origin)) return 'species';
	if (/feat|talent|talento/.test(origin)) return 'feat';
	return 'class';
}

export function deriveGrantedSpells(
	spells: readonly Spell[],
	entries: readonly CompendiumEntry[],
	sources: readonly SpellSourceText[],
	label: (entry: CompendiumEntry) => string
): Spell[] {
	const granted = spells.filter((spell) => resolveSpellOrigin(spell) !== 'class');
	for (const entry of entries) {
		if (entry.entryType !== 'spell') continue;
		const names = [entry.name, label(entry)].map(normalizeSpellName);
		const source = sources.find(({ text }) => {
			const normalized = normalizeSpellName(text);
			return names.some((name) => name.length > 2 && normalized.includes(name));
		});
		if (!source) continue;
		const name = label(entry);
		if (
			spells.some(
				(spell) =>
					spell.entryId === entry.id || normalizeSpellName(spell.name) === normalizeSpellName(name)
			)
		)
			continue;
		const level = Number(entry.rules.level ?? 0);
		granted.push({
			entryId: entry.id,
			name,
			level: Number.isFinite(level) && level >= 0 ? level : 0,
			notes: '',
			origin: source.origin
		});
	}
	return granted;
}

export function addSpellToSheet(
	spells: readonly Spell[],
	nameInput: string,
	circle: number,
	addableCircles: readonly number[],
	entry: CompendiumEntry | undefined,
	entryLabel: string
): Spell[] {
	const name = nameInput.trim();
	if (!name || !addableCircles.includes(circle)) return [...spells];
	const normalizedName = normalizeSpellName(name);
	if (spells.some((spell) => normalizeSpellName(spell.name) === normalizedName)) return [...spells];
	if (!entry)
		return [
			...spells,
			{
				name,
				level: circle,
				notes: '',
				description: '',
				diceFormula: '',
				higherLevels: '',
				scalingDicePerLevel: 0
			}
		];
	const rules = entry.rules ?? {};
	const damage =
		typeof rules.damage === 'object' && rules.damage !== null && !Array.isArray(rules.damage)
			? (rules.damage as Record<string, unknown>)
			: {};
	const level = Number(rules.level ?? circle);
	return [
		...spells,
		{
			entryId: entry.id,
			name: entryLabel,
			level: Number.isFinite(level) && level >= 0 ? level : circle,
			notes: `SRD · ${String(rules.school ?? '')}${rules.range ? ` · ${String(rules.range)}` : ''}`,
			description: String(rules.description ?? entry.summary ?? ''),
			diceFormula: String(damage.dice ?? ''),
			higherLevels: String(rules.higherLevels ?? rules.atHigherLevels ?? '')
		}
	];
}

export function updateSpellOnSheet(
	spells: readonly Spell[],
	index: number,
	changes: Partial<Spell>
): Spell[] {
	return spells.map((spell, itemIndex) => (itemIndex === index ? { ...spell, ...changes } : spell));
}

export function removeSpellFromSheet(spells: readonly Spell[], index: number): Spell[] {
	return spells.filter((_, itemIndex) => itemIndex !== index);
}

export function localizedSpellField(
	spell: Spell,
	entry: CompendiumEntry | undefined,
	field: string,
	fallback: string,
	locale: string
): string {
	const translation = entry?.translations?.[`pt-BR.rules.${field}`]?.trim();
	return locale === 'pt-BR' &&
		translation &&
		translation.toLocaleLowerCase() !== fallback.trim().toLocaleLowerCase()
		? translation
		: fallback;
}

export function hasAISpellTranslation(entry: CompendiumEntry | undefined): boolean {
	return Object.entries(entry?.translations ?? {}).some(
		([key, value]) => key.startsWith('pt-BR.rules.') && key.endsWith('.source') && value === 'ai'
	);
}
