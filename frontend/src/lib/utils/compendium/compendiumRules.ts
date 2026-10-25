import type {
	CompendiumDraft,
	CompendiumEntry,
	CompendiumSource
} from '$lib/services/compendiumApi';

export const COMPENDIUM_ENTRY_TYPES = [
	['species', 'Espécie'],
	['background', 'Antecedente'],
	['class', 'Classe'],
	['subclass', 'Subclasse'],
	['feat', 'Talento'],
	['spell', 'Magia'],
	['item', 'Item'],
	['feature', 'Característica'],
	['other', 'Monstro / outro']
] as const;

const LEGACY_FEAT_ALIASES: Record<string, string> = {
	archery: 'Fighting Style: Archery',
	defense: 'Fighting Style: Defense',
	'great weapon fighting': 'Fighting Style: Great Weapon Fighting',
	'two-weapon fighting': 'Fighting Style: Two-Weapon Fighting'
};
const LEGACY_INDEX_SUMMARY = 'Entrada do System Reference Document 5.2.1.';

function isLegacyFeatIndexStub(entry: CompendiumEntry): boolean {
	return (
		entry.entryType === 'feat' &&
		Object.keys(entry.rules ?? {}).length === 0 &&
		entry.summary === LEGACY_INDEX_SUMMARY &&
		LEGACY_FEAT_ALIASES[entry.name.toLocaleLowerCase()] !== undefined
	);
}

export function preferredCompendiumFeatEntries(
	entries: CompendiumEntry[],
	sources: CompendiumSource[]
): CompendiumEntry[] {
	const sharedSourceIds = new Set(
		sources.filter((source) => source.kind === 'srd').map((source) => source.id)
	);
	return entries.filter((entry) => {
		if (!isLegacyFeatIndexStub(entry) || !sharedSourceIds.has(entry.sourceId)) return true;
		const fullName = LEGACY_FEAT_ALIASES[entry.name.toLocaleLowerCase()];
		return !entries.some(
			(candidate) =>
				candidate.entryType === 'feat' &&
				candidate.name === fullName &&
				sharedSourceIds.has(candidate.sourceId) &&
				Object.keys(candidate.rules ?? {}).length > 0
		);
	});
}

export function resolveCompendiumFeatEntry(
	name: string,
	entries: CompendiumEntry[],
	displayName: (entry: CompendiumEntry) => string = (entry) => entry.name
): CompendiumEntry | undefined {
	const normalized = name.trim().toLocaleLowerCase();
	const exact = entries.filter(
		(entry) =>
			entry.entryType === 'feat' &&
			(entry.name.trim().toLocaleLowerCase() === normalized ||
				displayName(entry).trim().toLocaleLowerCase() === normalized)
	);
	const completeExact = exact.find((entry) => !isLegacyFeatIndexStub(entry));
	if (completeExact) return completeExact;

	const canonicalName = LEGACY_FEAT_ALIASES[normalized];
	if (canonicalName) {
		const canonical = entries.find(
			(entry) =>
				entry.entryType === 'feat' &&
				entry.name.toLocaleLowerCase() === canonicalName.toLocaleLowerCase() &&
				Object.keys(entry.rules ?? {}).length > 0
		);
		if (canonical) return canonical;
	}
	return exact[0];
}

export type CompendiumEntryType = (typeof COMPENDIUM_ENTRY_TYPES)[number][0];
export type CompendiumSortMode = 'name' | 'category' | 'challenge' | 'source';
export type CompendiumLevelFeature = {
	id: string;
	name: string;
	level: number;
	description: string;
};

export type CompendiumEditorModel = {
	sourceId: string;
	entryType: CompendiumEntryType;
	name: string;
	portugueseName: string;
	summary: string;
	published: boolean;
	category: string;
	hpMax: number;
	armorClass: number;
	size: number;
	initiative: number;
	color: number;
	imageUrl: string;
	monsterExtraRules: Record<string, unknown>;
	extraTranslations: Record<string, string>;
	spellLevel: number;
	spellClasses: string;
	itemDamage: string;
	itemDefense: number;
	classHitDie: number;
	parentClass: string;
	speed: number;
	levelFeatures: CompendiumLevelFeature[];
};

export type CompendiumCatalogFilters = {
	query: string;
	entryType: string;
	sourceId: string;
	sortMode: CompendiumSortMode;
};

