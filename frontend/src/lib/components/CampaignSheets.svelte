<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createCharacterForGM,
		listParticipants,
		type Participant
	} from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';

	let {
		campaignId,
		session,
		isGM,
		onopenmine,
		onopencharacter
	}: {
		campaignId: string;
		session: Session;
		isGM: boolean;
		onopenmine: () => void;
		onopencharacter: (characterId: string, ownerName: string) => void;
	} = $props();

	let participants = $state<Participant[]>([]);
	let loading = $state(true);
	let message = $state('');
	let creatingFor = $state<string | null>(null);

	onMount(async () => {
		if (!isGM) {
			loading = false;
			return;
		}
		try {
			participants = (await listParticipants(session, campaignId)).participants;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not load character sheets.'
						: 'Não foi possível carregar as fichas.';
		} finally {
			loading = false;
		}
	});
	async function createSheet(participant: Participant) {
		creatingFor = participant.userId;
		message = '';
		try {
			const character = await createCharacterForGM(session, campaignId, participant.userId);
			onopencharacter(character.id, participant.displayName);
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not create the character sheet.'
						: 'Não foi possível criar a ficha.';
		} finally {
			creatingFor = null;
		}
	}
</script>

<section
	class="sheets-view"
	aria-label={$appLocale === 'en' ? 'Campaign character sheets' : 'Fichas da campanha'}
