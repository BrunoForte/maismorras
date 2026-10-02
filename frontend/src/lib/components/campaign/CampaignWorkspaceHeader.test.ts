import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import CampaignWorkspaceHeader from './CampaignWorkspaceHeader.svelte';

const common = {
	scenes: [
		{ id: 'scene-1', name: 'Floresta' },
		{ id: 'scene-2', name: 'Ruínas' }
	],
	activeSceneId: 'scene-1',
	email: 'jogador@example.test',
	activeTab: 'map' as const,
	creatingScene: false,
	sceneCreatorOpen: false,
	sceneDraft: '',
	onreturntocampaigns: vi.fn(),
	onsceneselect: vi.fn(),
	ontogglescenecreator: vi.fn(),
	onscenedraftchange: vi.fn(),
	oncreatescene: vi.fn(),
	onopenscenesettings: vi.fn(),
	onpublishscenetooverlay: vi.fn(),
	ontabchange: vi.fn(),
	onlanguagechange: vi.fn(),
	onlogout: vi.fn()
};

describe('CampaignWorkspaceHeader', () => {
	it('shows campaign hub context, account controls, and language labels when no campaign is active', () => {
		const html = render(CampaignWorkspaceHeader, {
			props: { ...common, campaign: null, locale: 'pt-BR' }
		}).body;

		expect(html).toContain('MaisMorras');
		expect(html).toContain('Central de campanhas');
		expect(html).toContain('jogador@example.test');
		expect(html).toContain('Idioma');
		expect(html).not.toContain('Áreas da mesa');
	});

	it('shows the GM navigation and scene controls in English', () => {
		const html = render(CampaignWorkspaceHeader, {
			props: {
				...common,
				campaign: { name: 'Aventura', role: 'gm' },
				locale: 'en',
				sceneCreatorOpen: true,
				creatingScene: true,
				sceneDraft: 'New encounter'
			}
		}).body;

		expect(html).toContain('ACTIVE TABLE');
		expect(html).toContain('Game Master');
		expect(html).toContain('Bestiary');
		expect(html).toContain('Campaign');
		expect(html).toContain('Select scene');
		expect(html).toContain('Creating…');
		expect(html).toContain('New encounter');
		expect(html.match(/id="header-scene-select"/g)).toHaveLength(1);
		expect(html).not.toContain('id="scene-select"');
	});

	it('hides GM-only navigation and scene actions from players', () => {
		const html = render(CampaignWorkspaceHeader, {
			props: { ...common, campaign: { name: 'Aventura', role: 'player' }, locale: 'pt-BR' }
		}).body;

		expect(html).toContain('Jogador');
		expect(html).toContain('Áreas da mesa');
		expect(html).toContain('Mídias');
		expect(html).not.toContain('Bestiário');
		expect(html).not.toContain('Campanha</button>');
		expect(html).not.toContain('Criar cena');
		expect(html).not.toContain('Configurar cena');
		expect(html).toContain('Enviar cena atual para a overlay');
	});

	it('does not invoke parent actions while rendering', () => {
		render(CampaignWorkspaceHeader, {
			props: { ...common, campaign: { name: 'Aventura', role: 'gm' }, locale: 'pt-BR' }
		});
		expect(common.onsceneselect).not.toHaveBeenCalled();
		expect(common.oncreatescene).not.toHaveBeenCalled();
		expect(common.onlogout).not.toHaveBeenCalled();
	});
});
