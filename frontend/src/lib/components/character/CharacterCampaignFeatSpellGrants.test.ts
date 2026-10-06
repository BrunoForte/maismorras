import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import CharacterCampaignFeatSpellGrants from './CharacterCampaignFeatSpellGrants.svelte';

const feat: CompendiumEntry = {
	id: 'feat-arcane',
	sourceId: 'source',
	entryType: 'feat',
	name: 'Adept Arcano',
	summary: '',
	rules: {
		campaignOverrides: {
			featSpellGrant: {
				enabled: true,
				spells: [
					{
						spellEntryId: 'spell-shield',
						canUseExistingSlots: false,
						freeUses: 1,
						recovery: 'long',
						abilityOptions: ['intelligence', 'wisdom']
					}
				]
			}
		}
	},
	translations: {},
	isPublished: true
};
const spell: CompendiumEntry = {
	id: 'spell-shield',
	sourceId: 'source',
	entryType: 'spell',
	name: 'Shield',
	summary: '',
	rules: { level: 1 },
	translations: {},
	isPublished: true
};

describe('campaign-configured feat spell display', () => {
	it('shows only an explicit campaign rule for a feat on the character and exposes permitted ability choices', () => {
		const html = render(CharacterCampaignFeatSpellGrants, {
			props: {
				feats: ['Adept Arcano'],
				featEntries: [feat],
				spellEntries: [spell],
				grants: [
					{
						id: 'campaign-feat:feat-arcane:1',
						featEntryId: feat.id,
						spellcastingAbilities: { [spell.id]: 'wisdom' },
						freeCastsRemaining: { [spell.id]: 0 },
						active: true
					}
				],
				optionLabel: (entry: CompendiumEntry) => entry.name,
				onChange: vi.fn()
			}
		}).body;
		expect(html).toContain('Concedidas por Adept Arcano');
		expect(html).toContain('Shield');
		expect(html).toContain('Sem uso de espaços');
		expect(html).toContain('0/1 usos gratuitos');
		expect(html).toContain('value="wisdom" selected');
		expect(
			render(CharacterCampaignFeatSpellGrants, {
				props: {
					feats: [],
					featEntries: [feat],
					spellEntries: [spell],
					grants: [],
					optionLabel: (entry: CompendiumEntry) => entry.name,
					onChange: vi.fn()
				}
			}).body
		).not.toContain('Concedidas por');
	});
});