/** UI capability only; the backend repeats this authorization for every write. */
export function canInitiateCompendiumTranslation(
	entry: CompendiumEntry,
	source: CompendiumSource | undefined,
	canTranslateSharedSrd: boolean,
	isGM: boolean
): boolean {
	return source?.kind === 'srd' ? canTranslateSharedSrd : isGM;
}

export function emptyCompendiumEditorModel(sourceId = ''): CompendiumEditorModel {
	return {
		sourceId,
		entryType: 'other',
		name: '',
		portugueseName: '',
		summary: '',
		published: true,
		category: 'monster',
		hpMax: 10,
		armorClass: 10,
		size: 1,
		initiative: 0,
		color: 4921830,
		imageUrl: '',
		monsterExtraRules: {},
		extraTranslations: {},
		spellLevel: 1,
		spellClasses: '',
		itemDamage: '',
		itemDefense: 0,
		classHitDie: 8,
		parentClass: '',
		speed: 9,
		levelFeatures: []
	};
}

export function editorModelFromEntry(entry: CompendiumEntry): CompendiumEditorModel {
	const rules = entry.rules ?? {};
	return {
		...emptyCompendiumEditorModel(entry.sourceId),
		entryType: (COMPENDIUM_ENTRY_TYPES.some(([type]) => type === entry.entryType)
			? entry.entryType
			: 'other') as CompendiumEntryType,
		name: entry.name,
		portugueseName: String(entry.translations?.['pt-BR'] ?? ''),
		summary: entry.summary,
		published: entry.isPublished,
		monsterExtraRules: { ...rules },
		extraTranslations: { ...(entry.translations ?? {}) },
		category: String(rules.kind ?? rules.category ?? 'monster'),
		hpMax: Number(rules.hpMax ?? 10),
		armorClass: Number(rules.armorClass ?? 10),
		size: Number(rules.size ?? 1),
		initiative: Number(rules.initiative ?? 0),
		color: 4921830,
		imageUrl: String(rules.imageUrl ?? ''),
		itemDamage: String(rules.damage ?? ''),
		itemDefense: Number(rules.armorClass ?? 0),
		spellLevel: Number(rules.level ?? 1),
		spellClasses: Array.isArray(rules.classes) ? rules.classes.join(', ') : '',
		classHitDie: Number(rules.hitDie ?? 8),
		parentClass: String(rules.className ?? ''),
		speed: Number(rules.speed ?? 9),
		levelFeatures: Array.isArray(rules.features)
			? rules.features.map((feature, index) => {
					const item = feature as Record<string, unknown>;
					return {
						id: String(item.id ?? `feature-${index}`),
						name: String(item.name ?? ''),
						level: Number(item.level ?? 1),
						description: String(item.description ?? '')
					};
				})
			: []
	};
}

export function compendiumRulesFromEditor(model: CompendiumEditorModel): Record<string, unknown> {
	if (model.entryType === 'other')
		return {
			...(model.category === 'monster' ? model.monsterExtraRules : {}),
			kind: model.category,
			...(model.category === 'monster'
				? {
						hpMax: model.hpMax,
						armorClass: model.armorClass,
						size: model.size,
						initiative: model.initiative,
						color: model.color,
						...(model.imageUrl.trim() ? { imageUrl: model.imageUrl.trim() } : {})
					}
				: {})
		};
	if (model.entryType === 'item')
		return {
			category: model.category,
			...(model.itemDamage.trim() ? { damage: model.itemDamage.trim() } : {}),
			...(model.itemDefense > 0 ? { armorClass: model.itemDefense } : {})
		};
	if (model.entryType === 'spell')
		return {
			level: model.spellLevel,
			classes: model.spellClasses
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean)
		};
	if (model.entryType === 'class' || model.entryType === 'subclass')
		return {
			...(model.entryType === 'class'
				? { hitDie: model.classHitDie }
				: { className: model.parentClass.trim() }),
			...(model.levelFeatures.length
				? {
						features: model.levelFeatures
							.filter((feature) => feature.name.trim())
							.map((feature) => ({
								...feature,
								name: feature.name.trim(),
								description: feature.description.trim()
							}))
					}
				: {})
		};
	if (model.entryType === 'species') return { speed: model.speed };
	return {};
}

