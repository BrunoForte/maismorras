<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import type { AbilityScores, CharacterSheet } from '$lib/services/characterApi';

	type RollMode = 'normal' | 'advantage' | 'disadvantage';
	type Skill = readonly [string, keyof AbilityScores];

	let {
		sheet,
		skills,
		isNewCharacter,
		hasAttackDisadvantage,
		skillLabel,
		skillBonus,
		toggleSkill,
		rollSkill,
		rollMode = $bindable<RollMode>('normal')
	}: {
		sheet: CharacterSheet;
		skills: readonly Skill[];
		isNewCharacter: boolean;
		hasAttackDisadvantage: () => boolean;
		skillLabel: (name: string) => string;
		skillBonus: (name: string, ability: keyof AbilityScores) => number;
		toggleSkill: (name: string) => void;
		rollSkill: (name: string) => Promise<void>;
		rollMode?: RollMode;
	} = $props();
</script>

<section class="skills">
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Skills' : 'Perícias'}</h3>
		<label class="roll-mode">
			<select bind:value={rollMode} aria-label="Modo de rolagem">
				<option value="advantage" disabled={hasAttackDisadvantage()}>
					{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}
				</option>
				<option value="normal">Normal</option>
				<option value="disadvantage">{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option>
			</select>
		</label>
		{#if isNewCharacter}
			<span>
				{$appLocale === 'en'
					? 'Mark proficient skills. Expertise is granted by class progression.'
					: 'Marque as perícias proficientes. Especializações vêm da Progressão de classe.'}
			</span>
		{/if}
	</div>
	<div class="skills-grid">
		{#each skills as [name, ability] (name)}
			<div class="skill-row">
				<label
					title={$appLocale === 'en'
						? `${skillLabel(name)} proficiency`
						: `Proficiência em ${name}`}
				>
					<input
						type="checkbox"
						checked={sheet.skillProficiencies.includes(name)}
						onchange={() => toggleSkill(name)}
					/>
				</label>
				<span>
					{skillLabel(name)}
					{#if sheet.skillExpertise.includes(name)}
						<small>{$appLocale === 'en' ? 'expertise' : 'especialização'}</small>
					{/if}
				</span>
				<strong>{skillBonus(name, ability) >= 0 ? '+' : ''}{skillBonus(name, ability)}</strong>
				<button
					class="skill-roll"
					onclick={() => void rollSkill(name)}
					aria-label={$appLocale === 'en' ? `Roll ${skillLabel(name)}` : `Rolar ${name}`}
					><RpgIcon name="d20" size={20} /></button
				>
			</div>
		{/each}
	</div>
</section>

<style>
	.skills h3 {
		margin: 0 0 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.section-title > span {
		color: #b9c8d3;
		font-size: 0.68rem;
	}
	.roll-mode select {
		max-width: 9rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		color: #e8c786;
		background: #211a1b;
	}
	.skills-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.85rem;
	}
	.skill-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.55rem;
		color: #cbbbab;
	}
	.skill-row label {
		display: grid;
		place-items: center;
	}
	.skill-row input {
		appearance: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		border: 1px solid #806444;
		border-radius: 50%;
		padding: 0;
		background: #171216;
	}
	.skill-row input:checked {
		border-color: #e0b86f;
		background: #e0b86f;
		box-shadow: inset 0 0 0 3px #211914;
	}
	.skill-row > span {
		overflow: hidden;
		color: #eee4d6;
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.skill-row > span small {
		display: block;
		color: #d8ad67;
		font-size: 0.58rem;
	}
	.skill-row strong {
		min-width: 2.1rem;
		color: #f0d29d;
		font-size: 1rem;
		text-align: center;
	}
	.skill-roll {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	@media (max-width: 680px) {
		.skills-grid {
			grid-template-columns: 1fr;
		}
		.section-title {
			flex-wrap: wrap;
		}
		.section-title > span {
			flex-basis: 100%;
		}
	}
</style>
