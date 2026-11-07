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
	import { resolveCampaignSheetSelection } from '$lib/utils/campaignSheetNavigation';
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
	let availableCharacterIds = $derived([
		...participants.flatMap((participant) =>
			participant.character ? [participant.character.id] : []
		),
		...npcCharacters.map((character) => character.id)
	]);
	let resolvedSelectedCharacterId = $derived(
		resolveCampaignSheetSelection(selectedCharacterId, availableCharacterIds)
	);
	let selectedParticipant = $derived(
		participants.find((participant) => participant.character?.id === resolvedSelectedCharacterId) ??
			null
	);
	let selectedNPC = $derived(
		npcCharacters.find((character) => character.id === resolvedSelectedCharacterId) ?? null
	);
	let availableParticipantSheets = $derived(
		participants.filter(
			(participant) =>
				participant.character &&
				(participant.role === 'player' || participant.character.id === resolvedSelectedCharacterId)
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
			const availableIds = [
				...participants.flatMap((participant) =>
					participant.character ? [participant.character.id] : []
				),
				...npcCharacters.map((character) => character.id)
			];
			if (selectedCharacterId && !resolveCampaignSheetSelection(selectedCharacterId, availableIds))
				onclearselection();
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
			if (resolvedSelectedCharacterId === character.id) onclearselection();
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
		{#if resolvedSelectedCharacterId && hasSelectedSheet}
			<div class="sheet-picker">
				<label for="campaign-sheet-picker">
					{$appLocale === 'en' ? 'Campaign character' : 'Personagem da campanha'}
					<select
						id="campaign-sheet-picker"
						value={resolvedSelectedCharacterId}
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
						{#if availableParticipantSheets.length > 0}<optgroup
								label={$appLocale === 'en' ? 'Characters' : 'Personagens'}
							>
								{#each availableParticipantSheets as participant (participant.character!.id)}
									<option value={participant.character!.id}>
										{participant.character!.sheet.name} · {participant.displayName}
									</option>
								{/each}
							</optgroup>
						{/if}
						{#if npcCharacters.length > 0}<optgroup label="NPCs">
								{#each npcCharacters as character (character.id)}
									<option value={character.id}>{character.name}</option>
								{/each}
							</optgroup>{/if}
					</select>
				</label>
				<button type="button" onclick={() => void returnToCast()}>
					{$appLocale === 'en' ? 'Back to cast' : 'Voltar ao elenco'}
				</button>
			</div>
			{#if SheetComponent}{#key resolvedSelectedCharacterId}<SheetComponent
						{campaignId}
						{sceneId}
						{session}
						{isGM}
						characterId={resolvedSelectedCharacterId}
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
			<div class="cast-list">
				<details class="cast-section" open>
					<summary>
						<span>{$appLocale === 'en' ? 'Characters' : 'Personagens'}</span>
						<span class="section-count">{participants.length}</span>
					</summary>
					{#if participants.length === 0}
						<p class="status">
							{$appLocale === 'en'
								? 'No campaign participants yet.'
								: 'Ainda não há participantes na campanha.'}
						</p>
					{:else}
						<div class="sheet-grid">
							{#each participants as participant (participant.userId)}
								<article class:unready={!participant.character}>
									<div class="avatar" aria-hidden="true">
										{(participant.character?.sheet.name ?? participant.displayName)
											.slice(0, 1)
											.toUpperCase()}
									</div>
									<div class="card-main">
										<div class="details">
											<span class="owner"
												>{$appLocale === 'en'
													? 'Participant: '
													: 'Participante: '}{participant.displayName}
												· {participant.role === 'gm'
													? $appLocale === 'en'
														? 'Game Master'
														: 'Narrador'
													: $appLocale === 'en'
														? 'Player'
														: 'Jogador'}</span
											>
											<strong
												>{participant.character?.sheet.name ??
													($appLocale === 'en'
														? 'Sheet not created yet'
														: 'Ficha ainda não criada')}</strong
											>
											<small
												>{participant.character
													? `${participant.character.sheet.class || ($appLocale === 'en' ? 'No class' : 'Sem classe')} · ${$appLocale === 'en' ? 'level' : 'nível'} ${participant.character.sheet.level}`
													: $appLocale === 'en'
														? 'The player can create this from the Sheets tab.'
														: 'O jogador poderá criar esta ficha pela aba Fichas.'}</small
											>
										</div>
										<div class="card-actions">
											{#if participant.character}
												<button
													class="quiet-action"
													type="button"
													onclick={() =>
														onselectcharacter(participant.character!.id, participant.displayName)}
													>{$appLocale === 'en' ? 'Select sheet' : 'Selecionar ficha'}</button
												>
											{:else}<button
													class="create quiet-action"
													type="button"
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
										</div>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</details>
				<details class="cast-section npc-sheets" open>
					<summary>
						<span>{$appLocale === 'en' ? 'NPCs' : 'NPCs'}</span>
						<span class="section-count">{npcCharacters.length}</span>
					</summary>
					<div class="npc-section-content">
						<div class="npc-section-intro">
							<p>
								{$appLocale === 'en'
									? 'Full NPC sheets are independent from campaign participants.'
									: 'Fichas completas de NPC são independentes dos participantes da campanha.'}
							</p>
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
						</div>
						{#if npcCharacters.length === 0}
							<p class="status">
								{$appLocale === 'en'
									? 'No full NPC sheets yet.'
									: 'Nenhuma ficha completa de NPC ainda.'}
							</p>
						{:else}
							<div class="npc-grid">
								{#each npcCharacters as character (character.id)}
									<article>
										<div class="avatar" aria-hidden="true">
											{character.name.slice(0, 1).toUpperCase()}
										</div>
										<div class="card-main">
											<div class="details">
												<span class="owner"
													>{$appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha'}</span
												>
												<strong>{character.name}</strong>
												<small
													>{character.class || ($appLocale === 'en' ? 'No class' : 'Sem classe')} · {$appLocale ===
													'en'
														? 'level'
														: 'nível'}
													{character.level}</small
												>
											</div>
											<div class="card-actions">
												<button
													type="button"
													onclick={() =>
														onselectcharacter(
															character.id,
															$appLocale === 'en' ? 'Campaign NPC' : 'NPC da campanha'
														)}>{$appLocale === 'en' ? 'Open sheet' : 'Abrir ficha'}</button
												><button
													class="danger quiet-action"
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
											</div>
										</div>
									</article>
								{/each}
							</div>
						{/if}
					</div>
				</details>
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
	.cast-list {
		display: grid;
		align-content: start;
		flex: 1 1 auto;
		min-height: 0;
		gap: 1rem;
		overflow: auto;
		padding: 0.15rem 0.2rem 0.75rem;
	}
	.cast-section {
		display: grid;
		align-content: start;
		min-width: 0;
		gap: 0.7rem;
	}
	.cast-section > summary {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.4rem;
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid #5e4931;
		color: #f0cb85;
		font:
			600 1.05rem Georgia,
			serif;
		cursor: pointer;
		list-style: none;
	}
	.cast-section > summary::-webkit-details-marker {
		display: none;
	}
	.cast-section > summary::before {
		content: '▸';
		color: #c8a268;
		font:
			700 0.9rem system-ui,
			sans-serif;
	}
	.cast-section[open] > summary::before {
		content: '▾';
	}
	.cast-section > summary:focus-visible {
		outline: 2px solid #e0b86f;
		outline-offset: 2px;
	}
	.section-count {
		margin-left: auto;
		color: #b9aa9d;
		font:
			500 0.78rem system-ui,
			sans-serif;
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
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr));
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
		min-width: 0;
		gap: 0.35rem;
		color: #cbb9a7;
		font-size: 0.75rem;
	}
	.sheet-picker select {
		width: 100%;
		min-width: 0;
		min-height: 2.6rem;
		border: 1px solid #79603e;
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
		color: #eee4d6;
		background: #171315;
		font: inherit;
	}
	.sheet-grid article {
		display: grid;
		grid-template-columns: 2.8rem minmax(0, 1fr);
		align-items: start;
		gap: 0.75rem;
		min-width: 0;
		min-height: 7rem;
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
		gap: 0.7rem;
	}
	.npc-section-content {
		display: grid;
		gap: 0.7rem;
	}
	.npc-section-intro {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.65rem;
	}
	.npc-section-intro p {
		margin: 0;
		color: #a99c91;
		font-size: 0.82rem;
	}
	.npc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: 0.6rem;
	}
	.npc-grid article {
		display: grid;
		grid-template-columns: 2.8rem minmax(0, 1fr);
		align-items: start;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.7rem;
		border: 1px solid #4b3d3c;
		border-radius: 9px;
		background: #201b1e;
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
		gap: 0.22rem;
		min-width: 0;
	}
	.owner {
		overflow-wrap: anywhere;
		color: #b6a89b;
		font-size: 0.67rem;
		line-height: 1.4;
	}
	.details strong {
		font:
			600 1rem Georgia,
			serif;
		overflow-wrap: anywhere;
	}
	.details small {
		overflow-wrap: anywhere;
		line-height: 1.4;
	}
	.card-main {
		display: grid;
		min-width: 0;
		gap: 0.65rem;
	}
	.card-actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.quiet-action {
		padding: 0.42rem 0.65rem;
		font-size: 0.82rem;
		line-height: 1.2;
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
	@media (max-width: 380px) {
		.sheet-grid article,
		.npc-grid article {
			grid-template-columns: 2.35rem minmax(0, 1fr);
			gap: 0.55rem;
			padding: 0.7rem;
		}
		.avatar {
			width: 2.35rem;
			height: 2.35rem;
		}
		.card-actions > button {
			max-width: 100%;
			white-space: normal;
		}
	}
	@media (max-width: 480px) {
		.sheet-picker {
			align-items: stretch;
			flex-wrap: wrap;
		}
		.sheet-picker label {
			flex: 1 1 100%;
		}
		.sheet-picker > button {
			align-self: flex-end;
		}
	}
</style>