export function compendiumDraftFromEditor(
	model: CompendiumEditorModel,
	previousEntry?: CompendiumEntry
): CompendiumDraft {
	const translations: Record<string, string> = model.portugueseName.trim()
		? { ...model.extraTranslations, 'pt-BR': model.portugueseName.trim() }
		: { ...model.extraTranslations };
	const previousPortugueseName = previousEntry?.translations?.['pt-BR']?.trim() ?? '';
	const currentPortugueseName = translations['pt-BR']?.trim() ?? '';
	const currentNameSource =
		translations['pt-BR.source']?.toLowerCase() ??
		previousEntry?.translations?.['pt-BR.source']?.toLowerCase();
	if (currentNameSource === 'official' && currentPortugueseName) {
		translations['pt-BR.source'] = 'official';
	}
	if (
		currentPortugueseName &&
		currentPortugueseName !== previousPortugueseName &&
		!['official', 'manual', 'reviewed', 'human', 'user'].includes(currentNameSource ?? '')
	) {
		translations['pt-BR.source'] = 'manual';
	}
	return {
		name: model.name.trim(),
		summary: model.summary.trim(),
		rules: compendiumRulesFromEditor(model),
		translations,
		isPublished: model.published
	};
}

export function normalizeCompendiumSearch(value: unknown): string {
	return String(value ?? '')
		.trim()
		.toLocaleLowerCase();
}

export function isCompendiumTranslationPending(source: unknown, translation: unknown): boolean {
	const normalize = (value: unknown) =>
		String(value ?? '')
			.trim()
			.replace(/\s+/g, ' ');
	const original = normalize(source);
	const localized = normalize(translation);
	return (
		!localized || original.localeCompare(localized, undefined, { sensitivity: 'accent' }) === 0
	);
}

export function translatedCompendiumName(entry: CompendiumEntry, locale: string): string {
	const localized = entry.translations?.['pt-BR'];
	return locale === 'pt-BR' && !isCompendiumTranslationPending(entry.name, localized)
		? localized
		: entry.name;
}

export function translatedCompendiumText(
	entry: CompendiumEntry,
	field: string,
	fallback: unknown,
	locale: string
): string {
	const text = String(fallback ?? '');
	const localized = entry.translations?.[`pt-BR.${field}`];
	return locale === 'pt-BR' && !isCompendiumTranslationPending(text, localized) ? localized : text;
}

export function translatedFeatDetails(entry: CompendiumEntry, locale: string): string {
	const rules = entry.rules ?? {};
	const description = translatedCompendiumText(
		entry,
		'rules.description',
		rules.description ?? entry.summary ?? '',
		locale
	).trim();
	const benefits = Array.isArray(rules.benefits)
		? rules.benefits
				.map((benefit, index) =>
					translatedCompendiumText(entry, `rules.benefits.${index}`, benefit, locale).trim()
				)
				.filter(Boolean)
		: [];
	return [...new Set([description, ...benefits].filter(Boolean))].join('\n\n');
}

export function compendiumTranslationIsOfficial(
	entry: CompendiumEntry,
	field = 'summary',
	locale = 'pt-BR'
) {
	return locale === 'pt-BR' && entry.translations?.[`pt-BR.${field}.source`] === 'official';
}

export function compendiumTranslationHasAI(entry: CompendiumEntry, locale = 'pt-BR') {
	return (
		locale === 'pt-BR' &&
		Object.entries(entry.translations ?? {}).some(
			([key, value]) => key.startsWith('pt-BR') && key.endsWith('.source') && value === 'ai'
		)
	);
}

export function hasPendingCompendiumTranslation(entry: CompendiumEntry): boolean {
	if (isPendingField(entry, 'pt-BR', entry.name)) return true;
	if (isPendingField(entry, 'pt-BR.summary', entry.summary)) return true;
	const visit = (value: unknown, key: string): boolean => {
		if (typeof value === 'string') {
			const fieldName = key.split('.').at(-1) ?? '';
			return (
				['name', 'description', 'summary', 'text', 'benefit', 'benefits', 'notes'].includes(
					fieldName
				) && isPendingField(entry, `pt-BR.rules.${key}`, value)
			);
		}
		if (Array.isArray(value)) return value.some((child, index) => visit(child, `${key}.${index}`));
		if (value && typeof value === 'object')
			return Object.entries(value).some(
				([childKey, child]) =>
					!NON_TRANSLATABLE_COMPENDIUM_RULE_KEYS.has(childKey) &&
					visit(child, key ? `${key}.${childKey}` : childKey)
			);
		return false;
	};
	return visit(entry.rules ?? {}, '');
}

