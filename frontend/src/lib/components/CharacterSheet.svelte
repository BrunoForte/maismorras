<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createEmptySheet,
		getCharacterForGM,
		getMyCharacter,
		saveCharacterForGM,
		saveMyCharacter,
		type CharacterSheet as Sheet
	} from '$lib/services/characterApi';
	import { createTokenFromCharacter } from '$lib/services/sceneApi';
	import { getCompendium, type CompendiumEntry } from '$lib/services/compendiumApi';

	let {
		campaignId,
		sceneId,
		session,
		isGM,
		characterId = null,
		characterOwnerName = '',
		onclose,
		onTokenCreated
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		isGM: boolean;
		characterId?: string | null;
		characterOwnerName?: string;
		onclose: () => void;
		onTokenCreated: () => void;
	} = $props();
	let sheet = $state<Sheet>(createEmptySheet());
	let loading = $state(true);
	let saving = $state(false);
	let message = $state('');
	let isNewCharacter = $state(false);
	let compendiumEntries = $state<CompendiumEntry[]>([]);
	const attributes: { key: keyof Sheet['abilityScores']; label: string }[] = [
		{ key: 'strength', label: 'FOR' },
		{ key: 'dexterity', label: 'DES' },
		{ key: 'constitution', label: 'CON' },
		{ key: 'intelligence', label: 'INT' },
		{ key: 'wisdom', label: 'SAB' },
		{ key: 'charisma', label: 'CAR' }
	];
	const modifier = (score: number) => Math.floor((score - 10) / 2);

	onMount(async () => {
		// Lists come from the campaign compendium, so a GM can mix SRD choices,
		// private references and homebrew without exposing unpublished entries.
		void getCompendium(session, campaignId)
			.then((data) => (compendiumEntries = data.entries))
			.catch(() => undefined);
		try {
			sheet = characterId
				? (await getCharacterForGM(session, campaignId, characterId)).sheet
				: (await getMyCharacter(session, campaignId)).sheet;
		} catch (error) {
			if (!characterId && (error as Error & { status?: number }).status === 404)
				isNewCharacter = true;
			else message = error instanceof Error ? error.message : 'Não foi possível carregar a ficha.';
		} finally {
			loading = false;
		}
	});
	const optionsFor = (entryType: string) =>
		compendiumEntries.filter((entry) => entry.entryType === entryType);
	function updateScore(key: keyof Sheet['abilityScores'], value: string) {
		sheet.abilityScores[key] = Math.max(1, Math.min(30, Number(value) || 1));
	}
	function addAttack() {
		sheet.attacks = [
			...sheet.attacks,
			{ name: 'Novo ataque', attackBonus: 0, damage: '', notes: '' }
		];
	}
	function addSpell() {
		sheet.spells = [...sheet.spells, { name: 'Nova magia', level: 0, notes: '' }];
	}
	function removeAttack(index: number) {
		sheet.attacks = sheet.attacks.filter((_, i) => i !== index);
	}
	function removeSpell(index: number) {
		sheet.spells = sheet.spells.filter((_, i) => i !== index);
	}
	async function save() {
		saving = true;
		message = '';
		try {
			sheet = (
				characterId
					? await saveCharacterForGM(session, campaignId, characterId, sheet)
					: await saveMyCharacter(session, campaignId, sheet)
			).sheet;
			isNewCharacter = false;
			message = 'Ficha salva.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
		} finally {
			saving = false;
		}
	}
	async function createBoardToken() {
		if (!isGM) return;
		saving = true;
		message = '';
		try {
			const character = characterId
				? await saveCharacterForGM(session, campaignId, characterId, sheet)
				: await saveMyCharacter(session, campaignId, sheet);
			sheet = character.sheet;
			await createTokenFromCharacter(session, sceneId, character.id);
			message = 'Token criado e vinculado à ficha.';
			onTokenCreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível criar o token.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="sheet-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.currentTarget === event.target) onclose();
	}}
