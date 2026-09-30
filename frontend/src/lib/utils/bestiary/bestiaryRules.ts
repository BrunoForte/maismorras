import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { NPC } from '$lib/services/npcApi';

export type CreatureSheet = NPC['sheet'];
export type BestiarySortMode = 'name' | 'challenge';
export type MonsterRules = {
	catalog?: string;
	kind?: string;
	challenge?: string | number;
	challengeRating?: string | number;
	hpMax?: number;
	armorClass?: number;
	size?: number;
	initiative?: number;
	creatureType?: string;
	speed?: string;
	senses?: string;
	languages?: string;
	resistances?: string[];
	immunities?: string[];
	abilities?: Partial<CreatureSheet['abilities']>;
	traits?: { name?: string; description?: string }[];
	actions?: {
		name?: string;
		description?: string;
		damage?: string;
		toHit?: number;
		range?: string;
	}[];
};

export function createFreshCreatureSheet(): CreatureSheet {
	return {
		hitPointsCurrent: 10,
		hitPointsMax: 10,
		armorClass: 10,
		initiative: 0,
		size: 1,
		color: 4921830,
		imageUrl: '',
		creatureType: 'Humanoide',
		challenge: '',
		speed: '9 m',
		abilities: {
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10
		},
		traits: [],
		actions: [],
		resistances: [],
		immunities: [],
		senses: '',
		languages: ''
	};
}

export function normalizeCreatureSheet(
	value: Partial<CreatureSheet> | null | undefined
): CreatureSheet {
	const defaults = createFreshCreatureSheet();
	return {
		...defaults,
		...(value ?? {}),
		abilities: { ...defaults.abilities, ...(value?.abilities ?? {}) },
		traits: Array.isArray(value?.traits) ? value.traits : [],
		actions: Array.isArray(value?.actions) ? value.actions : [],
		resistances: Array.isArray(value?.resistances) ? value.resistances : [],
		immunities: Array.isArray(value?.immunities) ? value.immunities : []
	};
}

export function parseCreatureCsv(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function readMonsterRules(entry: CompendiumEntry): MonsterRules {
	const rules = entry?.rules;
	return rules && typeof rules === 'object' && !Array.isArray(rules) ? (rules as MonsterRules) : {};
}

export function getChallenge(entry: CompendiumEntry): string {
	const rules = readMonsterRules(entry);
	return String(rules.challenge ?? rules.challengeRating ?? '—');
}

export function challengeSortWeight(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
	const normalized = String(value ?? '').trim();
	if (/^\d+\s*\/\s*\d+$/.test(normalized)) {
		const [numerator, denominator] = normalized.split('/').map(Number);
		return denominator > 0 ? numerator / denominator : Number.MAX_SAFE_INTEGER;
	}
	const numeric = Number(normalized);
	return Number.isFinite(numeric) && numeric >= 0 ? numeric : Number.MAX_SAFE_INTEGER;
}

export function filterAndSortCreatures<T>(
	items: readonly T[],
	query: string,
	sortMode: BestiarySortMode,
	getName: (item: T) => string,
	getChallengeValue: (item: T) => unknown = () => undefined,
	locale = 'pt-BR'
): T[] {
	const needle = query.trim().toLocaleLowerCase(locale);
	return items
		.filter((item) => !needle || getName(item).toLocaleLowerCase(locale).includes(needle))
		.toSorted((left, right) => {
			const byName = getName(left).localeCompare(getName(right), locale);
			return sortMode === 'challenge'
				? challengeSortWeight(getChallengeValue(left)) -
						challengeSortWeight(getChallengeValue(right)) || byName
				: byName;
		});
}

export function hasValidMonsterStatBlock(entry: CompendiumEntry): boolean {
	const rules = readMonsterRules(entry);
	return (
		Number.isFinite(Number(rules.hpMax)) &&
		Number(rules.hpMax) > 0 &&
		Number.isFinite(Number(rules.armorClass)) &&
		Number(rules.armorClass) >= 0
	);
}

export function isSRDMonster(entry: CompendiumEntry, srdSourceIDs: ReadonlySet<string>): boolean {
	return (
		entry.entryType === 'other' &&
		srdSourceIDs.has(entry.sourceId) &&
		(entry.rules?.kind === 'monster' || entry.rules?.catalog === 'monster')
	);
}

export function localizedEntryLabel(entry: CompendiumEntry, locale: string): string {
	return locale === 'pt-BR' ? entry.translations?.['pt-BR'] || entry.name : entry.name;
}

export function localizedMonsterField(
	entry: CompendiumEntry,
	key: string,
	fallback: unknown,
	locale: string
): string {
	const value = String(fallback ?? '');
	return locale === 'pt-BR' ? entry.translations?.[`pt-BR.${key}`] || value : value;
}

export function hasAITranslation(entry: CompendiumEntry, locale: string): boolean {
	return (
		locale === 'pt-BR' &&
		Object.entries(entry.translations ?? {}).some(
			([key, value]) => key.startsWith('pt-BR') && key.endsWith('.source') && value === 'ai'
		)
	);
}
