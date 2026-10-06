import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import CompendiumEntryDetails from './CompendiumEntryDetails.svelte';
import CompendiumEntryEditor from './CompendiumEntryEditor.svelte';
import CompendiumCatalogPanel from './CompendiumCatalogPanel.svelte';
import { emptyCompendiumEditorModel } from '$lib/utils/compendium/compendiumRules';
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
			props: { view: { ...view, isGM: false }, actions }
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
