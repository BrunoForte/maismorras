import type { AbilityScores, CharacterResource, SpellSlot } from '$lib/services/characterApi';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { AppLocale } from '$lib/utils/speciesRules';
import { translatedCompendiumText } from '$lib/utils/compendium/compendiumRules';
import {
	canonicalClass,
	classData,
	classFeatures,
	classSavingThrows,
	defaultResources,
	isClassProgressionFeature,
	spellSlots,
	syncResourceMaxima
} from '$lib/data/classProgression';

export { canonicalClass as resolveCharacterClass };

export function proficiencyBonusForLevel(level: number): number {
	return Math.ceil(Math.max(1, Number.isFinite(level) ? level : 1) / 4) + 1;
}

export function hitDieForClass(className: string, fallback = ''): string {
	return classData[canonicalClass(className)]?.hitDice ?? fallback;
}

export function subclassesForClass(className: string): string[] {
	return [...(classData[canonicalClass(className)]?.subclasses ?? [])];
}

export function classProgressionFeatures(className: string, level: number, subclass: string) {
	return classFeatures(className, level, subclass);
}

export type CharacterFeature = { id: string; level: number; name: string; description: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

export function deriveCharacterFeatures(
	classEntry: CompendiumEntry | undefined,
	subclassEntry: CompendiumEntry | undefined,
	customEntries: readonly CompendiumEntry[],
	className: string,
	level: number,
	subclassName: string,
	locale: AppLocale = 'en'
): CharacterFeature[] {
	const semanticKey = (feature: Pick<CharacterFeature, 'level' | 'name'>) =>
		`${feature.level}:${feature.name
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim()}`;
	const stableId = (feature: Pick<CharacterFeature, 'level' | 'name'>) =>
		`feature-${semanticKey(feature).replace(/[^a-z0-9]+/g, '-')}`;
	const mapFeatures = (features: unknown[]): CharacterFeature[] =>
		features
			.filter((feature) => {
				const item = asRecord(feature);
				const featureLevel = Number(item?.level ?? 0);
				return Boolean(item) && Number.isFinite(featureLevel) && featureLevel <= level;
			})
			.map((feature) => {
				const item = asRecord(feature) ?? {};
				return {
					id: stableId({ level: Number(item.level ?? 0), name: String(item.name ?? '') }),
					level: Number(item.level ?? 0),
					name: String(item.name ?? ''),
					description: String(item.description ?? '')
				};
			})
			.filter((feature) => feature.name);
	const classFeaturesFromCompendium = Array.isArray(classEntry?.rules.features)
		? mapFeatures(classEntry.rules.features)
		: [];
	const subclassFeatures = Array.isArray(subclassEntry?.rules.features)
		? mapFeatures(subclassEntry.rules.features)
		: [];
	const customFeatures = customEntries
		.filter((entry) => isClassProgressionFeature(entry.entryType, entry.rules))
		.flatMap((entry) =>
			Array.isArray(entry.rules.features)
				? entry.rules.features
				: [{ name: entry.name, description: entry.summary, level: entry.rules.level ?? 1 }]
		)
		.filter((feature) => {
			const item = asRecord(feature);
			const featureLevel = Number(item?.level ?? 0);
			return Boolean(item) && Number.isFinite(featureLevel) && featureLevel <= level;
		})
		.map((feature) => ({
			id: stableId({
				level: Number(asRecord(feature)?.level ?? 1),
				name: String(asRecord(feature)?.name ?? '')
			}),
			level: Number(asRecord(feature)?.level ?? 1),
			name: String(asRecord(feature)?.name ?? ''),
			description: String(asRecord(feature)?.description ?? '')
		}))
		.filter((feature) => feature.name);
	const fallbackFeatures = classFeatures(className, level, '')
		.filter((feature) => !/subclasse/i.test(feature.name))
		.concat(subclassName && level >= 3 ? [{ level: 3, name: subclassName }] : [])
		.map((feature) => ({ ...feature, id: stableId(feature), description: '' }));
	// Compendium descriptions are preferred, while local progression fills gaps
	// independently for class and subclass instead of being disabled by either.
	const byMeaning = new Map<string, CharacterFeature>();
	for (const feature of [
		...fallbackFeatures,
		...classFeaturesFromCompendium,
		...subclassFeatures,
		...customFeatures
	]) {
		const key = semanticKey(feature);
		const previous = byMeaning.get(key);
		if (!previous || (!previous.description && feature.description)) {
			byMeaning.set(key, { ...feature, id: stableId(feature) });
		}
	}
	const sourceEntries = [classEntry, subclassEntry].filter((entry): entry is CompendiumEntry =>
		Boolean(entry)
	);
	return [...byMeaning.values()]
		.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
		.map((feature) => {
			const source = sourceEntries
				.map((entry) => ({
					entry,
					features: Array.isArray(entry.rules.features) ? entry.rules.features : []
				}))
				.flatMap(({ entry, features }) =>
					features.map((value, index) => ({ entry, value: asRecord(value), index }))
				)
				.find(
					({ value }) =>
						value &&
						Number(value.level ?? 0) === feature.level &&
						String(value.name ?? '') === feature.name
				);
			if (!source) return feature;
			return {
				...feature,
				name: translatedCompendiumText(
					source.entry,
					`rules.features.${source.index}.name`,
					feature.name,
					locale
				),
				description: translatedCompendiumText(
					source.entry,
					`rules.features.${source.index}.description`,
					feature.description,
					locale
				)
			};
		});
}

export function expertiseChoicesForLevel(className: string, level: number): number {
	const key = canonicalClass(className);
	if (key === 'bard') return level >= 9 ? 4 : level >= 2 ? 2 : 0;
	if (key === 'rogue') return level >= 6 ? 4 : level >= 1 ? 2 : 0;
	return 0;
}

/** Keeps custom resources while recalculating class-derived resources and clamping uses. */
export function synchronizeProgressionResources(
	className: string,
	level: number,
	scores: AbilityScores,
	previous: readonly CharacterResource[]
): CharacterResource[] {
	const defaults = defaultResources(className, level, scores);
	const synchronized = syncResourceMaxima(defaults, [...previous]);
	const derivedIds = new Set(
		Object.keys(classData).flatMap((name) => defaultResources(name, 20, scores).map(({ id }) => id))
	);
	const defaultIds = new Set(defaults.map(({ id }) => id));
	const customResources = previous.filter(
		(resource) => !derivedIds.has(resource.id) && !defaultIds.has(resource.id)
	);
	return [...synchronized, ...customResources.map((resource) => ({ ...resource }))];
}

export function defaultResourceMaximumFor(
	className: string,
	level: number,
	scores: AbilityScores,
	resourceId: string
): number | undefined {
	return defaultResources(className, level, scores).find(({ id }) => id === resourceId)?.max;
}

/** Retains spent slots at the same circle, but never above a reduced maximum. */
export function synchronizeSpellSlots(
	defaults: readonly SpellSlot[],
	previous: readonly SpellSlot[]
): SpellSlot[] {
	return defaults.map((slot) => {
		const old = previous.find((candidate) => candidate.level === slot.level);
		const current = old && Number.isFinite(old.current) ? old.current : slot.max;
		return { ...slot, current: Math.max(0, Math.min(slot.max, Math.floor(current))) };
	});
}

export function spellSlotsForProgression(className: string, level: number): SpellSlot[] {
	return spellSlots(className, level);
}

export function spellcastingEnabled(
	className: string,
	level: number,
	mappedRules: unknown,
	override = false
): boolean {
	if (override) return true;
	const hasMappedSpellcasting =
		typeof mappedRules === 'object' && mappedRules !== null && !Array.isArray(mappedRules);
	return hasMappedSpellcasting || spellSlots(className, level).length > 0;
}

export function savingThrowsForClass(className: string): string[] {
	return [...(classSavingThrows[canonicalClass(className)] ?? [])];
}

export function levelHitPointGain(
	choice: 'keep' | 'max' | 'roll',
	levelsGained: number,
	hitDieSides: number,
	constitutionModifier: number,
	rolledTotals: readonly number[] = []
): number {
	const gained = Math.max(0, Math.floor(Number.isFinite(levelsGained) ? levelsGained : 0));
	if (choice === 'max') return gained * Math.max(1, hitDieSides + constitutionModifier);
	if (choice === 'roll')
		return rolledTotals.slice(0, gained).reduce((total, value) => total + (Number(value) || 0), 0);
	return 0;
}

export function hitDieSidesFromNotation(notation: string, fallback = 8): number {
	const sides = Number(String(notation ?? '').match(/d(\d+)/i)?.[1]);
	return Number.isFinite(sides) && sides > 0 ? sides : fallback;
}
