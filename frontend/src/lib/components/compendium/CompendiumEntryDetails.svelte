<script lang="ts">
	import { appLocale, distanceText } from '$lib/stores/locale';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import type { CompendiumDetailsView } from './compendiumTypes';
	import {
		compendiumTranslationHasAI,
		compendiumTranslationIsOfficial,
		translatedCompendiumText
	} from '$lib/utils/compendium/compendiumRules';

	let {
		view,
		actions
	}: {
		view: CompendiumDetailsView;
		actions: {
			close: () => void;
			edit: (entry: CompendiumEntry) => void;
			remove: (entry: CompendiumEntry) => void;
			translate: (entry: CompendiumEntry) => void;
			copyToCampaign: (entry: CompendiumEntry) => void;
			place: (entry: CompendiumEntry) => void;
		};
	} = $props();
	const entry = $derived(view.entry);
	const detail = $derived(entry.rules ?? {});
	const locale = $derived($appLocale);
	const displayRule = (field: string, value: unknown) =>
		translatedCompendiumText(entry, `rules.${field}`, value, locale);
	const displayAction = (index: number, field: string, value: unknown) =>
		translatedCompendiumText(entry, `rules.actions.${index}.${field}`, value, locale);
</script>

<aside class="entry-detail">
	<button
		class="close-detail"
		onclick={actions.close}
		aria-label={$appLocale === 'en' ? 'Close details' : 'Fechar detalhes'}>×</button
	>
	<span class="type">{view.typeLabel}</span>
	{#if view.isGM && !view.sourceReadOnly}
		<div class="entry-actions">
			<button class="ghost" onclick={() => actions.edit(entry)}
				>{$appLocale === 'en' ? 'Edit private entry' : 'Editar entrada privada'}</button
			>
			<button class="danger" onclick={() => actions.remove(entry)}
				>{$appLocale === 'en' ? 'Delete' : 'Excluir'}</button
			>
		</div>
	{/if}
	<h3>{view.displayName}</h3>
	{#if view.isMonster && view.artUrl}<img
			class="monster-art"
			src={view.artUrl}
			alt={view.displayName}
			loading="lazy"
		/>{/if}
	{#if $appLocale === 'pt-BR' && entry.translations?.['pt-BR']}<small class="canonical"
			>{entry.name}</small
		>{/if}
	{#if view.translationStatus === 'official' || compendiumTranslationIsOfficial(entry, 'summary', locale)}<small
			class="official-translation"
			>{$appLocale === 'en' ? 'Official translation' : 'Tradução oficial'}</small
		>{/if}
	{#if compendiumTranslationHasAI(entry, locale)}<small class="ai-translation"
			>{$appLocale === 'en' ? 'Free AI translation' : 'Tradução livre (IA)'}</small
		>{/if}
	{#if view.translationStatus === 'pending'}
		<small class="pending-translation">
			{$appLocale === 'en' ? 'Portuguese fields pending' : 'Há campos em português pendentes'}
		</small>
	{:else if view.translationStatus === 'manual'}
		<small class="manual-translation">
			{$appLocale === 'en' ? 'Reviewed translation' : 'Tradução revisada'}
		</small>
	{:else if view.translationStatus === 'complete' && !compendiumTranslationHasAI(entry, locale) && !compendiumTranslationIsOfficial(entry, 'summary', locale)}
		<small class="complete-translation">
			{$appLocale === 'en' ? 'Translation available' : 'Tradução disponível'}
		</small>
	{/if}
	<p>
		{view.displaySummary ||
			($appLocale === 'en'
				? 'No summary is available for this entry.'
				: 'Sem resumo cadastrado para esta entrada.')}
	</p>
	{#if view.isGM && view.canTranslate}
		<button class="translate" onclick={() => actions.translate(entry)} disabled={view.translating}>
			{view.translating
				? 'Traduzindo…'
				: $appLocale === 'en'
					? 'Translate pending fields'
					: 'Traduzir campos pendentes'}
		</button>
	{/if}
	{#if view.isMonster}
		<div class="rules">
			<b>{$appLocale === 'en' ? 'AC' : 'CA'} {String(detail.armorClass ?? '—')}</b>
			<b>{$appLocale === 'en' ? 'HP' : 'PV'} {String(detail.hpMax ?? '—')}</b>
			<b>{$appLocale === 'en' ? 'CR' : 'ND'} {String(detail.challenge ?? '—')}</b>
			<b>{distanceText(displayRule('speed', detail.speed), $appLocale)}</b>
		</div>
		{#if view.isGM && view.sourceReadOnly && view.hasPrivateSource}
			<button class="ghost" onclick={() => actions.copyToCampaign(entry)}
				>{$appLocale === 'en'
					? 'Copy to campaign and link artwork'
					: 'Copiar para a mesa e vincular imagem'}</button
			>
		{/if}
		{#if detail.abilities}
			<div class="rules">
				{#each Object.entries(detail.abilities as Record<string, unknown>) as [ability, score] (ability)}<b
						>{ability.slice(0, 3).toUpperCase()} {String(score)}</b
					>{/each}
			</div>
		{/if}
		{#if Array.isArray(detail.actions) && detail.actions.length}
			<h4>{$appLocale === 'en' ? 'Actions' : 'Ações'}</h4>
			{#each detail.actions as action, index (index)}
				{@const actionRecord = action as Record<string, unknown>}
				<div class="action-card">
					<strong>{displayAction(index, 'name', actionRecord.name ?? 'Ação')}</strong>
					<span
						>{String(actionRecord.toHit ?? '') !== ''
							? `+${String(actionRecord.toHit)} ${$appLocale === 'en' ? 'to hit' : 'para acertar'} · `
							: ''}{displayAction(
							index,
							'damage',
							actionRecord.damage ?? actionRecord.description ?? ''
						)}</span
					>
				</div>
			{/each}
		{/if}
		{#if view.isGM && view.hasMonsterSheet}
			<button
				class="place"
				onclick={() => actions.place(entry)}
				disabled={view.placing || !view.canPlace}
			>
				{view.placing
					? $appLocale === 'en'
						? 'Adding…'
						: 'Adicionando…'
					: $appLocale === 'en'
						? 'Add to scene'
						: 'Adicionar à cena'}
			</button>
		{/if}
	{:else if entry.entryType === 'spell'}
		<div class="rules">
			<b>{$appLocale === 'en' ? 'Level' : 'Círculo'} {String(detail.level ?? 0)}</b>
			<b>{Array.isArray(detail.classes) ? (detail.classes as string[]).join(', ') : ''}</b>
			{#if detail.school}<b>{displayRule('school', detail.school)}</b>{/if}
			{#if detail.range}<b>{distanceText(displayRule('range', detail.range), $appLocale)}</b>{/if}
		</div>
	{:else if entry.entryType === 'item'}
		<div class="rules">
			<b>{displayRule('category', detail.category ?? 'item')}</b>
			{#if detail.damage}<b>{displayRule('damage', detail.damage)}</b>{/if}
			{#if detail.armorClass}<b>{$appLocale === 'en' ? 'AC' : 'CA'} +{String(detail.armorClass)}</b
				>{/if}
			{#if detail.properties}<b
					>{Array.isArray(detail.properties)
						? (detail.properties as string[]).join(', ')
						: String(detail.properties)}</b
				>{/if}
		</div>
	{:else if entry.entryType === 'class'}
		<div class="rules">
			<b>{$appLocale === 'en' ? 'Hit Die' : 'Dado de vida'} d{String(detail.hitDie ?? '—')}</b>
		</div>
		{#if Array.isArray(detail.features) && detail.features.length}
			<div class="feature-detail-list">
				<h4>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</h4>
				{#each detail.features as feature, index (String((feature as Record<string, unknown>).id ?? index))}
					{@const item = feature as Record<string, unknown>}
					<article>
						<strong
							>{$appLocale === 'en' ? 'Level' : 'Nível'}
							{String(item.level ?? '—')} · {String(item.name ?? '')}</strong
						>{#if item.description}<p>{String(item.description)}</p>{/if}
					</article>
				{/each}
			</div>
		{/if}
	{:else if entry.entryType === 'subclass'}
		<div class="rules">
			<b
				>{$appLocale === 'en' ? 'Base class' : 'Classe-base'}: {displayRule(
					'className',
					detail.className ?? '—'
				)}</b
			>
		</div>
		{#if Array.isArray(detail.features) && detail.features.length}
			<div class="feature-detail-list">
				<h4>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</h4>
				{#each detail.features as feature, index (String((feature as Record<string, unknown>).id ?? index))}
					{@const item = feature as Record<string, unknown>}
					<article>
						<strong
							>{$appLocale === 'en' ? 'Level' : 'Nível'}
							{String(item.level ?? '—')} · {String(item.name ?? '')}</strong
						>{#if item.description}<p>{String(item.description)}</p>{/if}
					</article>
				{/each}
			</div>
		{/if}
	{:else if entry.entryType === 'species'}
		<div class="rules">
			<b
				>{$appLocale === 'en' ? 'Speed' : 'Deslocamento'}: {distanceText(
					displayRule('speed', detail.speed ?? '—'),
					$appLocale
				)}</b
			>
		</div>
	{/if}
	<small
		>{entry.isPublished
			? $appLocale === 'en'
				? 'Visible to players'
				: 'Visível aos jogadores'
			: $appLocale === 'en'
				? 'Game master only'
				: 'Somente narrador'}</small
	>
</aside>

<style>
	.entry-detail {
		position: sticky;
		top: 1rem;
		align-self: start;
		display: grid;
		gap: 0.7rem;
		border: 1px solid #765d3d;
		border-radius: 10px;
		padding: 1rem;
		background: #251e1c;
	}
	.entry-detail h3,
	.entry-detail p {
		margin: 0;
	}
	.entry-detail p {
		color: #cbbbab;
		font-size: 0.8rem;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.entry-detail h4 {
		margin: 0.15rem 0 -0.25rem;
		color: #e6c98f;
		font:
			600 0.84rem Georgia,
			serif;
	}
	.type,
	.canonical,
	.entry-detail > small {
		color: #aa9a8b;
		font-size: 0.67rem;
	}
	.entry-actions {
		display: flex;
		gap: 0.4rem;
		margin: 0.45rem 0 0.7rem;
	}
	.entry-actions button,
	.ghost {
		padding: 0.35rem 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 5px;
		color: #f0d5a3;
		background: transparent;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.entry-actions .danger {
		border-color: #9c5c54;
		color: #f0aaa0;
	}
	.monster-art {
		display: block;
		width: 100%;
		max-height: 240px;
		object-fit: contain;
		border: 1px solid #493c39;
		border-radius: 8px;
		background: #100d10;
	}
	.official-translation,
	.ai-translation {
		justify-self: start;
		border: 1px solid #5a8b6a;
		border-radius: 999px;
		padding: 0.18rem 0.42rem;
		color: #bce8c8 !important;
		background: #1d3929;
		font-weight: 700;
	}
	.ai-translation {
		border-color: #6378a1;
		color: #cbd9ff !important;
		background: #202c47;
	}
	.pending-translation {
		color: #fbbf24 !important;
	}
	.manual-translation,
	.complete-translation {
		color: #bce8c8 !important;
	}
	.translate {
		justify-self: start;
		border: 1px solid #6378a1;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		color: #d9e3ff;
		background: #202c47;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.translate:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.close-detail {
		justify-self: end;
		border: 0;
		color: #cbbbab;
		background: transparent;
		font-size: 1.2rem;
		cursor: pointer;
	}
	.rules {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.rules b {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.32rem 0.45rem;
		color: #e8cf98;
		font-size: 0.68rem;
	}
	.action-card {
		display: grid;
		gap: 0.2rem;
		border-left: 2px solid #9b7549;
		padding: 0.38rem 0.5rem;
		background: #1b1618;
	}
	.action-card strong {
		color: #f0d29d;
		font-size: 0.74rem;
	}
	.action-card span {
		color: #cbbbab;
		font-size: 0.7rem;
		line-height: 1.35;
	}
	.feature-detail-list {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.8rem;
	}
	.feature-detail-list h4 {
		margin: 0;
		color: #d8ad67;
		font-size: 0.78rem;
	}
	.feature-detail-list article {
		padding: 0.45rem 0.6rem;
		border-left: 2px solid #8f6737;
		background: #171417;
	}
	.feature-detail-list article strong {
		color: #eadfce;
		font-size: 0.76rem;
	}
	.feature-detail-list article p {
		margin: 0.2rem 0 0;
		color: #bcae9e;
		font-size: 0.74rem;
		line-height: 1.4;
	}
	.place {
		justify-self: start;
		border: 1px solid #b98a4b;
		border-radius: 6px;
		padding: 0.55rem 0.75rem;
		color: #2c1b0d;
		background: #e0b86f;
		font-size: 0.74rem;
		cursor: pointer;
	}
</style>
