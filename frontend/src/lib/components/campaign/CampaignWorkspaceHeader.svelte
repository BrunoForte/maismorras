<script lang="ts">
	import type { WorkspaceTab } from '$lib/utils/campaignWorkspaceState';

	type Locale = 'en' | 'pt-BR';
	type CampaignHeader = { name: string; role: 'gm' | 'player' };
	type SceneOption = { id: string; name: string };
	type Props = {
		campaign: CampaignHeader | null;
		scenes: SceneOption[];
		activeSceneId: string;
		email: string;
		locale: Locale;
		activeTab: WorkspaceTab;
		creatingScene: boolean;
		sceneCreatorOpen: boolean;
		sceneDraft: string;
		onreturntocampaigns: () => void;
		onsceneselect: (sceneId: string) => void;
		ontogglescenecreator: () => void;
		onscenedraftchange: (draft: string) => void;
		oncreatescene: () => void;
		onopenscenesettings: () => void;
		onpublishscenetooverlay: () => void;
		ontabchange: (tab: WorkspaceTab) => void;
		onlanguagechange: (locale: Locale) => void;
		onlogout: () => void;
	};
	let {
		campaign,
		scenes,
		activeSceneId,
		email,
		locale,
		activeTab,
		creatingScene,
		sceneCreatorOpen,
		sceneDraft,
		onreturntocampaigns,
		onsceneselect,
		ontogglescenecreator,
		onscenedraftchange,
		oncreatescene,
		onopenscenesettings,
		onpublishscenetooverlay,
		ontabchange,
		onlanguagechange,
		onlogout
	}: Props = $props();
	const isEnglish = $derived(locale === 'en');
	const isGM = $derived(campaign?.role === 'gm');
	const avatarInitial = $derived(email.slice(0, 1).toUpperCase());
	const tabs: { id: WorkspaceTab; en: string; pt: string }[] = [
		{ id: 'map', en: 'Table', pt: 'Mesa' },
		{ id: 'sheets', en: 'Sheets', pt: 'Fichas' },
		{ id: 'library', en: 'Library', pt: 'Biblioteca' },
		{ id: 'compendium', en: 'Compendium', pt: 'Compêndio' }
	];
</script>