const NON_TRANSLATABLE_COMPENDIUM_RULE_KEYS = new Set([
	'catalog',
	'source',
	'id',
	'abilityScoreIncreases',
	'armorProficiencies',
	'startingEquipment',
	'skillProficiencies',
	'toolProficiency',
	'toolProficiencies',
	'weaponProficiencies',
	'savingThrows',
	'classes',
	'spellIds',
	'languages',
	'abilities',
	'speed',
	'hpMax',
	'armorClass',
	'initiative',
	'challenge',
	'size',
	'damage',
	'damageType',
	'toHit',
	'range',
	'cost',
	'weight',
	'level',
	'hitDie',
	'spellSlotProgression',
	'preparedFormula',
	'dice',
	'ability',
	'abilityBonuses',
	'primaryAbility',
	'components',
	'duration',
	'castingTime',
	'concentration',
	'ritual',
	'ritualCasting',
	'material',
	'verbal',
	'somatic',
	'strength',
	'dexterity',
	'constitution',
	'intelligence',
	'wisdom',
	'charisma',
	'immunities',
	'resistances',
	'senses'
]);

export type CompendiumTranslationStatus = 'pending' | 'ai' | 'official' | 'manual' | 'complete';

function isPendingField(entry: CompendiumEntry, key: string, source: unknown): boolean {
	const text = String(source ?? '').trim();
	if (!text) return false;
	const provenance = String(entry.translations?.[`${key}.source`] ?? '').toLowerCase();
	if (['ai', 'official', 'manual', 'reviewed', 'human', 'user'].includes(provenance)) return false;
	return isCompendiumTranslationPending(text, entry.translations?.[key]);
}

export function compendiumEntryTranslationStatus(
	entry: CompendiumEntry
): CompendiumTranslationStatus {
	if (hasPendingCompendiumTranslation(entry)) return 'pending';
	const provenance = Object.entries(entry.translations ?? {})
		.filter(([key]) => key.startsWith('pt-BR') && key.endsWith('.source'))
		.map(([, value]) => String(value).toLowerCase());
	if (provenance.includes('official')) return 'official';
	if (provenance.some((value) => ['manual', 'reviewed', 'human', 'user'].includes(value)))
		return 'manual';
	if (provenance.includes('ai')) return 'ai';
	const localized = Object.entries(entry.translations ?? {}).some(
		([key, value]) => key.startsWith('pt-BR') && !key.endsWith('.source') && Boolean(value?.trim())
	);
	return localized ? 'manual' : 'complete';
}

export function filterAndSortCompendiumEntries(
	entries: CompendiumEntry[],
	sources: CompendiumSource[],
	filters: CompendiumCatalogFilters,
	displayName: (entry: CompendiumEntry) => string
): CompendiumEntry[] {
	const query = normalizeCompendiumSearch(filters.query);
	return preferredCompendiumFeatEntries(entries, sources)
		.filter(
			(entry) =>
				(filters.entryType === 'all' || entry.entryType === filters.entryType) &&
				(filters.sourceId === 'all' || entry.sourceId === filters.sourceId) &&
				(!query ||
					normalizeCompendiumSearch(
						`${entry.name} ${entry.translations?.['pt-BR'] ?? ''} ${Object.entries(
							LEGACY_FEAT_ALIASES
						)
							.filter(([, fullName]) => fullName === entry.name)
							.map(([alias]) => alias)
							.join(' ')}`
					).includes(query))
		)
		.sort((a, b) => {
			if (filters.sortMode === 'challenge')
				return (
					Number(a.rules?.challenge ?? 999) - Number(b.rules?.challenge ?? 999) ||
					a.name.localeCompare(b.name)
				);
			if (filters.sortMode === 'category')
				return a.entryType.localeCompare(b.entryType) || a.name.localeCompare(b.name);
			if (filters.sortMode === 'source')
				return (
					(sources.find((source) => source.id === a.sourceId)?.title ?? '').localeCompare(
						sources.find((source) => source.id === b.sourceId)?.title ?? ''
					) || a.name.localeCompare(b.name)
				);
			return displayName(a).localeCompare(displayName(b));
		});
}
