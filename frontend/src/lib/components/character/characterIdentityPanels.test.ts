import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterSheet } from '$lib/services/characterApi';
import CharacterClassProgression from './CharacterClassProgression.svelte';
import CharacterCombatProfile from './CharacterCombatProfile.svelte';
import CharacterIdentityFields from './CharacterIdentityFields.svelte';
import CharacterPortraitPanel from './CharacterPortraitPanel.svelte';
import CharacterSpeciesTraits from './CharacterSpeciesTraits.svelte';

const sheet: CharacterSheet = {
	name: 'Ari',
	portraitPath: '',
	class: 'Clérigo',
	subclass: 'Clérigo da Guerra',
	level: 5,
	species: 'Elfo',
	speciesLineage: 'Drow',
	background: 'Acólito',
	alignment: 'Neutro e bom',
	abilityScores: {
		strength: 10,
		dexterity: 14,
		constitution: 12,
		intelligence: 10,
		wisdom: 16,
		charisma: 12
	},
	proficiencyBonus: 3,
	savingThrows: [],
	skillProficiencies: [],
	skillExpertise: [],
	armorClass: 15,
	initiative: 2,
	speed: 9,
	hitPointsCurrent: 30,
	hitPointsMax: 30,
	temporaryHP: 0,
	hitDice: 'd8',
	hitDiceSpent: 1,
	passivePerception: 13,
	attacks: [],
	spells: [],
	features: '',
	feats: '',
	equipment: '',
	inventory: [],
	resources: [],
	spellSlots: []
};

describe('character identity panels', () => {
	it('disables portrait upload and generation while portrait processing is active', () => {
		const html = render(CharacterPortraitPanel, {
			props: {
				locale: 'pt-BR',
				characterName: sheet.name,
				portraitPreview: null,
				portraitBusy: true,
				portraitPrompt: 'uma elfa drow',
				uploadPortrait: vi.fn(),
				generatePortrait: vi.fn()
			}
		}).body;

		expect(html).toContain('Gerando…');
		expect(html).toMatch(/type="file"[^>]*disabled/);
		expect(html).toMatch(/<button[^>]*disabled/);
	});

	it('renders identity, subclass and lineage fields with their available choices', () => {
		const html = render(CharacterIdentityFields, {
			props: {
				locale: 'pt-BR',
				sheet,
				optionsFor: (entryType) =>
					entryType === 'class'
						? [
								{
									id: 'wizard',
									sourceId: 'srd',
									entryType: 'class',
									name: 'Wizard',
									summary: 'A scholarly magic-user.',
									rules: {},
									translations: { 'pt-BR.summary': 'Um usuário de magia estudioso.' },
									isPublished: true
								}
							]
						: [],
				optionLabel: (entry) => entry.name,
				subclassOptions: ['Clérigo da Guerra', 'Clérigo da Vida'],
				lineageOptions: ['Drow', 'Alto Elfo'],
				onClassChanged: vi.fn(),
				onSubclassChanged: vi.fn(),
				onLevelChanged: vi.fn(),
				onSpeciesChanged: vi.fn(),
				onLineageChanged: vi.fn()
			}
		}).body;

		expect(html).toContain('Nome');
		expect(html).toContain('Clérigo da Guerra');
		expect(html).toContain('Linhagem / legado');
		expect(html).toContain('Drow');
		expect(html).toContain('Acólito');
		expect(html).toContain('Um usuário de magia estudioso.');
		expect(html).not.toContain('A scholarly magic-user.');
	});

	it('disables initiative rolling when the character has no linked token', () => {
		const html = render(CharacterCombatProfile, {
			props: {
				locale: 'pt-BR',
				sheet,
				shownSpeed: 9,
				initiativeTokenId: null,
				onSpeedChange: vi.fn(),
				onRollInitiative: vi.fn(),
				onSetInitiativeAdvantage: vi.fn(),
				onSyncToken: vi.fn()
			}
		}).body;

		expect(html).toMatch(/<button[^>]*disabled[^>]*>Rolar iniciativa/);
		expect(html).toContain('Dados de vida');
		expect(html).toContain('4/5');
	});

	it('renders applied species traits and their explanatory text', () => {
		const html = render(CharacterSpeciesTraits, {
			props: {
				locale: 'pt-BR',
				speciesName: 'Elfo',
				lineage: 'Drow',
				baseSpeedLabel: '9 m',
				traits: [{ name: 'Visão no escuro 36 m', description: 'Você enxerga na escuridão.' }]
			}
		}).body;

		expect(html).toContain('Elfo · Drow');
		expect(html).toContain('Visão no escuro 36 m');
		expect(html).toContain('Você enxerga na escuridão.');
	});

	it('renders expanded class progression and specialization choices', () => {
		const html = render(CharacterClassProgression, {
			props: {
				locale: 'pt-BR',
				passivePerception: 15,
				features: [
					{
						id: 'channel-divinity',
						level: 2,
						name: 'Canalizar Divindade',
						description: 'Use um poder divino.'
					}
				],
				expandedFeature: 'channel-divinity',
				expertiseChoices: 1,
				skills: [['Percepção', 'wisdom']],
				skillExpertise: [],
				onExpertiseChoice: vi.fn()
			}
		}).body;

		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('Use um poder divino.');
		expect(html).toContain('Especialização de classe');
		expect(html).toContain('Percepção');
	});
});
