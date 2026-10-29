<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import type { AbilityScores, CharacterSheet } from '$lib/services/characterApi';

	type RollMode = 'normal' | 'advantage' | 'disadvantage';
	type Attribute = { key: keyof AbilityScores; label: string };
	let {
		sheet,
		attributes,
		abilityLabel,
		saveBonus,
		toggleSavingThrow,
		rollSave,
		hasAttackDisadvantage,
		rollMode = $bindable<RollMode>('normal')
	}: {
		sheet: CharacterSheet;
		attributes: readonly Attribute[];
		abilityLabel: (key: keyof AbilityScores) => string;
		saveBonus: (key: keyof AbilityScores) => number;
		toggleSavingThrow: (key: keyof AbilityScores) => void;
		rollSave: (key: keyof AbilityScores, label: string) => Promise<void>;
		hasAttackDisadvantage: () => boolean;
		rollMode?: RollMode;
	} = $props();
</script>

<section class="saving-throws">
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Saving throws' : 'Testes de Salvaguarda'}</h3>
		<label class="roll-mode">
			<select bind:value={rollMode} aria-label="Modo de rolagem">
				<option value="advantage" disabled={hasAttackDisadvantage()}>
					{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}
				</option>
				<option value="normal">Normal</option>
				<option value="disadvantage">{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option>
			</select>
		</label>
	</div>
	<div class="saving-throws-grid">
		{#each attributes as attribute (attribute.key)}
			<article class="saving-throw-row">
				<label
					class="saving-throw-proficiency"
					title={$appLocale === 'en'
						? `${abilityLabel(attribute.key)} saving throw proficiency`
						: `Proficiência em resistência de ${abilityLabel(attribute.key)}`}
				>
					<input
						type="checkbox"
						aria-label={$appLocale === 'en'
							? `${abilityLabel(attribute.key)} saving throw proficiency`
							: `Proficiência em resistência de ${abilityLabel(attribute.key)}`}
						checked={sheet.savingThrows.includes(attribute.key)}
						onchange={() => toggleSavingThrow(attribute.key)}
					/>
				</label>
				<span class="saving-throw-ability">{abilityLabel(attribute.key)}</span>
				<strong>{saveBonus(attribute.key) >= 0 ? '+' : ''}{saveBonus(attribute.key)}</strong>
				<button
					type="button"
					class="saving-throw-roll"
					onclick={() =>
						void rollSave(
							attribute.key,
							$appLocale === 'en'
								? `${abilityLabel(attribute.key)} saving throw`
								: `Salvaguarda de ${abilityLabel(attribute.key)}`
						)}
					aria-label={$appLocale === 'en'
						? `Roll ${abilityLabel(attribute.key)} saving throw`
						: `Rolar Salvaguarda de ${abilityLabel(attribute.key)}`}>Salvaguarda</button
				>
			</article>
		{/each}
	</div>
</section>

<style>
	.saving-throws .section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.saving-throws .section-title h3 {
		margin: 0;
		white-space: nowrap;
	}
	.roll-mode select {
		max-width: 9rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		color: #e8c786;
		background: #211a1b;
	}
	.saving-throws-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.saving-throw-row {
		min-width: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.55rem;
		color: #cbbbab;
	}
	.saving-throw-proficiency {
		display: grid;
		place-items: center;
	}
	.saving-throw-proficiency input {
		appearance: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		border: 1px solid #806444;
		border-radius: 50%;
		padding: 0;
		background: #171216;
	}
	.saving-throw-proficiency input:checked {
		border-color: #e0b86f;
		background: #e0b86f;
		box-shadow: inset 0 0 0 3px #211914;
	}
	.saving-throw-ability {
		min-width: 0;
		overflow: hidden;
		color: #eee4d6;
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.saving-throw-row strong {
		min-width: 2.1rem;
		display: grid;
		place-items: center;
		color: #f0d29d;
		font-size: 1rem;
		text-align: center;
	}
	.saving-throw-roll {
		min-height: 2rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.32rem 0.5rem;
		color: #f0d29d;
		background: #2b211c;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.saving-throw-roll:hover {
		border-color: #c89655;
		background: #38281f;
	}
	.saving-throw-roll:focus-visible {
		outline: 2px solid #f0d29d;
		outline-offset: 2px;
	}
	@media (max-width: 680px) {
		.saving-throws-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.saving-throws .section-title h3 {
			font-size: clamp(0.72rem, 3vw, 0.9rem);
		}
	}
</style>
