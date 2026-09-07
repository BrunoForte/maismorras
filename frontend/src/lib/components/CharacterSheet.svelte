<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
import {
		createEmptySheet,
		getCharacterForGM,
		getMyCharacter,
		saveCharacterForGM,
		saveMyCharacter,
		type CharacterSheet as Sheet,
		type InventoryItem
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
	let rulesLocale = $state<'pt-BR' | 'en'>('pt-BR');
	let selectedItemId = $state('');
	let selectedSpellId = $state('');
	let spellCircle = $state('all');
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
		rulesLocale = localStorage.getItem('maismorras.rulesLocale') === 'en' ? 'en' : 'pt-BR';
		void getCompendium(session, campaignId)
			.then((data) => (compendiumEntries = data.entries))
			.catch(() => undefined);
		try {
			sheet = characterId
				? (await getCharacterForGM(session, campaignId, characterId)).sheet
				: (await getMyCharacter(session, campaignId)).sheet;
			sheet.inventory ??= [];
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
	const optionLabel = (entry: CompendiumEntry) =>
		rulesLocale === 'pt-BR' ? (entry.translations?.['pt-BR'] || entry.name) : entry.name;
	const entryRules = (entry: CompendiumEntry) => entry.rules as Record<string, unknown>;
	const itemEntries = () => compendiumEntries.filter((entry) => entry.entryType === 'item');
	const itemLabel = (item: InventoryItem) => item.name;
	const modifierText = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
	function canonicalClass(value: string) {
		const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
		return ({ barbaro: 'barbarian', bardo: 'bard', clerigo: 'cleric', druida: 'druid', guerreiro: 'fighter', monge: 'monk', paladino: 'paladin', patrulheiro: 'ranger', ladino: 'rogue', feiticeiro: 'sorcerer', bruxo: 'warlock', mago: 'wizard' } as Record<string, string>)[normalized] ?? normalized;
	}
	const spellEntries = () => compendiumEntries.filter((entry) => {
		if (entry.entryType !== 'spell') return false;
		const rules = entryRules(entry);
		const level = Number(rules.level ?? 0);
		const classes = Array.isArray(rules.classes) ? rules.classes.map(String) : [];
		return (spellCircle === 'all' || level === Number(spellCircle)) && (!canonicalClass(sheet.class) || classes.length === 0 || classes.includes(canonicalClass(sheet.class)));
	});
	function addInventoryItem() {
		const entry = itemEntries().find((item) => item.id === selectedItemId);
		if (!entry) return;
		sheet.inventory = [...sheet.inventory, { entryId: entry.id, name: optionLabel(entry), quantity: 1, equipped: false, rules: entry.rules }];
		selectedItemId = '';
	}
	function removeInventoryItem(index: number) { sheet.inventory = sheet.inventory.filter((_, itemIndex) => itemIndex !== index); }
	function addWeaponAttack(item: InventoryItem) {
		const rules = item.rules;
		if (rules.category !== 'weapon') return;
		const ability = rules.attackAbility === 'dexterity' ? sheet.abilityScores.dexterity : sheet.abilityScores.strength;
		const abilityModifier = modifier(ability);
		const damage = `${String(rules.damage ?? '')}${abilityModifier ? ` ${modifierText(abilityModifier)}` : ''} ${String(rules.damageType ?? '')}`.trim();
		sheet.attacks = [...sheet.attacks, { name: item.name, attackBonus: abilityModifier + sheet.proficiencyBonus, damage, notes: `Item do compêndio · ${Array.isArray(rules.properties) ? rules.properties.join(', ') : ''}` }];
	}
	function addCompendiumSpell() {
		const entry = spellEntries().find((spell) => spell.id === selectedSpellId);
		if (!entry || sheet.spells.some((spell) => spell.name === optionLabel(entry))) return;
		const rules = entryRules(entry);
		sheet.spells = [...sheet.spells, { name: optionLabel(entry), level: Number(rules.level ?? 0), notes: `SRD · ${String(rules.school ?? '')}${rules.range ? ` · ${String(rules.range)}` : ''}` }];
		selectedSpellId = '';
	}
	const equippedDefense = () => sheet.inventory.filter((item) => item.equipped).reduce((total, item) => total + Number(item.rules.armorClassBonus ?? 0), 0);
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
					<datalist id="class-options">{#each optionsFor('class') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
					<datalist id="species-options">{#each optionsFor('species') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
					<datalist id="background-options">{#each optionsFor('background') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
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
				<section class="inventory-section">
					<div class="section-title"><h3>Equipamento</h3><span class="defense-hint">Defesa equipada: +{equippedDefense()} CA</span></div>
					<div class="compendium-picker"><select bind:value={selectedItemId}><option value="">Adicionar item do compêndio…</option>{#each itemEntries() as entry (entry.id)}<option value={entry.id}>{optionLabel(entry)}</option>{/each}</select><button onclick={addInventoryItem} disabled={!selectedItemId}>Adicionar</button></div>
					{#if sheet.inventory.length}<div class="inventory-list">{#each sheet.inventory as item, index}<div class="inventory-item"><label><input type="checkbox" bind:checked={item.equipped}/> equipado</label><strong>{itemLabel(item)}</strong><input type="number" min="0" max="9999" bind:value={item.quantity} aria-label={`Quantidade de ${item.name}`}/>{#if item.rules.category === 'weapon'}<button onclick={() => addWeaponAttack(item)}>+ ataque</button>{/if}<button onclick={() => removeInventoryItem(index)}>×</button></div>{/each}</div>{:else}<p class="empty-inline">Use a lista para incluir armas, escudos e itens rastreáveis.</p>{/if}
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
					<div class="compendium-picker spell-picker"><select bind:value={spellCircle}><option value="all">Todos os círculos</option><option value="0">Truques</option>{#each [1,2,3,4,5,6,7,8,9] as circle}<option value={String(circle)}>Círculo {circle}</option>{/each}</select><select bind:value={selectedSpellId}><option value="">{sheet.class ? 'Magia disponível para a classe…' : 'Defina a classe para filtrar magias…'}</option>{#each spellEntries() as entry (entry.id)}<option value={entry.id}>{optionLabel(entry)} · círculo {Number(entryRules(entry).level ?? 0)}</option>{/each}</select><button onclick={addCompendiumSpell} disabled={!selectedSpellId}>Adicionar</button></div>
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
	.defense-hint {
		color: #b9d8ad;
		font-size: 0.72rem;
	}
	.compendium-picker {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
		margin-bottom: 0.55rem;
	}
	.spell-picker {
		grid-template-columns: 130px minmax(0, 1fr) auto;
	}
	.compendium-picker select,
	.inventory-item input {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.compendium-picker button,
	.inventory-item button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.inventory-list {
		display: grid;
		gap: 0.4rem;
	}
	.inventory-item {
		display: grid;
		grid-template-columns: auto minmax(90px, 1fr) 60px auto auto;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem;
		border: 1px solid #453a38;
		border-radius: 6px;
		background: #181416;
		font-size: 0.78rem;
	}
	.inventory-item label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.62rem;
	}
	.inventory-item label input { width: auto; }
	.empty-inline { margin: 0; color: #96897e; font-size: 0.76rem; }
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
		.sheet-backdrop { padding: 0; }
		.sheet {
			width: 100%;
			max-height: 100dvh;
			height: 100dvh;
			border: 0;
			border-radius: 0;
		}
		header,
		footer { padding: 0.8rem 1rem; }
		footer { position: sticky; bottom: 0; background: #1b171a; }
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
		.spell-picker,
		.inventory-item { grid-template-columns: 1fr; }
	}
</style>