>
	<section class="sheet" aria-label="Ficha de personagem D&D 2024">
		<header>
			<div>
				<p>FICHA D&D 2024 · MVP</p>
				<h2>{sheet.name || 'Nova ficha'}</h2>
				{#if characterOwnerName}<small>Personagem de {characterOwnerName}</small>{/if}
			</div>
			<button onclick={onclose} aria-label="Fechar ficha">×</button>
		</header>
		{#if loading}<p class="status">Carregando ficha…</p>{:else}
			<div class="sheet-body">
				{#if isNewCharacter}
					<aside class="onboarding">
						<strong>Seu personagem começa aqui.</strong>
						<span
							>Preencha os dados, salve a ficha e o narrador poderá vinculá-la a um token na mesa.</span
						>
					</aside>
				{/if}
				<section class="identity">
					<label
						>Nome<input
							bind:value={sheet.name}
							maxlength="120"
							placeholder="Nome do personagem"
						/></label
					><label>Classe<input bind:value={sheet.class} list="class-options" placeholder="Ex.: Guerreiro" /></label
					><label>Nível<input type="number" min="1" max="20" bind:value={sheet.level} /></label
					><label>Espécie<input bind:value={sheet.species} list="species-options" placeholder="Ex.: Humano" /></label
					><label>Antecedente<input bind:value={sheet.background} list="background-options" /></label><label
						>Alinhamento<input bind:value={sheet.alignment} /></label
					>
					<datalist id="class-options">{#each optionsFor('class') as entry (entry.id)}<option value={entry.name}>{entry.summary}</option>{/each}</datalist>
					<datalist id="species-options">{#each optionsFor('species') as entry (entry.id)}<option value={entry.name}>{entry.summary}</option>{/each}</datalist>
					<datalist id="background-options">{#each optionsFor('background') as entry (entry.id)}<option value={entry.name}>{entry.summary}</option>{/each}</datalist>
				</section>
				<section>
					<h3>Atributos</h3>
					<div class="abilities">
						{#each attributes as attribute}<label
								><span>{attribute.label}</span><input
									type="number"
									min="1"
									max="30"
									value={sheet.abilityScores[attribute.key]}
									onchange={(event) => updateScore(attribute.key, event.currentTarget.value)}
								/><small
									>{modifier(sheet.abilityScores[attribute.key]) >= 0 ? '+' : ''}{modifier(
										sheet.abilityScores[attribute.key]
									)}</small
								></label
							>{/each}
					</div>
				</section>
				<section class="combat">
					<h3>Combate</h3>
					<label>CA<input type="number" min="0" max="99" bind:value={sheet.armorClass} /></label
					><label>Deslocamento (m)<input type="number" min="0" bind:value={sheet.speed} /></label
					><label>Proficiência<input type="number" bind:value={sheet.proficiencyBonus} /></label
					><label
						>PV atuais<input
							type="number"
							min="0"
							max={sheet.hitPointsMax}
							bind:value={sheet.hitPointsCurrent}
						/></label
					><label>PV máximos<input type="number" min="1" bind:value={sheet.hitPointsMax} /></label
					><label
						>PV temporários<input type="number" min="0" bind:value={sheet.temporaryHP} /></label
					><label>Dados de vida<input bind:value={sheet.hitDice} /></label><label
						>Percepção passiva<input
							type="number"
							min="0"
							bind:value={sheet.passivePerception}
						/></label
					>
				</section>
				<section>
					<div class="section-title">
						<h3>Ataques</h3>
						<button onclick={addAttack}>+ Ataque</button>
					</div>
					{#each sheet.attacks as attack, index}<div class="line-item">
							<input bind:value={attack.name} placeholder="Nome" /><input
								type="number"
								bind:value={attack.attackBonus}
								aria-label="Bônus de ataque"
							/><input bind:value={attack.damage} placeholder="Dano" /><button
								onclick={() => removeAttack(index)}>×</button
							>
						</div>{/each}
				</section>
				<section>
					<div class="section-title">
						<h3>Magias</h3>
						<button onclick={addSpell}>+ Magia</button>
					</div>
					{#each sheet.spells as spell, index}<div class="line-item">
							<input bind:value={spell.name} placeholder="Nome" /><input
								type="number"
								min="0"
								max="9"
								bind:value={spell.level}
								aria-label="Círculo"
							/><input bind:value={spell.notes} placeholder="Notas" /><button
								onclick={() => removeSpell(index)}>×</button
							>
						</div>{/each}
				</section>
				<section class="notes">
					<label
						>Características e talentos<textarea
							bind:value={sheet.features}
							placeholder="Habilidades importantes, talentos e observações."></textarea></label
					><label
						>Equipamento<textarea
							bind:value={sheet.equipment}
							placeholder="Itens, moedas e anotações."></textarea></label
					>
				</section>
			</div>
			<footer>
				{#if message}<span class:success={message === 'Ficha salva.'}>{message}</span>{/if}
				<button class="save" onclick={save} disabled={saving}
					>{saving ? 'Salvando…' : 'Salvar ficha'}</button
				>
				{#if isGM}
					<button class="save token-button" onclick={createBoardToken} disabled={saving}
						>{saving ? 'Salvando…' : 'Criar token na cena'}</button
					>
				{/if}
			</footer>
		{/if}
	</section>
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 6, 8, 0.72);
		backdrop-filter: blur(5px);
	}
	.sheet {
		width: min(100%, 940px);
		max-height: min(92vh, 900px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 14px;
		color: #eee4d6;
		background: #1b171a;
		box-shadow: 0 30px 90px #000;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	header p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	header small {
		display: block;
		margin-top: 0.25rem;
		color: #a99c91;
		font-size: 0.75rem;
	}
	h2,
	h3 {
		margin: 0;
		font-family: Georgia, serif;
	}
	header button,
	.line-item button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font-size: 1.35rem;
	}
	.sheet-body {
		display: grid;
		gap: 1rem;
		overflow: auto;
		padding: 1.25rem;
	}
	.onboarding {
		display: grid;
		gap: 0.28rem;
		border: 1px solid rgba(216, 173, 103, 0.42);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		color: #d8c5a6;
		background: rgba(92, 57, 31, 0.24);
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.onboarding strong {
		color: #f0cb85;
		font-family: Georgia, serif;
	}
	.identity,
	.combat {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.7rem;
	}
	.identity label:first-child {
		grid-column: span 2;
	}
	label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	input,
	textarea {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	textarea {
		min-height: 74px;
		resize: vertical;
	}
	h3 {
		margin-bottom: 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.55rem;
	}
	.abilities label {
		place-items: center;
		border: 1px solid #4b3d3c;
		border-radius: 7px;
		padding: 0.4rem;
	}
	.abilities input {
		text-align: center;
	}
	.abilities small {
		color: #d8ad67;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-title button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.line-item {
		display: grid;
		grid-template-columns: 1fr 80px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.45rem;
	}
	.notes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	footer {
		border-top: 1px solid #403536;
		border-bottom: 0;
		min-height: 64px;
	}
	footer span {
		color: #ffb2aa;
		font-size: 0.8rem;
	}
	footer span.success {
		color: #a9d8a3;
	}
	.save {
		border: 0;
		border-radius: 7px;
		padding: 0.65rem 1rem;
		color: #24170e;
		background: #ecd09a;
		font-weight: 800;
	}
	.save:disabled {
		opacity: 0.6;
	}
	.token-button {
		margin-left: 0.5rem;
		border: 1px solid #9c7141;
		color: #f0dcae;
		background: #3c2b22;
	}
	.status {
		padding: 2rem;
		color: #bbaea1;
	}
	@media (max-width: 700px) {
		.identity,
		.combat {
			grid-template-columns: repeat(2, 1fr);
		}
		.identity label:first-child {
			grid-column: span 2;
		}
		.abilities {
			grid-template-columns: repeat(3, 1fr);
		}
		.notes {
			grid-template-columns: 1fr;
		}
	}
</style>
