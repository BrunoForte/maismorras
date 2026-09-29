<!-- eslint-disable svelte/no-navigation-without-resolve -- overlay intentionally opens in a separate tab. -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import AmbientAudioPlayer from '$lib/components/AmbientAudioPlayer.svelte';
	import ImagePresentation from '$lib/components/ImagePresentation.svelte';
	import CampaignHub from '$lib/components/CampaignHub.svelte';
	import { savePresentation } from '$lib/services/presentationApi';
	import { getSupabaseClient, supabaseConfigured } from '$lib/services/supabase';
	import { createScene, listScenes, type Scene } from '$lib/services/sceneApi';
	import { personagens } from '$lib/stores/gameStore';
	import { appLocale, restoreAppLocale, setAppLocale } from '$lib/stores/locale';
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

	let session = $state<Session | null>(null);
	let localE2EEmail = $state('');
	let localE2EPassword = $state('');
	const localE2EAuthEnabled = import.meta.env.DEV && import.meta.env.PUBLIC_E2E_AUTH === 'true';
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
	let loading = $state(true);
	let error = $state('');
	async function ensureMapComponents() {
		const [canvas, dice, table, chat, actor] = await Promise.all([
			import('$lib/components/CanvasMesa.svelte'),
			import('$lib/components/DiceOverlay.svelte'),
			import('$lib/components/TableTools.svelte'),
			import('$lib/components/FloatingChat.svelte'),
			import('$lib/components/ActorDrawer.svelte')
		]);
		CanvasMesaComponent ??= canvas.default;
		DiceOverlayComponent ??= dice.default;
		TableToolsComponent ??= table.default;
		FloatingChatComponent ??= chat.default;
		ActorDrawerComponent ??= actor.default;
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
	let loadingCampaigns = $state(false);
	let loadingScene = $state(false);
	let sheetOpen = $state(false);
	let standaloneSheet = $state(false);
	let editingCharacter = $state<{ id: string; ownerName: string } | null>(null);
	type WorkspaceTab =
		'map' | 'sheets' | 'library' | 'compendium' | 'bestiary' | 'campaign' | 'overlay';
	let workspaceTab = $state<WorkspaceTab>('map');
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
	const sessionTimeoutMs = 10000;
	let restoringSession = false;
	let restoredSessionId = '';
	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};
	let installPrompt = $state<InstallPromptEvent | null>(null);
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
		let disposed = false;
		let unsubscribeAuth: (() => void) | undefined;
		restoreAppLocale();
		const rememberInstallPrompt = (event: Event) => {
			event.preventDefault();
			installPrompt = event as InstallPromptEvent;
		};
		const clearInstallPrompt = () => (installPrompt = null);
		window.addEventListener('beforeinstallprompt', rememberInstallPrompt);
		window.addEventListener('appinstalled', clearInstallPrompt);
		const initializeAuth = async () => {
			if (!supabaseConfigured) {
				error =
					$appLocale === 'en'
						? 'Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY in the .env file.'
						: 'Configure PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env.';
				loading = false;
				return;
			}
			try {
				const client = await getSupabaseClient();
				if (!client || disposed) return;
				const { data } = await Promise.race([
					client.auth.getSession(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error('A autenticação demorou demais para responder.')),
							sessionTimeoutMs
						)
					)
				]);
				session = data.session;
				if (data.session) {
					restoredSessionId = data.session.user.id;
				}
				if (disposed) return;
				const { data: authState } = client.auth.onAuthStateChange((_event, nextSession) => {
					if (
						nextSession?.user.id === restoredSessionId &&
						session?.access_token === nextSession.access_token
					)
						return;
					session = nextSession;
					if (nextSession) {
						restoredSessionId = nextSession.user.id;
						void restoreSession(nextSession);
					} else {
						restoredSessionId = '';
						campaigns = [];
						activeCampaign = null;
					}
				});
				unsubscribeAuth = () => authState.subscription.unsubscribe();
				if (data.session) await restoreSession(data.session);
			} catch (cause) {
				error = cause instanceof Error ? cause.message : 'Não foi possível restaurar sua sessão.';
			} finally {
				if (!disposed) loading = false;
			}
		};
		void initializeAuth();
		return () => {
			disposed = true;
			unsubscribeAuth?.();
			window.removeEventListener('beforeinstallprompt', rememberInstallPrompt);
			window.removeEventListener('appinstalled', clearInstallPrompt);
		};
	});
	async function installApp() {
		if (!installPrompt) return;
		await installPrompt.prompt();
		if ((await installPrompt.userChoice).outcome === 'accepted') installPrompt = null;
	}

	async function login() {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			// Preserve ?invite=... across OAuth, but never reuse location.href: it
			// may already contain Supabase's #access_token fragment after a prior
			// callback. Reusing it produces ##access_token and prevents getSession
			// from recovering the authenticated session.
			options: {
				redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`
			}
		});
		if (authError) error = authError.message;
	}
	async function loginLocalE2E() {
		const supabase = await getSupabaseClient();
		if (!supabase || !localE2EAuthEnabled) return;
		error = '';
		const { error: authError } = await supabase.auth.signInWithPassword({
			email: localE2EEmail,
			password: localE2EPassword
		});
		if (authError) error = 'Não foi possível autenticar a conta local de teste.';
	}
	async function logout() {
		await (await getSupabaseClient())?.auth.signOut();
	}
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
			window.history.replaceState({}, '', window.location.pathname);
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
			standaloneSheet = new URLSearchParams(window.location.search).get('sheetWindow') === '1';
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
		const url = new URL('/', window.location.origin);
		url.searchParams.set('campaign', activeCampaign.id);
		url.searchParams.set('character', characterId);
		url.searchParams.set('sheetWindow', '1');
		const popup = window.open(
			url,
			`maismorras-sheet-${characterId}`,
			'popup,width=1400,height=900,resizable=yes,scrollbars=no'
		);
		popup?.focus();
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

<svelte:head>
	<title>MaisMorras</title>
	<meta name="description" content="Mesa virtual para campanhas de RPG." />
</svelte:head>

{#if loading}
	<main class="loading-screen" aria-live="polite">
		<div class="brand-mark">M</div>
		<p>{$appLocale === 'en' ? 'Preparing the portals…' : 'Preparando os portais…'}</p>
	</main>
{:else if !session}
	<main class="auth-shell">
		<section class="auth-intro">
			<div class="brand-lockup">
				<div class="brand-mark" aria-hidden="true">M</div>
				<span>MaisMorras</span>
			</div>
			<p class="eyebrow">
				{$appLocale === 'en' ? 'YOUR WORLD. YOUR TABLE.' : 'SEU MUNDO. SUA MESA.'}
			</p>
			<h1>{$appLocale === 'en' ? 'Where stories\ncome alive.' : 'Onde histórias\nganham vida.'}</h1>
			<p class="auth-copy">
				{$appLocale === 'en'
					? 'A fast virtual tabletop made for adventures your players will never forget.'
					: 'Uma mesa virtual rápida, feita para aventuras que seus jogadores não vão esquecer.'}
			</p>
			<div
				class="feature-list"
				aria-label={$appLocale === 'en' ? 'Platform features' : 'Recursos da plataforma'}
			>
				<span>⌘ {$appLocale === 'en' ? 'Real-time table' : 'Mesa em tempo real'}</span>
				<span>✦ {$appLocale === 'en' ? 'Persistent campaigns' : 'Campanhas persistentes'}</span>
				<span>◈ {$appLocale === 'en' ? 'Game-master tools' : 'Ferramentas para narrar'}</span>
			</div>
		</section>

		<section class="auth-card">
			<p class="eyebrow">{$appLocale === 'en' ? 'WELCOME' : 'BEM-VINDO'}</p>
			<h2>{$appLocale === 'en' ? 'Enter the adventure' : 'Entre na aventura'}</h2>
			<p>
				{$appLocale === 'en'
					? 'Use your Google account to access your tables and continue where you left off.'
					: 'Use sua conta Google para acessar suas mesas e continuar de onde parou.'}
			</p>
			{#if error}<p class="error">{error}</p>{/if}
			<button class="google-button" onclick={login} disabled={!supabaseConfigured}>
				<span class="google-g" aria-hidden="true">G</span>
				{$appLocale === 'en' ? 'Continue with Google' : 'Continuar com Google'}
			</button>
			{#if localE2EAuthEnabled}
				<form
					class="local-e2e-login"
					onsubmit={(event) => {
						event.preventDefault();
						void loginLocalE2E();
					}}
				>
					<label for="local-e2e-email">E-mail de teste</label>
					<input
						id="local-e2e-email"
						type="email"
						autocomplete="username"
						bind:value={localE2EEmail}
						required
					/>
					<label for="local-e2e-password">Senha de teste</label>
					<input
						id="local-e2e-password"
						type="password"
						autocomplete="current-password"
						bind:value={localE2EPassword}
						required
					/>
					<button type="submit" class="secondary-button" disabled={!supabaseConfigured}
						>Entrar no ambiente local</button
					>
				</form>
			{/if}
			<p class="auth-note">
				{$appLocale === 'en'
					? 'By signing in, you agree to play respectfully at your table.'
					: 'Ao entrar, você concorda em jogar com respeito à sua mesa.'}
			</p>
		</section>
	</main>
{:else}
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
		<header class="app-header">
			<button
				class="brand-lockup brand-button"
				onclick={() => (activeCampaign = null)}
				aria-label={$appLocale === 'en' ? 'Go to your tables' : 'Ir para suas mesas'}
			>
				<span class="brand-mark" aria-hidden="true">M</span><span
					>{activeCampaign ? activeCampaign.name : 'MaisMorras'}</span
				>
			</button>
			{#if activeCampaign}
				<div class="header-scene">
					<div class="scene-control">
						<label for="header-scene-select">{$appLocale === 'en' ? 'Scene' : 'Cena'}</label><select
							id="header-scene-select"
							value={activeScene?.id ?? ''}
							onchange={(event) => selectScene(event.currentTarget.value)}
							>{#each availableScenes as scene (scene.id)}<option value={scene.id}
									>{scene.name}</option
								>{/each}</select
						>
						{#if activeCampaign.role === 'gm'}<button
								class="scene-add"
								onclick={() => (sceneCreatorOpen = !sceneCreatorOpen)}
								disabled={creatingScene}
								title={$appLocale === 'en' ? 'Create scene' : 'Criar cena'}>+</button
							>{/if}
						{#if activeCampaign.role === 'gm' && activeScene}<button
								class="scene-add"
								onclick={() => (sceneSettingsOpen = true)}
								title={$appLocale === 'en' ? 'Configure scene' : 'Configurar cena'}>⚙</button
							>{/if}
					</div>
					{#if activeScene}<button
							class="scene-overlay-link"
							onclick={publishOverlayScene}
							title="Enviar cena atual para a overlay">↻</button
						>{/if}
					{#if activeCampaign.role === 'gm' && sceneCreatorOpen}<form
							class="scene-creator"
							onsubmit={(event) => {
								event.preventDefault();
								void addScene();
							}}
						>
							<input
								bind:value={sceneDraft}
								maxlength="120"
								placeholder={$appLocale === 'en' ? 'New scene name' : 'Nome da nova cena'}
							/><button disabled={creatingScene}
								>{creatingScene ? '…' : $appLocale === 'en' ? 'Create' : 'Criar'}</button
							>
						</form>{/if}
				</div>
			{:else}
				<p class="header-context">
					{$appLocale === 'en' ? 'Campaign hub' : 'Central de campanhas'}
				</p>
			{/if}
			<div class="account">
				<select
					class="locale-select"
					aria-label={$appLocale === 'en' ? 'Language' : 'Idioma'}
					value={$appLocale}
					onchange={(event) => setAppLocale(event.currentTarget.value === 'en' ? 'en' : 'pt-BR')}
					><option value="pt-BR">PT</option><option value="en">EN</option></select
				>
				<span class="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span>
				<div class="account-copy">
					<span class="account-email">{session.user.email}</span>{#if activeCampaign}<small
							class="account-role"
							>{activeCampaign.role === 'gm'
								? $appLocale === 'en'
									? 'Game Master'
									: 'Narrador'
								: $appLocale === 'en'
									? 'Player'
									: 'Jogador'}</small
						>{/if}
				</div>
				<button class="text-button" onclick={logout}
					>{$appLocale === 'en' ? 'Sign out' : 'Sair'}</button
				>
			</div>
		</header>

		{#if activeCampaign}
			<section class="game-header">
				<div>
					<p class="eyebrow">{$appLocale === 'en' ? 'ACTIVE TABLE' : 'MESA ATIVA'}</p>
					<h1>{activeCampaign.name}</h1>
				</div>
				<div class="game-meta">
					<div class="scene-control">
						<label for="scene-select">{$appLocale === 'en' ? 'Scene' : 'Cena'}</label><select
							id="scene-select"
							value={activeScene?.id ?? ''}
							onchange={(event) => selectScene(event.currentTarget.value)}
							>{#each availableScenes as scene (scene.id)}<option value={scene.id}
									>{scene.name}</option
								>{/each}</select
						>{#if activeCampaign.role === 'gm'}<button
								class="scene-add"
								onclick={() => (sceneCreatorOpen = !sceneCreatorOpen)}
								disabled={creatingScene}
								title="Criar cena">+</button
							>{/if}{#if activeCampaign.role === 'gm' && activeScene}<button
								class="scene-add"
								onclick={() => (sceneSettingsOpen = true)}
								title="Configurar cena">⚙</button
							>{/if}
					</div>
					{#if activeCampaign.role === 'gm' && sceneCreatorOpen}<form
							class="scene-creator"
							onsubmit={(event) => {
								event.preventDefault();
								void addScene();
							}}
						>
							<input
								bind:value={sceneDraft}
								maxlength="120"
								placeholder={$appLocale === 'en' ? 'New scene name' : 'Nome da nova cena'}
							/><button disabled={creatingScene}
								>{creatingScene
									? $appLocale === 'en'
										? 'Creating…'
										: 'Criando…'
									: $appLocale === 'en'
										? 'Create'
										: 'Criar'}</button
							>
						</form>{/if}
					<span class="role-badge {activeCampaign.role}"
						>{activeCampaign.role === 'gm'
							? $appLocale === 'en'
								? '✦ Game Master'
								: '✦ Narrador'
							: $appLocale === 'en'
								? '◈ Player'
								: '◈ Jogador'}</span
					>
				</div>
			</section>
			<nav
				class="workspace-tabs"
				aria-label={$appLocale === 'en' ? 'Table areas' : 'Áreas da mesa'}
			>
				<button class:active={workspaceTab === 'map'} onclick={() => (workspaceTab = 'map')}
					>{$appLocale === 'en' ? 'Table' : 'Mesa'}</button
				>
				<button class:active={workspaceTab === 'sheets'} onclick={() => (workspaceTab = 'sheets')}
					>{$appLocale === 'en' ? 'Sheets' : 'Fichas'}</button
				>
				<button class:active={workspaceTab === 'library'} onclick={() => (workspaceTab = 'library')}
					>{$appLocale === 'en' ? 'Library' : 'Biblioteca'}</button
				>
				<button
					class:active={workspaceTab === 'compendium'}
					onclick={() => (workspaceTab = 'compendium')}
					>{$appLocale === 'en' ? 'Compendium' : 'Compêndio'}</button
				>
				{#if activeCampaign.role === 'gm'}<button
						class:active={workspaceTab === 'bestiary'}
						onclick={() => (workspaceTab = 'bestiary')}
						>{$appLocale === 'en' ? 'Bestiary' : 'Bestiário'}</button
					>{/if}
				{#if activeCampaign.role === 'gm'}<button
						class:active={workspaceTab === 'campaign'}
						onclick={() => (workspaceTab = 'campaign')}
						>{$appLocale === 'en' ? 'Campaign' : 'Campanha'}</button
					>{/if}
				{#if activeCampaign.role === 'gm'}<button
						class:active={workspaceTab === 'overlay'}
						onclick={() => (workspaceTab = 'overlay')}>Overlay</button
					>{/if}
			</nav>
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
								{#if FloatingChatComponent}<FloatingChatComponent
										campaignId={activeCampaign.id}
										sceneId={activeScene.id}
										{session}
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
			{:else if workspaceTab === 'overlay' && activeCampaign.role === 'gm'}<main
					class="campaign-settings overlay-workspace"
				>
					<section class="overlay-toggle-card">
						<div>
							<p class="eyebrow">TRANSMISSÃO</p>
							<h2>Overlay da live</h2>
							<p>Ative os recursos de overlay para esta campanha e configure a cena atual.</p>
						</div>
						<label class="switch"
							><input type="checkbox" checked={overlayEnabled} onchange={toggleOverlay} /><span
							></span>{overlayEnabled ? 'Ativada' : 'Desativada'}</label
						>
					</section>
					{#if overlayEnabled && activeScene && OverlayLayoutEditorComponent}<OverlayLayoutEditorComponent
							campaignId={activeCampaign.id}
							sceneId={activeScene.id}
							{session}
						/>{:else if !overlayEnabled}<p class="status-message">
							Ative a overlay para editar seus elementos.
						</p>{:else}<p class="status-message">Selecione uma cena para editar a overlay.</p>{/if}
				</main>
			{:else if workspaceTab === 'campaign' && activeCampaign.role === 'gm'}<main
					class="campaign-settings"
				>
					<section>
						<p class="eyebrow">
							{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}
						</p>
						<h2>{$appLocale === 'en' ? 'Invites and settings' : 'Convites e configurações'}</h2>
						<p>
							{$appLocale === 'en'
								? 'Manage who joins the campaign and the options that affect the whole table.'
								: 'Gerencie quem entra na campanha e as opções que afetam toda a mesa.'}
						</p>
					</section>
					<div class="settings-actions">
						<button class="primary-button" onclick={createInvite}
							>{$appLocale === 'en' ? 'Copy player invite' : 'Copiar convite de jogador'}</button
						><button class="secondary-button" onclick={() => (participantsOpen = true)}
							>{$appLocale === 'en' ? 'Participants' : 'Participantes'}</button
						><button class="secondary-button" onclick={() => (npcsOpen = true)}
							>{$appLocale === 'en' ? 'NPCs' : 'NPCs'}</button
						>
						{#if installPrompt}<button class="secondary-button" onclick={() => void installApp()}
								>{$appLocale === 'en' ? 'Install MaisMorras' : 'Instalar MaisMorras'}</button
							>{/if}
					</div>
					<section class="overlay-settings">
						<p class="eyebrow">OVERLAY DA LIVE</p>
						<h3>Link, cena e câmeras</h3>
						<p>
							Configure até cinco câmeras de jogadores e uma do narrador. Cole o link de sala do
							VDO.Ninja; o narrador aparece no topo sobre a iniciativa e as câmeras dos jogadores na
							base, à frente dos dados. O nome do personagem aparece junto ao vídeo.
						</p>
						<div class="overlay-camera-grid">
							{#each overlayCameras as camera, index (index)}<fieldset>
									<legend
										>{index === 5
											? 'Câmera do narrador · topo esquerdo'
											: `Câmera do jogador ${index < 5 ? index + 1 : index}`}</legend
									>
									<input bind:value={camera.url} placeholder="Link https://vdo.ninja/..." />
									<input bind:value={camera.playerName} placeholder="Nome do jogador" />
									<label class="camera-character-link">
										<span>Ficha vinculada</span>
										<select
											value={camera.characterId ?? ''}
											onchange={(event) => linkOverlayCamera(index, event.currentTarget.value)}
										>
											<option value="">Sem vínculo</option>
											{#each overlayCharacters as participant (participant.character?.id)}
												{#if participant.character}<option value={participant.character.id}
														>{participant.character.sheet.name} · {participant.displayName}</option
													>{/if}
											{/each}
										</select>
									</label>
									{#if !camera.characterId}<input
											bind:value={camera.characterName}
											placeholder="Nome exibido, se não houver ficha vinculada"
										/>{/if}
									<input bind:value={camera.email} type="email" placeholder="E-mail (opcional)" />
								</fieldset>{/each}
						</div>
						<div class="settings-actions">
							<button class="primary-button" onclick={saveOverlayCameras}>Salvar câmeras</button>
							<button class="secondary-button" onclick={openLiveOverlay}
								>Abrir overlay no navegador</button
							>
							<button class="secondary-button" onclick={() => void copyLiveOverlayAddress()}
								>Gerar link pareado para o OBS</button
							>
							<button class="secondary-button" onclick={() => void revokeLiveOverlayAccess()}
								>Revogar acesso do OBS</button
							>
						</div>
					</section>
				</main>{/if}
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
					docked={workspaceTab === 'map' && !standaloneSheet}
					standalone={standaloneSheet}
					onclose={() => {
						if (standaloneSheet) window.close();
						else sheetOpen = false;
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
{/if}

<style>
	:global(body) {
		margin: 0;
		min-width: 320px;
		color: var(--mm-text, #f4eee4);
		background: var(--mm-bg, #100e11);
	}
	.loading-screen,
	.auth-shell {
		min-height: 100vh;
		background:
			radial-gradient(circle at 15% 15%, rgba(133, 78, 43, 0.33), transparent 32%),
			radial-gradient(circle at 85% 80%, rgba(81, 34, 68, 0.35), transparent 35%), #100e11;
	}
	.loading-screen {
		display: grid;
		place-content: center;
		gap: 1rem;
		text-align: center;
		color: #b7aa9b;
	}
	.brand-mark {
		display: inline-grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid #d8ad67;
		color: #f6d89c;
		background: linear-gradient(135deg, #342216, #171116);
		clip-path: polygon(50% 0, 94% 24%, 94% 76%, 50% 100%, 6% 76%, 6% 24%);
		font-family: Georgia, serif;
		font-weight: 700;
	}
	.auth-shell {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(390px, 0.9fr);
		align-items: center;
		gap: clamp(3rem, 10vw, 11rem);
		padding: clamp(2rem, 8vw, 8rem);
		overflow: hidden;
	}
	.auth-intro {
		max-width: 660px;
	}
	.brand-lockup {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #f7eedf;
		font:
			700 1.2rem Georgia,
			serif;
		letter-spacing: 0.03em;
	}
	.eyebrow {
		margin: 2.8rem 0 0.75rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.18em;
	}
	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}
	.auth-intro h1,
	.game-header h1 {
		margin-bottom: 1.25rem;
		font:
			500 clamp(3rem, 6vw, 5.75rem)/0.95 Georgia,
			'Times New Roman',
			serif;
		letter-spacing: -0.045em;
	}
	.auth-copy {
		max-width: 510px;
		color: #c5b8aa;
		font-size: 1.12rem;
		line-height: 1.7;
	}
	.feature-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin-top: 2rem;
		color: #a99d91;
		font-size: 0.86rem;
	}
	.feature-list span {
		white-space: nowrap;
	}
	.auth-card {
		max-width: 440px;
		padding: clamp(2rem, 4vw, 3.25rem);
		border: 1px solid rgba(216, 173, 103, 0.25);
		border-radius: 20px;
		background: linear-gradient(145deg, rgba(46, 37, 36, 0.9), rgba(25, 20, 23, 0.94));
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.38);
	}
	.auth-card .eyebrow {
		margin-top: 0;
	}
	.auth-card h2 {
		font:
			500 2rem Georgia,
			serif;
	}
	.auth-card > p:not(.eyebrow):not(.error):not(.auth-note) {
		color: #bcae9f;
		line-height: 1.6;
	}
	.google-button,
	.primary-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 100%;
		border: 0;
		border-radius: 9px;
		padding: 0.85rem 1rem;
		color: #20160e;
		background: #ecd09a;
		font-weight: 750;
		transition:
			transform 0.18s,
			background 0.18s;
	}
	.google-button:hover,
	.primary-button:hover {
		background: #f5dbab;
		transform: translateY(-1px);
	}
	.google-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.google-g {
		display: grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		color: white;
		background: #4285f4;
		font-weight: 800;
		font-size: 0.78rem;
	}
	.auth-note {
		margin: 1.25rem 0 0;
		color: #81766e;
		font-size: 0.73rem;
		text-align: center;
	}
	.local-e2e-login {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(216, 173, 103, 0.2);
	}
	.local-e2e-login label {
		color: #bcae9f;
		font-size: 0.82rem;
	}
	.local-e2e-login input {
		min-width: 0;
		border: 1px solid rgba(216, 173, 103, 0.25);
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		color: #f2e8d8;
		background: rgba(15, 13, 15, 0.72);
	}
	.error {
		margin: 1rem 0;
		padding: 0.8rem;
		border: 1px solid #944a4a;
		border-radius: 8px;
		color: #ffb2aa;
		background: rgba(123, 36, 32, 0.2);
		font-size: 0.88rem;
	}
	.app-shell {
		min-height: 100vh;
		padding-bottom: 7.5rem;
		background:
			radial-gradient(circle at 65% -10%, rgba(126, 82, 40, 0.15), transparent 26%), #141114;
	}
	.app-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 52px;
		padding: 0 clamp(0.8rem, 3vw, 2.5rem);
		border-bottom: 1px solid #30292a;
		background: rgba(20, 17, 20, 0.88);
		backdrop-filter: blur(14px);
	}
	.brand-button {
		border: 0;
		padding: 0;
		background: transparent;
	}
	.game-mode .brand-button {
		max-width: 30%;
		overflow: hidden;
		color: #f0d29d;
		font-size: 0.82rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.header-scene {
		position: absolute;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		transform: translateX(-50%);
	}
	.header-scene .scene-control {
		align-items: center;
	}
	.header-scene .scene-control label {
		display: none;
	}
	.header-scene .scene-control select {
		max-width: min(26vw, 190px);
		padding: 0.34rem 0.5rem;
		font-size: 0.7rem;
	}
	.header-scene .scene-add {
		width: 1.75rem;
		height: 1.75rem;
		font-size: 0.95rem;
	}
	.header-scene .scene-creator {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		z-index: 20;
		padding: 0.45rem;
		border: 1px solid #5c5045;
		border-radius: 7px;
		background: #211c1e;
		box-shadow: 0 8px 24px #0008;
	}
	.account-copy {
		display: grid;
		gap: 0.08rem;
		min-width: 0;
	}
	.account-role {
		color: #8f8378;
		font-size: 0.58rem;
		line-height: 1;
	}
	.brand-button .brand-mark {
		width: 2rem;
		height: 2rem;
		font-size: 0.85rem;
	}
	.header-context,
	.breadcrumb {
		color: #958b82;
		font-size: 0.85rem;
	}
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.text-button {
		border: 0;
		padding: 0;
		color: #aaa097;
		background: none;
	}
	.text-button:hover {
		color: #f0c97e;
	}
	.account {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-left: auto;
	}
	.locale-select {
		border: 1px solid #5f4c3c;
		border-radius: 6px;
		padding: 0.35rem 0.4rem;
		color: #eadfce;
		background: #211a1d;
		font:
			700 0.68rem/1 system-ui,
			sans-serif;
		letter-spacing: 0.06em;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border: 1px solid #765d3d;
		border-radius: 50%;
		color: #f2ce8e;
		background: #2f231e;
		font-size: 0.78rem;
		font-weight: 800;
	}
	.account-email {
		max-width: 230px;
		overflow: hidden;
		color: #b9aea3;
		font-size: 0.8rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.text-button {
		margin-left: 0.5rem;
		font-size: 0.8rem;
	}
	.role-badge {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		padding: 0.3rem 0.52rem;
		border: 1px solid;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.role-badge.gm {
		border-color: #895f34;
		color: #edbf75;
		background: rgba(119, 75, 32, 0.12);
	}
	.role-badge.player {
		border-color: #4f617d;
		color: #a9c2eb;
		background: rgba(51, 72, 112, 0.16);
	}
	.status-message {
		color: #a89b8e;
	}
	.game-header {
		display: none;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		padding: 2rem clamp(1.25rem, 5vw, 5rem);
		border-bottom: 1px solid #30292a;
	}
	.game-header h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3.4rem);
	}
	.game-header .eyebrow {
		margin: 0 0 0.8rem;
	}
	.game-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.workspace-tabs {
		display: flex;
		gap: 0.3rem;
		padding: 0 clamp(1.25rem, 5vw, 5rem);
		border-bottom: 1px solid #30292a;
		background: rgba(24, 20, 23, 0.68);
	}
	.workspace-tabs button {
		border: 0;
		border-bottom: 2px solid transparent;
		padding: 0.85rem 1rem 0.75rem;
		color: #9e9288;
		background: transparent;
		font-size: 0.78rem;
		font-weight: 750;
	}
	.workspace-tabs button:hover {
		color: #edcf94;
	}
	.workspace-tabs button.active {
		border-bottom-color: #d8ad67;
		color: #f4e5cb;
	}
	.campaign-settings {
		display: grid;
		gap: 1.5rem;
		min-height: 510px;
		min-width: 0;
		padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1.25rem, 5vw, 5rem);
		color: #e9dfd3;
	}
	.overlay-workspace {
		min-width: 0;
		overflow-x: hidden;
	}
	.overlay-workspace > * {
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
	}
	.overlay-settings {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
	}
	.overlay-toggle-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
	}
	.overlay-toggle-card h2 {
		margin-bottom: 0.35rem;
	}
	.overlay-toggle-card p:not(.eyebrow) {
		margin: 0;
		color: #a99c91;
		font-size: 0.82rem;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: #d8c9b9;
		font-size: 0.78rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.switch span {
		position: relative;
		width: 2.5rem;
		height: 1.35rem;
		border-radius: 999px;
		background: #4a3d36;
		transition: background 0.2s;
	}
	.switch span::after {
		content: '';
		position: absolute;
		top: 0.18rem;
		left: 0.18rem;
		width: 0.99rem;
		height: 0.99rem;
		border-radius: 50%;
		background: #e9dfd3;
		transition: transform 0.2s;
	}
	.switch input:checked + span {
		background: #9a6d35;
	}
	.switch input:checked + span::after {
		transform: translateX(1.15rem);
	}
	.overlay-settings h3 {
		margin: 0 0 0.45rem;
		color: #f0e0c8;
		font:
			600 clamp(1.1rem, 2vw, 1.35rem) Georgia,
			serif;
	}
	.overlay-settings > p:not(.eyebrow) {
		margin: 0 0 1rem;
		max-width: 680px;
		color: #a99c91;
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.overlay-camera-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr));
		gap: 0.75rem;
		width: 100%;
		min-width: 0;
	}
	.overlay-camera-grid fieldset {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
		margin: 0;
		border: 1px solid #51443a;
		border-radius: 9px;
		padding: 0.75rem;
		background: #181417;
	}
	.overlay-camera-grid legend {
		max-width: 100%;
		padding: 0 0.3rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.overlay-camera-grid input {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.55rem 0.6rem;
		color: #eee4d6;
		background: #211c1e;
		font-family: inherit;
		font-size: 0.76rem;
	}
	.overlay-camera-grid select {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.55rem 0.6rem;
		color: #eee4d6;
		background: #211c1e;
		font: inherit;
		font-size: 0.76rem;
	}
	.camera-character-link {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		color: #b6a899;
		font-size: 0.7rem;
	}
	.overlay-camera-grid input::placeholder {
		color: #84776d;
	}
	.overlay-camera-grid input:focus {
		border-color: #d8ad67;
		outline: 2px solid rgba(216, 173, 103, 0.2);
		outline-offset: 1px;
	}
	.overlay-settings > .settings-actions {
		margin-top: 1rem;
	}
	.campaign-settings h2 {
		margin: 0 0 0.6rem;
		font:
			500 clamp(1.8rem, 4vw, 2.7rem) Georgia,
			serif;
	}
	.campaign-settings section > p:not(.eyebrow) {
		max-width: 580px;
		color: #a99c91;
		line-height: 1.6;
	}
	.settings-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}
	.settings-actions .primary-button {
		width: auto;
	}
	.scene-control {
		display: flex;
		align-items: end;
		gap: 0.35rem;
	}
	.scene-control label {
		color: #96897e;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.scene-control select {
		max-width: 160px;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.52rem 0.6rem;
		color: #e4d7c7;
		background: #211c1e;
		font-size: 0.76rem;
	}
	.scene-add {
		width: 2rem;
		height: 2rem;
		border: 1px solid #806039;
		border-radius: 7px;
		color: #f0cb85;
		background: #2b211e;
		font-size: 1.1rem;
	}
	.scene-add:hover {
		background: #4a3223;
	}
	.scene-creator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.scene-creator input {
		width: 150px;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.48rem 0.55rem;
		color: #eee4d6;
		background: #181216;
		font-size: 0.75rem;
	}
	.scene-creator button {
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.48rem 0.6rem;
		color: #25190f;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 800;
	}
	.secondary-button {
		border: 1px solid #5c5045;
		border-radius: 8px;
		padding: 0.65rem 0.85rem;
		color: #e4d7c7;
		background: #211c1e;
	}
	.secondary-button:hover {
		border-color: #c19c62;
		color: #f6d89c;
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
	.scene-overlay-link {
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		color: #f0cb85;
		background: #211a1d;
		font-size: 0.8rem;
		text-decoration: none;
	}
	.scene-overlay-link:hover {
		border-color: #d8ad67;
		background: #34271f;
	}
	.scene-overlay-copy {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		color: #f0cb85;
		background: #211a1d;
		font-size: 0.62rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.scene-overlay-copy:hover {
		border-color: #d8ad67;
		background: #34271f;
	}
	@media (max-width: 760px) {
		.app-shell {
			padding-bottom: calc(8rem + env(safe-area-inset-bottom));
		}
		.app-header {
			position: sticky;
			top: 0;
			z-index: 40;
			min-height: 2.8rem;
			padding: 0.4rem 0.65rem;
			background: rgba(20, 17, 20, 0.96);
			backdrop-filter: blur(12px);
		}
		.account {
			gap: 0.45rem;
		}
		.locale-select {
			min-height: 2rem;
		}
		.auth-shell {
			grid-template-columns: 1fr;
			gap: 3rem;
			padding: 2rem 1.5rem;
		}
		.auth-intro h1 {
			font-size: 3.4rem;
		}
		.app-header {
			gap: 1rem;
		}
		.header-context,
		.account-email {
			display: none;
		}
		.game-header {
			align-items: flex-start;
			flex-direction: column;
		}
		.workspace-tabs {
			position: sticky;
			top: 2.8rem;
			z-index: 35;
			overflow-x: auto;
			scrollbar-width: none;
			padding: 0 1.25rem;
			background: rgba(20, 17, 20, 0.94);
			backdrop-filter: blur(10px);
		}
		.workspace-tabs::-webkit-scrollbar {
			display: none;
		}
		.workspace-tabs button {
			white-space: nowrap;
		}
		.game-header {
			gap: 0.65rem;
			padding: 0.85rem 1rem;
		}
		.game-header h1 {
			font-size: 1.45rem;
		}
		.scene-control select {
			max-width: 125px;
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
		.campaign-settings {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.overlay-settings {
			padding: 0.85rem;
		}
		.overlay-toggle-card {
			align-items: flex-start;
			flex-direction: column;
		}
		.overlay-camera-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.overlay-camera-grid fieldset {
			padding: 0.65rem;
		}
		.settings-actions {
			display: grid;
			grid-template-columns: 1fr;
		}
		.settings-actions button {
			width: 100%;
		}
	}
</style>
