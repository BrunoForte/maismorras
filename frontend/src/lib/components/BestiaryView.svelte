<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createNPC, listNPCs, updateNPC, type NPC } from '$lib/services/npcApi';
	import { getCompendium, type CompendiumEntry } from '$lib/services/compendiumApi';
	import { createTokenFromCompendiumMonster, request } from '$lib/services/sceneApi';
	import { appLocale, distanceText } from '$lib/stores/locale';
	import BestiaryCatalog from '$lib/components/bestiary/BestiaryCatalog.svelte';
	import BestiaryCreatureEditor from '$lib/components/bestiary/BestiaryCreatureEditor.svelte';
	import BestiarySrdDetails from '$lib/components/bestiary/BestiarySrdDetails.svelte';
	import {
		createFreshCreatureSheet,
		filterAndSortCreatures,
		getChallenge,
		isSRDMonster,
		localizedEntryLabel,
		normalizeCreatureSheet,
		readMonsterRules,
		type BestiarySortMode,
		type CreatureSheet
	} from '$lib/utils/bestiary/bestiaryRules';

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

	let npcs = $state<NPC[]>([]);
	let srdCreatures = $state<CompendiumEntry[]>([]);
	let selected = $state<NPC | null>(null);
	let selectedSRD = $state<CompendiumEntry | null>(null);
	let monsterName = $state('');
	let sheet = $state<CreatureSheet>(createFreshCreatureSheet());
	let loading = $state(true);
	let saving = $state(false);
	let placing = $state<string | null>(null);
	let message = $state('');
	let query = $state('');
	let sortMode = $state<BestiarySortMode>('name');
	let editorElement: HTMLElement;
	const locale = $derived($appLocale);
	const visibleNPCs = $derived(
		filterAndSortCreatures(
			npcs,
			query,
			sortMode,
			(npc) => npc.name,
			(npc) => npc.sheet.challenge
		)
	);
	const visibleSRD = $derived(
		filterAndSortCreatures(
			srdCreatures,
			query,
			sortMode,
			(entry) => localizedEntryLabel(entry, locale),
			getChallenge
		)
	);
	const npcOptions = $derived(
		visibleNPCs.map((npc) => ({
			id: npc.id,
			name: npc.name,
			meta: `${npc.sheet.creatureType || (locale === 'en' ? 'Creature' : 'Criatura')} · ${locale === 'en' ? 'CR' : 'ND'} ${npc.sheet.challenge || '—'} · ${locale === 'en' ? 'HP' : 'PV'} ${npc.sheet.hitPointsMax} · ${locale === 'en' ? 'AC' : 'CA'} ${npc.sheet.armorClass}`
		}))
	);
	const srdOptions = $derived(
		visibleSRD.map((entry) => {
			const rules = readMonsterRules(entry);
			const hasStats = Number(rules.hpMax) > 0 && Number(rules.armorClass) >= 0;
			return {
				id: entry.id,
				name: localizedEntryLabel(entry, locale),
				meta: `SRD · ${locale === 'en' ? 'CR' : 'ND'} ${getChallenge(entry)}${hasStats ? ` · ${locale === 'en' ? 'HP' : 'PV'} ${rules.hpMax} · ${locale === 'en' ? 'AC' : 'CA'} ${rules.armorClass}` : ''}`
			};
		})
	);

	async function focusEditor() {
		await tick();
		if (window.matchMedia('(max-width: 750px)').matches)
			editorElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function edit(npc: NPC) {
		selected = npc;
		selectedSRD = null;
		monsterName = npc.name;
		sheet = normalizeCreatureSheet(npc.sheet);
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
		sheet = createFreshCreatureSheet();
		message = '';
		void focusEditor();
	}
	function selectNPC(id: string) {
		const npc = npcs.find((item) => item.id === id);
		if (npc) edit(npc);
	}
	function selectSRD(id: string) {
		const entry = srdCreatures.find((item) => item.id === id);
		if (entry) viewSRD(entry);
	}
	function label(entry: CompendiumEntry) {
		return localizedEntryLabel(entry, locale);
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
			srdCreatures = compendium.entries.filter((entry) => isSRDMonster(entry, srdSourceIDs));
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: locale === 'en'
						? 'Could not load the bestiary.'
						: 'Não foi possível carregar o bestiário.';
		} finally {
			loading = false;
		}
	}
	async function save() {
		if (!monsterName.trim()) {
			message = locale === 'en' ? 'Enter the creature name.' : 'Informe o nome da criatura.';
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
				? locale === 'en'
					? 'Creature updated.'
					: 'Criatura atualizada.'
				: locale === 'en'
					? 'Creature added to the bestiary.'
					: 'Criatura adicionada ao bestiário.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: locale === 'en'
						? 'Could not save the creature.'
						: 'Não foi possível salvar a criatura.';
		} finally {
			saving = false;
		}
	}
	async function place(npc: NPC) {
		if (!sceneId) {
			message =
				locale === 'en'
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
					: locale === 'en'
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
				locale === 'en'
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
					: locale === 'en'
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
		<BestiaryCatalog
			{locale}
			{loading}
			{query}
			{sortMode}
			npcs={npcOptions}
			srdCreatures={srdOptions}
			selectedNpcId={selected?.id ?? null}
			selectedSrdId={selectedSRD?.id ?? null}
			onQueryChange={(value) => (query = value)}
			onSortChange={(value) => (sortMode = value)}
			onSelectNpc={selectNPC}
			onSelectSrd={selectSRD}
		/>
		<section class="editor" bind:this={editorElement}>
			{#if selectedSRD}
				<BestiarySrdDetails
					entry={selectedSRD}
					{locale}
					placing={placing === selectedSRD.id}
					formatDistance={distanceText}
					onPlace={(entry) => void placeSRD(entry)}
				/>
			{:else}
				<BestiaryCreatureEditor
					bind:name={monsterName}
					bind:sheet
					{selected}
					{saving}
					placing={placing === selected?.id}
					{locale}
					onSave={() => void save()}
					onAddTrait={addTrait}
					onRemoveTrait={removeTrait}
					onAddAction={addAction}
					onRemoveAction={removeAction}
					onPlace={placeSelected}
				/>
			{/if}
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
	.bestiary header span {
		color: #a99c91;
		font-size: 0.8rem;
	}
	.bestiary > header button {
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
	.editor {
		grid-area: editor;
		min-width: 0;
		border: 1px solid #5b4938;
		border-radius: 10px;
		padding: 1rem;
		background: #251e1c;
	}
	@media (max-width: 750px) {
		.layout {
			grid-template-areas: 'editor' 'list';
			grid-template-columns: 1fr;
		}
		.layout :global(aside) {
			max-height: 300px;
			overflow: auto;
		}
		.bestiary > header {
			flex-direction: column;
		}
	}
</style>
