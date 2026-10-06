import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { Dnd2024FeatSpellGrant } from '$lib/services/characterApi';
import {
	availableDndFeatSpellLists,
	DND2024_FEAT_SPELL_RULES,
	dnd2024FeatSpellRule,
	eligibleDnd2024FeatSpells,
	isDnd2024MagicInitiate,
	normalizeDndFeatKey,
	synchronizeCampaignFeatSpellGrants,
	synchronizeDndFeatGrantActivation
} from './dnd2024FeatSpells';

function spell(id: string, level: number, classes: string[]): CompendiumEntry {
	return {
		id,
		sourceId: 'srd',
		entryType: 'spell',
		name: id,
		summary: '',
		rules: { level, classes },
		translations: {},
		isPublished: true
	};
}

function grant(id: string): Dnd2024FeatSpellGrant {
	return {
		id,
		featId: 'magic-initiate',
		spellList: 'wizard',
		ability: 'intelligence',
		cantripEntryIds: [],
		firstLevelSpellEntryId: '',
		freeCastsRemaining: 1
	};
}

describe('D&D 2024 curated feat spell mappings', () => {
	it('keeps Magic Initiate explicit and does not grant additional slots', () => {
		const rule = dnd2024FeatSpellRule('magic-initiate');
		expect(rule).toMatchObject({
			cantripCount: 2,
			firstLevelSpellLevel: 1,
			freeCasts: 1,
			recovery: 'long',
			canUseExistingSlots: true
		});
		expect(rule?.spellLists).toHaveLength(6);
		expect(dnd2024FeatSpellRule('unknown-feat')).toBeUndefined();
		expect(DND2024_FEAT_SPELL_RULES['magic-initiate'].freeCasts).toBe(1);
	});

	it('keeps repeatable Magic Initiate choices on distinct spell lists', () => {
		const first = { ...grant('first'), spellList: 'wizard' };
		const second = { ...grant('second'), spellList: 'cleric' };
		expect(availableDndFeatSpellLists([first, second], 'magic-initiate', 'second')).not.toContain(
			'wizard'
		);
		expect(availableDndFeatSpellLists([first, second], 'magic-initiate', 'second')).toContain(
			'cleric'
		);
		expect(
			availableDndFeatSpellLists([{ ...first, active: false }], 'magic-initiate', 'new')
		).toContain('wizard');
	});

	it('only offers spells matching the selected list and level', () => {
		const choices = [
			spell('wizard-light', 0, ['wizard']),
			spell('wizard-shield', 1, ['wizard']),
			spell('cleric-heal', 1, ['cleric'])
		];
		expect(eligibleDnd2024FeatSpells(choices, 'wizard', 0).map(({ id }) => id)).toEqual([
			'wizard-light'
		]);
		expect(eligibleDnd2024FeatSpells(choices, 'wizard', 1).map(({ id }) => id)).toEqual([
			'wizard-shield'
		]);
		expect(eligibleDnd2024FeatSpells(choices, 'wizard', 0, ['wizard-light'])).toEqual([]);
	});

	it('normalizes localized feat names and identifies only the curated compendium id', () => {
		expect(normalizeDndFeatKey('  INICIADO   em Magia ')).toBe('iniciado em magia');
		expect(
			isDnd2024MagicInitiate({
				...spell('x', 0, []),
				entryType: 'feat',
				rules: { id: 'magic-initiate' }
			})
		).toBe(true);
	});

	it('deactivates removed or excess repeatable feat mappings without dropping usage history', () => {
		const grants = [
			{
				id: 'one',
				featId: 'magic-initiate',
				spellList: 'wizard',
				ability: 'intelligence' as const,
				cantripEntryIds: [],
				firstLevelSpellEntryId: '',
				freeCastsRemaining: 0
			},
			{
				id: 'two',
				featId: 'magic-initiate',
				spellList: 'cleric',
				ability: 'wisdom' as const,
				cantripEntryIds: [],
				firstLevelSpellEntryId: '',
				freeCastsRemaining: 1
			}
		];
		const oneFeat = synchronizeDndFeatGrantActivation('Magic Initiate', grants);
		expect(
			oneFeat.map(({ id, active, freeCastsRemaining }) => ({ id, active, freeCastsRemaining }))
		).toEqual([
			{ id: 'one', active: true, freeCastsRemaining: 0 },
			{ id: 'two', active: false, freeCastsRemaining: 1 }
		]);
		expect(synchronizeDndFeatGrantActivation('', grants).every(({ active }) => !active)).toBe(true);
	});

	it('synchronizes campaign feat grants from explicit rules and preserves only valid choices and uses', () => {
		const configuredFeat: CompendiumEntry = {
			...spell('feat-id', 0, []),
			entryType: 'feat',
			name: 'Adept Arcano',
			translations: { 'pt-BR': 'Adept Arcano' },
			rules: {
				campaignOverrides: {
					featSpellGrant: {
						enabled: true,
						spells: [
							{
								spellEntryId: 'shield',
								canUseExistingSlots: true,
								freeUses: 2,
								recovery: 'long',
								abilityOptions: ['intelligence', 'wisdom']
							}
						]
					}
				}
			}
		};
		const previous = [
			{
				id: 'campaign-feat:feat-id:1',
				featEntryId: 'feat-id',
				active: true,
				spellcastingAbilities: { shield: 'wisdom' as const },
				freeCastsRemaining: { shield: 1 }
			}
		];
		const grants = synchronizeCampaignFeatSpellGrants('Adept Arcano', previous, [configuredFeat]);
		expect(grants).toEqual([{ ...previous[0], active: true }]);
		expect(synchronizeCampaignFeatSpellGrants('', grants, [configuredFeat])[0]).toMatchObject({
			active: false,
			freeCastsRemaining: { shield: 1 }
		});
	});

	it('treats a campaign override as explicit and prevents the hard-coded Magic Initiate mapping from also activating', () => {
		const entry: CompendiumEntry = {
			...spell('magic', 0, []),
			entryType: 'feat',
			name: 'Magic Initiate',
			rules: {
				id: 'magic-initiate',
				campaignOverrides: {
					featSpellGrant: {
						enabled: true,
						spells: [
							{
								spellEntryId: 'wizard-light',
								canUseExistingSlots: false,
								freeUses: 0,
								recovery: 'none',
								abilityOptions: []
							}
						]
					}
				}
			}
		};
		expect(isDnd2024MagicInitiate(entry)).toBe(false);
		const mapped = synchronizeDndFeatGrantActivation('Magic Initiate', [grant('old')], [entry]);
		expect(mapped[0].active).toBe(false);
	});
});
