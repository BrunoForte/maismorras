<script lang="ts">
	import type { CharacterSheet } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	let {
		sheet,
		attributes,
		abilityLabel,
		modifier,
		onScoreChange
	}: {
		sheet: CharacterSheet;
		attributes: { key: keyof CharacterSheet['abilityScores']; label: string }[];
		abilityLabel: (key: keyof CharacterSheet['abilityScores']) => string;
		modifier: (score: number) => number;
		onScoreChange: (key: keyof CharacterSheet['abilityScores'], value: string) => void;
	} = $props();
</script>

<section class="ability-scores">
	<h3>{$appLocale === 'en' ? 'Ability scores' : 'Atributos'}</h3>
	<div class="abilities">
		{#each attributes as attribute (attribute.key)}
			<label>
				<span>{abilityLabel(attribute.key)}</span>
				<input
					type="number"
					min="1"
					max="30"
					value={sheet.abilityScores[attribute.key]}
					onchange={(event) => onScoreChange(attribute.key, event.currentTarget.value)}
				/>
				<small
					>{modifier(sheet.abilityScores[attribute.key]) >= 0 ? '+' : ''}{modifier(
						sheet.abilityScores[attribute.key]
					)}</small
				>
			</label>
		{/each}
	</div>
</section>

<style>
	.ability-scores h3 {
		margin: 0 0 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.55rem;
	}
	.abilities label {
		display: grid;
		place-items: center;
		border: 1px solid #4b3d3c;
		border-radius: 7px;
		padding: 0.4rem;
		color: #cdbfae;
		font-size: 0.75rem;
	}
	.abilities input {
		width: 100%;
		text-align: center;
	}
	.abilities small {
		color: #d8ad67;
	}
	@media (max-width: 700px) {
		.abilities {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
