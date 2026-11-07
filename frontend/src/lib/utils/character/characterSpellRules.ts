import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type {
	CampaignFeatSpellGrant,
	Dnd2024FeatSpellGrant,
	SpeciesSpellGrant,
	Spell,
	SpellSlot,
	SpellCastAuthorization
} from '$lib/services/characterApi';
import type { CampaignFeatSpellRule } from '$lib/services/compendiumApi';
import { canonicalClass } from '$lib/data/classProgression';
import { DND2024_FEAT_SPELL_RULES } from '$lib/data/dnd2024FeatSpells';
import { campaignFeatSpellRuleFromEntryRules } from '$lib/utils/compendium/campaignFeatSpellRule';
import { spellIsOnSheet, unlockedSpellCircles } from '$lib/utils/spellbook';
import type { SpellMechanicsPresentation } from '$lib/utils/compendium/spellMechanics';
import { spellSchoolLabel } from '$lib/utils/compendium/spellMetadataLabels';
import {
	featureSpellGrantIds,
	translatedCompendiumText
} from '$lib/utils/compendium/compendiumRules';

export type SpellOrigin = NonNullable<Spell['origin']>;
export type FeatureSpellGrant = {
	featureEntryId: string;
	featureId: string;
	featureName: string;
	spellEntryId: string;
	spellName: string;
	spellLevel: number;
	level: number;
};
export type SpellFeatGrantProjection = {
	id: string;
	featId: string;
	featName: string;
	spellEntryId: string;
	spellList?: string;
	ability?: string;
	freeCastsRemaining: number;
	freeUses: number;
	canUseExistingSlots: boolean;
	recovery: string;
	campaignConfigured: boolean;
	sourceKind: 'feat' | 'species';
	freeCastsMax: number;
	defaultFreeCasts: number;
};
export type SpellCircleEntry = {
	spell: Spell;
	index: number;
	key?: string;
	featGrants?: SpellFeatGrantProjection[];
	featureGrants?: FeatureSpellGrant[];
	origins?: SpellOrigin[];
};

export function hasActiveFeatGrantedSpells(
	curatedGrants: readonly Dnd2024FeatSpellGrant[] = [],
	campaignGrants: readonly CampaignFeatSpellGrant[] = [],
	speciesGrants: readonly SpeciesSpellGrant[] = []
): boolean {
	return (
		curatedGrants.some((grant) => grant.active !== false) ||
		campaignGrants.some((grant) => grant.active !== false) ||
		speciesGrants.some((grant) => grant.active)
	);
}
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
	mechanics: (spell: Spell) => SpellMechanicsPresentation;
	hasAITranslation: (spell: Spell) => boolean;
};

