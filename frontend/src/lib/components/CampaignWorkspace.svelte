<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import AmbientAudioPlayer from '$lib/components/AmbientAudioPlayer.svelte';
	import ImagePresentation from '$lib/components/ImagePresentation.svelte';
	import CampaignHub from '$lib/components/CampaignHub.svelte';
	import CampaignWorkspaceHeader from '$lib/components/campaign/CampaignWorkspaceHeader.svelte';
	import CampaignManagementPanel, {
		type CampaignPanelActions
	} from '$lib/components/CampaignManagementPanel.svelte';
	import {
		canAccessWorkspaceTab,
		createInitialCampaignViewState,
		type WorkspaceTab
	} from '$lib/utils/campaignWorkspaceState';
	import { savePresentation } from '$lib/services/presentationApi';
	import { createScene, listScenes, type Scene } from '$lib/services/sceneApi';
	import { personagens } from '$lib/stores/gameStore';
	import { appLocale, setAppLocale } from '$lib/stores/locale';
	import { diceRendererMode } from '$lib/stores/diceOverlayStore';
	import {
		acceptCampaignInvite,
		createCampaign as createCampaignRequest,
		createCampaignInvite,
		deleteCampaign as deleteCampaignRequest,
		listCampaigns,
		renameCampaign as renameCampaignRequest,
		type CampaignSummary
	} from '$lib/services/campaignApi';
	import { getOverlaySettings, saveOverlaySettings } from '$lib/services/overlaySettingsApi';
	import { createOverlayPairing, revokeOverlayAccess } from '$lib/services/overlayPairingApi';
	import { listParticipants, type Participant } from '$lib/services/characterApi';

	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};
	type Props = {
		session: Session;
		installPrompt: InstallPromptEvent | null;
		onlogout: () => void;
		oninstall: () => void;
	};
	let { session, installPrompt, onlogout, oninstall }: Props = $props();
	type CanvasMesaComponentType = typeof import('$lib/components/CanvasMesa.svelte').default;
	let CanvasMesaComponent = $state<CanvasMesaComponentType | null>(null);
	type DiceOverlayComponentType = typeof import('$lib/components/DiceOverlay.svelte').default;
	type CharacterSheetComponentType = typeof import('$lib/components/CharacterSheet.svelte').default;
	type CampaignSheetsComponentType = typeof import('$lib/components/CampaignSheets.svelte').default;
	type LibraryViewComponentType = typeof import('$lib/components/LibraryView.svelte').default;
	type CompendiumViewComponentType = typeof import('$lib/components/CompendiumView.svelte').default;
	type BestiaryViewComponentType = typeof import('$lib/components/BestiaryView.svelte').default;
	type OverlayLayoutEditorComponentType =
		typeof import('$lib/components/OverlayLayoutEditor.svelte').default;
	type ParticipantsPanelComponentType =
		typeof import('$lib/components/ParticipantsPanel.svelte').default;
	type NPCsPanelComponentType = typeof import('$lib/components/NPCsPanel.svelte').default;
	type SceneSettingsComponentType = typeof import('$lib/components/SceneSettings.svelte').default;
	type FloatingChatComponentType = typeof import('$lib/components/FloatingChat.svelte').default;
	type ActorDrawerComponentType = typeof import('$lib/components/ActorDrawer.svelte').default;
	type TableToolsComponentType = typeof import('$lib/components/TableTools.svelte').default;
	let DiceOverlayComponent = $state<DiceOverlayComponentType | null>(null);
	let CharacterSheetComponent = $state<CharacterSheetComponentType | null>(null);
	let CampaignSheetsComponent = $state<CampaignSheetsComponentType | null>(null);
	let LibraryViewComponent = $state<LibraryViewComponentType | null>(null);
	let CompendiumViewComponent = $state<CompendiumViewComponentType | null>(null);
	let BestiaryViewComponent = $state<BestiaryViewComponentType | null>(null);
	let OverlayLayoutEditorComponent = $state<OverlayLayoutEditorComponentType | null>(null);
	let ParticipantsPanelComponent = $state<ParticipantsPanelComponentType | null>(null);
	let NPCsPanelComponent = $state<NPCsPanelComponentType | null>(null);
	let SceneSettingsComponent = $state<SceneSettingsComponentType | null>(null);
	let FloatingChatComponent = $state<FloatingChatComponentType | null>(null);
	let ActorDrawerComponent = $state<ActorDrawerComponentType | null>(null);
	let TableToolsComponent = $state<TableToolsComponentType | null>(null);
	let error = $state('');
	async function ensureMapComponents() {
		const [canvas, dice, table, actor] = await Promise.all([
			import('$lib/components/CanvasMesa.svelte'),
			import('$lib/components/DiceOverlay.svelte'),
			import('$lib/components/TableTools.svelte'),
			import('$lib/components/ActorDrawer.svelte')
		]);
		CanvasMesaComponent ??= canvas.default;
		DiceOverlayComponent ??= dice.default;
		TableToolsComponent ??= table.default;
		ActorDrawerComponent ??= actor.default;
	}
	async function ensureChatComponent() {
		FloatingChatComponent ??= (await import('$lib/components/FloatingChat.svelte')).default;
	}
	async function ensureTabComponent(tab: WorkspaceTab) {
		if (tab === 'sheets')
			CampaignSheetsComponent ??= (await import('$lib/components/CampaignSheets.svelte')).default;
		if (tab === 'library')
			LibraryViewComponent ??= (await import('$lib/components/LibraryView.svelte')).default;
		if (tab === 'compendium')
			CompendiumViewComponent ??= (await import('$lib/components/CompendiumView.svelte')).default;
		if (tab === 'bestiary')
			BestiaryViewComponent ??= (await import('$lib/components/BestiaryView.svelte')).default;
		if (tab === 'overlay')
			OverlayLayoutEditorComponent ??= (await import('$lib/components/OverlayLayoutEditor.svelte'))
				.default;
	}
	async function ensureSheetComponent() {
		CharacterSheetComponent ??= (await import('$lib/components/CharacterSheet.svelte')).default;
	}
	async function ensureDrawerComponents() {
		const [participants, npcs, settings, actor] = await Promise.all([
			import('$lib/components/ParticipantsPanel.svelte'),
			import('$lib/components/NPCsPanel.svelte'),
			import('$lib/components/SceneSettings.svelte'),
			import('$lib/components/ActorDrawer.svelte')
		]);
		ParticipantsPanelComponent ??= participants.default;
		NPCsPanelComponent ??= npcs.default;
		SceneSettingsComponent ??= settings.default;
		ActorDrawerComponent ??= actor.default;
	}
	$effect(() => {
		if (activeCampaign) void ensureChatComponent();
		if (workspaceTab === 'map' && activeScene) void ensureMapComponents();
		if (workspaceTab !== 'map') void ensureTabComponent(workspaceTab);
		if (sheetOpen) void ensureSheetComponent();
		if (participantsOpen || npcsOpen || sceneSettingsOpen) void ensureDrawerComponents();
	});
	type Campaign = CampaignSummary;
	let campaigns = $state<Campaign[]>([]);
	let activeCampaign = $state<Campaign | null>(null);
	let activeScene = $state<Scene | null>(null);
	let campaignName = $state('');
	let campaignSystem = $state<'dnd2024'>('dnd2024');
	let campaignCreateOpen = $state(false);
	let campaignFilter = $state('');
	let campaignSystemFilter = $state<'all' | 'dnd2024'>('all');
	let loadingCampaigns = $state(true);
	let loadingScene = $state(false);
	let sheetOpen = $state(false);
	let editingCharacter = $state<{ id: string; ownerName: string } | null>(null);
	let workspaceTab = $state<WorkspaceTab>('map');
	$effect(() => {
		if (activeCampaign && !canAccessWorkspaceTab(workspaceTab, activeCampaign.role))
			workspaceTab = 'map';
	});
	let sceneRevision = $state(0);
	let inviteStatus = $state('');
	let inviteStatusTimer: number | undefined;
	function showInviteStatus(message: string) {
		if (inviteStatusTimer) window.clearTimeout(inviteStatusTimer);
		inviteStatus = message;
		inviteStatusTimer = window.setTimeout(() => {
			inviteStatus = '';
			inviteStatusTimer = undefined;
		}, 7000);
	}
	let inviteProcessed = false;
	let participantsOpen = $state(false);
	let npcsOpen = $state(false);
	let availableScenes = $state<Scene[]>([]);
	let creatingScene = $state(false);
	let sceneCreatorOpen = $state(false);
	let sceneDraft = $state('');
	let sceneSettingsOpen = $state(false);
	let restoringSession = false;
	type OverlayCamera = {
		url: string;
		playerName: string;
		characterName: string;
		characterId?: string;
		email: string;
	};
	const emptyOverlayCamera = (): OverlayCamera => ({
		url: '',
		playerName: '',
		characterName: '',
		email: ''
	});
	let overlayCameras = $state<OverlayCamera[]>(Array.from({ length: 6 }, emptyOverlayCamera));
	let overlayCharacters = $state<Participant[]>([]);
	let overlayEnabled = $state(false);
	$effect(() => {
		if (overlayCameras.at(-1)?.url.trim())
			overlayCameras = [...overlayCameras, emptyOverlayCamera()];
	});

	onMount(() => {
		void restoreSession(session);
		return () => {
			if (inviteStatusTimer) window.clearTimeout(inviteStatusTimer);
			personagens.set([]);
		};
	});

	async function loadCampaigns(currentSession = session) {
		if (!currentSession) return;
		loadingCampaigns = true;
		error = '';
		try {
			campaigns = await listCampaigns(currentSession);
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not load your tables.'
						: 'Não foi possível carregar as mesas.';
		} finally {
			loadingCampaigns = false;
		}
	}
	async function acceptPendingInvite(currentSession: Session) {
		const code = new URLSearchParams(window.location.search).get('invite');
		if (!code || inviteProcessed) return;
		inviteProcessed = true;
		try {
			const campaign = await acceptCampaignInvite(currentSession, code);
			inviteStatus = `Você entrou em “${campaign.name}”.`;
			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.delete('invite');
			window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
			return campaign;
		} catch (err) {
			inviteStatus =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not accept the invite.'
						: 'Não foi possível aceitar o convite.';
			return null;
		}
	}
	async function restoreSession(currentSession: Session) {
		if (restoringSession) return;
		restoringSession = true;
		try {
			const invitedCampaign = await acceptPendingInvite(currentSession);
			await loadCampaigns(currentSession);
			const requestedCampaignId = new URLSearchParams(window.location.search).get('campaign');
			const requestedSceneId = new URLSearchParams(window.location.search).get('scene');
			const requestedCharacterId = new URLSearchParams(window.location.search).get('character');
			const requestedCampaign =
				invitedCampaign ?? campaigns.find((item) => item.id === requestedCampaignId);
			if (requestedCampaign) {
				await openCampaign(requestedCampaign);
				if (requestedCharacterId) openCharacter(requestedCharacterId, '');
				if (requestedSceneId) {
					const requestedScene = availableScenes.find((item) => item.id === requestedSceneId);
					if (requestedScene) activeScene = requestedScene;
				}
			}
		} finally {
			restoringSession = false;
		}
	}
	async function createInvite() {
		if (!activeCampaign || !session) return;
		try {
			const code = await createCampaignInvite(session, activeCampaign.id);
			const link = `${window.location.origin}/?invite=${code}`;
			await navigator.clipboard.writeText(link);
			showInviteStatus(
				$appLocale === 'en'
					? 'Invite link copied. It expires in 24 hours and can be used by multiple players.'
					: 'Link de convite copiado. Ele expira em 24 horas e pode ser usado por vários jogadores.'
			);
		} catch (err) {
			inviteStatus =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not create the invite.'
						: 'Não foi possível criar o convite.';
		}
	}
	async function createCampaign() {
		if (!campaignName.trim() || !session) return;
		try {
			const campaign = await createCampaignRequest(session, {
				name: campaignName.trim(),
				systemId: campaignSystem
			});
			campaigns = [campaign, ...campaigns];
			campaignName = '';
			campaignCreateOpen = false;
			await openCampaign(campaign);
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not create the table.'
						: 'Não foi possível criar a mesa.';
		}
	}
	async function renameCampaign(campaign: Campaign) {
		if (campaign.role !== 'gm') return;
		const nextName = window.prompt('Novo nome da campanha', campaign.name)?.trim();
		if (!nextName || nextName === campaign.name || !session) return;
		try {
			const normalized = await renameCampaignRequest(session, campaign, nextName);
			campaigns = campaigns.map((item) => (item.id === campaign.id ? normalized : item));
			if (activeCampaign?.id === campaign.id) activeCampaign = normalized;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível renomear a campanha.';
		}
	}
	async function deleteCampaign(campaign: Campaign) {
		if (campaign.role !== 'gm') return;
		if (!window.confirm(`Excluir a campanha “${campaign.name}”? Esta ação não pode ser desfeita.`))
			return;
		if (!session) return;
		try {
			await deleteCampaignRequest(session, campaign.id);
			campaigns = campaigns.filter((item) => item.id !== campaign.id);
			if (activeCampaign?.id === campaign.id) {
				activeCampaign = null;
				activeScene = null;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível excluir a campanha.';
		}
	}
	async function openCampaign(campaign: Campaign) {
		// Tokens pertencem a uma cena. Nunca carregue o estado visual da mesa anterior.
		personagens.set([]);
		const initialView = createInitialCampaignViewState();
		workspaceTab = initialView.tab;
		activeScene = null;
		availableScenes = [];
		sheetOpen = initialView.sheetOpen;
		editingCharacter = initialView.editingCharacter;
		participantsOpen = initialView.participantsOpen;
		npcsOpen = initialView.npcsOpen;
		sceneSettingsOpen = initialView.sceneSettingsOpen;
		sceneCreatorOpen = initialView.sceneCreatorOpen;
		sceneDraft = initialView.sceneDraft;
		sceneRevision = initialView.sceneRevision;
		loadingScene = false;
		error = '';
		activeCampaign = campaign;
		overlayCharacters = [];
		if (session && campaign.role === 'gm') {
			try {
				overlayCharacters = (await listParticipants(session, campaign.id)).participants.filter(
					(participant) => participant.character
				);
			} catch {
				// A falha na lista de fichas não deve impedir a abertura da mesa.
			}
		}
		overlayEnabled = localStorage.getItem(`maismorras:overlay-enabled:${campaign.id}`) === 'true';
		let remoteOverlayLoaded = false;
		try {
			if (session) {
				const remote = await getOverlaySettings(session, campaign.id);
				overlayEnabled = remote.enabled;
				overlayCameras = (remote.cameras ?? []).map((camera) => ({
					...emptyOverlayCamera(),
					...camera
				}));
				remoteOverlayLoaded = true;
			}
		} catch {
			/* legacy local fallback */
		}
		if (!remoteOverlayLoaded) {
			try {
				const saved = localStorage.getItem(`maismorras:overlay-cameras:${campaign.id}`);
				overlayCameras = saved
					? (JSON.parse(saved) as (Partial<OverlayCamera> | string)[])
							.slice(0, 6)
							.map((camera) =>
								typeof camera === 'string'
									? { ...emptyOverlayCamera(), url: camera }
									: { ...emptyOverlayCamera(), ...camera }
							)
							.concat([
								emptyOverlayCamera(),
								emptyOverlayCamera(),
								emptyOverlayCamera(),
								emptyOverlayCamera()
							])
							.slice(0, 6)
					: Array.from({ length: 6 }, emptyOverlayCamera);
			} catch {
				overlayCameras = Array.from({ length: 6 }, emptyOverlayCamera);
			}
		}
		workspaceTab = 'map';
		activeScene = null;
		if (!session) return;
		loadingScene = true;
		try {
			const response = await listScenes(session, campaign.id);
			availableScenes = response.scenes;
			if (availableScenes.length === 0 && campaign.role === 'gm') {
				availableScenes = [
					await createScene(
						session,
						campaign.id,
						$appLocale === 'en' ? 'Main scene' : 'Cena principal'
					)
				];
			}
			activeScene = availableScenes[0] ?? null;
			if (!activeScene) {
				if (campaign.role === 'gm') {
					error =
						$appLocale === 'en'
							? 'Create a scene to start the table.'
							: 'Crie uma cena para iniciar a mesa.';
				} else {
					error = '';
					inviteStatus =
						$appLocale === 'en'
							? 'Waiting for the Game Master to create a scene.'
							: 'Aguardando o narrador criar uma cena.';
				}
			}
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not open the scene.'
						: 'Não foi possível abrir a cena.';
		} finally {
			loadingScene = false;
		}
	}
	function openMySheet() {
		editingCharacter = null;
		sheetOpen = true;
	}
	function openCharacter(characterId: string, ownerName: string) {
		editingCharacter = { id: characterId, ownerName };
		sheetOpen = true;
	}
	function openCharacterWindow(characterId: string) {
		if (!activeCampaign) return;
		const url = new URL('/sheet', window.location.origin);
		url.searchParams.set('campaign', activeCampaign.id);
		url.searchParams.set('character', characterId);
		const popup = window.open(
			url,
			`maismorras-sheet-${characterId}`,
			'popup,width=1400,height=900,resizable=yes,scrollbars=no'
		);
		if (popup) popup.focus();
		else
			showInviteStatus(
				$appLocale === 'en'
					? 'The browser blocked the new window. Allow pop-ups for MaisMorras and try again.'
					: 'O navegador bloqueou a nova janela. Permita pop-ups para o MaisMorras e tente novamente.'
			);
	}
	function selectScene(sceneId: string) {
		const scene = availableScenes.find((item) => item.id === sceneId);
		if (!scene || scene.id === activeScene?.id) return;
		personagens.set([]);
		activeScene = scene;
	}
	async function toggleOverlay() {
		if (!activeCampaign) return;
		overlayEnabled = !overlayEnabled;
		localStorage.setItem('maismorras:overlay-enabled:' + activeCampaign.id, String(overlayEnabled));
		if (session)
			await saveOverlaySettings(session, activeCampaign.id, {
				enabled: overlayEnabled,
				cameras: overlayCameras,
				activeSceneId: activeScene?.id ?? null
			});
	}
	function openLiveOverlay() {
		const overlayWindow = window.open('about:blank', '_blank');
		if (overlayWindow) overlayWindow.opener = null;
		void createOverlayPairingLink(overlayWindow, false);
	}
	async function createOverlayPairingLink(overlayWindow: Window | null, copy: boolean) {
		if (!activeCampaign || !activeScene || !overlayEnabled) {
			inviteStatus = 'Ative a overlay antes de abrir o painel de transmissão.';
			return;
		}
		if (!session) {
			inviteStatus = 'Entre na campanha como narrador para gerar o link do OBS.';
			return;
		}
		try {
			await saveOverlaySettings(session, activeCampaign.id, {
				enabled: overlayEnabled,
				cameras: overlayCameras,
				activeSceneId: activeScene.id
			});
			const pairing = await createOverlayPairing(session, activeCampaign.id, activeScene.id);
			const url = `${window.location.origin}/overlay?campaign=${encodeURIComponent(activeCampaign.id)}&scene=${encodeURIComponent(activeScene.id)}&diceMode=${encodeURIComponent($diceRendererMode)}#pair=${encodeURIComponent(pairing.code)}`;
			if (copy) await navigator.clipboard.writeText(url);
			if (overlayWindow) overlayWindow.location.replace(url);
			inviteStatus = `Link OBS ${copy ? 'copiado' : 'aberto'}. Código de uso único válido por 10 minutos; o acesso pareado dura 30 dias e pode ser revogado aqui.`;
		} catch {
			overlayWindow?.close();
			inviteStatus =
				'Não foi possível gerar o link do OBS. Confirme que a overlay está ativada e tente novamente.';
		}
	}
	async function publishOverlayScene() {
		if (!activeCampaign || !activeScene) return;
		const payload = JSON.stringify({ sceneId: activeScene.id, nonce: crypto.randomUUID() });
		localStorage.setItem(`maismorras:overlay:${activeCampaign.id}`, payload);
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel(`maismorras:overlay:${activeCampaign.id}`);
			channel.postMessage({ type: 'scene-change', sceneId: activeScene.id });
			channel.close();
		}
		if (session) {
			void saveOverlaySettings(session, activeCampaign.id, {
				enabled: overlayEnabled,
				cameras: overlayCameras,
				activeSceneId: activeScene.id
			}).catch(() => {
				/* local broadcast remains available when the API is temporarily offline */
			});
		}
	}
	async function presentAsset(
		asset: { path: string; name: string },
		userIds: string[],
		restricted: boolean,
		overlayVisible: boolean
	) {
		if (!activeCampaign || !activeScene || activeCampaign.role !== 'gm' || !session) return;
		try {
			await savePresentation(session, activeScene.id, {
				assetPath: asset.path,
				title: asset.name,
				description: '',
				visible: true,
				visibleUserIds: userIds,
				audienceRestricted: restricted,
				overlayVisible
			});
			window.dispatchEvent(
				new CustomEvent('maismorras:presentation-changed', { detail: { sceneId: activeScene.id } })
			);
			inviteStatus = 'Imagem exibida para os jogadores.';
			publishOverlayScene();
		} catch {
			inviteStatus = '';
		}
	}
	async function hidePresentedAsset() {
		if (!activeScene || !session || activeCampaign?.role !== 'gm') return;
		try {
			await savePresentation(session, activeScene.id, {
				assetPath: '',
				title: '',
				description: '',
				visible: false,
				visibleUserIds: [],
				audienceRestricted: false,
				overlayVisible: false
			});
			window.dispatchEvent(
				new CustomEvent('maismorras:presentation-changed', { detail: { sceneId: activeScene.id } })
			);
			publishOverlayScene();
			inviteStatus = 'Imagem ocultada para os jogadores.';
		} catch {
			inviteStatus = '';
		}
	}
	async function copyLiveOverlayAddress() {
		await createOverlayPairingLink(null, true);
	}
	async function revokeLiveOverlayAccess() {
		if (!activeCampaign || !session) return;
		try {
			await revokeOverlayAccess(session, activeCampaign.id);
			inviteStatus = 'Acesso do OBS revogado. Gere um novo link para parear novamente.';
		} catch {
			inviteStatus = 'Não foi possível revogar o acesso do OBS. Tente novamente.';
		}
	}
	async function saveOverlayCameras() {
		if (activeCampaign)
			localStorage.setItem(
				`maismorras:overlay-cameras:${activeCampaign.id}`,
				JSON.stringify(overlayCameras)
			);
		if (session && activeCampaign)
			await saveOverlaySettings(session, activeCampaign.id, {
				enabled: overlayEnabled,
				cameras: overlayCameras,
				activeSceneId: activeScene?.id ?? null
			});
		inviteStatus = 'Câmeras da overlay salvas.';
	}
	function linkOverlayCamera(index: number, characterId: string) {
		const character = overlayCharacters.find(
			(participant) => participant.character?.id === characterId
		)?.character;
		overlayCameras = overlayCameras.map((camera, cameraIndex) =>
			cameraIndex === index
				? {
						...camera,
						characterId: character?.id,
						characterName: character?.sheet.name ?? camera.characterName
					}
				: camera
		);
	}
	const campaignPanelActions: CampaignPanelActions = {
		toggleOverlay,
		createInvite,
		openParticipants: () => (participantsOpen = true),
		openNpcs: () => (npcsOpen = true),
		install: () => oninstall(),
		linkCamera: linkOverlayCamera,
		saveCameras: saveOverlayCameras,
		openOverlay: openLiveOverlay,
		copyOverlayAddress: copyLiveOverlayAddress,
		revokeOverlayAccess: revokeLiveOverlayAccess
	};

	async function addScene() {
		if (!activeCampaign || !session || creatingScene) return;
		const name = sceneDraft.trim();
		if (!name) return;
		creatingScene = true;
		try {
			const scene = await createScene(session, activeCampaign.id, name);
			availableScenes = [...availableScenes, scene];
			selectScene(scene.id);
			sceneDraft = '';
			sceneCreatorOpen = false;
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not create the scene.'
						: 'Não foi possível criar a cena.';
		} finally {
			creatingScene = false;
		}
	}
	async function reloadActiveScene() {
		// A scene keeps the same id after receiving a token. The revision forces
		// a deterministic Pixi remount, so the fresh scene request includes it.
		sceneRevision += 1;
		await tick();
	}
