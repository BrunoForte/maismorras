<!-- eslint-disable svelte/no-navigation-without-resolve -- overlay intentionally opens in a separate tab. -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import CanvasMesa from '$lib/components/CanvasMesa.svelte';
	import FloatingChat from '$lib/components/FloatingChat.svelte';
	import ActorDrawer from '$lib/components/ActorDrawer.svelte';
	import DiceOverlay from '$lib/components/DiceOverlay.svelte';
	import TableTools from '$lib/components/TableTools.svelte';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';
	import ParticipantsPanel from '$lib/components/ParticipantsPanel.svelte';
	import NotesPanel from '$lib/components/NotesPanel.svelte';
	import NPCsPanel from '$lib/components/NPCsPanel.svelte';
	import CampaignSheets from '$lib/components/CampaignSheets.svelte';
	import LibraryView from '$lib/components/LibraryView.svelte';
	import CompendiumView from '$lib/components/CompendiumView.svelte';
	import BestiaryView from '$lib/components/BestiaryView.svelte';
	import SceneSettings from '$lib/components/SceneSettings.svelte';
	import { supabase } from '$lib/services/supabase';
	import { createScene, listScenes, type Scene } from '$lib/services/sceneApi';
	import { personagens } from '$lib/stores/gameStore';
	import { appLocale, restoreAppLocale, setAppLocale } from '$lib/stores/locale';
	import { apiBase } from '$lib/services/apiBase';

	let session = $state<Session | null>(null);
	let loading = $state(true);
	let error = $state('');
	type Campaign = { id: string; name: string; role: 'gm' | 'player' };
	let campaigns = $state<Campaign[]>([]);
	let activeCampaign = $state<Campaign | null>(null);
	let activeScene = $state<Scene | null>(null);
	let campaignName = $state('');
	let loadingCampaigns = $state(false);
	let sheetOpen = $state(false);
	let editingCharacter = $state<{ id: string; ownerName: string } | null>(null);
	type WorkspaceTab = 'map' | 'sheets' | 'library' | 'compendium' | 'bestiary' | 'campaign';
	let workspaceTab = $state<WorkspaceTab>('map');
	let sceneRevision = $state(0);
	let inviteStatus = $state('');
	let inviteProcessed = false;
	let participantsOpen = $state(false);
	let notesOpen = $state(false);
	let npcsOpen = $state(false);
	let availableScenes = $state<Scene[]>([]);
	let creatingScene = $state(false);
	let sceneCreatorOpen = $state(false);
	let sceneDraft = $state('');
	let sceneSettingsOpen = $state(false);
	const apiTimeoutMs = 15000;
	let restoringSession = false;
	type OverlayCamera = { url: string; playerName: string; characterName: string; email: string };
	const emptyOverlayCamera = (): OverlayCamera => ({
		url: '',
		playerName: '',
		characterName: '',
		email: ''
	});
	let overlayCameras = $state<OverlayCamera[]>(Array.from({ length: 6 }, emptyOverlayCamera));
	$effect(() => {
		if (overlayCameras.at(-1)?.url.trim())
			overlayCameras = [...overlayCameras, emptyOverlayCamera()];
	});

	onMount(() => {
		restoreAppLocale();
		if (!supabase) {
			error =
				$appLocale === 'en'
					? 'Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY in the .env file.'
					: 'Configure PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env.';
			loading = false;
			return;
		}
		supabase.auth
			.getSession()
			.then(async ({ data }) => {
				session = data.session;
				if (data.session) await restoreSession(data.session);
			})
			.catch((cause) => {
				error = cause instanceof Error ? cause.message : 'Não foi possível restaurar sua sessão.';
			})
			.finally(() => (loading = false));
		const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			session = nextSession;
			if (nextSession) void restoreSession(nextSession);
			else {
				campaigns = [];
				activeCampaign = null;
			}
		});
		return () => data.subscription.unsubscribe();
	});

	async function login() {
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
	async function logout() {
		await supabase?.auth.signOut();
	}
	async function api(path: string, init: RequestInit = {}, currentSession = session) {
		if (!currentSession)
			throw new Error($appLocale === 'en' ? 'Session unavailable.' : 'Sessão indisponível.');
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), apiTimeoutMs);
		let response: Response;
		try {
			response = await fetch(`${apiBase}${path}`, {
				...init,
				signal: controller.signal,
				headers: {
					...init.headers,
					Authorization: `Bearer ${currentSession.access_token}`,
					'Content-Type': 'application/json'
				}
			});
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError')
				throw new Error('O servidor demorou demais para responder. Tente novamente.', { cause });
			throw cause;
		} finally {
			clearTimeout(timeout);
		}
		if (!response.ok)
			throw new Error(
				(await response.json()).error?.message ??
					($appLocale === 'en'
						? 'Could not communicate with the server.'
						: 'Erro ao comunicar com o servidor.')
			);
		return response.json();
	}
	async function loadCampaigns(currentSession = session) {
		loadingCampaigns = true;
		error = '';
		try {
			const response = await api('/api/v1/campaigns', {}, currentSession);
			campaigns = response.campaigns.map(
				(campaign: Campaign & { ID?: string; Name?: string; Role?: 'gm' | 'player' }) => ({
					id: campaign.id ?? campaign.ID ?? '',
					name: campaign.name ?? campaign.Name ?? '',
					role: campaign.role ?? campaign.Role ?? 'player'
				})
			);
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
			const campaign: Campaign = await api(
				`/api/v1/invites/${code}/accept`,
				{ method: 'POST' },
				currentSession
			);
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
			if (invitedCampaign) await openCampaign(invitedCampaign);
		} finally {
			restoringSession = false;
		}
	}
	async function createInvite() {
		if (!activeCampaign || !session) return;
		try {
			const invite = await api(`/api/v1/campaigns/${activeCampaign.id}/invites`, {
				method: 'POST'
			});
			const link = `${window.location.origin}/?invite=${invite.code}`;
			await navigator.clipboard.writeText(link);
			inviteStatus =
				$appLocale === 'en'
					? 'Invite link copied. It expires in 14 days and can be used once.'
					: 'Link de convite copiado. Ele expira em 14 dias e pode ser usado uma vez.';
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
		if (!campaignName.trim()) return;
		try {
			const response = await api('/api/v1/campaigns', {
				method: 'POST',
				body: JSON.stringify({ name: campaignName.trim() })
			});
			const campaign: Campaign = {
				id: response.id ?? response.ID,
				name: response.name ?? response.Name,
				role: response.role ?? response.Role
			};
			campaigns = [campaign, ...campaigns];
			campaignName = '';
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
	async function openCampaign(campaign: Campaign) {
		// Tokens pertencem a uma cena. Nunca carregue o estado visual da mesa anterior.
		personagens.set([]);
		activeCampaign = campaign;
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
		workspaceTab = 'map';
		activeScene = null;
		if (!session) return;
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
			if (!activeScene)
				error =
					$appLocale === 'en'
						? 'The Game Master has not created a scene for this campaign yet.'
						: 'O narrador ainda não criou uma cena para esta campanha.';
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: $appLocale === 'en'
						? 'Could not open the scene.'
						: 'Não foi possível abrir a cena.';
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
	function selectScene(sceneId: string) {
		const scene = availableScenes.find((item) => item.id === sceneId);
		if (!scene || scene.id === activeScene?.id) return;
		personagens.set([]);
		activeScene = scene;
	}
	function openLiveOverlay() {
		if (!activeCampaign || !activeScene) return;
		// URLSearchParams is local and only used to construct the share URL.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({ campaign: activeCampaign.id, scene: activeScene.id });
		overlayCameras.forEach((camera, index) => {
			if (!camera.url) return;
			params.set(`camera${index + 1}`, camera.url);
			if (camera.playerName) params.set(`camera${index + 1}Player`, camera.playerName);
			if (camera.characterName) params.set(`camera${index + 1}Character`, camera.characterName);
		});
		window.open(`/overlay?${params.toString()}`, '_blank', 'noopener,noreferrer');
	}
	function publishOverlayScene() {
		if (!activeCampaign || !activeScene) return;
		const payload = JSON.stringify({ sceneId: activeScene.id, nonce: crypto.randomUUID() });
		localStorage.setItem(`maismorras:overlay:${activeCampaign.id}`, payload);
		if ('BroadcastChannel' in window) {
			const channel = new BroadcastChannel(`maismorras:overlay:${activeCampaign.id}`);
			channel.postMessage({ type: 'scene-change', sceneId: activeScene.id });
			channel.close();
		}
	}
	async function copyLiveOverlayAddress() {
		if (!activeCampaign || !activeScene) return;
		// URLSearchParams is local and only used to construct the share URL.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({ campaign: activeCampaign.id, scene: activeScene.id });
		overlayCameras.forEach((camera, index) => {
			if (!camera.url) return;
			params.set(`camera${index + 1}`, camera.url);
			if (camera.playerName) params.set(`camera${index + 1}Player`, camera.playerName);
			if (camera.characterName) params.set(`camera${index + 1}Character`, camera.characterName);
		});
		await navigator.clipboard.writeText(`${window.location.origin}/overlay?${params.toString()}`);
		inviteStatus = 'Endereço da overlay copiado.';
	}
	function saveOverlayCameras() {
		if (activeCampaign)
			localStorage.setItem(
				`maismorras:overlay-cameras:${activeCampaign.id}`,
				JSON.stringify(overlayCameras)
			);
		inviteStatus = 'Câmeras da overlay salvas.';
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
			<button class="google-button" onclick={login} disabled={!supabase}>
				<span class="google-g" aria-hidden="true">G</span>
				{$appLocale === 'en' ? 'Continue with Google' : 'Continuar com Google'}
			</button>
			<p class="auth-note">
				{$appLocale === 'en'
					? 'By signing in, you agree to play respectfully at your table.'
					: 'Ao entrar, você concorda em jogar com respeito à sua mesa.'}
			</p>
		</section>
	</main>
{:else}
	<div class:game-mode={activeCampaign} class="app-shell">
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
								<CanvasMesa
									scene={activeScene}
									{session}
									isGM={activeCampaign.role === 'gm'}
									onopensheet={(actorId) =>
										activeCampaign?.role === 'gm' ? openCharacter(actorId, '') : openMySheet()}
								/>
								<DiceOverlay />
								<TableTools
									campaignId={activeCampaign.id}
									sceneId={activeScene.id}
									{session}
									isGM={activeCampaign.role === 'gm'}
								/>
								<FloatingChat campaignId={activeCampaign.id} sceneId={activeScene.id} {session} />
								{#if activeCampaign.role === 'gm'}<ActorDrawer
										campaignId={activeCampaign.id}
										sceneId={activeScene.id}
										{session}
										onadded={() => reloadActiveScene()}
									/>{/if}
							</div>
						{/key}{:else}<p class="status-message">Carregando cena…</p>{/if}
				</main>
			{:else if workspaceTab === 'sheets'}<CampaignSheets
					campaignId={activeCampaign.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
					onopenmine={openMySheet}
					onopencharacter={openCharacter}
				/>
			{:else if workspaceTab === 'library'}<LibraryView
					campaignId={activeCampaign.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
					onnotes={() => (notesOpen = true)}
				/>
			{:else if workspaceTab === 'compendium'}<CompendiumView
					campaignId={activeCampaign.id}
					sceneId={activeScene?.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
					ontokencreated={() => void reloadActiveScene()}
				/>
			{:else if workspaceTab === 'bestiary' && activeCampaign.role === 'gm'}<BestiaryView
					campaignId={activeCampaign.id}
					sceneId={activeScene?.id}
					{session}
					ontokencreated={() => void reloadActiveScene()}
				/>
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
					</div>
					<section class="overlay-settings">
						<p class="eyebrow">OVERLAY DA LIVE</p>
						<h3>Link, cena e câmeras</h3>
						<p>
							Configure cinco câmeras de jogadores e uma do narrador. Os nomes serão exibidos junto
							ao vídeo na overlay.
						</p>
						<div class="overlay-camera-grid">
							{#each overlayCameras as camera, index (index)}<fieldset>
									<legend
										>{index === 5 ? 'Câmera do narrador' : `Câmera do jogador ${index + 1}`}</legend
									>
									<input bind:value={camera.url} placeholder="Link https://vdo.ninja/..." />
									<input bind:value={camera.playerName} placeholder="Nome do jogador" />
									<input bind:value={camera.characterName} placeholder="Nome do personagem" />
									<input bind:value={camera.email} type="email" placeholder="E-mail (opcional)" />
								</fieldset>{/each}
						</div>
						<div class="settings-actions">
							<button class="primary-button" onclick={saveOverlayCameras}>Salvar câmeras</button>
							<button class="secondary-button" onclick={openLiveOverlay}>Abrir overlay</button>
							<button class="secondary-button" onclick={() => void copyLiveOverlayAddress()}
								>Copiar link da overlay</button
							>
						</div>
					</section>
				</main>{/if}
			{#if inviteStatus}<p class="invite-status">{inviteStatus}</p>{/if}
			{#if sheetOpen && activeScene}<CharacterSheet
					campaignId={activeCampaign.id}
					sceneId={activeScene.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
					characterId={editingCharacter?.id}
					characterOwnerName={editingCharacter?.ownerName ?? ''}
					docked={workspaceTab === 'map'}
					onclose={() => (sheetOpen = false)}
					onTokenCreated={() => void reloadActiveScene()}
				/>{/if}
			{#if participantsOpen && activeScene}<ParticipantsPanel
					campaignId={activeCampaign.id}
					sceneId={activeScene.id}
					{session}
					onclose={() => (participantsOpen = false)}
					ontokencreated={() => void reloadActiveScene()}
				/>{/if}
			{#if notesOpen}<NotesPanel
					campaignId={activeCampaign.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
					onclose={() => (notesOpen = false)}
				/>{/if}
			{#if npcsOpen && activeScene}<NPCsPanel
					campaignId={activeCampaign.id}
					sceneId={activeScene.id}
					{session}
					onclose={() => (npcsOpen = false)}
					ontokencreated={() => void reloadActiveScene()}
				/>{/if}
			{#if sceneSettingsOpen && activeScene}<SceneSettings
					scene={activeScene}
					{session}
					onclose={() => (sceneSettingsOpen = false)}
					onsaved={(scene) => {
						activeScene = scene;
						availableScenes = availableScenes.map((item) => (item.id === scene.id ? scene : item));
					}}
				/>{/if}
		{:else}
			<main class="campaign-hub">
				<section class="hub-hero">
					<div>
						<p class="eyebrow">{$appLocale === 'en' ? 'YOUR ADVENTURES' : 'SUAS AVENTURAS'}</p>
						<h1>{$appLocale === 'en' ? 'Choose a portal.' : 'Escolha um portal.'}</h1>
						<p>
							{$appLocale === 'en'
								? 'Resume a story or open a new table for your next adventure.'
								: 'Retome uma história ou abra uma nova mesa para sua próxima aventura.'}
						</p>
					</div>
					<div class="hero-die" aria-hidden="true">⌘</div>
				</section>
				{#if error}<p class="error">{error}</p>{/if}
				<form
					class="create-campaign"
					onsubmit={(e) => {
						e.preventDefault();
						void createCampaign();
					}}
				>
					<label for="campaign-name"
						>{$appLocale === 'en' ? 'Create a new table' : 'Criar uma nova mesa'}</label
					>
					<div>
						<input
							id="campaign-name"
							bind:value={campaignName}
							maxlength="120"
							placeholder={$appLocale === 'en'
								? 'E.g. The Spider City'
								: 'Ex.: A Cidade das Aranhas'}
						/><button class="primary-button"
							>{$appLocale === 'en' ? 'Create table' : 'Criar mesa'}
							<span aria-hidden="true">→</span></button
						>
					</div>
				</form>
				<section class="campaign-section">
					<div class="section-heading">
						<h2>{$appLocale === 'en' ? 'Your tables' : 'Suas mesas'}</h2>
						<span
							>{campaigns.length}
							{campaigns.length === 1
								? $appLocale === 'en'
									? 'campaign'
									: 'campanha'
								: $appLocale === 'en'
									? 'campaigns'
									: 'campanhas'}</span
						>
					</div>
					{#if loadingCampaigns}<p class="status-message">
							{$appLocale === 'en' ? 'Consulting the scrolls…' : 'Consultando os pergaminhos…'}
						</p>{:else if campaigns.length === 0}<div class="empty-state">
							<div>◇</div>
							<h3>
								{$appLocale === 'en'
									? 'Your first adventure starts here.'
									: 'Sua primeira aventura começa aqui.'}
							</h3>
							<p>
								{$appLocale === 'en'
									? 'Create a table above to invite your group.'
									: 'Crie uma mesa acima para convidar seu grupo.'}
							</p>
						</div>{:else}<div class="campaign-list">
							{#each campaigns as campaign (campaign.id)}<button
									class="campaign"
									onclick={() => void openCampaign(campaign)}
									><span class="campaign-emblem">{campaign.name.slice(0, 1).toUpperCase()}</span
									><span class="campaign-info"
										><strong>{campaign.name}</strong><small
											>{campaign.role === 'gm'
												? $appLocale === 'en'
													? 'You run this campaign'
													: 'Você narra esta campanha'
												: $appLocale === 'en'
													? 'You play in this campaign'
													: 'Você participa desta campanha'}</small
										></span
									><span class="role-badge {campaign.role}"
										>{campaign.role === 'gm'
											? $appLocale === 'en'
												? 'Game Master'
												: 'Narrador'
											: $appLocale === 'en'
												? 'Player'
												: 'Jogador'}</span
									><span class="campaign-arrow" aria-hidden="true">→</span></button
								>{/each}
						</div>{/if}
				</section>
			</main>
		{/if}
	</div>
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		min-width: 320px;
		color: #f4eee4;
		background: #100e11;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}
	:global(button),
	:global(input) {
		font: inherit;
	}
	:global(button) {
		cursor: pointer;
	}
	:global(button:focus-visible),
	:global(input:focus-visible) {
		outline: 2px solid #d8ad67;
		outline-offset: 3px;
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
	.hub-hero h1,
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
	.campaign-hub {
		width: min(100% - 2.5rem, 980px);
		margin: 0 auto;
		padding: clamp(3rem, 7vw, 6rem) 0;
	}
	.hub-hero {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 2rem;
		padding-bottom: 3rem;
		border-bottom: 1px solid #332d2c;
	}
	.hub-hero .eyebrow,
	.game-header .eyebrow {
		margin: 0 0 0.8rem;
	}
	.hub-hero h1 {
		font-size: clamp(2.8rem, 6vw, 4.7rem);
	}
	.hub-hero p:not(.eyebrow) {
		max-width: 530px;
		margin-bottom: 0;
		color: #a99e94;
		line-height: 1.65;
	}
	.hero-die {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 100px;
		height: 100px;
		border: 1px solid #60492e;
		color: #ddb977;
		background: radial-gradient(circle at 30% 25%, #4a3523, #201a1b 72%);
		clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
		font:
			2.4rem Georgia,
			serif;
	}
	.create-campaign {
		margin: 2rem 0 3.5rem;
		padding: 1.25rem;
		border: 1px solid #3a312e;
		border-radius: 14px;
		background: #201b1e;
	}
	.create-campaign label {
		display: block;
		margin-bottom: 0.75rem;
		color: #e8ded2;
		font-weight: 650;
		font-size: 0.9rem;
	}
	.create-campaign > div {
		display: flex;
		gap: 0.75rem;
	}
	.create-campaign input {
		flex: 1;
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 8px;
		padding: 0.78rem 0.9rem;
		color: #f6eee4;
		background: #151216;
	}
	.create-campaign input::placeholder {
		color: #80766e;
	}
	.create-campaign .primary-button {
		width: auto;
		white-space: nowrap;
	}
	.section-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}
	.section-heading h2 {
		margin: 0;
		font:
			500 1.7rem Georgia,
			serif;
	}
	.section-heading span {
		color: #8f8378;
		font-size: 0.78rem;
	}
	.campaign-list {
		display: grid;
		gap: 0.75rem;
	}
	.campaign {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 1rem 1.15rem;
		border: 1px solid #38302f;
		border-radius: 12px;
		color: #f4eee4;
		background: linear-gradient(90deg, #211c1e, #1b1719);
		text-align: left;
		transition:
			border 0.18s,
			transform 0.18s,
			background 0.18s;
	}
	.campaign:hover {
		border-color: #9a7544;
		background: #282023;
		transform: translateX(3px);
	}
	.campaign-emblem {
		display: grid;
		place-items: center;
		width: 2.7rem;
		height: 2.7rem;
		border: 1px solid #755c3c;
		color: #ebc983;
		background: #2b221f;
		clip-path: polygon(50% 0, 94% 24%, 94% 76%, 50% 100%, 6% 76%, 6% 24%);
		font:
			700 1rem Georgia,
			serif;
	}
	.campaign-info {
		display: grid;
		gap: 0.28rem;
		min-width: 0;
	}
	.campaign-info strong {
		overflow: hidden;
		font:
			600 1.05rem Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.campaign-info small {
		color: #978b81;
		font-size: 0.78rem;
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
	.campaign-arrow {
		color: #bba06e;
		font-size: 1.2rem;
	}
	.status-message,
	.empty-state {
		color: #a89b8e;
	}
	.invite-status {
		position: fixed;
		z-index: 12;
		bottom: 1.25rem;
		left: 50%;
		max-width: min(560px, calc(100% - 2rem));
		margin: 0;
		transform: translateX(-50%);
		border: 1px solid #79603e;
		border-radius: 9px;
		padding: 0.7rem 1rem;
		color: #f0d8aa;
		background: #28201f;
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
		font-size: 0.82rem;
	}
	.empty-state {
		padding: 3.5rem 1rem;
		border: 1px dashed #4a4039;
		border-radius: 12px;
		text-align: center;
	}
	.empty-state > div {
		margin-bottom: 1rem;
		color: #d8ad67;
		font-size: 2rem;
	}
	.empty-state h3 {
		margin-bottom: 0.4rem;
		color: #e8ddd0;
		font:
			500 1.3rem Georgia,
			serif;
	}
	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
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
		padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1.25rem, 5vw, 5rem);
		color: #e9dfd3;
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
			padding-bottom: env(safe-area-inset-bottom);
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
		.campaign-hub {
			width: min(100% - 2rem, 980px);
		}
		.hero-die {
			width: 70px;
			height: 70px;
			font-size: 1.8rem;
		}
		.create-campaign > div {
			flex-direction: column;
		}
		.create-campaign .primary-button {
			width: 100%;
		}
		.campaign {
			grid-template-columns: auto 1fr auto;
		}
		.campaign .role-badge {
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
		.campaign-settings,
		.campaign-hub {
			padding-left: 1rem;
			padding-right: 1rem;
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
