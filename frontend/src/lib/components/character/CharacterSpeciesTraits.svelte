<script lang="ts">
	import type { AppLocale } from '$lib/utils/speciesRules';
	import { distanceText } from '$lib/stores/locale';

	let {
		locale,
		speciesName,
		lineage,
		baseSpeedLabel,
		traits
	}: {
		locale: AppLocale;
		speciesName: string | null;
		lineage: string;
		baseSpeedLabel: string;
		traits: readonly { name: string; description: string }[];
	} = $props();
</script>

{#if speciesName}
	<section
		class="species-traits"
		aria-label={locale === 'en' ? 'Applied species traits' : 'Traços de espécie aplicados'}
	>
		<div>
			<h3>{speciesName}{lineage ? ` · ${lineage}` : ''}</h3>
			<span
				>{locale === 'en' ? 'Applied base speed' : 'Deslocamento base aplicado'}: {baseSpeedLabel}</span
			>
		</div>
		<div class="species-trait-list">
			{#each traits as trait (trait.name)}
				<details class="species-trait">
					<summary>{distanceText(trait.name, locale)}</summary>
					<p>{distanceText(trait.description, locale)}</p>
				</details>
			{/each}
		</div>
		<small
			>{locale === 'en'
				? 'These traits are calculated from the selected species and lineage. HP, spells, and uses appear here for the table; complete current combat values and add the desired spells to the sheet.'
				: 'Estes traços são calculados pela espécie e linhagem selecionadas. Ajustes de PV, magias e usos são exibidos aqui para a mesa; preencha os valores atuais de combate e inclua as magias desejadas na ficha.'}</small
		>
	</section>
{/if}

<style>
	.species-traits {
		display: grid;
		gap: 0.55rem;
		border: 1px solid rgba(101, 130, 158, 0.5);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		background: rgba(33, 54, 74, 0.32);
	}
	.species-traits > div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.species-traits h3 {
		margin: 0;
		color: #b9d7ee;
	}
	.species-traits span,
	.species-traits small {
		color: #a7bac9;
		font-size: 0.72rem;
		line-height: 1.4;
	}
	.species-trait-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
		gap: 0.45rem;
	}
	.species-trait {
		border: 1px solid rgba(124, 161, 189, 0.35);
		border-radius: 7px;
		color: #d5e4ed;
		font-size: 0.7rem;
	}
	.species-trait summary {
		padding: 0.45rem 0.55rem;
		cursor: pointer;
	}
	.species-trait[open] summary {
		color: #f1d59e;
	}
	.species-trait p {
		margin: 0;
		padding: 0 0.55rem 0.55rem;
		color: #b9c8d3;
		font-size: 0.68rem;
		line-height: 1.5;
	}
	@media (max-width: 700px) {
		.species-traits > div {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
	}
</style>
