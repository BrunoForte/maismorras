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
				<option value="advantage">
					{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}
				</option>
				<option value="normal">Normal</option>
				<option value="disadvantage">{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option>
			</select>
		</label>
		{#if hasAttackDisadvantage() && rollMode === 'advantage'}
			<small
				>{$appLocale === 'en'
					? 'Advantage and disadvantage cancel; one d20 is rolled.'
					: 'Vantagem e desvantagem se cancelam; um d20 será rolado.'}</small
			>
		{/if}
	</div>
	<div>
		{#each attributes as attribute (attribute.key)}
			<article>
				<label
					title={$appLocale === 'en'
						? `${abilityLabel(attribute.key)} saving throw proficiency`
						: `Proficiência em resistência de ${abilityLabel(attribute.key)}`}
				>
					<span>{abilityLabel(attribute.key)}</span>
					<input
						type="checkbox"
						checked={sheet.savingThrows.includes(attribute.key)}
						onchange={() => toggleSavingThrow(attribute.key)}
					/>
				</label>
				<strong>{saveBonus(attribute.key) >= 0 ? '+' : ''}{saveBonus(attribute.key)}</strong>
				<button
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
	.saving-throws > div:last-child {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.saving-throws article {
		display: grid;
		grid-template-rows: auto 1fr auto;
		place-items: center;
		gap: 0.3rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.5rem;
		color: #cbbbab;
	}
	.saving-throws article label {
		display: flex;
		align-items: center;
		gap: 0.28rem;
		color: #d8c5aa;
		font-size: 0.68rem;
		font-weight: 800;
	}
	.saving-throws article input {
		appearance: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		border: 1px solid #806444;
		border-radius: 50%;
		padding: 0;
		background: #171216;
	}
	.saving-throws article input:checked {
		border-color: #e0b86f;
		background: #e0b86f;
		box-shadow: inset 0 0 0 3px #211914;
	}
	.saving-throws strong {
		display: grid;
		place-items: center;
		min-height: 1.8rem;
		color: #f0d29d;
		font-size: 1.05rem;
	}
	.saving-throws button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.28rem 0.4rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	@media (max-width: 680px) {
		.saving-throws > div:last-child {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.saving-throws .section-title h3 {
			font-size: clamp(0.72rem, 3vw, 0.9rem);
		}
	}
</style>
