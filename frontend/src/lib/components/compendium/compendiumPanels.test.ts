import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import CompendiumEntryDetails from './CompendiumEntryDetails.svelte';
import CompendiumEntryEditor from './CompendiumEntryEditor.svelte';
import CompendiumCatalogPanel from './CompendiumCatalogPanel.svelte';
import { emptyCompendiumEditorModel } from '$lib/utils/compendium/compendiumRules';
import { setAppLocale } from '$lib/stores/locale';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import {
	emptyCampaignFeatSpellRuleDraft,
	type CampaignFeatSpellRuleDraft
} from '$lib/utils/compendium/campaignFeatSpellRule';

const monster: CompendiumEntry = {
	id: 'ogre',
	sourceId: 'source',
	entryType: 'other',
	name: 'Ogre',
	summary: 'A large creature.',
	rules: { kind: 'monster', hpMax: 59, armorClass: 11, challenge: 2 },
	translations: {},
	isPublished: true
};

describe('compendium panels', () => {
	it('shows spell schools and class lists in PT-BR while preserving source data', () => {
		setAppLocale('pt-BR');
		const spellEntry: CompendiumEntry = {
			...monster,
			id: 'fireball',
			entryType: 'spell',
			name: 'Fireball',
			summary: 'A bright streak flashes.',
			rules: {
				level: 3,
				classes: ['wizard', 'Sorcerer', 'Homebrew Adept'],
				school: 'Evocation'
			},
			translations: {},
			isPublished: true
		};
		const view = {
			entry: spellEntry,
			artUrl: '',
			displayName: 'Bola de Fogo',
			displaySummary: spellEntry.summary,
			typeLabel: 'Magia',
			isMonster: false,
			hasMonsterSheet: false,
			sourceReadOnly: true,
			hasPrivateSource: false,
			isGM: false,
			canConfigureFeatSpellRule: false,
			canTranslate: false,
			translationStatus: 'complete' as const,
			canPlace: false,
			translating: false,
			placing: false
		};
		const actions = {
			close: vi.fn(),
			edit: vi.fn(),
			configureFeatSpellRule: vi.fn(),
			remove: vi.fn(),
			translate: vi.fn(),
			copyToCampaign: vi.fn(),
			place: vi.fn()
		};

		const html = render(CompendiumEntryDetails, { props: { view, actions } }).body;

		expect(html).toContain('Evocação');
		expect(html).toContain('Mago, Feiticeiro, Homebrew Adept');
		expect(spellEntry.rules.school).toBe('Evocation');
		expect(spellEntry.rules.classes).toEqual(['wizard', 'Sorcerer', 'Homebrew Adept']);
	});

	it('renders localized class features and feat benefits with source fallback', () => {
		setAppLocale('pt-BR');
		const actions = {
			close: vi.fn(),
			edit: vi.fn(),
			configureFeatSpellRule: vi.fn(),
			remove: vi.fn(),
			translate: vi.fn(),
			copyToCampaign: vi.fn(),
			place: vi.fn()
		};
		const makeView = (entry: CompendiumEntry) => ({
			entry,
			artUrl: '',
			displayName: entry.translations['pt-BR'] ?? entry.name,
			displaySummary: entry.translations['pt-BR.summary'] ?? entry.summary,
			typeLabel: 'Entrada',
			isMonster: false,
			hasMonsterSheet: false,
			sourceReadOnly: true,
			hasPrivateSource: false,
			isGM: false,
			canConfigureFeatSpellRule: false,
			canTranslate: false,
			translationStatus: 'manual' as const,
			canPlace: false,
			translating: false,
			placing: false
		});
		const classEntry: CompendiumEntry = {
			...monster,
			id: 'fighter',
			entryType: 'class',
			name: 'Fighter',
			summary: 'Combat training.',
			rules: {
				hitDie: 10,
				features: [
					{ id: 'second-wind', name: 'Second Wind', level: 1, description: 'Regain hit points.' }
				]
			},
			translations: {
				'pt-BR': 'Guerreiro',
				'pt-BR.rules.features.0.name': 'Segundo Fôlego',
				'pt-BR.rules.features.0.description': 'Recupere pontos de vida.'
			},
			isPublished: true
		};
		const localizedClassHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(classEntry), actions }
		}).body;
		expect(localizedClassHtml).toContain('Segundo Fôlego');
		expect(localizedClassHtml).toContain('Recupere pontos de vida.');
		const fallbackClassHtml = render(CompendiumEntryDetails, {
			props: { view: makeView({ ...classEntry, translations: { 'pt-BR': 'Guerreiro' } }), actions }
		}).body;
		expect(fallbackClassHtml).toContain('Second Wind');
		expect(fallbackClassHtml).toContain('Regain hit points.');

		const featEntry: CompendiumEntry = {
			...monster,
			id: 'alert',
			entryType: 'feat',
			name: 'Alert',
			summary: 'Always ready.',
			rules: { description: 'You are always ready.', benefits: ['Add proficiency to Initiative.'] },
			translations: {
				'pt-BR': 'Alerta',
				'pt-BR.rules.description': 'Você está sempre preparado.',
				'pt-BR.rules.benefits.0': 'Adicione proficiência à Iniciativa.'
			},
			isPublished: true
		};
		const featHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(featEntry), actions }
		}).body;
		expect(featHtml).toContain('Você está sempre preparado.');
		expect(featHtml).toContain('Adicione proficiência à Iniciativa.');

		const magicItem: CompendiumEntry = {
			...monster,
			id: 'bag-of-holding',
			name: 'Bag of Holding',
			summary: 'Item mágico do SRD.',
			rules: {
				catalog: 'magic-item',
				description: 'The bag can hold up to 500 pounds and weighs 5 pounds.'
			},
			translations: {
				'pt-BR': 'Bolsa de Carga',
				'pt-BR.rules.description': 'A bolsa comporta até 227 kg e pesa 2,3 kg.'
			},
			isPublished: true
		};
		const localizedMagicItemHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(magicItem), actions }
		}).body;
		expect(localizedMagicItemHtml).toContain('A bolsa comporta até 227 kg e pesa 2,3 kg.');
		expect(localizedMagicItemHtml).not.toContain('The bag can hold up to 500 pounds');
		const fallbackMagicItemHtml = render(CompendiumEntryDetails, {
			props: {
				view: makeView({ ...magicItem, translations: { 'pt-BR': 'Bolsa de Carga' } }),
				actions
			}
		}).body;
		expect(fallbackMagicItemHtml).toContain(
			'The bag can hold up to 500 pounds and weighs 5 pounds.'
		);

		const weapon: CompendiumEntry = {
			...monster,
			id: 'shortbow',
			entryType: 'item',
			name: 'Shortbow',
			summary: '',
			rules: {
				category: 'Martial Ranged',
				damage: '1d6',
				damageType: 'Piercing',
				properties: ['Ammunition (80/320)', 'Heavy', 'Two-Handed']
			},
			translations: {},
			isPublished: true
		};
		const localizedWeaponHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(weapon), actions }
		}).body;
		expect(localizedWeaponHtml).toContain('Armas Marciais à Distância');
		expect(localizedWeaponHtml).toContain('Munição (80/320), Pesada, Duas Mãos');
		expect(weapon.rules).toEqual({
			category: 'Martial Ranged',
			damage: '1d6',
			damageType: 'Piercing',
			properties: ['Ammunition (80/320)', 'Heavy', 'Two-Handed']
		});

		setAppLocale('en');
		const englishWeaponHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(weapon), actions }
		}).body;
		expect(englishWeaponHtml).toContain('Martial Ranged');
		expect(englishWeaponHtml).toContain('Ammunition (80/320), Heavy, Two-Handed');
		setAppLocale('pt-BR');

		const unknownWeapon: CompendiumEntry = {
			...weapon,
			rules: { ...weapon.rules, category: 'Homebrew Category', properties: ['Custom Property'] }
		};
		const unknownWeaponHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(unknownWeapon), actions }
		}).body;
		expect(unknownWeaponHtml).toContain('Homebrew Category');
		expect(unknownWeaponHtml).toContain('Custom Property');

		const localizedMonster: CompendiumEntry = {
			...monster,
			translations: {
				'pt-BR': 'Ogro',
				'pt-BR.summary': 'Criatura Grande Gigante, Caótico e mau (ND 2).',
				'pt-BR.rules.actions.0.name': 'Tacape',
				'pt-BR.rules.actions.0.description':
					'Jogada de Ataque Corpo a Corpo: +6, alcance 1,5 m Acerto: 13 (2d8 + 4) de dano contundente.'
			},
			rules: {
				catalog: 'monster',
				hpMax: 59,
				armorClass: 11,
				challenge: 2,
				actions: [
					{
						name: 'Greatclub',
						toHit: 6,
						damage: '13 (2d8 + 4) Bludgeoning damage.',
						description: 'Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.'
					}
				]
			}
		};
		const monsterView = {
			...makeView(localizedMonster),
			displayName: 'Ogro',
			isMonster: true
		};
		const localizedMonsterHtml = render(CompendiumEntryDetails, {
			props: { view: monsterView, actions }
		}).body;
		expect(localizedMonsterHtml).toContain('Tacape');
		expect(localizedMonsterHtml).toContain(
			'Jogada de Ataque Corpo a Corpo: +6, alcance 1,5 m Acerto: 13 (2d8 + 4) de dano contundente.'
		);
		expect(localizedMonsterHtml).not.toContain('Melee Attack Roll');
	});

	it('renders localized SRD conditions, species traits and background choices with source fallback', () => {
		setAppLocale('pt-BR');
		const actions = {
			close: vi.fn(),
			edit: vi.fn(),
			configureFeatSpellRule: vi.fn(),
			remove: vi.fn(),
			translate: vi.fn(),
			copyToCampaign: vi.fn(),
			place: vi.fn()
		};
		const condition: CompendiumEntry = {
			...monster,
			id: 'blinded',
			name: 'Blinded',
			summary: 'A blinded creature cannot see.',
			rules: {
				catalog: 'conditions',
				id: 'blinded',
				name: 'Blinded',
				description: 'A blinded creature cannot see.',
				effects: ['Cannot see']
			},
			translations: {
				'pt-BR': 'Cego',
				'pt-BR.summary': 'Uma criatura cega não consegue enxergar.',
				'pt-BR.rules.name': 'Cego',
				'pt-BR.rules.description': 'Uma criatura cega não consegue enxergar.',
				'pt-BR.rules.effects.0': 'Não consegue enxergar.'
			},
			isPublished: true
		};
		const makeView = (entry: CompendiumEntry) => ({
			entry,
			artUrl: '',
			displayName: entry.translations['pt-BR'] ?? entry.name,
			displaySummary: entry.translations['pt-BR.summary'] ?? entry.summary,
			typeLabel: 'Monstro / outro',
			isMonster: false,
			hasMonsterSheet: false,
			sourceReadOnly: true,
			hasPrivateSource: false,
			isGM: false,
			canConfigureFeatSpellRule: false,
			canTranslate: false,
			translationStatus: 'manual' as const,
			canPlace: false,
			translating: false,
			placing: false
		});
		const species: CompendiumEntry = {
			...monster,
			entryType: 'species',
			name: 'Dwarf',
			summary: 'Dwarves endure.',
			rules: {
				size: 'medium',
				speed: 30,
				description: 'Dwarves endure.',
				traits: [
					{ id: 'darkvision-dwarf', name: 'Darkvision', description: 'You see in darkness.' }
				]
			},
			translations: {
				'pt-BR': 'Anão',
				'pt-BR.summary': 'Anões resistem.',
				'pt-BR.rules.description': 'Anões resistem.',
				'pt-BR.rules.traits.0.name': 'Visão no Escuro',
				'pt-BR.rules.traits.0.description': 'Você enxerga no escuro.'
			},
			isPublished: true
		};
		const speciesHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(species), actions }
		}).body;
		expect(speciesHtml).toContain('Visão no Escuro');
		expect(speciesHtml).toContain('Você enxerga no escuro.');
		const fallbackSpeciesHtml = render(CompendiumEntryDetails, {
			props: { view: makeView({ ...species, translations: { 'pt-BR': 'Anão' } }), actions }
		}).body;
		expect(fallbackSpeciesHtml).toContain('Darkvision');
		expect(fallbackSpeciesHtml).toContain('You see in darkness.');

		const background: CompendiumEntry = {
			...monster,
			entryType: 'background',
			name: 'Farmer',
			summary: 'You grew up close to the land.',
			rules: {
				description: 'You grew up close to the land.',
				abilityScoreIncreases: { options: ['str', 'con', 'wis'], points: 3 },
				skillProficiencies: ['Animal Handling', 'Nature'],
				toolProficiency: "Carpenter's Tools",
				startingEquipment: ['Sickle', "Carpenter's Tools"],
				feat: 'Tough'
			},
			translations: {
				'pt-BR': 'Fazendeiro',
				'pt-BR.rules.description': 'Você cresceu perto da terra.',
				'pt-BR.rules.skillProficiencies.0': 'Adestrar Animais',
				'pt-BR.rules.skillProficiencies.1': 'Natureza',
				'pt-BR.rules.toolProficiency': 'Ferramentas de Carpinteiro',
				'pt-BR.rules.startingEquipment.0': 'Foice',
				'pt-BR.rules.startingEquipment.1': 'Ferramentas de Carpinteiro',
				'pt-BR.rules.feat': 'Robusto'
			},
			isPublished: true
		};
		const backgroundHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(background), actions }
		}).body;
		for (const label of [
			'Você cresceu perto da terra.',
			'Força',
			'Constituição',
			'Sabedoria',
			'Adestrar Animais',
			'Ferramentas de Carpinteiro',
			'Foice',
			'Robusto'
		]) {
			expect(backgroundHtml).toContain(label);
		}
		const localizedHtml = render(CompendiumEntryDetails, {
			props: { view: makeView(condition), actions }
		}).body;
		expect(localizedHtml).toContain('Cego');
		expect(localizedHtml).toContain('Não consegue enxergar.');
		const fallbackHtml = render(CompendiumEntryDetails, {
			props: { view: makeView({ ...condition, translations: { 'pt-BR': 'Cego' } }), actions }
		}).body;
		expect(fallbackHtml).toContain('Cannot see');
		expect(fallbackHtml).toContain('A blinded creature cannot see.');
	});

	it('shows per-entry pending, AI and official translation states in the catalog', () => {
		const entries: CompendiumEntry[] = [
			{ ...monster, id: 'pending', name: 'Pending Ogre', summary: '', rules: {}, translations: {} },
			{
				...monster,
				id: 'ai',
				name: 'Ogre',
				summary: '',
				rules: {},
				translations: { 'pt-BR': 'Ogro', 'pt-BR.source': 'ai' }
			},
			{
				...monster,
				id: 'official',
				name: 'Ogre',
				summary: '',
				rules: {},
				translations: { 'pt-BR': 'Ogro', 'pt-BR.source': 'official' }
			}
		];
		const html = render(CompendiumCatalogPanel, {
			props: {
				section: 'entries',
				entries,
				sources: [],
				filters: { query: '', entryType: 'all', sourceId: 'all', sortMode: 'name' },
				selectedEntryId: null,
				loading: false,
				displayName: (entry) => entry.translations['pt-BR'] ?? entry.name,
				typeName: (type) => type,
				sourceKindLabel: () => 'SRD',
				isMonster: () => false,
				hasMonsterSheet: () => false,
				onselect: vi.fn()
			}
		}).body;
		expect(html).toContain('Pendente');
		expect(html).toContain('Tradução IA');
		expect(html).toContain('Oficial');
	});

	it('renders only one page of compendium entries at a time', () => {
		const entries = Array.from({ length: 75 }, (_, index) => ({
			...monster,
			id: `entry-${index}`,
			name: `Entry ${index}`,
			translations: {}
		}));
		const html = render(CompendiumCatalogPanel, {
			props: {
				section: 'entries',
				entries,
				sources: [],
				filters: { query: '', entryType: 'other', sourceId: 'all', sortMode: 'name' },
				selectedEntryId: null,
				loading: false,
				displayName: (entry) => entry.name,
				typeName: (type) => type,
				sourceKindLabel: () => 'SRD',
				isMonster: () => false,
				hasMonsterSheet: () => false,
				onselect: vi.fn()
			}
		}).body;

		expect(html).toContain('1–50');
		expect(html).toContain('75');
		expect(html).toContain('Entry 0');
		expect(html).not.toContain('Entry 74');
	});

	it('shows monster management and token actions to the GM, but not to a player', () => {
		const view = {
			entry: monster,
			artUrl: '',
			displayName: 'Ogre',
			displaySummary: monster.summary,
			typeLabel: 'Monstro / outro',
			isMonster: true,
			hasMonsterSheet: true,
			sourceReadOnly: false,
			hasPrivateSource: true,
			isGM: true,
			canConfigureFeatSpellRule: false,
			canTranslate: true,
			translationStatus: 'pending' as const,
			canPlace: true,
			translating: false,
			placing: false
		};
		const actions = {
			close: vi.fn(),
			edit: vi.fn(),
			configureFeatSpellRule: vi.fn(),
			remove: vi.fn(),
			translate: vi.fn(),
			copyToCampaign: vi.fn(),
			place: vi.fn()
		};
		const gmHtml = render(CompendiumEntryDetails, { props: { view, actions } }).body;
		const playerHtml = render(CompendiumEntryDetails, {
			props: { view: { ...view, isGM: false, canTranslate: false }, actions }
		}).body;
		expect(gmHtml).toContain('Editar entrada privada');
		expect(gmHtml).toContain('Excluir');
		expect(gmHtml).toContain('Traduzir campos pendentes');
		expect(gmHtml).toContain('Há campos em português pendentes');
		expect(gmHtml).toContain('Adicionar à cena');
		expect(playerHtml).not.toContain('Editar entrada privada');
		expect(playerHtml).not.toContain('Excluir');
		expect(playerHtml).not.toContain('Traduzir campos pendentes');
		expect(playerHtml).not.toContain('Adicionar à cena');
		const platformOwnerHtml = render(CompendiumEntryDetails, {
			props: { view: { ...view, isGM: false, canTranslate: true }, actions }
		}).body;
		expect(platformOwnerHtml).toContain('Traduzir campos pendentes');
		expect(platformOwnerHtml).not.toContain('Editar entrada privada');
		expect(platformOwnerHtml).not.toContain('Excluir');
		expect(platformOwnerHtml).not.toContain('Adicionar à cena');
		const readonlyHtml = render(CompendiumEntryDetails, {
			props: { view: { ...view, sourceReadOnly: true }, actions }
		}).body;
		expect(readonlyHtml).not.toContain('Editar entrada privada');
		expect(readonlyHtml).not.toContain('Excluir');
		expect(readonlyHtml).toContain('Copiar para a mesa e vincular imagem');
	});

	it('labels completed AI and official translations and hides the action when no fields remain', () => {
		const view = {
			entry: { ...monster, translations: { 'pt-BR': 'Ogro', 'pt-BR.source': 'ai' } },
			artUrl: '',
			displayName: 'Ogro',
			displaySummary: monster.summary,
			typeLabel: 'Monstro',
			isMonster: true,
			hasMonsterSheet: true,
			sourceReadOnly: true,
			hasPrivateSource: false,
			isGM: true,
			canConfigureFeatSpellRule: false,
			canTranslate: false,
			translationStatus: 'ai' as const,
			canPlace: false,
			translating: false,
			placing: false
		};
		const actions = {
			close: vi.fn(),
			edit: vi.fn(),
			configureFeatSpellRule: vi.fn(),
			remove: vi.fn(),
			translate: vi.fn(),
			copyToCampaign: vi.fn(),
			place: vi.fn()
		};
		const aiHtml = render(CompendiumEntryDetails, { props: { view, actions } }).body;
		expect(aiHtml).toContain('Tradução livre (IA)');
		expect(aiHtml).not.toContain('Traduzir campos pendentes');
		const officialHtml = render(CompendiumEntryDetails, {
			props: {
				view: {
					...view,
					entry: { ...monster, translations: { 'pt-BR': 'Ogro', 'pt-BR.source': 'official' } },
					translationStatus: 'official' as const
				},
				actions
			}
		}).body;
		expect(officialHtml).toContain('Tradução oficial');
	});

	it('does not render the editor for a player', () => {
		const props = {
			model: emptyCompendiumEditorModel(),
			sources: [],
			typeName: (value: string) => value,
			isGM: true,
			editing: false,
			busy: { saving: false, importing: false, uploadingArt: false },
			actions: {
				save: vi.fn(),
				cancel: vi.fn(),
				downloadTemplate: vi.fn(),
				importFile: vi.fn(),
				uploadArt: vi.fn(),
				addFeature: vi.fn(),
				removeFeature: vi.fn(),
				saveCampaignFeatRule: vi.fn(),
				closeCampaignFeatRule: vi.fn()
			}
		};
		const gmHtml = render(CompendiumEntryEditor, { props }).body;
		const playerHtml = render(CompendiumEntryEditor, { props: { ...props, isGM: false } }).body;
		expect(gmHtml).toContain('Cadastro privado estruturado');
		expect(gmHtml).toContain('Importar');
		expect(playerHtml).not.toContain('Cadastro privado estruturado');
		expect(playerHtml).not.toContain('Importar');
	});

	it('offers structured campaign-scoped spell mapping only to the GM', () => {
		const feat: CompendiumEntry = {
			...monster,
			id: 'feat-id',
			entryType: 'feat',
			name: 'Magic Initiate',
			rules: {}
		};
		const draft = emptyCampaignFeatSpellRuleDraft();
		const campaignDraft: CampaignFeatSpellRuleDraft = {
			...draft,
			spells: [
				{
					draftId: 'row-1',
					spellEntryId: 'spell-id',
					canUseExistingSlots: false,
					freeUses: 1,
					recovery: 'long',
					abilityOptions: []
				}
			]
		};
		const props = {
			model: emptyCompendiumEditorModel(),
			sources: [],
			typeName: (value: string) => value,
			isGM: true,
			editing: false,
			busy: { saving: false, importing: false, uploadingArt: false },
			campaignFeatRuleEntry: feat,
			campaignFeatRuleDraft: campaignDraft,
			spellEntries: [
				{
					...monster,
					id: 'spell-id',
					entryType: 'spell',
					name: 'Detect Magic',
					rules: { level: 1 }
				}
			],
			actions: {
				save: vi.fn(),
				cancel: vi.fn(),
				downloadTemplate: vi.fn(),
				importFile: vi.fn(),
				uploadArt: vi.fn(),
				addFeature: vi.fn(),
				removeFeature: vi.fn(),
				saveCampaignFeatRule: vi.fn(),
				closeCampaignFeatRule: vi.fn()
			}
		};
		const gmHtml = render(CompendiumEntryEditor, { props }).body;
		const playerHtml = render(CompendiumEntryEditor, { props: { ...props, isGM: false } }).body;
		expect(gmHtml).toContain('Magias concedidas por');
		expect(gmHtml).toContain('Magia do compêndio');
		expect(gmHtml).toContain('Pode usar espaços existentes');
		expect(gmHtml).toContain('Conjurações gratuitas');
		expect(gmHtml).toContain('Descanso longo');
		expect(playerHtml).not.toContain('REGRA ESPECÍFICA DA CAMPANHA');
	});
});
