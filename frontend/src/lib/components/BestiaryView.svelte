<!-- eslint-disable svelte/require-each-key -- editor arrays are intentionally positional and may not have stable IDs. -->
<script lang="ts">
	/* eslint-disable svelte/require-each-key */
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createNPC, listNPCs, updateNPC, type NPC } from '$lib/services/npcApi';
	import { getCompendium, type CompendiumEntry } from '$lib/services/compendiumApi';
	import { createTokenFromCompendiumMonster, request } from '$lib/services/sceneApi';
	import { appLocale, distanceText } from '$lib/stores/locale';
	let {
		campaignId,
		sceneId = null,
		session,
		ontokencreated = () => {}
	}: {
		campaignId: string;
		sceneId?: string | null;
		session: Session;
		ontokencreated?: () => void;
	} = $props();
	type Sheet = NPC['sheet'];
	type SortMode = 'name' | 'challenge';
	type MonsterRules = {
		catalog?: string;
		kind?: string;
		challenge?: string | number;
		challengeRating?: string | number;
		hpMax?: number;
		armorClass?: number;
		size?: number;
		initiative?: number;
		creatureType?: string;
		speed?: string;
		senses?: string;
		languages?: string;
		resistances?: string[];
		immunities?: string[];
		abilities?: Partial<Sheet['abilities']>;
		traits?: { name?: string; description?: string }[];
		actions?: {
			name?: string;
			description?: string;
			damage?: string;
			toHit?: number;
			range?: string;
		}[];
	};
	const fresh = (): Sheet => ({
		hitPointsCurrent: 10,
		hitPointsMax: 10,
		armorClass: 10,
		initiative: 0,
		size: 1,
		color: 4921830,
		imageUrl: '',
		creatureType: 'Humanoide',
		challenge: '',
		speed: '9 m',
		abilities: {
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10
		},
		traits: [],
		actions: [],
		resistances: [],
		immunities: [],
		senses: '',
		languages: ''
	});
	const normalized = (value: Partial<Sheet>): Sheet => ({
		...fresh(),
		...value,
		abilities: { ...fresh().abilities, ...value.abilities },
		traits: value.traits ?? [],
		actions: value.actions ?? [],
		resistances: value.resistances ?? [],
		immunities: value.immunities ?? []
	});
	let npcs = $state<NPC[]>([]),
		srdCreatures = $state<CompendiumEntry[]>([]),
		selected = $state<NPC | null>(null),
		selectedSRD = $state<CompendiumEntry | null>(null),
		monsterName = $state(''),
		sheet = $state<Sheet>(fresh()),
		loading = $state(true),
		saving = $state(false),
		placing = $state<string | null>(null),
		message = $state(''),
		query = $state(''),
		sortMode = $state<SortMode>('name');
	let editorElement: HTMLElement;
	const csv = (value: string) =>
		value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	async function focusEditor() {
		await tick();
		if (window.matchMedia('(max-width: 750px)').matches)
			editorElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function edit(npc: NPC) {
		selected = npc;
		selectedSRD = null;
		monsterName = npc.name;
		sheet = normalized(npc.sheet);
		message = '';
		void focusEditor();
	}
	function viewSRD(entry: CompendiumEntry) {
		selected = null;
		selectedSRD = entry;
		message = '';
		void focusEditor();
	}
	function reset() {
		selected = null;
		selectedSRD = null;
		monsterName = '';
		sheet = fresh();
		message = '';
		void focusEditor();
	}
	function label(entry: CompendiumEntry) {
		return $appLocale === 'pt-BR' ? entry.translations['pt-BR'] || entry.name : entry.name;
	}
	function localized(entry: CompendiumEntry, key: string, fallback: unknown) {
		const value = String(fallback ?? '');
		return $appLocale === 'pt-BR' ? entry.translations?.[`pt-BR.${key}`] || value : value;
	}
	const translationHasAI = (entry: CompendiumEntry) =>
		$appLocale === 'pt-BR' &&
		Object.entries(entry.translations ?? {}).some(
			([key, value]) => key.startsWith('pt-BR') && key.endsWith('.source') && value === 'ai'
		);
	function monsterRules(entry: CompendiumEntry): MonsterRules {
		return entry.rules as MonsterRules;
	}
	function challenge(entry: CompendiumEntry) {
		const value = monsterRules(entry).challenge ?? monsterRules(entry).challengeRating ?? '—';
		return String(value);
	}
	function challengeWeight(value: string) {
		const fractions: Record<string, number> = { '0': 0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
		return fractions[value] ?? (Number(value) || Number.MAX_SAFE_INTEGER);
	}
	function filtered<T extends { name: string }>(
		items: T[],
		entryLabel: (item: T) => string,
		entryChallenge: (item: T) => string = () => ''
	) {
		const needle = query.trim().toLocaleLowerCase('pt-BR');
		return items
			.filter((item) => !needle || entryLabel(item).toLocaleLowerCase('pt-BR').includes(needle))
			.toSorted((a, b) =>
				sortMode === 'challenge'
					? challengeWeight(entryChallenge(a)) - challengeWeight(entryChallenge(b)) ||
						entryLabel(a).localeCompare(entryLabel(b), 'pt-BR')
					: entryLabel(a).localeCompare(entryLabel(b), 'pt-BR')
			);
	}
	const visibleNPCs = () =>
		filtered(
			npcs,
			(npc) => npc.name,
			(npc) => npc.sheet.challenge || ''
		);
	const visibleSRD = () => filtered(srdCreatures, label, challenge);
	function hasStatBlock(entry: CompendiumEntry) {
		const rules = monsterRules(entry);
		return Number(rules.hpMax) > 0 && Number(rules.armorClass) >= 0;
	}
	function addTrait() {
		sheet.traits = [...sheet.traits, { name: 'Novo traço', description: '' }];
	}
	function addAction() {
		sheet.actions = [
			...sheet.actions,
			{
				name: 'Novo ataque',
				kind: 'action',
				toHit: 0,
				range: '',
				damage: '',
				saveDC: 0,
				description: ''
			}
		];
	}
	function removeTrait(index: number) {
		sheet.traits = sheet.traits.filter((_, item) => item !== index);
	}
	function removeAction(index: number) {
		sheet.actions = sheet.actions.filter((_, item) => item !== index);
	}
	async function load() {
		loading = true;
		try {
			const [campaignNPCs, compendium] = await Promise.all([
				listNPCs(session, campaignId),
				getCompendium(session, campaignId)
			]);
			npcs = campaignNPCs.npcs;
			const srdSourceIDs = new Set(
				compendium.sources
					.filter((source) => source.kind === 'srd' || source.readOnly)
					.map((source) => source.id)
			);
			srdCreatures = compendium.entries.filter(
				(entry) =>
					entry.entryType === 'other' &&
					srdSourceIDs.has(entry.sourceId) &&
					(entry.rules.kind === 'monster' || entry.rules.catalog === 'monster')
			);
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not load the bestiary.'
						: 'Não foi possível carregar o bestiário.';
		} finally {
			loading = false;
		}
	}
	async function save() {
		if (!monsterName.trim()) {
			message = $appLocale === 'en' ? 'Enter the creature name.' : 'Informe o nome da criatura.';
			return;
		}
		saving = true;
		message = '';
		const payload = {
			name: monsterName.trim(),
			sheet: { ...sheet, hitPointsCurrent: Math.min(sheet.hitPointsCurrent, sheet.hitPointsMax) }
		};
		try {
			const npc = selected
				? await updateNPC(session, campaignId, selected.id, payload)
				: await createNPC(session, campaignId, payload);
			npcs = selected ? npcs.map((item) => (item.id === npc.id ? npc : item)) : [...npcs, npc];
			edit(npc);
			message = selected
				? $appLocale === 'en'
					? 'Creature updated.'
					: 'Criatura atualizada.'
				: $appLocale === 'en'
					? 'Creature added to the bestiary.'
					: 'Criatura adicionada ao bestiário.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not save the creature.'
						: 'Não foi possível salvar a criatura.';
		} finally {
			saving = false;
		}
	}
	async function place(npc: NPC) {
		if (!sceneId) {
			message =
				$appLocale === 'en'
					? 'Open a scene in the Table tab before placing a creature.'
					: 'Abra uma cena na aba Mesa antes de colocar uma criatura.';
			return;
		}
		placing = npc.id;
		message = '';
		try {
			await request(session, `/api/v1/scenes/${sceneId}/tokens/from-npc`, {
				method: 'POST',
				body: JSON.stringify({ actorId: npc.id })
			});
			await ontokencreated();
			message = `${npc.name} foi adicionado à cena.`;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not add the creature.'
						: 'Não foi possível adicionar a criatura.';
		} finally {
			placing = null;
		}
	}
	async function placeSRD(entry: CompendiumEntry | null) {
		if (!entry) return;
		if (!sceneId) {
			message =
				$appLocale === 'en'
					? 'Open a scene in the Table tab before placing a creature.'
					: 'Abra uma cena na aba Mesa antes de colocar uma criatura.';
			return;
		}
		placing = entry.id;
		message = '';
		try {
			await createTokenFromCompendiumMonster(session, sceneId, entry.id);
			await ontokencreated();
			message = `${label(entry)} foi adicionado à cena.`;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not add the creature.'
						: 'Não foi possível adicionar a criatura.';
		} finally {
			placing = null;
		}
	}
	function placeSelected() {
		if (selected) void place(selected);
	}
	onMount(() => void load());
</script>

<main class="bestiary">
	<header>
		<div>
			<p>{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}</p>
			<h2>{$appLocale === 'en' ? 'Bestiary' : 'Bestiário'}</h2>
			<span
				>{$appLocale === 'en'
					? 'Create private creature sheets and place them on the map when needed.'
					: 'Crie fichas privadas de criatura e coloque-as no mapa quando precisar.'}</span
			>
		</div>
		<button onclick={reset}>+ {$appLocale === 'en' ? 'New creature' : 'Nova criatura'}</button>
	</header>
	{#if message}<p
			class:success={message.includes('adicionada') ||
				message.includes('atualizada') ||
				message.includes('adicionado')}
			class="message"
		>
			{message}
		</p>{/if}
	<section class="layout">
		<aside>
			<div class="list-tools">
				<input
					bind:value={query}
					placeholder={$appLocale === 'en' ? 'Search creatures…' : 'Buscar criatura…'}
					aria-label={$appLocale === 'en' ? 'Search creature by name' : 'Buscar criatura pelo nome'}
				/><select
					bind:value={sortMode}
					aria-label={$appLocale === 'en' ? 'Sort creatures' : 'Ordenar criaturas'}
					><option value="name">A–Z</option><option value="challenge"
						>{$appLocale === 'en' ? 'CR ascending' : 'ND crescente'}</option
					></select
				>
			</div>
			<h3>
				{$appLocale === 'en' ? 'Campaign creatures' : 'Criaturas da campanha'}
				<small>{visibleNPCs().length}</small>
			</h3>
			{#if loading}<p>
					{$appLocale === 'en' ? 'Loading…' : 'Carregando…'}
				</p>{:else if !visibleNPCs().length}<p class="hint">
					{$appLocale === 'en' ? 'No creatures found.' : 'Nenhuma criatura encontrada.'}
				</p>{:else}{#each visibleNPCs() as npc (npc.id)}<button
						class:active={selected?.id === npc.id}
						onclick={() => edit(npc)}
						><strong>{npc.name}</strong><small
							>{npc.sheet.creatureType || ($appLocale === 'en' ? 'Creature' : 'Criatura')} · {$appLocale ===
							'en'
								? 'CR'
								: 'ND'}
							{npc.sheet.challenge || '—'} · {$appLocale === 'en' ? 'HP' : 'PV'}
							{npc.sheet.hitPointsMax} · {$appLocale === 'en' ? 'AC' : 'CA'}
							{npc.sheet.armorClass}</small
						></button
					>{/each}{/if}
			<h3 class="srd-heading">
				{$appLocale === 'en' ? 'SRD creatures' : 'Criaturas do SRD'}
				<small>{visibleSRD().length}</small>
			</h3>
			{#if loading}<p>
					{$appLocale === 'en' ? 'Loading…' : 'Carregando…'}
				</p>{:else if !visibleSRD().length}<p class="hint">
					{$appLocale === 'en' ? 'No SRD creatures found.' : 'Nenhuma criatura SRD encontrada.'}
				</p>{:else}{#each visibleSRD() as creature (creature.id)}<button
						class:active={selectedSRD?.id === creature.id}
						onclick={() => viewSRD(creature)}
						><strong>{label(creature)}</strong><small
							>SRD · {$appLocale === 'en' ? 'CR' : 'ND'}
							{challenge(creature)}{#if hasStatBlock(creature)}
								· {$appLocale === 'en' ? 'HP' : 'PV'}
								{monsterRules(creature).hpMax} · {$appLocale === 'en' ? 'AC' : 'CA'}
								{monsterRules(creature).armorClass}{/if}</small
						></button
					>{/each}{/if}
		</aside>
		<section class="editor" bind:this={editorElement}>
			{#if selectedSRD}<div class="editor-head">
					<h3>{label(selectedSRD)}</h3>
					<span
						>{$appLocale === 'en'
							? 'SRD CREATURE · READ ONLY'
							: 'CRIATURA DO SRD · SOMENTE LEITURA'}</span
					>
					{#if translationHasAI(selectedSRD)}<small class="ai-translation"
							>{$appLocale === 'en' ? 'Translated with AI' : 'Traduzido com IA'}</small
						>{/if}
				</div>
				{@const rules = monsterRules(selectedSRD)}
				<article class="srd-preview">
					<p>{localized(selectedSRD, 'summary', selectedSRD.summary)}</p>
					{#if hasStatBlock(selectedSRD)}<div class="stat-line">
							<strong>{$appLocale === 'en' ? 'CR' : 'ND'} {challenge(selectedSRD)}</strong><strong
								>{$appLocale === 'en' ? 'AC' : 'CA'} {rules.armorClass}</strong
							><strong>{$appLocale === 'en' ? 'HP' : 'PV'} {rules.hpMax}</strong><strong
								>{distanceText(
									localized(
										selectedSRD,
										'rules.speed',
										rules.speed ||
											($appLocale === 'en' ? 'Speed unavailable' : 'Deslocamento não informado')
									),
									$appLocale
								)}</strong
							>
						</div>
						<p>
							<b
								>{localized(
									selectedSRD,
									'rules.creatureType',
									rules.creatureType || ($appLocale === 'en' ? 'Creature' : 'Criatura')
								)}</b
							>{#if rules.senses}
								· {distanceText(
									localized(selectedSRD, 'rules.senses', rules.senses),
									$appLocale
								)}{/if}{#if rules.languages}
								· {localized(selectedSRD, 'rules.languages', rules.languages)}{/if}
						</p>
						{#if rules.abilities}<h4>{$appLocale === 'en' ? 'Ability scores' : 'Atributos'}</h4>
							<div class="read-abilities">
								<span>FOR <b>{rules.abilities.strength ?? '—'}</b></span><span
									>DES <b>{rules.abilities.dexterity ?? '—'}</b></span
								><span>CON <b>{rules.abilities.constitution ?? '—'}</b></span><span
									>INT <b>{rules.abilities.intelligence ?? '—'}</b></span
								><span>SAB <b>{rules.abilities.wisdom ?? '—'}</b></span><span
									>CAR <b>{rules.abilities.charisma ?? '—'}</b></span
								>
							</div>{/if}{#if rules.traits?.length}<h4>
								{$appLocale === 'en' ? 'Traits' : 'Traços'}
							</h4>
							{#each rules.traits as trait}<p>
									<b>{trait.name}</b>{#if trait.description}
										— {trait.description}{/if}
								</p>{/each}{/if}{#if rules.actions?.length}<h4>
								{$appLocale === 'en' ? 'Actions' : 'Ações'}
							</h4>
							{#each rules.actions as action}<p>
									<b>{action.name}</b>{#if action.toHit !== undefined}
										· +{action.toHit} para acertar{/if}{#if action.damage}
										· {action.damage}{/if}{#if action.range}
										· {action.range}{/if}{#if action.description}
										— {action.description}{/if}
								</p>{/each}{/if}<button
							class="place"
							onclick={() => void placeSRD(selectedSRD)}
							disabled={placing === selectedSRD.id}
							>{placing === selectedSRD.id
								? $appLocale === 'en'
									? 'Adding…'
									: 'Adicionando…'
								: $appLocale === 'en'
									? 'Add to scene'
									: 'Adicionar à cena'}</button
						>{:else}<p class="missing-stats">
							Esta referência do SRD ainda não possui bloco de estatísticas no pacote local; ela
							permanece imutável e não pode ser adicionada à cena até que os dados oficiais sejam
							importados.
						</p>{/if}<small
						>O conteúdo SRD é separado do bestiário privado da campanha e não pode ser alterado
						aqui.</small
					>
				</article>{:else}<div class="editor-head">
					<h3>
						{selected
							? $appLocale === 'en'
								? 'Edit creature'
								: 'Editar criatura'
							: $appLocale === 'en'
								? 'New private creature'
								: 'Nova criatura privada'}
					</h3>
					<span
						>{selected
							? 'As mudanças afetam novos tokens; tokens já na mesa mantêm o estado atual.'
							: 'Registre uma ficha compacta e utilizável em combate.'}</span
					>
				</div>
				<form
					onsubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<div class="grid">
						<label
							>Nome<input
								bind:value={monsterName}
								maxlength="120"
								placeholder="Ex.: Sentinela da teia"
							/></label
						><label
							>Tipo<input
								bind:value={sheet.creatureType}
								maxlength="80"
								placeholder="Ex.: Humanoide"
							/></label
						><label
							>ND<input bind:value={sheet.challenge} maxlength="20" placeholder="Ex.: 2" /></label
						><label
							>Deslocamento<input
								bind:value={sheet.speed}
								maxlength="80"
								placeholder="Ex.: 9 m, escalada 9 m"
							/></label
						><label
							>PV máximo<input
								bind:value={sheet.hitPointsMax}
								type="number"
								min="1"
								max="9999"
							/></label
						><label
							>PV atual<input
								bind:value={sheet.hitPointsCurrent}
								type="number"
								min="0"
								max={sheet.hitPointsMax}
							/></label
						><label>CA<input bind:value={sheet.armorClass} type="number" min="0" max="99" /></label
						><label>Iniciativa<input bind:value={sheet.initiative} type="number" /></label><label
							>Tamanho no grid<input bind:value={sheet.size} type="number" min="1" max="6" /></label
						><label class="wide"
							>URL da miniatura<input
								bind:value={sheet.imageUrl}
								type="url"
								placeholder="URL pública do Supabase Storage"
							/></label
						>
					</div>
					<h4>Atributos</h4>
					<div class="abilities">
						<label
							>FOR<input
								bind:value={sheet.abilities.strength}
								type="number"
								min="0"
								max="30"
							/></label
						><label
							>DES<input
								bind:value={sheet.abilities.dexterity}
								type="number"
								min="0"
								max="30"
							/></label
						><label
							>CON<input
								bind:value={sheet.abilities.constitution}
								type="number"
								min="0"
								max="30"
							/></label
						><label
							>INT<input
								bind:value={sheet.abilities.intelligence}
								type="number"
								min="0"
								max="30"
							/></label
						><label
							>SAB<input
								bind:value={sheet.abilities.wisdom}
								type="number"
								min="0"
								max="30"
							/></label
						><label
							>CAR<input
								bind:value={sheet.abilities.charisma}
								type="number"
								min="0"
								max="30"
							/></label
						>
					</div>
					<div class="grid">
						<label
							>Resistências<input
								value={sheet.resistances.join(', ')}
								onchange={(event) => (sheet.resistances = csv(event.currentTarget.value))}
								placeholder="fogo, veneno"
							/></label
						><label
							>Imunidades<input
								value={sheet.immunities.join(', ')}
								onchange={(event) => (sheet.immunities = csv(event.currentTarget.value))}
								placeholder="amedrontado"
							/></label
						><label
							>Senses<input bind:value={sheet.senses} placeholder="visão no escuro 18 m" /></label
						><label
							>{$appLocale === 'en' ? 'Languages' : 'Idiomas'}<input
								bind:value={sheet.languages}
								placeholder={$appLocale === 'en' ? 'Undercommon' : 'Subcomum'}
							/></label
						>
					</div>
					<div class="block">
						<div>
							<h4>{$appLocale === 'en' ? 'Traits' : 'Traços'}</h4>
							<button type="button" onclick={addTrait}>+ Traço</button>
						</div>
						{#each sheet.traits as trait, index}<article>
								<input
									bind:value={trait.name}
									placeholder={$appLocale === 'en' ? 'Trait name' : 'Nome do traço'}
								/><textarea bind:value={trait.description} placeholder="Resumo próprio do efeito"
								></textarea><button type="button" onclick={() => removeTrait(index)}>×</button>
							</article>{/each}
					</div>
					<div class="block">
						<div>
							<h4>{$appLocale === 'en' ? 'Actions' : 'Ações'}</h4>
							<button type="button" onclick={addAction}>+ Ação</button>
						</div>
						{#each sheet.actions as action, index}<article class="action">
								<input
									bind:value={action.name}
									placeholder={$appLocale === 'en' ? 'Name' : 'Nome'}
								/><select bind:value={action.kind}
									><option value="action">Ação</option><option value="bonus">Ação bônus</option
									><option value="reaction">Reação</option></select
								><input bind:value={action.toHit} type="number" placeholder="Acerto" /><input
									bind:value={action.damage}
									placeholder="Dano, ex.: 2d6 veneno"
								/><input bind:value={action.range} placeholder="Alcance" /><input
									bind:value={action.saveDC}
									type="number"
									min="0"
									placeholder="CD"
								/><textarea bind:value={action.description} placeholder="Resumo próprio e objetivo"
								></textarea><button type="button" onclick={() => removeAction(index)}>×</button>
							</article>{/each}
					</div>
					<div class="footer">
						<button class="primary" disabled={saving}
							>{saving
								? 'Salvando…'
								: selected
									? $appLocale === 'en'
										? 'Save changes'
										: 'Salvar alterações'
									: $appLocale === 'en'
										? 'Add to bestiary'
										: 'Adicionar ao bestiário'}</button
						>{#if selected}<button
								type="button"
								class="place"
								onclick={placeSelected}
								disabled={placing === selected.id}
								>{placing === selected.id
									? $appLocale === 'en'
										? 'Adding…'
										: 'Adicionando…'
									: $appLocale === 'en'
										? 'Add to scene'
										: 'Adicionar à cena'}</button
							>{/if}
					</div>
				</form>{/if}
		</section>
	</section>
</main>

<style>
	.bestiary {
		min-height: 520px;
		padding: var(--mm-content-gutter, clamp(1rem, 2.5vw, 2rem));
		color: #eee4d6;
	}
	.bestiary > header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
		padding-bottom: 1.1rem;
		border-bottom: 1px solid #3b3030;
	}
	.bestiary header p {
		margin: 0 0 0.45rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}
	.bestiary h2 {
		margin: 0 0 0.35rem;
		font:
			500 clamp(1.8rem, 4vw, 2.7rem) Georgia,
			serif;
	}
	.bestiary header span,
	.hint,
	.editor-head span {
		color: #a99c91;
		font-size: 0.8rem;
	}
	.bestiary > header button,
	.primary,
	.place,
	.block > div button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.7rem;
		color: #edc77f;
		background: #2b211e;
		font-weight: 750;
		cursor: pointer;
	}
	.message {
		margin: 0 0 1rem;
		color: #f0cb85;
		font-size: 0.8rem;
	}
	.success {
		color: #acdba2;
	}
	.layout {
		display: grid;
		grid-template-areas: 'list editor';
		grid-template-columns: minmax(220px, 0.36fr) 1fr;
		gap: 1rem;
	}
	.layout > aside {
		grid-area: list;
	}
	.editor {
		grid-area: editor;
	}
	aside {
		display: grid;
		align-content: start;
		gap: 0.5rem;
		border: 1px solid #493c39;
		border-radius: 10px;
		padding: 0.8rem;
		background: #211b1e;
	}
	aside h3 {
		display: flex;
		justify-content: space-between;
		margin: 0.15rem;
		font:
			600 0.95rem Georgia,
			serif;
	}
	.list-tools {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.4rem;
	}
	.list-tools input,
	.list-tools select {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.73rem;
	}
	.srd-heading {
		margin-top: 1rem !important;
		padding-top: 1rem;
		border-top: 1px solid #493c39;
		color: #d8ad67;
	}
	aside button {
		display: grid;
		gap: 0.2rem;
		border: 1px solid transparent;
		border-radius: 7px;
		padding: 0.65rem;
		color: #e9ddce;
		background: #2a2222;
		text-align: left;
		cursor: pointer;
	}
	aside button.active,
	aside button:hover {
		border-color: #d8ad67;
	}
	aside small {
		color: #a99c91;
		font-size: 0.67rem;
	}
	.editor {
		border: 1px solid #5b4938;
		border-radius: 10px;
		padding: 1rem;
		background: #251e1c;
	}
	.editor-head {
		margin-bottom: 1rem;
	}
	.editor h3,
	.editor h4 {
		margin: 0 0 0.35rem;
		font:
			600 1rem Georgia,
			serif;
	}
	.editor h4 {
		margin-top: 1.2rem;
		color: #d8ad67;
		font-size: 0.83rem;
	}
	.srd-preview {
		display: grid;
		gap: 0.8rem;
		max-width: 760px;
		color: #d9cebf;
		line-height: 1.6;
	}
	.srd-preview p {
		margin: 0;
	}
	.srd-preview small {
		color: #a99c91;
	}
	.stat-line,
	.read-abilities {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.stat-line strong,
	.read-abilities span {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e7cf9a;
		background: #1b1618;
		font-size: 0.75rem;
	}
	.read-abilities b {
		color: #fff;
	}
	.missing-stats {
		border-left: 3px solid #b88247;
		padding: 0.65rem 0.8rem;
		background: #211b1e;
		color: #d7c1a7;
	}
	.ai-translation {
		display: inline-flex;
		width: fit-content;
		border: 1px solid #6378a1;
		border-radius: 999px;
		padding: 0.18rem 0.42rem;
		color: #cbd9ff;
		background: #202c47;
		font-size: 0.67rem;
		font-weight: 700;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.grid label,
	.abilities label {
		display: grid;
		gap: 0.25rem;
		color: #b9aa9d;
		font-size: 0.67rem;
	}
	.wide {
		grid-column: 1/-1;
	}
	.grid input,
	.abilities input,
	.block input,
	.block textarea,
	.block select {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.45rem;
	}
	.block {
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid #493c39;
	}
	.block > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.block > div h4 {
		margin: 0;
	}
	.block > div button {
		padding: 0.35rem 0.5rem;
		font-size: 0.67rem;
	}
	.block article {
		display: grid;
		grid-template-columns: 170px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}
	.block textarea {
		min-height: 48px;
		resize: vertical;
	}
	.action {
		grid-template-columns: 1.2fr 0.8fr 0.55fr 1.2fr 0.8fr 0.55fr auto !important;
	}
	.action textarea {
		grid-column: 1/-2;
	}
	.block article > button {
		border: 0;
		color: #d7b3a5;
		background: transparent;
		font-size: 1.1rem;
	}
	.footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}
	.primary {
		border: 0;
		color: #26190e;
		background: #e0b86f;
	}
	.place {
		justify-self: start;
		background: #2b211e;
	}
	@media (max-width: 750px) {
		.layout {
			grid-template-areas: 'editor' 'list';
			grid-template-columns: 1fr;
		}
		.layout aside {
			max-height: 300px;
			overflow: auto;
		}
		.abilities {
			grid-template-columns: repeat(3, 1fr);
		}
		.action,
		.block article {
			grid-template-columns: 1fr 1fr !important;
		}
		.action textarea {
			grid-column: 1/-1;
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.wide {
			grid-column: auto;
		}
		.bestiary > header {
			flex-direction: column;
		}
	}
</style>
