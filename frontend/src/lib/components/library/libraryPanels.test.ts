import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import LibraryAccessDialog from './LibraryAccessDialog.svelte';
import LibraryAssetsPanel from './LibraryAssetsPanel.svelte';
import LibraryHandoutsPanel from './LibraryHandoutsPanel.svelte';
import LibraryPresentationStatus from './LibraryPresentationStatus.svelte';
import type { LibraryAsset, LibraryHandout } from './libraryTypes';

const asset: LibraryAsset = {
	name: 'mapa.png',
	path: 'campaigns/c1/media/mapa.png',
	url: 'https://assets.example/mapa.png',
	type: 'image'
};
const handout: LibraryHandout = { id: 'n1', title: 'Bilhete', body: 'Texto', visibility: 'gm' };
const assetActions = {
	changeFilter: () => {},
	upload: () => {},
	changeAudioSettings: () => {},
	delete: () => {},
	manageAccess: () => {},
	present: () => {}
};
const handoutActions = {
	edit: () => {},
	delete: () => {},
	manageAccess: () => {},
	save: () => {},
	changeTitle: () => {},
	changeBody: () => {},
	changeAudience: () => {},
	toggleUser: () => {}
};

describe('library panels role controls', () => {
	it('renders asset upload, delete, access, and presentation controls for a GM only', () => {
		const props = {
			assets: [asset],
			isGM: true,
			filter: 'all' as const,
			uploading: false,
			deletingAsset: null,
			changingAudioKind: null,
			actions: assetActions
		};
		const gmHtml = render(LibraryAssetsPanel, { props }).body;
		const playerHtml = render(LibraryAssetsPanel, { props: { ...props, isGM: false } }).body;
		expect(gmHtml).toContain('Adicionar mídia');
		expect(gmHtml).toContain('Gerenciar acesso a mapa.png');
		expect(gmHtml).toContain('Exibir mapa.png para a mesa');
		expect(playerHtml).not.toContain('Adicionar mídia');
		expect(playerHtml).not.toContain('Excluir mapa.png');
		expect(playerHtml).not.toContain('Gerenciar acesso a mapa.png');
		expect(playerHtml).not.toContain('Exibir mapa.png para a mesa');
	});

	it('renders handout editing and deletion controls for a GM only', () => {
		const props = {
			handouts: [handout],
			isGM: true,
			editor: {
				open: true,
				title: '',
				body: '',
				audience: 'all' as const,
				userIds: [],
				saving: false,
				participants: []
			},
			actions: handoutActions
		};
		const gmHtml = render(LibraryHandoutsPanel, { props }).body;
		const playerHtml = render(LibraryHandoutsPanel, { props: { ...props, isGM: false } }).body;
		expect(gmHtml).toContain('Salvar handout');
		expect(gmHtml).toContain('Acesso');
		expect(gmHtml).toContain('Excluir');
		expect(playerHtml).not.toContain('Salvar handout');
		expect(playerHtml).not.toContain('Acesso');
		expect(playerHtml).not.toContain('Excluir');
	});

	it('does not render the permission dialog or its save action for a player', () => {
		const props = {
			model: {
				kind: 'access' as const,
				label: 'Mapa secreto',
				loading: false,
				saving: false,
				restricted: true,
				selectedUserIds: [],
				participants: []
			},
			actions: {
				close: () => {},
				setRestricted: () => {},
				toggleUser: () => {},
				setOverlayVisible: () => {},
				saveAccess: () => {},
				confirmPresentation: () => {}
			},
			isGM: true
		};
		const gmHtml = render(LibraryAccessDialog, { props }).body;
		const playerHtml = render(LibraryAccessDialog, { props: { ...props, isGM: false } }).body;
		expect(gmHtml).toContain('Mapa secreto');
		expect(gmHtml).toContain('Salvar acesso');
		expect(playerHtml).not.toContain('Mapa secreto');
		expect(playerHtml).not.toContain('Salvar acesso');
	});

	it('groups all media into audio, visual, and optional document sections while preserving audio lists', () => {
		const props = {
			assets: [
				{ ...asset, type: 'audio' as const, path: 'song.mp3', name: 'Trilha.mp3' },
				asset,
				{ ...asset, type: 'map' as const, path: 'map.png', name: 'Mapa.png' },
				{ ...asset, type: 'document' as const, path: 'note.pdf', name: 'Nota.pdf' }
			],
			isGM: false,
			filter: 'all' as const,
			uploading: false,
			deletingAsset: null,
			changingAudioKind: null,
			actions: assetActions
		};
		const allHtml = render(LibraryAssetsPanel, { props }).body;
		expect(allHtml).toContain('Músicas e efeitos');
		expect(allHtml).toContain('Imagens e mapas');
		expect(allHtml).toContain('Documentos');
		const audioHtml = render(LibraryAssetsPanel, { props: { ...props, filter: 'audio' } }).body;
		expect(audioHtml).toContain('audio-list');
		expect(audioHtml).toContain('Trilha.mp3');
		expect(audioHtml).not.toContain('Imagens e mapas');
	});

	it('shows current presentation source state and offers hide only when media is active', () => {
		const onhide = () => {};
		const inactive = render(LibraryPresentationStatus, {
			props: { active: false, name: '', audience: '', overlayVisible: false, onhide }
		}).body;
		expect(inactive).toContain('Nenhuma mídia em exibição');
		expect(inactive).not.toContain('Ocultar mídia');
		const active = render(LibraryPresentationStatus, {
			props: {
				active: true,
				name: 'Magia de luz',
				audience: 'Todos os jogadores',
				overlayVisible: false,
				onhide
			}
		}).body;
		expect(active).toContain('Magia de luz');
		expect(active).toContain('Todos os jogadores');
		expect(active).toContain('oculta');
		expect(active).toContain('Ocultar mídia');
	});
});
