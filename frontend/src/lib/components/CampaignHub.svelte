<script lang="ts">
	import type { CampaignSummary } from '$lib/services/campaignApi';
	import { appLocale } from '$lib/stores/locale';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import { filterCampaigns, type CampaignSystemFilter } from '$lib/utils/campaignHub';

	type Props = {
		campaigns: CampaignSummary[];
		loading: boolean;
		error: string;
		campaignName?: string;
		campaignSystem?: CampaignSummary['systemId'];
		campaignCreateOpen?: boolean;
		campaignFilter?: string;
		campaignSystemFilter?: CampaignSystemFilter;
		oncreate: () => void;
		onopen: (campaign: CampaignSummary) => void;
		onrename: (campaign: CampaignSummary) => void;
		ondelete: (campaign: CampaignSummary) => void;
	};

	let {
		campaigns,
		loading,
		error,
		campaignName = $bindable(''),
		campaignSystem = $bindable<CampaignSummary['systemId']>('dnd2024'),
		campaignCreateOpen = $bindable(false),
		campaignFilter = $bindable(''),
		campaignSystemFilter = $bindable<CampaignSystemFilter>('all'),
		oncreate,
		onopen,
		onrename,
		ondelete
	}: Props = $props();

	let visibleCampaigns = $derived(filterCampaigns(campaigns, campaignFilter, campaignSystemFilter));
