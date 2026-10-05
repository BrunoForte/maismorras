import type { Dnd2024FeatSpellGrant } from '$lib/services/characterApi';
import type { CompendiumEntry } from '$lib/services/compendiumApi';

/** Reviewed spell-grant rules for D&D 2024 feats present in SRD 5.2.1. */
export const DND2024_FEAT_SPELL_RULES = {
	'magic-initiate': {
		name: 'Magic Initiate',
		localizedNames: ['Magic Initiate', 'Iniciado em Magia'],
		spellLists: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
		cantripCount: 2,
		firstLevelSpellLevel: 1,
		spellcastingAbilities: ['intelligence', 'wisdom', 'charisma'] as const,
		freeCasts: 1,
		recovery: 'long' as const,
		canUseExistingSlots: true
	}
} as const;

export type Dnd2024MappedFeatID = keyof typeof DND2024_FEAT_SPELL_RULES;
export type Dnd2024FeatSpellDraft = Omit<Dnd2024FeatSpellGrant, 'freeCastsRemaining' | 'active'> & {
	freeCastsRemaining?: number;
	active?: boolean;
};

export function normalizeDndFeatKey(value: string): string {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('pt-BR');
}

export function dnd2024FeatSpellRule(featId: string) {
	return Object.prototype.hasOwnProperty.call(DND2024_FEAT_SPELL_RULES, featId)
		? DND2024_FEAT_SPELL_RULES[featId as Dnd2024MappedFeatID]
		: undefined;
}

export function eligibleDnd2024FeatSpells(
	entries: readonly CompendiumEntry[],
	spellList: string,
	level: number,
	excludedEntryIds: readonly string[] = []
): CompendiumEntry[] {
	const normalizedList = normalizeDndFeatKey(spellList);
	const excluded = new Set(excludedEntryIds.filter(Boolean));
	return entries.filter((entry) => {
		if (
			entry.entryType !== 'spell' ||
			Number(entry.rules.level) !== level ||
			excluded.has(entry.id)
		)
			return false;
		const classes = Array.isArray(entry.rules.classes)
			? entry.rules.classes.map((value) => normalizeDndFeatKey(String(value)))
			: [];
		return classes.includes(normalizedList);
	});
}

export function isDnd2024MagicInitiate(entry: CompendiumEntry): boolean {
	return entry.entryType === 'feat' && entry.rules.id === 'magic-initiate';
}

export function newMagicInitiateGrant(): Dnd2024FeatSpellGrant {
	return {
		id: crypto.randomUUID(),
		featId: 'magic-initiate',
		spellList: 'wizard',
		ability: 'intelligence',
		cantripEntryIds: Array.from(
			{ length: DND2024_FEAT_SPELL_RULES['magic-initiate'].cantripCount },
			() => ''
		),
		firstLevelSpellEntryId: '',
		freeCastsRemaining: 1
	};
}

export function availableDndFeatSpellLists(
	grants: readonly Dnd2024FeatSpellGrant[],
	featId: string,
	currentGrantId: string
): string[] {
	const rule = dnd2024FeatSpellRule(featId);
	if (!rule) return [];
	const used = new Set(
		grants
			.filter(
				(grant) => grant.id !== currentGrantId && grant.featId === featId && grant.active !== false
			)
			.map((grant) => normalizeDndFeatKey(grant.spellList))
	);
	return rule.spellLists.filter((spellList) => !used.has(normalizeDndFeatKey(spellList)));
}

/** Deactivates excess mappings when a character removes/reduces a repeatable feat. */
export function synchronizeDndFeatGrantActivation(
	featsText: string,
	grants: readonly Dnd2024FeatSpellGrant[]
): Dnd2024FeatSpellGrant[] {
	const featCounts = new Map<string, number>();
	for (const feat of String(featsText ?? '').split(/[\n,]/)) {
		const key = normalizeDndFeatKey(feat);
		if (key) featCounts.set(key, (featCounts.get(key) ?? 0) + 1);
	}
	const remaining = new Map<string, number>();
	for (const [id, rule] of Object.entries(DND2024_FEAT_SPELL_RULES)) {
		remaining.set(
			id,
			rule.localizedNames.reduce(
				(count, name) => Math.max(count, featCounts.get(normalizeDndFeatKey(name)) ?? 0),
				0
			)
		);
	}
	return grants.map((grant) => {
		if (grant.active === false) return { ...grant, active: false };
		const rule = dnd2024FeatSpellRule(grant.featId);
		const count = rule ? (remaining.get(grant.featId) ?? 0) : 0;
		if (count <= 0) return { ...grant, active: false };
		remaining.set(grant.featId, count - 1);
		return { ...grant, active: true };
	});
}
