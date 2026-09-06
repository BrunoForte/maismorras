<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import CanvasMesa from '$lib/components/CanvasMesa.svelte';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';
	import ParticipantsPanel from '$lib/components/ParticipantsPanel.svelte';
	import NotesPanel from '$lib/components/NotesPanel.svelte';
	import NPCsPanel from '$lib/components/NPCsPanel.svelte';
	import { supabase } from '$lib/services/supabase';
	import { createScene, listScenes, type Scene } from '$lib/services/sceneApi';
	import { personagens } from '$lib/stores/gameStore';

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
	let inviteStatus = $state('');
	let inviteProcessed = false;
	let participantsOpen = $state(false);
	let notesOpen = $state(false);
	let npcsOpen = $state(false);
	let availableScenes = $state<Scene[]>([]);
	let creatingScene = $state(false);

	onMount(() => {
		if (!supabase) {
			error = 'Configure PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env.';
			loading = false;
			return;
		}
		supabase.auth.getSession().then(({ data }) => {
			session = data.session;
			if (data.session)
				void acceptPendingInvite(data.session).then(() => loadCampaigns(data.session));
			loading = false;
		});
		const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			session = nextSession;
			if (nextSession) void acceptPendingInvite(nextSession).then(() => loadCampaigns(nextSession));
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
			options: { redirectTo: window.location.origin }
		});
		if (authError) error = authError.message;
	}
	async function logout() {
		await supabase?.auth.signOut();
	}
	async function api(path: string, init: RequestInit = {}, currentSession = session) {
		if (!currentSession) throw new Error('Sessão indisponível.');
		const response = await fetch(
			`${import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080'}${path}`,
			{
				...init,
				headers: {
					...init.headers,
					Authorization: `Bearer ${currentSession.access_token}`,
					'Content-Type': 'application/json'
				}
			}
		);
		if (!response.ok)
			throw new Error(
				(await response.json()).error?.message ?? 'Erro ao comunicar com o servidor.'
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
			error = err instanceof Error ? err.message : 'Não foi possível carregar as mesas.';
		} finally {
			loadingCampaigns = false;
		}
	}
	async function acceptPendingInvite(currentSession: Session) {
		const code = new URLSearchParams(window.location.search).get('invite');
		if (!code || inviteProcessed) return;
		inviteProcessed = true;
		try {
			const campaign = await api(
				`/api/v1/invites/${code}/accept`,
				{ method: 'POST' },
				currentSession
			);
			inviteStatus = `Você entrou em “${campaign.name}”.`;
			window.history.replaceState({}, '', window.location.pathname);
		} catch (err) {
			inviteStatus = err instanceof Error ? err.message : 'Não foi possível aceitar o convite.';
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
			inviteStatus = 'Link de convite copiado. Ele expira em 14 dias e pode ser usado uma vez.';
		} catch (err) {
			inviteStatus = err instanceof Error ? err.message : 'Não foi possível criar o convite.';
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
			error = err instanceof Error ? err.message : 'Não foi possível criar a mesa.';
		}
	}
	async function openCampaign(campaign: Campaign) {
		// Tokens pertencem a uma cena. Nunca carregue o estado visual da mesa anterior.
		personagens.set([]);
		activeCampaign = campaign;
		activeScene = null;
		if (!session) return;
		try {
			const response = await listScenes(session, campaign.id);
			availableScenes = response.scenes;
			if (availableScenes.length === 0 && campaign.role === 'gm') {
				availableScenes = [await createScene(session, campaign.id, 'Cena principal')];
			}
			activeScene = availableScenes[0] ?? null;
			if (!activeScene) error = 'O narrador ainda não criou uma cena para esta campanha.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível abrir a cena.';
		}
	}
	function selectScene(sceneId: string) {
		const scene = availableScenes.find((item) => item.id === sceneId);
		if (!scene || scene.id === activeScene?.id) return;
		personagens.set([]);
		activeScene = scene;
	}
	async function addScene() {
		if (!activeCampaign || !session || creatingScene) return;
		const name = window.prompt('Nome da nova cena:', `Cena ${availableScenes.length + 1}`)?.trim();
		if (!name) return;
		creatingScene = true;
		try {
			const scene = await createScene(session, activeCampaign.id, name);
			availableScenes = [...availableScenes, scene];
			selectScene(scene.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível criar a cena.';
		} finally {
			creatingScene = false;
		}
	}
	async function reloadActiveScene() {
		const currentScene = activeScene;
		if (!currentScene) return;
		activeScene = null;
		await tick();
		activeScene = currentScene;
	}
</script>

{#if loading}
	<main class="loading-screen" aria-live="polite">
		<div class="brand-mark">M</div>
		<p>Preparando os portais…</p>
	</main>
{:else if !session}
	<main class="auth-shell">
		<section class="auth-intro">
			<div class="brand-lockup">
				<div class="brand-mark" aria-hidden="true">M</div>
				<span>MaisMorras</span>
			</div>
			<p class="eyebrow">SEU MUNDO. SUA MESA.</p>
			<h1>Onde histórias<br />ganham vida.</h1>
			<p class="auth-copy">
				Uma mesa virtual rápida, feita para aventuras que seus jogadores não vão esquecer.
			</p>
			<div class="feature-list" aria-label="Recursos da plataforma">
				<span>⌘ Mesa em tempo real</span>
				<span>✦ Campanhas persistentes</span>
				<span>◈ Ferramentas para narrar</span>
			</div>
		</section>

		<section class="auth-card">
			<p class="eyebrow">BEM-VINDO</p>
			<h2>Entre na aventura</h2>
			<p>Use sua conta Google para acessar suas mesas e continuar de onde parou.</p>
			{#if error}<p class="error">{error}</p>{/if}
			<button class="google-button" onclick={login} disabled={!supabase}>
				<span class="google-g" aria-hidden="true">G</span> Continuar com Google
			</button>
			<p class="auth-note">Ao entrar, você concorda em jogar com respeito à sua mesa.</p>
		</section>
	</main>
{:else}
	<div class:game-mode={activeCampaign} class="app-shell">
		<header class="app-header">
			<button
				class="brand-lockup brand-button"
				onclick={() => (activeCampaign = null)}
				aria-label="Ir para suas mesas"
			>
				<span class="brand-mark" aria-hidden="true">M</span><span>MaisMorras</span>
			</button>
			{#if activeCampaign}
				<div class="breadcrumb">
					<button onclick={() => (activeCampaign = null)}>Mesas</button><span>/</span><strong
						>{activeCampaign.name}</strong
					>
				</div>
			{:else}
				<p class="header-context">Central de campanhas</p>
			{/if}
			<div class="account">
				<span class="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</span><span
					class="account-email">{session.user.email}</span
				><button class="text-button" onclick={logout}>Sair</button>
			</div>
		</header>

		{#if activeCampaign}
			<section class="game-header">
				<div>
					<p class="eyebrow">MESA ATIVA</p>
					<h1>{activeCampaign.name}</h1>
				</div>
				<div class="game-actions">
					<div class="scene-control">
						<label for="scene-select">Cena</label><select
							id="scene-select"
							value={activeScene?.id ?? ''}
							onchange={(event) => selectScene(event.currentTarget.value)}
							>{#each availableScenes as scene (scene.id)}<option value={scene.id}
									>{scene.name}</option
								>{/each}</select
						>{#if activeCampaign.role === 'gm'}<button
								class="scene-add"
								onclick={addScene}
								disabled={creatingScene}
								title="Criar cena">+</button
							>{/if}
					</div>
					<span class="role-badge {activeCampaign.role}"
						>{activeCampaign.role === 'gm' ? '✦ Narrador' : '◈ Jogador'}</span
					>{#if activeCampaign.role === 'gm'}<button class="secondary-button" onclick={createInvite}
							>Convidar jogador</button
						>{/if}
					>{#if activeCampaign.role === 'gm'}<button
							class="secondary-button"
							onclick={() => (participantsOpen = true)}>Participantes</button
						>{/if}
					>{#if activeCampaign.role === 'gm'}<button
							class="secondary-button"
							onclick={() => (npcsOpen = true)}>NPCs</button
						>{/if}
					><button class="secondary-button" onclick={() => (notesOpen = true)}>Notas</button><button
						class="secondary-button"
						onclick={() => (sheetOpen = true)}>Minha ficha</button
					><button class="secondary-button" onclick={() => (activeCampaign = null)}
						>Trocar mesa</button
					>
				</div>
			</section>
			<main class="vtt-workspace">
				{#if activeScene}{#key activeScene.id}<CanvasMesa
							scene={activeScene}
							{session}
							isGM={activeCampaign.role === 'gm'}
						/><Sidebar
							isGM={activeCampaign.role === 'gm'}
							campaignId={activeCampaign.id}
							{session}
						/>{/key}{:else}<p class="status-message">Carregando cena…</p>{/if}
			</main>
			{#if inviteStatus}<p class="invite-status">{inviteStatus}</p>{/if}
			{#if sheetOpen && activeScene}<CharacterSheet
					campaignId={activeCampaign.id}
					sceneId={activeScene.id}
					{session}
					isGM={activeCampaign.role === 'gm'}
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
		{:else}
			<main class="campaign-hub">
				<section class="hub-hero">
					<div>
						<p class="eyebrow">SUAS AVENTURAS</p>
						<h1>Escolha um portal.</h1>
						<p>Retome uma história ou abra uma nova mesa para sua próxima aventura.</p>
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
					<label for="campaign-name">Criar uma nova mesa</label>
					<div>
						<input
							id="campaign-name"
							bind:value={campaignName}
							maxlength="120"
							placeholder="Ex.: A Cidade das Aranhas"
						/><button class="primary-button">Criar mesa <span aria-hidden="true">→</span></button>
					</div>
				</form>
				<section class="campaign-section">
					<div class="section-heading">
						<h2>Suas mesas</h2>
						<span>{campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}</span>
					</div>
					{#if loadingCampaigns}<p class="status-message">
							Consultando os pergaminhos…
						</p>{:else if campaigns.length === 0}<div class="empty-state">
							<div>◇</div>
							<h3>Sua primeira aventura começa aqui.</h3>
							<p>Crie uma mesa acima para convidar seu grupo.</p>
						</div>{:else}<div class="campaign-list">
							{#each campaigns as campaign (campaign.id)}<button
									class="campaign"
									onclick={() => void openCampaign(campaign)}
									><span class="campaign-emblem">{campaign.name.slice(0, 1).toUpperCase()}</span
									><span class="campaign-info"
										><strong>{campaign.name}</strong><small
											>{campaign.role === 'gm'
												? 'Você narra esta campanha'
												: 'Você participa desta campanha'}</small
										></span
									><span class="role-badge {campaign.role}"
										>{campaign.role === 'gm' ? 'Narrador' : 'Jogador'}</span
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
		display: flex;
		align-items: center;
		gap: 2rem;
		min-height: 72px;
		padding: 0 clamp(1.25rem, 5vw, 5rem);
		border-bottom: 1px solid #30292a;
		background: rgba(20, 17, 20, 0.88);
		backdrop-filter: blur(14px);
	}
	.brand-button {
		border: 0;
		padding: 0;
		background: transparent;
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
	.breadcrumb button,
	.text-button {
		border: 0;
		padding: 0;
		color: #aaa097;
		background: none;
	}
	.breadcrumb button:hover,
	.text-button:hover {
		color: #f0c97e;
	}
	.breadcrumb strong {
		color: #eee5d8;
		font-weight: 600;
	}
	.account {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-left: auto;
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
		display: flex;
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
	.game-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
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
		display: flex;
		align-items: flex-start;
		gap: 1.25rem;
		padding: 1.25rem clamp(1.25rem, 5vw, 5rem) 3rem;
	}
	@media (max-width: 760px) {
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
		.vtt-workspace {
			flex-direction: column;
		}
	}
</style>
