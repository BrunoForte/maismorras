<script lang="ts">
	import type { BestiarySortMode } from '$lib/utils/bestiary/bestiaryRules';
	type CreatureOption = { id: string; name: string; meta: string };
	let {
		locale,
		loading,
		query,
		sortMode,
		npcs,
		srdCreatures,
		selectedNpcId,
		selectedSrdId,
		onQueryChange,
		onSortChange,
		onSelectNpc,
		onSelectSrd
	}: {
		locale: string;
		loading: boolean;
		query: string;
		sortMode: BestiarySortMode;
		npcs: CreatureOption[];
		srdCreatures: CreatureOption[];
		selectedNpcId: string | null;
		selectedSrdId: string | null;
		onQueryChange: (value: string) => void;
		onSortChange: (value: BestiarySortMode) => void;
		onSelectNpc: (id: string) => void;
		onSelectSrd: (id: string) => void;
	} = $props();
	const english = $derived(locale === 'en');
</script>

<aside class="catalog">
	<div class="list-tools">
		<input
			value={query}
			oninput={(event) => onQueryChange(event.currentTarget.value)}
			placeholder={english ? 'Search creatures…' : 'Buscar criatura…'}
			aria-label={english ? 'Search creature by name' : 'Buscar criatura pelo nome'}
		/><select
			value={sortMode}
			onchange={(event) => onSortChange(event.currentTarget.value as BestiarySortMode)}
			aria-label={english ? 'Sort creatures' : 'Ordenar criaturas'}
			><option value="name">A–Z</option><option value="challenge"
				>{english ? 'CR ascending' : 'ND crescente'}</option
			></select
		>
	</div>
	<h3>{english ? 'Campaign creatures' : 'Criaturas da campanha'} <small>{npcs.length}</small></h3>
	{#if loading}<p>{english ? 'Loading…' : 'Carregando…'}</p>{:else if !npcs.length}<p class="hint">
			{english ? 'No creatures found.' : 'Nenhuma criatura encontrada.'}
		</p>{:else}{#each npcs as npc (npc.id)}<button
				class:active={selectedNpcId === npc.id}
				onclick={() => onSelectNpc(npc.id)}
				><strong>{npc.name}</strong><small>{npc.meta}</small></button
			>{/each}{/if}
	<h3 class="srd-heading">
		{english ? 'SRD creatures' : 'Criaturas do SRD'} <small>{srdCreatures.length}</small>
	</h3>
	{#if loading}<p>{english ? 'Loading…' : 'Carregando…'}</p>{:else if !srdCreatures.length}<p
			class="hint"
		>
			{english ? 'No SRD creatures found.' : 'Nenhuma criatura SRD encontrada.'}
		</p>{:else}{#each srdCreatures as creature (creature.id)}<button
				class:active={selectedSrdId === creature.id}
				onclick={() => onSelectSrd(creature.id)}
				><strong>{creature.name}</strong><small>{creature.meta}</small></button
			>{/each}{/if}
</aside>

<style>
	.catalog {
		grid-area: list;
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
	.hint {
		color: #a99c91;
		font-size: 0.8rem;
	}
</style>
