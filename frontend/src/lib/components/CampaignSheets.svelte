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
	let selectedParticipantUserId = $state('');
	let selectedParticipant = $derived(
		participants.find((participant) => participant.userId === selectedParticipantUserId) ?? null
	);

	onMount(async () => {
		if (!isGM) {
			loading = false;
			return;
		}
		try {
			participants = (await listParticipants(session, campaignId)).participants;
			selectedParticipantUserId =
				participants.find((participant) => participant.character)?.userId ??
				participants[0]?.userId ??
				'';
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
	function showSelectedSheet() {
		if (!selectedParticipant) return;
		if (selectedParticipant.character) {
			onopencharacter(selectedParticipant.character.id, selectedParticipant.displayName);
			return;
		}
		void createSheet(selectedParticipant);
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
			<section
				class="sheet-picker"
				aria-label={$appLocale === 'en'
					? 'Choose sheet for the panel'
					: 'Escolher ficha para o painel'}
			>
				<label for="campaign-sheet-picker">
					{$appLocale === 'en' ? 'Participant / character' : 'Participante / personagem'}
					<select id="campaign-sheet-picker" bind:value={selectedParticipantUserId}>
						{#each participants as participant (participant.userId)}
							<option value={participant.userId}>
								{participant.displayName} · {participant.character?.sheet.name ??
									($appLocale === 'en' ? 'No sheet yet' : 'Sem ficha')}
							</option>
						{/each}
					</select>
				</label>
				{#if selectedParticipant}
					<button
						type="button"
						class:create={!selectedParticipant.character}
						onclick={showSelectedSheet}
						disabled={creatingFor === selectedParticipant.userId}
					>
						{creatingFor === selectedParticipant.userId
							? $appLocale === 'en'
								? 'Creating…'
								: 'Criando…'
							: selectedParticipant.character
								? $appLocale === 'en'
									? 'Show selected sheet'
									: 'Exibir ficha selecionada'
								: $appLocale === 'en'
									? 'Create and show sheet'
									: 'Criar e exibir ficha'}
					</button>
				{/if}
			</section>
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
		padding: var(--mm-content-gutter, clamp(1rem, 2.5vw, 2rem));
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
	.sheet-picker {
		grid-column: 1 / -1;
		position: relative;
		z-index: 40;
		display: flex;
		align-items: end;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #5e4931;
		border-radius: 10px;
		background: #201b1e;
	}
	.sheet-picker label {
		display: grid;
		flex: 1;
		gap: 0.35rem;
		color: #cbb9a7;
		font-size: 0.75rem;
	}
	.sheet-picker select {
		min-height: 2.6rem;
		border: 1px solid #79603e;
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
		color: #eee4d6;
		background: #171315;
		font: inherit;
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
		.player-sheet-card,
		.sheet-picker {
			align-items: flex-start;
			flex-direction: column;
		}
		.player-sheet-card button,
		.sheet-picker button {
			width: 100%;
		}
	}
</style>
