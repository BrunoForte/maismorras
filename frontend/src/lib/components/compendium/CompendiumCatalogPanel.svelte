<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import type { CompendiumEntry, CompendiumSource } from '$lib/services/compendiumApi';
	import {
		COMPENDIUM_ENTRY_TYPES,
		compendiumEntryTranslationStatus,
		filterAndSortCompendiumEntries,
		type CompendiumCatalogFilters
	} from '$lib/utils/compendium/compendiumRules';

	let {
		section,
		entries,
		sources,
		filters = $bindable<CompendiumCatalogFilters>(),
		selectedEntryId,
		loading,
		displayName,
		typeName,
		sourceKindLabel,
		isMonster,
		hasMonsterSheet,
		onselect
	}: {
		section: 'sources' | 'entries';
		entries: CompendiumEntry[];
		sources: CompendiumSource[];
		filters: CompendiumCatalogFilters;
		selectedEntryId: string | null;
		loading: boolean;
		displayName: (entry: CompendiumEntry) => string;
		typeName: (value: string) => string;
		sourceKindLabel: (source: CompendiumSource) => string;
		isMonster: (entry: CompendiumEntry) => boolean;
		hasMonsterSheet: (entry: CompendiumEntry) => boolean;
		onselect: (id: string) => void;
	} = $props();

	const visible = $derived(filterAndSortCompendiumEntries(entries, sources, filters, displayName));
	const grouped = $derived(
		COMPENDIUM_ENTRY_TYPES.map(([type]) => ({
			label: typeName(type),
			entries: visible.filter((entry) => entry.entryType === type)
		})).filter((group) => group.entries.length)
	);
	const rules = (entry: CompendiumEntry) => entry.rules ?? {};
	const translationLabel = (entry: CompendiumEntry) => {
		if ($appLocale !== 'pt-BR') return '';
		const status = compendiumEntryTranslationStatus(entry);
		if (status === 'pending') return 'Pendente';
		if (status === 'ai') return 'Tradução IA';
		if (status === 'official') return 'Oficial';
		if (status === 'manual') return 'Revisada';
		return '';
	};
	const entryCount = (sourceId: string) =>
		entries.filter((entry) => entry.sourceId === sourceId).length;
	const selectFilter = (value: string) => {
		filters.entryType = value;
		if (selectedEntryId) onselect('');
	};
</script>