<header class:game-mode={campaign !== null} class="app-header">
	<button
		class="brand-lockup brand-button"
		onclick={onreturntocampaigns}
		aria-label={isEnglish ? 'Go to your tables' : 'Ir para suas mesas'}
	>
		<span class="brand-mark" aria-hidden="true">M</span><span>{campaign?.name ?? 'MaisMorras'}</span
		>
	</button>
	{#if campaign}
		<div class="header-scene">
			<div class="scene-control">
				<label for="header-scene-select">{isEnglish ? 'Scene' : 'Cena'}</label>
				<select
					id="header-scene-select"
					value={activeSceneId}
					aria-label={isEnglish ? 'Select scene' : 'Selecionar cena'}
					onchange={(event) => onsceneselect(event.currentTarget.value)}
				>
					{#each scenes as scene (scene.id)}<option value={scene.id}>{scene.name}</option>{/each}
				</select>
				{#if isGM}
					<button
						class="scene-add"
						onclick={ontogglescenecreator}
						disabled={creatingScene}
						title={isEnglish ? 'Create scene' : 'Criar cena'}
						aria-label={isEnglish ? 'Create scene' : 'Criar cena'}>+</button
					>
				{/if}
				{#if isGM && activeSceneId}
					<button
						class="scene-add"
						onclick={onopenscenesettings}
						title={isEnglish ? 'Configure scene' : 'Configurar cena'}
						aria-label={isEnglish ? 'Configure scene' : 'Configurar cena'}>⚙</button
					>
				{/if}
			</div>
			{#if activeSceneId}
				<button
					class="scene-overlay-link"
					onclick={onpublishscenetooverlay}
					title={isEnglish ? 'Send current scene to overlay' : 'Enviar cena atual para a overlay'}
					aria-label={isEnglish ? 'Publish scene to overlay' : 'Publicar cena na overlay'}>↻</button
				>
			{/if}
			{#if isGM && sceneCreatorOpen}
				<form
					class="scene-creator"
					onsubmit={(event) => {
						event.preventDefault();
						oncreatescene();
					}}
				>
					<input
						value={sceneDraft}
						oninput={(event) => onscenedraftchange(event.currentTarget.value)}
						maxlength="120"
						aria-label={isEnglish ? 'New scene name' : 'Nome da nova cena'}
						placeholder={isEnglish ? 'New scene name' : 'Nome da nova cena'}
					/>
					<button disabled={creatingScene}>
						{creatingScene
							? isEnglish
								? 'Creating…'
								: 'Criando…'
							: isEnglish
								? 'Create'
								: 'Criar'}
					</button>
				</form>
			{/if}
		</div>
	{:else}
		<p class="header-context">{isEnglish ? 'Campaign hub' : 'Central de campanhas'}</p>
	{/if}
	<div class="account">
		<select
			class="locale-select"
			aria-label={isEnglish ? 'Language' : 'Idioma'}
			value={locale}
			onchange={(event) => onlanguagechange(event.currentTarget.value === 'en' ? 'en' : 'pt-BR')}
		>
			<option value="pt-BR">PT</option><option value="en">EN</option>
		</select>
		<span class="avatar">{avatarInitial}</span>
		<div class="account-copy">
			<span class="account-email">{email}</span>
			{#if campaign}<small class="account-role">
					{campaign.role === 'gm'
						? isEnglish
							? 'Game Master'
							: 'Narrador'
						: isEnglish
							? 'Player'
							: 'Jogador'}
				</small>{/if}
		</div>
		<button class="text-button" onclick={onlogout}>{isEnglish ? 'Sign out' : 'Sair'}</button>
	</div>
</header>

{#if campaign}
	<section class="game-header">
		<div>
			<p class="eyebrow">{isEnglish ? 'ACTIVE TABLE' : 'MESA ATIVA'}</p>
			<h1>{campaign.name}</h1>
		</div>
		<span class="role-badge {campaign.role}">
			{campaign.role === 'gm'
				? isEnglish
					? '✦ Game Master'
					: '✦ Narrador'
				: isEnglish
					? '◈ Player'
					: '◈ Jogador'}
		</span>
	</section>
	<nav class="workspace-tabs" aria-label={isEnglish ? 'Table areas' : 'Áreas da mesa'}>
		{#each tabs as tab (tab.id)}
			<button class:active={activeTab === tab.id} onclick={() => ontabchange(tab.id)}>
				{isEnglish ? tab.en : tab.pt}
			</button>
		{/each}
		{#if isGM}
			<button class:active={activeTab === 'bestiary'} onclick={() => ontabchange('bestiary')}
				>{isEnglish ? 'Bestiary' : 'Bestiário'}</button
			>
			<button class:active={activeTab === 'campaign'} onclick={() => ontabchange('campaign')}
				>{isEnglish ? 'Campaign' : 'Campanha'}</button
			>
			<button class:active={activeTab === 'overlay'} onclick={() => ontabchange('overlay')}
				>Overlay</button
			>
		{/if}
	</nav>
{/if}

<style>
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
	.app-header.game-mode .brand-button {
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
	.header-context {
		color: #958b82;
		font-size: 0.85rem;
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
	@media (max-width: 760px) {
		.app-header {
			position: sticky;
			top: 0;
			z-index: 40;
			min-height: 2.8rem;
			padding: 0.4rem 0.65rem;
			background: rgba(20, 17, 20, 0.96);
			backdrop-filter: blur(12px);
			gap: 1rem;
		}
		.account {
			gap: 0.45rem;
		}
		.locale-select {
			min-height: 2rem;
		}
		.header-context,
		.account-email {
			display: none;
		}
		.game-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.65rem;
			padding: 0.85rem 1rem;
		}
		.game-header h1 {
			font-size: 1.45rem;
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
		.scene-control select {
			max-width: 125px;
		}
	}
</style>