export type SpellTabActions = {
	setNewSpellName: (value: string) => void;
	setNewSpellLevel: (value: number) => void;
	setExpandedSpell: (value: number | null) => void;
	chooseSlot: (index: number, value: number) => void;
	setAvailableSpellSlots: (level: number, current: number) => Promise<boolean>;
	setSpellGrantUseConfig: (
		grantId: string,
		entryId: string,
		max: number,
		current: number,
		recovery: 'none' | 'short' | 'long'
	) => Promise<boolean>;
	setSpeciesSpellcastingAbility: (ability: string) => void;
	add: () => void;
	remove: (index: number) => void;
	change: (index: number, changes: Partial<Spell>) => void;
	present: (spell: Spell) => void;
	rollEffect: (spell: Spell) => void;
	cast: (spell: Spell, index: number, authorization?: SpellCastAuthorization) => void;
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

/** Adds curated feat-granted spells to the display without duplicating a spell
 * already on the class spell list; a card retains every source and grant. */
export function projectCharacterSpells(
	spells: readonly Spell[],
	grants: readonly Dnd2024FeatSpellGrant[],
	entries: readonly CompendiumEntry[],
	label: (entry: CompendiumEntry) => string = (entry) => entry.name,
	campaignGrants: readonly CampaignFeatSpellGrant[] = [],
	featEntries: readonly CompendiumEntry[] = [],
	speciesGrants: readonly SpeciesSpellGrant[] = [],
	speciesSpellcastingAbility = '',
	featureGrants: readonly FeatureSpellGrant[] = []
): SpellCircleEntry[] {
	const result: SpellCircleEntry[] = spells.map((spell, index) => ({
		spell,
		index,
		key: `sheet:${spell.entryId ?? normalizeSpellName(spell.name)}:${index}`,
		featGrants: [],
		origins: [resolveSpellOrigin(spell)]
	}));
	let virtualIndex = -1;
	for (const grant of grants.filter((item) => item.active !== false)) {
		const entryIds = [...grant.cantripEntryIds, grant.firstLevelSpellEntryId].filter(Boolean);
		for (const entryId of entryIds) {
			const featRule =
				DND2024_FEAT_SPELL_RULES[grant.featId as keyof typeof DND2024_FEAT_SPELL_RULES];
			if (!featRule) continue;
			const firstLevel = entryId === grant.firstLevelSpellEntryId;
			addGrantedSpell(
				result,
				entries,
				label,
				{
					id: grant.id,
					featId: grant.featId,
					featName: featRule.name,
					spellEntryId: entryId,
					spellList: grant.spellList,
					ability: grant.ability,
					freeCastsRemaining: firstLevel ? grant.freeCastsRemaining : 0,
					freeUses: firstLevel ? featRule.freeCasts : 0,
					canUseExistingSlots: featRule.canUseExistingSlots,
					recovery: firstLevel ? (grant.freeCastsRecovery ?? featRule.recovery) : 'none',
					campaignConfigured: false,
					sourceKind: 'feat',
					freeCastsMax: firstLevel ? (grant.freeCastsMaxOverride ?? featRule.freeCasts) : 0,
					defaultFreeCasts: firstLevel ? featRule.freeCasts : 0
				},
				virtualIndex--
			);
		}
	}
	for (const grant of campaignGrants.filter((item) => item.active !== false)) {
		const feat = featEntries.find(
			(entry) => entry.id === grant.featEntryId && entry.entryType === 'feat'
		);
		if (!feat) continue;
		const rule: CampaignFeatSpellRule = campaignFeatSpellRuleFromEntryRules(feat.rules);
		if (!rule.enabled) continue;
		for (const configuredSpell of rule.spells) {
			const ability = grant.spellcastingAbilities?.[configuredSpell.spellEntryId];
			addGrantedSpell(
				result,
				entries,
				label,
				{
					id: grant.id,
					featId: grant.featEntryId,
					featName: label(feat),
					spellEntryId: configuredSpell.spellEntryId,
					ability,
					freeCastsRemaining:
						grant.freeCastsRemaining?.[configuredSpell.spellEntryId] ?? configuredSpell.freeUses,
					freeUses: configuredSpell.freeUses,
					canUseExistingSlots: configuredSpell.canUseExistingSlots,
					recovery:
						grant.freeCastsRecoveries?.[configuredSpell.spellEntryId] ?? configuredSpell.recovery,
					campaignConfigured: true,
					sourceKind: 'feat',
					freeCastsMax:
						configuredSpell.freeUses > 0
							? (grant.freeCastsMaxOverrides?.[configuredSpell.spellEntryId] ??
								configuredSpell.freeUses)
							: 0,
					defaultFreeCasts: configuredSpell.freeUses
				},
				virtualIndex--
			);
		}
	}
	for (const grant of speciesGrants.filter((item) => item.active)) {
		addGrantedSpell(
			result,
			entries,
			label,
			{
				id: grant.id,
				featId: grant.featureId,
				featName: `${grant.speciesId} · ${grant.lineageId}`,
				spellEntryId: grant.spellEntryId,
				ability: grant.spellcastingAbility ?? speciesSpellcastingAbility,
				freeCastsRemaining: grant.freeCastsRemaining,
				freeUses: grant.defaultFreeCasts,
				canUseExistingSlots: grant.canUseExistingSlots,
				recovery: grant.freeCastsRecovery ?? 'long',
				campaignConfigured: false,
				sourceKind: 'species',
				freeCastsMax: grant.freeCastsMax,
				defaultFreeCasts: grant.defaultFreeCasts
			},
			virtualIndex--
		);
	}
	for (const grant of featureGrants) {
		const compendium = entries.find(
			(entry) => entry.id === grant.spellEntryId && entry.entryType === 'spell'
		);
		if (!compendium) continue;
		const level = Number(compendium.rules.level);
		if (!Number.isInteger(level) || level < 0 || level > 9) continue;
		const displayName = label(compendium);
		const existing = result.find(
			({ spell }) =>
				spell.entryId === compendium.id ||
				[compendium.name, displayName].some(
					(name) => normalizeSpellName(spell.name) === normalizeSpellName(name)
				)
		);
		if (existing) {
			existing.featureGrants = [...(existing.featureGrants ?? []), grant];
			existing.origins = [...new Set<SpellOrigin>([...(existing.origins ?? []), 'feature'])];
			continue;
		}
		result.push({
			spell: {
				entryId: compendium.id,
				name: displayName,
				level,
				notes: '',
				description: String(compendium.rules.description ?? compendium.summary ?? ''),
				origin: 'feature'
			},
			index: virtualIndex,
			key: `feature:${grant.featureId}:${grant.spellEntryId}`,
			featureGrants: [grant],
			origins: ['feature']
		});
		virtualIndex--;
	}
	return result;
}

/** Reads only the declarative spell-grant shape; arbitrary Compendium data is never executed. */
export function deriveFeatureSpellGrants(
	classEntry: CompendiumEntry | undefined,
	subclassEntry: CompendiumEntry | undefined,
	classLevel: number,
	locale = 'en',
	spellEntries: readonly CompendiumEntry[]
): FeatureSpellGrant[] {
	if (!Number.isInteger(classLevel) || classLevel < 1) return [];
	const results: FeatureSpellGrant[] = [];
	for (const entry of [classEntry, subclassEntry]) {
		if (!entry || !['class', 'subclass'].includes(entry.entryType)) continue;
		if (!Array.isArray(entry.rules.features)) continue;
		entry.rules.features.forEach((rawFeature, index) => {
			if (!rawFeature || typeof rawFeature !== 'object' || Array.isArray(rawFeature)) return;
			const feature = rawFeature as Record<string, unknown>;
			const unlockLevel = Number(feature.level);
			if (!Number.isInteger(unlockLevel) || unlockLevel < 1 || unlockLevel > classLevel) return;
			const originalFeatureName = String(feature.name ?? '').trim();
			if (!originalFeatureName) return;
			const featureName = translatedCompendiumText(
				entry,
				`rules.features.${index}.name`,
				originalFeatureName,
				locale
			);
			const featureId = String(feature.id ?? `${entry.id}:feature:${index}`);
			for (const spellEntryId of featureSpellGrantIds(feature.grants)) {
				if (!spellEntries.some((spell) => spell.entryType === 'spell' && spell.id === spellEntryId))
					continue;
				const spell = spellEntries.find(
					(candidate) => candidate.entryType === 'spell' && candidate.id === spellEntryId
				);
				if (!spell) continue;
				const spellLevel = Number(spell.rules.level);
				if (!Number.isInteger(spellLevel) || spellLevel < 0 || spellLevel > 9) continue;
				results.push({
					featureEntryId: entry.id,
					featureId,
					featureName,
					spellEntryId,
					spellName: translatedCompendiumText(spell, 'name', spell.name, locale),
					spellLevel,
					level: unlockLevel
				});
			}
		});
	}
	return results.filter(
		(grant, index) =>
			results.findIndex(
				(item) =>
					item.featureEntryId === grant.featureEntryId &&
					item.featureId === grant.featureId &&
					item.spellEntryId === grant.spellEntryId
			) === index
	);
}

function addGrantedSpell(
	result: SpellCircleEntry[],
	entries: readonly CompendiumEntry[],
	label: (entry: CompendiumEntry) => string,
	grant: SpellFeatGrantProjection,
	virtualIndex: number
) {
	const compendium = entries.find(
		(entry) => entry.id === grant.spellEntryId && entry.entryType === 'spell'
	);
	if (!compendium) return;
	const displayName = label(compendium);
	const level = Number(compendium.rules.level);
	if (!Number.isInteger(level) || level < 0 || level > 9) return;
	const existing = result.find(
		({ spell }) =>
			spell.entryId === compendium.id ||
			[compendium.name, displayName].some(
				(name) => normalizeSpellName(spell.name) === normalizeSpellName(name)
			)
	);
	if (existing) {
		existing.featGrants = [...(existing.featGrants ?? []), grant];
		existing.origins = [...new Set([...(existing.origins ?? []), grant.sourceKind])];
		return;
	}
	result.push({
		spell: {
			entryId: compendium.id,
			name: displayName,
			level,
			notes: '',
			description: String(compendium.rules.description ?? compendium.summary ?? ''),
			origin: grant.sourceKind
		},
		index: virtualIndex,
		key: `${grant.sourceKind}:${grant.id}:${grant.spellEntryId}`,
		featGrants: [grant],
		origins: [grant.sourceKind]
	});
}

export function groupCharacterSpellsByCircle(
	entries: readonly SpellCircleEntry[],
	circle: number
): SpellCircleEntry[] {
	return entries.filter(({ spell }) => spell.level === circle);
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
	entryLabel: string,
	locale = 'en'
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
	const school = spellSchoolLabel(rules.school ?? '', locale);
	return [
		...spells,
		{
			entryId: entry.id,
			name: entryLabel,
			level: Number.isFinite(level) && level >= 0 ? level : circle,
			notes: `SRD · ${school}${rules.range ? ` · ${String(rules.range)}` : ''}`,
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
