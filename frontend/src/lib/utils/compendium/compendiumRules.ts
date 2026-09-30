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

export function compendiumDraftFromEditor(model: CompendiumEditorModel): CompendiumDraft {
	return {
		name: model.name.trim(),
		summary: model.summary.trim(),
		rules: compendiumRulesFromEditor(model),
		translations: model.portugueseName.trim()
			? { ...model.extraTranslations, 'pt-BR': model.portugueseName.trim() }
			: { ...model.extraTranslations },
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
	if (isCompendiumTranslationPending(entry.name, entry.translations?.['pt-BR'])) return true;
	if (isCompendiumTranslationPending(entry.summary, entry.translations?.['pt-BR.summary']))
		return true;
	const visit = (value: unknown, key: string): boolean => {
		if (typeof value === 'string')
			return isCompendiumTranslationPending(value, entry.translations?.[`pt-BR.rules.${key}`]);
		if (Array.isArray(value)) return value.some((child, index) => visit(child, `${key}.${index}`));
		if (value && typeof value === 'object')
			return Object.entries(value).some(([childKey, child]) =>
				visit(child, key ? `${key}.${childKey}` : childKey)
			);
		return false;
	};
	return visit(entry.rules ?? {}, '');
}

export function filterAndSortCompendiumEntries(
	entries: CompendiumEntry[],
	sources: CompendiumSource[],
	filters: CompendiumCatalogFilters,
	displayName: (entry: CompendiumEntry) => string
): CompendiumEntry[] {
	const query = normalizeCompendiumSearch(filters.query);
	return entries
		.filter(
			(entry) =>
				(filters.entryType === 'all' || entry.entryType === filters.entryType) &&
				(filters.sourceId === 'all' || entry.sourceId === filters.sourceId) &&
				(!query ||
					normalizeCompendiumSearch(
						`${entry.name} ${entry.translations?.['pt-BR'] ?? ''}`
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