</script>

<div class:game-mode={activeCampaign} class="app-shell">
	{#if activeCampaign && activeScene && session}<ImagePresentation
			sceneId={activeScene.id}
			campaignId={activeCampaign.id}
			isGM={activeCampaign.role === 'gm'}
			{session}
		/>{/if}
	{#if activeCampaign && activeScene && session}<AmbientAudioPlayer
			scene={activeScene}
			{session}
			isGM={activeCampaign.role === 'gm'}
			onSceneUpdate={(next) => (activeScene = next)}
		/>{/if}
	<div class="persistent-audio" aria-hidden="true">
		<audio id="maismorras-ambient-a" loop preload="metadata"></audio>
		<audio id="maismorras-ambient-b" loop preload="metadata"></audio>
		<audio id="maismorras-effects-a" loop preload="metadata"></audio>
		<audio id="maismorras-effects-b" loop preload="metadata"></audio>
	</div>
	<CampaignWorkspaceHeader
		campaign={activeCampaign ? { name: activeCampaign.name, role: activeCampaign.role } : null}
		scenes={availableScenes.map((scene) => ({ id: scene.id, name: scene.name }))}
		activeSceneId={activeScene?.id ?? ''}
		email={session.user.email ?? ''}
		locale={$appLocale}
		activeTab={workspaceTab}
		{creatingScene}
		{sceneCreatorOpen}
		{sceneDraft}
		onreturntocampaigns={() => (activeCampaign = null)}
		onsceneselect={selectScene}
		ontogglescenecreator={() => (sceneCreatorOpen = !sceneCreatorOpen)}
		onscenedraftchange={(draft) => (sceneDraft = draft)}
		oncreatescene={() => void addScene()}
		onopenscenesettings={() => (sceneSettingsOpen = true)}
		onpublishscenetooverlay={() => void publishOverlayScene()}
		ontabchange={(tab) => (workspaceTab = tab)}
		onlanguagechange={(locale) => setAppLocale(locale)}
		{onlogout}
	/>
	{#if activeCampaign}
		{#if workspaceTab === 'map'}<main class="vtt-workspace">
				{#if activeScene}{#key `${activeScene.id}:${sceneRevision}`}
						<div
							class="scene-board-heading"
							aria-label={$appLocale === 'en' ? 'Current scene' : 'Cena atual'}
						>
							<span>{$appLocale === 'en' ? 'Scene' : 'Cena'}</span><strong
								>{activeScene.name}</strong
							>
						</div>
						<div class="scene-board">
							{#if CanvasMesaComponent}<CanvasMesaComponent
									scene={activeScene}
									{session}
									isGM={activeCampaign.role === 'gm'}
									campaignId={activeCampaign.id}
									onopensheet={(actorId) =>
										activeCampaign?.role === 'gm' ? openCharacter(actorId, '') : openMySheet()}
									onopennewwindow={openCharacterWindow}
								/>{:else}<p class="status-message" role="status" aria-live="polite">
									Carregando mapa…
								</p>{/if}
							{#if DiceOverlayComponent && session}<DiceOverlayComponent />{/if}
							{#if TableToolsComponent}<TableToolsComponent
									campaignId={activeCampaign.id}
									sceneId={activeScene.id}
									{session}
									isGM={activeCampaign.role === 'gm'}
								/>{/if}
							{#if activeCampaign.role === 'gm' && ActorDrawerComponent}<ActorDrawerComponent
									campaignId={activeCampaign.id}
									sceneId={activeScene.id}
									{session}
									onadded={() => reloadActiveScene()}
									oncompendium={() => (workspaceTab = 'compendium')}
								/>{/if}
						</div>
					{/key}{:else}<p class="status-message">
						{loadingScene ? 'Carregando cena…' : inviteStatus || 'Nenhuma cena disponível.'}
					</p>{/if}
			</main>
		{:else if workspaceTab === 'sheets' && CampaignSheetsComponent}<CampaignSheetsComponent
				campaignId={activeCampaign.id}
				{session}
				isGM={activeCampaign.role === 'gm'}
				onopenmine={openMySheet}
				onopencharacter={openCharacter}
			/>
		{:else if workspaceTab === 'library' && LibraryViewComponent}<LibraryViewComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene?.id ?? ''}
				{session}
				isGM={activeCampaign.role === 'gm'}
				onpresent={(asset, userIds, restricted, overlayVisible) =>
					void presentAsset(asset, userIds, restricted, overlayVisible)}
				onhide={() => void hidePresentedAsset()}
			/>
		{:else if workspaceTab === 'compendium' && CompendiumViewComponent}<CompendiumViewComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene?.id}
				{session}
				isGM={activeCampaign.role === 'gm'}
				ontokencreated={() => void reloadActiveScene()}
			/>
		{:else if workspaceTab === 'bestiary' && activeCampaign.role === 'gm' && BestiaryViewComponent}<BestiaryViewComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene?.id}
				{session}
				ontokencreated={() => void reloadActiveScene()}
			/>
		{:else if (workspaceTab === 'overlay' || workspaceTab === 'campaign') && activeCampaign.role === 'gm'}
			<CampaignManagementPanel
				view={workspaceTab === 'overlay' ? 'overlay' : 'campaign'}
				campaign={activeCampaign}
				{activeScene}
				{session}
				bind:overlayEnabled
				bind:overlayCameras
				{overlayCharacters}
				installAvailable={Boolean(installPrompt)}
				{OverlayLayoutEditorComponent}
				actions={campaignPanelActions}
			/>
		{/if}
		{#if activeCampaign && session && FloatingChatComponent}{#key activeCampaign.id}<FloatingChatComponent
					campaignId={activeCampaign.id}
					{session}
				/>{/key}{/if}
		{#if inviteStatus}<p class="invite-status">{inviteStatus}</p>{/if}
		{#if sheetOpen && !CharacterSheetComponent}<p
				class="status-message"
				role="status"
				aria-live="polite"
			>
				{$appLocale === 'en' ? 'Loading character sheet…' : 'Carregando ficha…'}
			</p>{/if}
		{#if sheetOpen && CharacterSheetComponent && activeCampaign && (activeScene || !editingCharacter)}<CharacterSheetComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene?.id ?? ''}
				{session}
				isGM={activeCampaign.role === 'gm'}
				characterId={editingCharacter?.id}
				characterOwnerName={editingCharacter?.ownerName ?? ''}
				docked={workspaceTab === 'map'}
				standalone={false}
				onclose={() => {
					sheetOpen = false;
				}}
				onTokenCreated={() => void reloadActiveScene()}
			/>{/if}
		{#if participantsOpen && ParticipantsPanelComponent && activeScene}<ParticipantsPanelComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene.id}
				{session}
				onclose={() => (participantsOpen = false)}
				ontokencreated={() => void reloadActiveScene()}
			/>{/if}
		{#if npcsOpen && NPCsPanelComponent && activeScene}<NPCsPanelComponent
				campaignId={activeCampaign.id}
				sceneId={activeScene.id}
				{session}
				onclose={() => (npcsOpen = false)}
				ontokencreated={() => void reloadActiveScene()}
			/>{/if}
		{#if sceneSettingsOpen && SceneSettingsComponent && activeScene}<SceneSettingsComponent
				scene={activeScene}
				{session}
				onclose={() => (sceneSettingsOpen = false)}
				onsaved={(scene) => {
					activeScene = scene;
					availableScenes = availableScenes.map((item) => (item.id === scene.id ? scene : item));
				}}
			/>{/if}
	{:else}
		<CampaignHub
			{campaigns}
			loading={loadingCampaigns}
			{error}
			bind:campaignName
			bind:campaignSystem
			bind:campaignCreateOpen
			bind:campaignFilter
			bind:campaignSystemFilter
			oncreate={() => void createCampaign()}
			onopen={(campaign) => void openCampaign(campaign)}
			onrename={(campaign) => void renameCampaign(campaign)}
			ondelete={(campaign) => void deleteCampaign(campaign)}
		/>
	{/if}
</div>

<style>
	.app-shell {
		--mm-audio-footer-offset: 4.1rem;
		min-height: 100vh;
		padding-bottom: 7.5rem;
		background:
			radial-gradient(circle at 65% -10%, rgba(126, 82, 40, 0.15), transparent 26%), #141114;
	}
	.status-message {
		color: #a89b8e;
	}
	.vtt-workspace {
		padding: 0.35rem clamp(0.35rem, 1.2vw, 1rem) 1rem;
	}
	.scene-board-heading {
		display: none;
	}
	.scene-board-heading span {
		color: #b58b52;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.scene-board-heading strong {
		overflow: hidden;
		max-width: min(72vw, 720px);
		color: #f1d4a0;
		font:
			600 clamp(1rem, 2vw, 1.35rem) Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scene-board {
		position: relative;
	}
	@media (max-width: 760px) {
		.app-shell {
			--mm-audio-footer-offset: 6.5rem;
			padding-bottom: calc(8rem + env(safe-area-inset-bottom));
		}
		.vtt-workspace {
			padding: 0.45rem 0 0;
		}
		.scene-board-heading {
			min-height: 1.8rem;
			padding: 0.2rem 0.75rem 0.45rem;
		}
		.scene-board-heading strong {
			max-width: 78vw;
			font-size: 1rem;
		}
	}
</style>
