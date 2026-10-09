<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createCharacterForGM,
		listParticipants,
		type Participant
	} from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	type SheetComponentType = typeof import('$lib/components/CharacterSheet.svelte').default;

	let {
		campaignId,
		session,
		isGM,
		SheetComponent,
		selectedCharacterId,
		selectedCharacterOwnerName,
		onselectcharacter,
		onclearselection,
		onopenpanel,
		onopenwindow,
		onresolved
	}: {
		campaignId: string;
		session: Session;
		isGM: boolean;
		SheetComponent: SheetComponentType | null;
		selectedCharacterId: string | null;
		selectedCharacterOwnerName: string;
		onselectcharacter: (characterId: string, ownerName: string) => void;
		onclearselection: () => void;
		onopenpanel: (characterId: string, ownerName: string) => void;
		onopenwindow: (characterId: string) => boolean;
		onresolved: (characterId: string) => void;
	} = $props();

	let participants = $state<Participant[]>([]);
	let loading = $state(true);
	let message = $state('');
	let creatingFor = $state<string | null>(null);
	let selectedParticipant = $derived(
		participants.find((participant) => participant.character?.id === selectedCharacterId) ?? null
	);
	let availableSheets = $derived(
		participants.filter(
			(participant) =>
				participant.character &&
				(participant.role === 'player' || participant.character.id === selectedCharacterId)
		)
	);

	onMount(async () => {
		if (!isGM) {
			loading = false;
			return;
		}
		try {
			participants = (await listParticipants(session, campaignId)).participants;
			const currentSelection = participants.find(
				(participant) => participant.character?.id === selectedCharacterId
			);
			if (currentSelection?.character) return;
			const firstWithSheet = participants.find(
				(participant) => participant.role === 'player' && participant.character
			);
			if (firstWithSheet?.character)
				onselectcharacter(firstWithSheet.character.id, firstWithSheet.displayName);
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
			participant.character = character;
			onselectcharacter(character.id, participant.displayName);
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
	{#if !isGM}
		{#if SheetComponent}<SheetComponent
				{campaignId}
				sceneId=""
				{session}
				{isGM}
				embedded
				onCharacterResolved={onresolved}
				onOpenPanel={(characterId) => onopenpanel(characterId, '')}
				onOpenNewWindow={onopenwindow}
				onclose={() => {}}
				onTokenCreated={() => {}}
			/>{:else}<p class="status" role="status">
				{$appLocale === 'en' ? 'Loading character sheet…' : 'Carregando ficha…'}
			</p>{/if}
	{:else if loading}<p class="status">
			{$appLocale === 'en' ? 'Loading the campaign cast…' : 'Carregando o elenco da campanha…'}
		</p>
	{:else if message}<p class="status error">{message}</p>
	{:else}
		{#if selectedCharacterId && selectedParticipant?.character}
			<div class="sheet-picker">
				<label for="campaign-sheet-picker">
					{$appLocale === 'en' ? 'Campaign character' : 'Personagem da campanha'}
					<select
						id="campaign-sheet-picker"
						value={selectedCharacterId}
						onchange={(event) => {
							const participant = availableSheets.find(
								(item) => item.character?.id === event.currentTarget.value
							);
							if (participant?.character)
								onselectcharacter(participant.character.id, participant.displayName);
						}}
					>
						{#each availableSheets as participant (participant.character!.id)}
							<option value={participant.character!.id}>
								{participant.character!.sheet.name} · {participant.displayName}
							</option>
						{/each}
					</select>
				</label>
				<button type="button" onclick={onclearselection}>
					{$appLocale === 'en' ? 'Back to cast' : 'Voltar ao elenco'}
				</button>
			</div>
			{#if SheetComponent}{#key selectedCharacterId}<SheetComponent
						{campaignId}
						sceneId=""
						{session}
						{isGM}
						characterId={selectedCharacterId}
						characterOwnerName={selectedCharacterOwnerName || selectedParticipant.displayName}
						embedded
						onCharacterResolved={onresolved}
						onOpenPanel={(characterId) =>
							onopenpanel(
								characterId,
								selectedCharacterOwnerName || selectedParticipant.displayName
							)}
						onOpenNewWindow={onopenwindow}
						onclose={() => {}}
						onTokenCreated={() => {}}
					/>{/key}{/if}
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
								onclick={() =>
									onselectcharacter(participant.character!.id, participant.displayName)}
								>{$appLocale === 'en' ? 'Select sheet' : 'Selecionar ficha'}</button
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
	{/if}
</section>

<style>
	.sheets-view {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		box-sizing: border-box;
		overflow: hidden;
		width: 100%;
		height: calc(100dvh - 6.5rem - var(--mm-audio-footer-offset, 4.1rem));
		min-height: 0;
		padding: 0.5rem clamp(0.35rem, 1vw, 0.8rem);
		color: #eee4d6;
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
	.details small {
		color: #a99c91;
		font-size: 0.78rem;
	}
	.sheet-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		min-height: 0;
		flex: 1 1 auto;
		overflow: auto;
		gap: 0.8rem;
	}
	.sheet-picker {
		position: relative;
		flex: 0 0 auto;
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
	@media (max-width: 760px) {
		.sheets-view {
			height: calc(100dvh - 6rem - var(--mm-audio-footer-offset, 6.5rem));
			padding: 0.35rem;
		}
		.sheet-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.sheet-picker {
			padding: 0.45rem;
		}
	}
</style>