>
	<header class="view-heading">
		<div>
			<p>{$appLocale === 'en' ? 'TABLE CHARACTERS' : 'PERSONAGENS DA MESA'}</p>
			<h2>
				{isGM
					? $appLocale === 'en'
						? 'Cast and sheets'
						: 'Elenco e fichas'
					: $appLocale === 'en'
						? 'Your sheet'
						: 'Sua ficha'}
			</h2>
			<span
				>{isGM
					? $appLocale === 'en'
						? 'Open and edit any sheet linked to this campaign.'
						: 'Abra e edite qualquer ficha vinculada a esta campanha.'
					: $appLocale === 'en'
						? 'Your sheet belongs to you and follows this campaign.'
						: 'Sua ficha pertence a você e acompanha esta campanha.'}</span
			>
		</div>
		{#if !isGM}<button class="primary" onclick={onopenmine}
				>{$appLocale === 'en' ? 'Open my sheet' : 'Abrir minha ficha'}</button
			>{/if}
	</header>

	{#if !isGM}
		<div class="player-sheet-card">
			<div class="sheet-icon">◇</div>
			<div>
				<strong
					>{$appLocale === 'en'
						? 'D&D 2024 character sheet'
						: 'Ficha de personagem D&D 2024'}</strong
				><span
					>{$appLocale === 'en'
						? 'Create, review, and update your adventurer details.'
						: 'Crie, consulte e atualize os detalhes do seu aventureiro.'}</span
				>
			</div>
			<button onclick={onopenmine}>{$appLocale === 'en' ? 'Open sheet' : 'Abrir ficha'} →</button>
		</div>
	{:else if loading}<p class="status">
			{$appLocale === 'en' ? 'Loading the campaign cast…' : 'Carregando o elenco da campanha…'}
		</p>
	{:else if message}<p class="status error">{message}</p>
	{:else}
		<div class="sheet-grid">
			{#each participants as participant (participant.userId)}
				<article class:unready={!participant.character}>
					<div class="avatar">{participant.displayName.slice(0, 1).toUpperCase()}</div>
					<div class="details">
						<span class="owner"
							>{participant.displayName} · {participant.role === 'gm'
								? $appLocale === 'en'
									? 'Game Master'
									: 'Narrador'
								: $appLocale === 'en'
									? 'Player'
									: 'Jogador'}</span
						>
						<strong>{participant.character?.sheet.name ?? 'Ficha ainda não criada'}</strong>
						<small
							>{participant.character
								? `${participant.character.sheet.class || ($appLocale === 'en' ? 'No class' : 'Sem classe')} · ${$appLocale === 'en' ? 'level' : 'nível'} ${participant.character.sheet.level}`
								: $appLocale === 'en'
									? 'The player can create it from the Sheets tab.'
									: 'O jogador poderá criá-la pela própria aba Fichas.'}</small
						>
					</div>
					{#if participant.character}
						<button
							onclick={() => onopencharacter(participant.character!.id, participant.displayName)}
							>{$appLocale === 'en' ? 'Open and edit' : 'Abrir e editar'}</button
						>
					{:else}<button
							class="create"
							onclick={() => void createSheet(participant)}
							disabled={creatingFor === participant.userId}
							>{creatingFor === participant.userId
								? $appLocale === 'en'
									? 'Creating…'
									: 'Criando…'
								: $appLocale === 'en'
									? 'Create sheet'
									: 'Criar ficha'}</button
						>{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.sheets-view {
		min-height: 510px;
		padding: clamp(1.25rem, 3vw, 2.5rem);
		color: #eee4d6;
	}
	.view-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
		padding-bottom: 1.4rem;
		border-bottom: 1px solid #3b3030;
	}
	.view-heading p {
		margin: 0 0 0.5rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}
	.view-heading h2 {
		margin: 0 0 0.5rem;
		font:
			500 clamp(1.8rem, 4vw, 2.7rem) Georgia,
			serif;
	}
	.view-heading span {
		color: #a99c91;
		font-size: 0.85rem;
	}
	button {
		border: 1px solid #79603e;
		border-radius: 8px;
		padding: 0.65rem 0.8rem;
		color: #f2d59c;
		background: #2b211e;
		font-weight: 700;
		cursor: pointer;
	}
	button:hover {
		border-color: #d8ad67;
		background: #3a2920;
	}
	.primary {
		color: #271a0f;
		background: #ecd09a;
		border: 0;
		white-space: nowrap;
	}
	.player-sheet-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 720px;
		padding: 1.25rem;
		border: 1px solid #5e4931;
		border-radius: 12px;
		background: linear-gradient(125deg, #292020, #1c171a);
	}
	.sheet-icon,
	.avatar {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 2.8rem;
		height: 2.8rem;
		border: 1px solid #806039;
		color: #f0cb85;
		background: #2b211e;
		font:
			700 1.1rem Georgia,
			serif;
	}
	.sheet-icon {
		clip-path: polygon(50% 0, 94% 24%, 94% 76%, 50% 100%, 6% 76%, 6% 24%);
	}
	.player-sheet-card div:nth-child(2) {
		display: grid;
		gap: 0.25rem;
		flex: 1;
	}
	.player-sheet-card strong {
		font:
			600 1.05rem Georgia,
			serif;
	}
	.player-sheet-card span,
	.details small {
		color: #a99c91;
		font-size: 0.78rem;
	}
	.sheet-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 0.8rem;
	}
	.sheet-grid article {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 100px;
		padding: 1rem;
		border: 1px solid #4b3d3c;
		border-radius: 10px;
		background: #201b1e;
	}
	.sheet-grid article.unready {
		opacity: 0.7;
		border-style: dashed;
	}
	.avatar {
		width: 2.35rem;
		height: 2.35rem;
		border-radius: 50%;
	}
	.details {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.18rem;
	}
	.owner {
		overflow: hidden;
		color: #b6a89b;
		font-size: 0.67rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.details strong {
		overflow: hidden;
		font:
			600 1rem Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.create {
		border-color: #806039;
		color: #26190e;
		background: #e0b86f;
	}
	.status {
		color: #b9aa9d;
	}
	.status.error {
		color: #ffb2aa;
	}
	@media (max-width: 650px) {
		.view-heading,
		.player-sheet-card {
			align-items: flex-start;
			flex-direction: column;
		}
		.player-sheet-card button {
			width: 100%;
		}
	}
</style>