{#if section === 'sources'}
	<section class="sources">
		<h3>{$appLocale === 'en' ? 'Active sources' : 'Fontes ativas'}</h3>
		<button class:active={filters.sourceId === 'all'} onclick={() => (filters.sourceId = 'all')}>
			<strong>{$appLocale === 'en' ? 'All sources' : 'Todas as fontes'}</strong>
			<small>{entries.length} {$appLocale === 'en' ? 'entries' : 'entradas'}</small>
		</button>
		{#each sources as source (source.id)}
			<button
				class:active={filters.sourceId === source.id}
				onclick={() => (filters.sourceId = source.id)}
			>
				<strong>{source.title}</strong>
				<small
					>{sourceKindLabel(source)} · {entryCount(source.id)}
					{$appLocale === 'en' ? 'entries' : 'entradas'}</small
				>
			</button>
		{/each}
	</section>
{:else}
	<section class="entries">
		<div class="entry-head">
			<h3>{$appLocale === 'en' ? 'Entries' : 'Entradas'}</h3>
			<input
				bind:value={filters.query}
				placeholder={$appLocale === 'en' ? 'Search by name…' : 'Buscar por nome…'}
			/>
			<select
				value={filters.entryType}
				onchange={(event) => selectFilter(event.currentTarget.value)}
			>
				<option value="all">{$appLocale === 'en' ? 'All types' : 'Todos os tipos'}</option>
				{#each COMPENDIUM_ENTRY_TYPES as [value, label] (value)}<option {value}>{label}</option
					>{/each}
			</select>
			<select
				bind:value={filters.sortMode}
				aria-label={$appLocale === 'en' ? 'Sort entries' : 'Ordenar entradas'}
			>
				<option value="name">{$appLocale === 'en' ? 'Sort: name' : 'Ordenar: nome'}</option>
				<option value="category"
					>{$appLocale === 'en' ? 'Sort: category' : 'Ordenar: categoria'}</option
				>
				<option value="challenge"
					>{$appLocale === 'en' ? 'Sort: challenge rating' : 'Ordenar: nível de desafio'}</option
				>
				<option value="source">{$appLocale === 'en' ? 'Sort: source' : 'Ordenar: fonte'}</option>
			</select>
		</div>
		{#if loading}
			<p class="empty">{$appLocale === 'en' ? 'Loading compendium…' : 'Carregando compêndio…'}</p>
		{:else if visible.length}
			<div class="catalog-list">
				{#if filters.entryType === 'all'}
					{#each grouped as group (group.label)}
						<section class="category-group">
							<h4>{group.label} <small>{group.entries.length}</small></h4>
							<div class="entry-grid">
								{#each group.entries as entry (entry.id)}
									<button
										class:active={selectedEntryId === entry.id}
										onclick={() => onselect(entry.id)}
									>
										<span>{typeName(entry.entryType)}</span><strong>{displayName(entry)}</strong>
										{#if translationLabel(entry)}<small class="translation-status"
												>{translationLabel(entry)}</small
											>{/if}
										{#if isMonster(entry) && hasMonsterSheet(entry)}<small
												>{$appLocale === 'en' ? 'CR' : 'ND'}
												{String(rules(entry).challenge ?? '—')} · {$appLocale === 'en'
													? 'HP'
													: 'PV'}
												{rules(entry).hpMax}</small
											>{/if}
									</button>
								{/each}
							</div>
						</section>
					{/each}
				{:else}
					<div class="entry-grid">
						{#each visible as entry (entry.id)}
							<button
								class:active={selectedEntryId === entry.id}
								onclick={() => onselect(entry.id)}
							>
								<span>{typeName(entry.entryType)}</span><strong>{displayName(entry)}</strong>
								{#if translationLabel(entry)}<small class="translation-status"
										>{translationLabel(entry)}</small
									>{/if}
								{#if isMonster(entry) && hasMonsterSheet(entry)}<small
										>{$appLocale === 'en' ? 'CR' : 'ND'}
										{String(rules(entry).challenge ?? '—')} · {$appLocale === 'en' ? 'HP' : 'PV'}
										{rules(entry).hpMax}</small
									>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<p class="empty">
				{$appLocale === 'en' ? 'No entries match this filter.' : 'Nenhuma entrada neste filtro.'}
			</p>
		{/if}
	</section>
{/if}

<style>
	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: stretch;
	}
	.sources h3 {
		width: 100%;
		margin: 0 0 0.05rem;
		color: #cdbba8;
		font:
			600 0.78rem Georgia,
			serif;
	}
	.sources button {
		display: grid;
		gap: 0.22rem;
		min-width: 160px;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem 0.75rem;
		color: #d9ccbb;
		background: #211b1e;
		text-align: left;
		cursor: pointer;
	}
	.sources button:hover,
	.sources button.active {
		border-color: #d8ad67;
		background: #30251f;
	}
	.sources button strong {
		color: #f0d7a4;
		font-size: 0.76rem;
	}
	.sources button small {
		color: #a99c91;
		font-size: 0.66rem;
	}
	.entries {
		min-width: 0;
		border-top: 1px solid #3e3434;
		padding-top: 1rem;
	}
	.entry-head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.entry-head h3 {
		margin: 0 auto 0 0;
		color: #f0d29d;
		font:
			600 1rem Georgia,
			serif;
	}
	.entry-head input,
	.entry-head select {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
	}
	.entry-head input {
		width: min(100%, 270px);
	}
	.catalog-list {
		min-width: 0;
	}
	.category-group {
		margin-bottom: 1.2rem;
	}
	.category-group h4 {
		margin: 0 0 0.5rem;
		color: #d8ad67;
		font:
			600 0.8rem Georgia,
			serif;
	}
	.category-group h4 small {
		color: #a99c91;
	}
	.entry-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
		gap: 0.5rem;
	}
	.entry-grid button {
		display: grid;
		gap: 0.25rem;
		min-height: 76px;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem;
		color: #eee4d6;
		background: #211b1e;
		text-align: left;
		cursor: pointer;
	}
	.entry-grid button:hover,
	.entry-grid button.active {
		border-color: #d8ad67;
		background: #30251f;
	}
	.entry-grid button span {
		color: #d8ad67;
		font-size: 0.59rem;
		text-transform: uppercase;
	}
	.entry-grid button strong {
		font:
			600 0.82rem Georgia,
			serif;
	}
	.entry-grid .translation-status {
		justify-self: start;
		border: 1px solid #59483b;
		border-radius: 999px;
		padding: 0.12rem 0.38rem;
		color: #d8c5a1;
		font-size: 0.62rem;
	}
	.entry-grid button small {
		color: #a99c91;
		font-size: 0.62rem;
	}
	.empty {
		color: #aa9a8b;
		font-style: italic;
	}
	@media (max-width: 760px) {
		.entry-head {
			flex-wrap: wrap;
		}
		.entry-head h3 {
			width: 100%;
		}
		.entry-head input,
		.entry-head select {
			flex: 1 1 150px;
		}
	}
</style>
