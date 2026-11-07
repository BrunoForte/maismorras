import type { CompendiumEntry } from '$lib/services/compendiumApi';
import { canonicalClass } from '$lib/data/classProgression';
import { spellClassLabel } from '$lib/utils/compendium/spellMetadataLabels';
import type { AppLocale } from '$lib/utils/speciesRules';

type ClassEntry = Pick<CompendiumEntry, 'id' | 'name' | 'rules' | 'translations'>;

const CLASS_IDS = new Set([
	'barbarian',
	'bard',
	'cleric',
	'druid',
	'fighter',
	'monk',
	'paladin',
	'ranger',
	'rogue',
	'sorcerer',
	'warlock',
	'wizard'
]);

const normalize = (value: unknown) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

function classEntryForReference(value: unknown, classEntries: readonly ClassEntry[]) {
	const reference = normalize(value);
	if (!reference) return undefined;
	return classEntries.find((entry) =>
		[
			entry.id,
			entry.rules.id,
			entry.name,
			entry.translations['pt-BR'],
			entry.translations['en']
		].some((candidate) => normalize(candidate) === reference)
	);
}

export function classIdForLabel(
	value: string,
	classEntries: readonly ClassEntry[]
): string | undefined {
	const entry = classEntryForReference(value, classEntries);
	const id = entry?.rules.id ?? entry?.id;
	return id === undefined || id === null || String(id).trim() === '' ? undefined : String(id);
}

function classIdentity(value: unknown, classEntries: readonly ClassEntry[]) {
	const reference = normalize(value);
	if (!reference) return null;
	const classEntry = classEntryForReference(value, classEntries);
	if (classEntry) return `entry:${classEntry.id}`;
	const canonical = canonicalClass(String(value));
	if (CLASS_IDS.has(canonical)) return `class:${canonical}`;
	return `name:${reference}`;
}

function subclassClassIdentity(entry: CompendiumEntry, classEntries: readonly ClassEntry[]) {
	const rules = entry.rules ?? {};
	const classId = String(rules.classId ?? '').trim();
	if (classId) {
		const byId = classEntryForReference(classId, classEntries);
		if (byId) return `entry:${byId.id}`;
		const canonical = canonicalClass(classId);
		if (CLASS_IDS.has(canonical)) return `class:${canonical}`;
	}
	return classIdentity(
		[String(rules.className ?? '').trim(), String(rules.parentClass ?? '').trim()].find(Boolean),
		classEntries
	);
}

export function subclassMatchesClass(
	entry: CompendiumEntry,
	className: string,
	classEntries: readonly ClassEntry[] = []
): boolean {
	if (entry.entryType !== 'subclass' || !className.trim()) return false;
	const identity = subclassClassIdentity(entry, classEntries);
	return identity !== null && identity === classIdentity(className, classEntries);
}

export function subclassOptionsForClass(
	entries: readonly CompendiumEntry[],
	className: string,
	fallbackOptions: readonly string[],
	classEntries: readonly ClassEntry[] = []
): string[] {
	if (!className.trim()) return [];
	const associated = entries
		.filter(
			(entry) =>
				entry.entryType === 'subclass' && subclassMatchesClass(entry, className, classEntries)
		)
		.map((entry) => entry.name);
	return associated.length ? associated : [...fallbackOptions];
}

export function retainCompatibleSubclass(subclass: string, options: readonly string[]): string {
	return subclass && options.includes(subclass) ? subclass : '';
}

export function subclassBaseClassLabel(
	entry: CompendiumEntry,
	classEntries: readonly ClassEntry[],
	locale: AppLocale
): string {
	const rules = entry.rules ?? {};
	const classId = String(rules.classId ?? '').trim();
	const classEntry =
		classEntryForReference(classId, classEntries) ??
		classEntryForReference(rules.className, classEntries) ??
		classEntryForReference(rules.parentClass, classEntries);
	if (classEntry) {
		const classEntryId = String(classEntry.rules.id ?? '').trim();
		if (classEntryId && CLASS_IDS.has(canonicalClass(classEntryId)))
			return spellClassLabel(canonicalClass(classEntryId), locale);
		return classEntry.translations[locale] || spellClassLabel(classEntry.name, locale);
	}
	if (classId) {
		const canonical = canonicalClass(classId);
		if (CLASS_IDS.has(canonical)) return spellClassLabel(canonical, locale);
	}
	const readableReference =
		[rules.className, rules.parentClass, classId]
			.map((value) => String(value ?? '').trim())
			.find(Boolean) ?? '';
	if (!readableReference) return '—';
	const canonical = canonicalClass(readableReference);
	return spellClassLabel(CLASS_IDS.has(canonical) ? canonical : readableReference, locale);
}
