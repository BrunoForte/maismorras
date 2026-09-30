<script lang="ts">
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import type { AppLocale } from '$lib/stores/locale';
	import {
		getChallenge,
		hasAITranslation,
		hasValidMonsterStatBlock,
		localizedEntryLabel,
		localizedMonsterField,
		readMonsterRules
	} from '$lib/utils/bestiary/bestiaryRules';
	let {
		entry,
		locale,
		placing,
		formatDistance,
		onPlace
	}: {
		entry: CompendiumEntry;
		locale: AppLocale;
		placing: boolean;
		formatDistance: (value: string, locale: AppLocale) => string;
		onPlace: (entry: CompendiumEntry) => void;
	} = $props();
	const english = $derived(locale === 'en');
	const rules = $derived(readMonsterRules(entry));
	const label = $derived(localizedEntryLabel(entry, locale));
	const canPlace = $derived(hasValidMonsterStatBlock(entry));
	const field = (key: string, fallback: unknown) =>
		localizedMonsterField(entry, key, fallback, locale);
	const challenge = $derived(getChallenge(entry));
</script>

<div class="editor-head">
	<h3>{label}</h3>
	<span>{english ? 'SRD CREATURE · READ ONLY' : 'CRIATURA DO SRD · SOMENTE LEITURA'}</span>
	{#if hasAITranslation(entry, locale)}<small class="ai-translation"
			>{english ? 'Translated with AI' : 'Traduzido com IA'}</small
		>{/if}
</div>
<article class="srd-preview">
	<p>{field('summary', entry.summary)}</p>
	{#if canPlace}
		<div class="stat-line">
			<strong>{english ? 'CR' : 'ND'} {challenge}</strong><strong
				>{english ? 'AC' : 'CA'} {rules.armorClass}</strong
			>
			<strong>{english ? 'HP' : 'PV'} {rules.hpMax}</strong>
			<strong
				>{formatDistance(
					field(
						'rules.speed',
						rules.speed || (english ? 'Speed unavailable' : 'Deslocamento não informado')
					),
					locale
				)}</strong
			>
		</div>
		<p>
			<b>{field('rules.creatureType', rules.creatureType || (english ? 'Creature' : 'Criatura'))}</b
			>
			{#if rules.senses}
				· {formatDistance(field('rules.senses', rules.senses), locale)}{/if}
			{#if rules.languages}
				· {field('rules.languages', rules.languages)}{/if}
		</p>
		{#if rules.abilities}<h4>{english ? 'Ability scores' : 'Atributos'}</h4>
			<div class="read-abilities">
				<span>FOR <b>{rules.abilities.strength ?? '—'}</b></span><span
					>DES <b>{rules.abilities.dexterity ?? '—'}</b></span
				>
				<span>CON <b>{rules.abilities.constitution ?? '—'}</b></span><span
					>INT <b>{rules.abilities.intelligence ?? '—'}</b></span
				>
				<span>SAB <b>{rules.abilities.wisdom ?? '—'}</b></span><span
					>CAR <b>{rules.abilities.charisma ?? '—'}</b></span
				>
			</div>
		{/if}
		{#if rules.traits?.length}<h4>{english ? 'Traits' : 'Traços'}</h4>
			{#each rules.traits as trait, index (`${trait.name}-${index}`)}<p>
					<b>{trait.name}</b>{#if trait.description}
						— {trait.description}{/if}
				</p>{/each}
		{/if}
		{#if rules.actions?.length}<h4>{english ? 'Actions' : 'Ações'}</h4>
			{#each rules.actions as action, index (`${action.name}-${index}`)}<p>
					<b>{action.name}</b>{#if action.toHit !== undefined}
						· +{action.toHit} para acertar{/if}
					{#if action.damage}
						· {action.damage}{/if}{#if action.range}
						· {action.range}{/if}
					{#if action.description}
						— {action.description}{/if}
				</p>{/each}
		{/if}
		<button class="place" onclick={() => onPlace(entry)} disabled={placing}>
			{placing
				? english
					? 'Adding…'
					: 'Adicionando…'
				: english
					? 'Add to scene'
					: 'Adicionar à cena'}
		</button>
	{:else}
		<p class="missing-stats">
			Esta referência do SRD ainda não possui bloco de estatísticas no pacote local; ela permanece
			imutável e não pode ser adicionada à cena até que os dados oficiais sejam importados.
		</p>
	{/if}
	<small
		>O conteúdo SRD é separado do bestiário privado da campanha e não pode ser alterado aqui.</small
	>
</article>

<style>
	.editor-head {
		margin-bottom: 1rem;
	}
	.editor-head h3,
	h4 {
		margin: 0 0 0.35rem;
		font:
			600 1rem Georgia,
			serif;
	}
	.editor-head span,
	.srd-preview small {
		color: #a99c91;
		font-size: 0.8rem;
	}
	.editor-head span {
		display: block;
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
	.srd-preview h4 {
		margin-top: 0.3rem;
		color: #d8ad67;
		font-size: 0.83rem;
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
		color: #cbd9ff !important;
		background: #202c47;
		font-size: 0.67rem !important;
		font-weight: 700;
	}
	.place {
		justify-self: start;
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.7rem;
		color: #edc77f;
		background: #2b211e;
		font-weight: 750;
		cursor: pointer;
	}
</style>
