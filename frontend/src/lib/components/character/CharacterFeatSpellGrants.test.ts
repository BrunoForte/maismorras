import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import CharacterFeatSpellGrants from './CharacterFeatSpellGrants.svelte';

const feat: CompendiumEntry = {
	id: 'magic-initiate',
	sourceId: 'srd',
	entryType: 'feat',
	name: 'Magic Initiate',
	summary: '',
	rules: { id: 'magic-initiate' },
	translations: {},
	isPublished: true
};

describe('CharacterFeatSpellGrants', () => {
	it('offers only reviewed mappings and explains that no additional slots are granted', () => {
		const html = render(CharacterFeatSpellGrants, {
			props: {
				feats: ['Magic Initiate'],
				featEntries: [feat],
				spellEntries: [],
				grants: [],
				optionLabel: (entry) => entry.name,
				onChange: vi.fn()
			}
		}).body;
		expect(html).toContain('Magias concedidas por talentos');
		expect(html).toContain('Mapear Iniciado em Magia');
		expect(html).toContain('não adiciona espaços de magia');
	});

	it('renders the repeatable spell choices and current server-reported free-use count', () => {
		const html = render(CharacterFeatSpellGrants, {
			props: {
				feats: ['Magic Initiate'],
				featEntries: [feat],
				spellEntries: [],
				grants: [
					{
						id: 'grant-1',
						featId: 'magic-initiate',
						spellList: 'wizard',
						ability: 'intelligence',
						cantripEntryIds: ['', ''],
						firstLevelSpellEntryId: '',
						freeCastsRemaining: 0,
						active: true
					}
				],
				optionLabel: (entry) => entry.name,
				onChange: vi.fn()
			}
		}).body;
		expect(html).toContain('Truque 1');
		expect(html).toContain('Truque 2');
		expect(html).toContain('Magia de 1º círculo');
		expect(html).toContain('0/1');
		expect(html).toContain('Descanso Longo');
	});
});
