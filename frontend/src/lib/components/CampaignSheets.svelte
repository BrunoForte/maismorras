<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createCharacterForGM,
		createNPCCharacterForGM,
		deleteCharacterForGM,
		listNPCCharacters,
		listParticipants,
		type NPCCharacterSummary,
		type Participant
	} from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	type SheetComponentType = typeof import('$lib/components/CharacterSheet.svelte').default;

	let {
		campaignId,
		sceneId,
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
		sceneId: string;
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
	let npcCharacters = $state<NPCCharacterSummary[]>([]);
	let loading = $state(true);
	let message = $state('');
	let creatingFor = $state<string | null>(null);
	let creatingNPC = $state(false);
	let deletingNPC = $state<string | null>(null);
	let selectedParticipant = $derived(
		participants.find((participant) => participant.character?.id === selectedCharacterId) ?? null
	);
	let selectedNPC = $derived(
		npcCharacters.find((character) => character.id === selectedCharacterId) ?? null
	);
	let availableParticipantSheets = $derived(
		participants.filter(
			(participant) =>
				participant.character &&
				(participant.role === 'player' || participant.character.id === selectedCharacterId)
		)
	);
	let hasSelectedSheet = $derived(Boolean(selectedParticipant?.character || selectedNPC));

	onMount(async () => {
		if (!isGM) {
			loading = false;
			return;
		}
		try {
			const [participantResponse, npcResponse] = await Promise.all([
				listParticipants(session, campaignId),
				listNPCCharacters(session, campaignId)
			]);
			participants = participantResponse.participants;
			npcCharacters = npcResponse.characters;
			const currentSelection = participants.find(
				(participant) => participant.character?.id === selectedCharacterId
			);
			if (
				currentSelection?.character ||
				npcCharacters.some((character) => character.id === selectedCharacterId)
			)
				return;
			const firstWithSheet = participants.find(
				(participant) => participant.role === 'player' && participant.character
			);
			if (firstWithSheet?.character)
				onselectcharacter(firstWithSheet.character.id, firstWithSheet.displayName);
			else if (npcCharacters[0])
				onselectcharacter(
					npcCharacters[0].id,
					$appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha'
				);
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
	async function createNPCCharacter() {
		creatingNPC = true;
		message = '';
		try {
			const character = await createNPCCharacterForGM(session, campaignId);
			npcCharacters = [
				...npcCharacters,
				{
					id: character.id,
					name: character.sheet.name,
					class: character.sheet.class,
					level: character.sheet.level
				}
			];
			onselectcharacter(character.id, $appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha');
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not create NPC sheet.'
						: 'Não foi possível criar a ficha do NPC.';
		} finally {
			creatingNPC = false;
		}
	}
	async function deleteNPCCharacter(character: NPCCharacterSummary) {
		if (
			!confirm(
				$appLocale === 'en'
					? `Delete ${character.name}'s sheet? Any linked scene tokens will also be removed.`
					: `Excluir a ficha de ${character.name}? Os tokens associados nas cenas também serão removidos.`
			)
		)
			return;
		deletingNPC = character.id;
		message = '';
		try {
			await deleteCharacterForGM(session, campaignId, character.id);
			npcCharacters = npcCharacters.filter((item) => item.id !== character.id);
			if (selectedCharacterId === character.id) onclearselection();
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not delete NPC sheet.'
						: 'Não foi possível excluir a ficha do NPC.';
		} finally {
			deletingNPC = null;
		}
	}
	async function returnToCast() {
		message = '';
		try {
			npcCharacters = (await listNPCCharacters(session, campaignId)).characters;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not refresh NPC sheets.'
						: 'Não foi possível atualizar as fichas de NPC.';
		}
		onclearselection();
	}
</script>

<section
	class="sheets-view"
	aria-label={$appLocale === 'en' ? 'Campaign character sheets' : 'Fichas da campanha'}
>
	{#if !isGM}
		{#if SheetComponent}<SheetComponent
				{campaignId}
				{sceneId}
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
		{#if selectedCharacterId && hasSelectedSheet}
			<div class="sheet-picker">
				<label for="campaign-sheet-picker">
					{$appLocale === 'en' ? 'Campaign character' : 'Personagem da campanha'}
					<select
						id="campaign-sheet-picker"
						value={selectedCharacterId}
						onchange={(event) => {
							const participant = availableParticipantSheets.find(
								(item) => item.character?.id === event.currentTarget.value
							);
							if (participant?.character) {
								onselectcharacter(participant.character.id, participant.displayName);
								return;
							}
							const npc = npcCharacters.find((item) => item.id === event.currentTarget.value);
							if (npc)
								onselectcharacter(npc.id, $appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha');
						}}
					>
						{#each availableParticipantSheets as participant (participant.character!.id)}
							<option value={participant.character!.id}>
								{participant.character!.sheet.name} · {participant.displayName}
							</option>
						{/each}
						{#each npcCharacters as character (character.id)}<option value={character.id}
								>{character.name} · {$appLocale === 'en'
									? 'Campaign NPC'
									: 'NPC da campanha'}</option
							>{/each}
					</select>
				</label>
				<button type="button" onclick={() => void returnToCast()}>
					{$appLocale === 'en' ? 'Back to cast' : 'Voltar ao elenco'}
				</button>
			</div>
			{#if SheetComponent}{#key selectedCharacterId}<SheetComponent
						{campaignId}
						{sceneId}
						{session}
						{isGM}
						characterId={selectedCharacterId}
						characterOwnerName={selectedCharacterOwnerName ||
							(selectedParticipant?.displayName ??
								($appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha'))}
						embedded
						onCharacterResolved={onresolved}
						onOpenPanel={(characterId) =>
							onopenpanel(
								characterId,
								selectedCharacterOwnerName ||
									selectedParticipant?.displayName ||
									($appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha')
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
			<section
				class="npc-sheets"
				aria-label={$appLocale === 'en' ? 'Full NPC sheets' : 'Fichas completas de NPC'}
			>
				<header>
					<div>
						<strong>{$appLocale === 'en' ? 'Full NPC sheets' : 'Fichas completas de NPC'}</strong
						><small
							>{$appLocale === 'en'
								? 'Independent from campaign participants.'
								: 'Independentes dos participantes da campanha.'}</small
						>
					</div>
					<button
						class="create"
						type="button"
						onclick={() => void createNPCCharacter()}
						disabled={creatingNPC}
						>{creatingNPC
							? $appLocale === 'en'
								? 'Creating…'
								: 'Criando…'
							: $appLocale === 'en'
								? 'Create NPC sheet'
								: 'Criar ficha de NPC'}</button
					>
				</header>
				{#if npcCharacters.length === 0}<p class="status">
						{$appLocale === 'en'
							? 'No full NPC sheets yet.'
							: 'Nenhuma ficha completa de NPC ainda.'}
					</p>
				{:else}<div class="npc-grid">
						{#each npcCharacters as character (character.id)}<article>
								<div class="details">
									<span class="owner"
										>{$appLocale === 'en' ? 'CAMPAIGN NPC' : 'NPC DA CAMPANHA'}</span
									><strong>{character.name}</strong><small
										>{character.class || ($appLocale === 'en' ? 'No class' : 'Sem classe')} · {$appLocale ===
										'en'
											? 'level'
											: 'nível'}
										{character.level}</small
									>
								</div>
								<button
									type="button"
									onclick={() =>
										onselectcharacter(
											character.id,
											$appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha'
										)}>{$appLocale === 'en' ? 'Open sheet' : 'Abrir ficha'}</button
								><button
									class="danger"
									type="button"
									onclick={() => void deleteNPCCharacter(character)}
									disabled={deletingNPC === character.id}
									>{deletingNPC === character.id
										? $appLocale === 'en'
											? 'Deleting…'
											: 'Excluindo…'
										: $appLocale === 'en'
											? 'Delete'
											: 'Excluir'}</button
								>
							</article>{/each}
					</div>{/if}
			</section>
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
	.npc-sheets {
		display: grid;
		gap: 0.65rem;
		min-height: 0;
		overflow: auto;
		padding-bottom: 0.4rem;
	}
	.npc-sheets > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.npc-sheets > header > div {
		display: grid;
		gap: 0.2rem;
	}
	.npc-sheets > header small {
		color: #a99c91;
		font-size: 0.75rem;
	}
	.npc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: 0.6rem;
	}
	.npc-grid article {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.7rem;
		border: 1px solid #4b3d3c;
		border-radius: 9px;
		background: #201b1e;
	}
	.npc-grid button {
		flex: 0 0 auto;
		padding: 0.5rem 0.6rem;
	}
	button.danger {
		border-color: #8a4c43;
		color: #ffc0b8;
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