</script>

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
		<div class="hero-die" aria-hidden="true"><RpgIcon name="d20" size={58} /></div>
	</section>
	{#if error}<p class="error">{error}</p>{/if}
	<div class="campaign-toolbar">
		<label class="campaign-filter" for="campaign-filter">
			<span>{$appLocale === 'en' ? 'Filter tables' : 'Filtrar mesas'}</span>
			<input
				id="campaign-filter"
				bind:value={campaignFilter}
				placeholder={$appLocale === 'en' ? 'Search by name' : 'Buscar por nome'}
			/>
		</label>
		<label class="campaign-filter campaign-system-filter" for="campaign-system-filter">
			<span>{$appLocale === 'en' ? 'System' : 'Sistema'}</span>
			<select id="campaign-system-filter" bind:value={campaignSystemFilter}>
				<option value="all">{$appLocale === 'en' ? 'All systems' : 'Todos os sistemas'}</option>
				<option value="dnd2024">D&D 2024</option>
			</select>
		</label>
		<button
			class="primary-button new-campaign-button"
			type="button"
			onclick={() => (campaignCreateOpen = true)}
		>
			+ {$appLocale === 'en' ? 'New table' : 'Nova mesa'}
		</button>
	</div>
	{#if campaignCreateOpen}
		<form
			class="create-campaign"
			onsubmit={(event) => {
				event.preventDefault();
				oncreate();
			}}
		>
			<div class="create-campaign-heading">
				<label for="campaign-name"
					>{$appLocale === 'en' ? 'Create a new table' : 'Criar uma nova mesa'}</label
				>
				<button class="text-button" type="button" onclick={() => (campaignCreateOpen = false)}>
					{$appLocale === 'en' ? 'Cancel' : 'Cancelar'}
				</button>
			</div>
			<div>
				<input
					id="campaign-name"
					bind:value={campaignName}
					maxlength="120"
					placeholder={$appLocale === 'en' ? 'E.g. The Spider City' : 'Ex.: A Cidade das Aranhas'}
				/>
				<select
					bind:value={campaignSystem}
					aria-label={$appLocale === 'en' ? 'Game system' : 'Sistema de jogo'}
				>
					<option value="dnd2024">D&D 2024</option>
				</select>
				<button class="primary-button">
					{$appLocale === 'en' ? 'Create table' : 'Criar mesa'}
					<span aria-hidden="true">→</span>
				</button>
			</div>
		</form>
	{/if}
	<section class="campaign-section">
		<div class="section-heading">
			<h2>{$appLocale === 'en' ? 'Your tables' : 'Suas mesas'}</h2>
			<span
				>{visibleCampaigns.length}
				{visibleCampaigns.length === 1
					? $appLocale === 'en'
						? 'campaign'
						: 'campanha'
					: $appLocale === 'en'
						? 'campaigns'
						: 'campanhas'}</span
			>
		</div>
		{#if loading}
			<p class="status-message">
				{$appLocale === 'en' ? 'Consulting the scrolls…' : 'Consultando os pergaminhos…'}
			</p>
		{:else if campaigns.length === 0}
			<div class="empty-state">
				<div><RpgIcon name="campaign" size={36} /></div>
				<h3>
					{$appLocale === 'en'
						? 'Your first adventure starts here.'
						: 'Sua primeira aventura começa aqui.'}
				</h3>
				<p>
					{$appLocale === 'en'
						? 'Use the New table button to invite your group.'
						: 'Use o botão Nova mesa para convidar seu grupo.'}
				</p>
			</div>
		{:else if visibleCampaigns.length === 0}
			<div class="empty-state">
				<div>⌕</div>
				<h3>{$appLocale === 'en' ? 'No tables found.' : 'Nenhuma mesa encontrada.'}</h3>
				<p>
					{$appLocale === 'en'
						? 'Try another name or clear the filter.'
						: 'Tente outro nome ou limpe o filtro.'}
				</p>
				<button
					class="secondary-button"
					type="button"
					onclick={() => {
						campaignFilter = '';
						campaignSystemFilter = 'all';
					}}
				>
					{$appLocale === 'en' ? 'Clear filter' : 'Limpar filtro'}
				</button>
			</div>
		{:else}
			<div class="campaign-list">
				{#each visibleCampaigns as campaign (campaign.id)}
					<div class="campaign">
						<button class="campaign-open" onclick={() => onopen(campaign)}>
							<span class="campaign-emblem">{campaign.name.slice(0, 1).toUpperCase()}</span>
							<span class="campaign-info">
								<strong>{campaign.name}</strong>
								<small>
									{campaign.role === 'gm'
										? $appLocale === 'en'
											? 'You run this campaign'
											: 'Você narra esta campanha'
										: $appLocale === 'en'
											? 'You play in this campaign'
											: 'Você participa desta campanha'}
								</small>
							</span>
							<span class="system-badge"
								>{campaign.systemId === 'dnd2024' ? 'D&D 2024' : campaign.systemId}</span
							>
							<span class="role-badge {campaign.role}">
								{campaign.role === 'gm'
									? $appLocale === 'en'
										? 'Game Master'
										: 'Narrador'
									: $appLocale === 'en'
										? 'Player'
										: 'Jogador'}
							</span>
							<span class="campaign-arrow" aria-hidden="true">→</span>
						</button>
						{#if campaign.role === 'gm'}
							<div class="campaign-actions">
								<button type="button" onclick={() => onrename(campaign)}>Renomear</button>
								<button type="button" class="danger" onclick={() => ondelete(campaign)}
									>Excluir</button
								>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.eyebrow {
		margin: 0 0 0.8rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.18em;
	}
	.hub-hero h1 {
		margin: 0 0 1.25rem;
		font:
			500 clamp(3rem, 6vw, 5.75rem)/0.95 Georgia,
			'Times New Roman',
			serif;
		letter-spacing: -0.045em;
		font-size: clamp(2.8rem, 6vw, 4.7rem);
	}
	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}
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
		cursor: pointer;
	}
	.primary-button:hover {
		background: #f5dbab;
		transform: translateY(-1px);
	}
	.secondary-button {
		border: 1px solid #5c5045;
		border-radius: 8px;
		padding: 0.65rem 0.85rem;
		color: #e4d7c7;
		background: #211c1e;
		cursor: pointer;
	}
	.secondary-button:hover {
		border-color: #c19c62;
		color: #f6d89c;
	}
	.text-button {
		border: 0;
		padding: 0;
		color: #aaa097;
		background: none;
		cursor: pointer;
	}
	.text-button:hover {
		color: #f0c97e;
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
	}
	.hero-die :global(svg) {
		width: 58px;
		height: 58px;
	}
	.campaign-toolbar {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin: 2rem 0 1rem;
	}
	.campaign-filter {
		display: grid;
		gap: 0.45rem;
		flex: 1;
		min-width: 0;
		color: #a99e94;
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.campaign-system-filter {
		flex: 0 0 190px;
		max-width: 220px;
	}
	.new-campaign-button {
		width: auto;
		flex: 0 0 auto;
		white-space: nowrap;
	}
	.campaign-filter input,
	.campaign-filter select {
		width: 100%;
		border: 1px solid #51443a;
		border-radius: 8px;
		padding: 0.78rem 0.9rem;
		color: #f6eee4;
		background: #151216;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
	}
	.create-campaign-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.create-campaign-heading .text-button {
		margin: 0;
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
		width: 100%;
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
	.campaign-open {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 1rem 1.15rem;
		border: 0;
		color: inherit;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.campaign-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
		padding: 0 1rem 0.8rem;
	}
	.campaign-actions button {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #d8ad67;
		background: #211a1d;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.campaign-actions button.danger {
		color: #e29a8a;
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
	.system-badge {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		padding: 0.3rem 0.52rem;
		border: 1px solid #65533b;
		border-radius: 999px;
		color: #d8bd8d;
		background: rgba(119, 75, 32, 0.1);
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
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
	.empty-state > div :global(svg) {
		width: 36px;
		height: 36px;
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
	@media (max-width: 760px) {
		.campaign-hub {
			width: min(100% - 2rem, 980px);
		}
		.hero-die {
			width: 70px;
			height: 70px;
			font-size: 1.8rem;
		}
		.campaign-toolbar {
			align-items: stretch;
			flex-direction: column;
			margin-top: 1.25rem;
		}
		.campaign-filter {
			max-width: none;
		}
		.campaign-system-filter {
			flex-basis: auto;
		}
		.new-campaign-button {
			width: 100%;
			flex: 0 0 auto;
		}
		.create-campaign > div {
			flex-direction: column;
		}
		.create-campaign .primary-button {
			width: 100%;
		}
		.campaign-open {
			grid-template-columns: auto 1fr auto;
			padding: 0.85rem;
		}
		.campaign-open .role-badge {
			display: none;
		}
		.campaign-actions {
			justify-content: flex-start;
			padding: 0 0.85rem 0.75rem;
		}
	}
</style>
