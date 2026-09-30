<script lang="ts">
	import type { CharacterSheet } from '$lib/services/characterApi';
	import type { AppLocale } from '$lib/utils/speciesRules';

	let {
		locale,
		sheet = $bindable(),
		shownSpeed,
		initiativeTokenId,
		onSpeedChange,
		onRollInitiative,
		onSetInitiativeAdvantage,
		onSyncToken
	}: {
		locale: AppLocale;
		sheet: CharacterSheet;
		shownSpeed: number;
		initiativeTokenId: string | null;
		onSpeedChange: (value: string) => void;
		onRollInitiative: () => void | Promise<void>;
		onSetInitiativeAdvantage: (enabled: boolean) => void | Promise<void>;
		onSyncToken: () => void;
	} = $props();
</script>

<section class="profile-combat-fields">
	<h3>{locale === 'en' ? 'Combat profile' : 'Perfil de combate'}</h3>
	<label
		>{locale === 'en' ? 'Speed' : 'Deslocamento'}<input
			type="number"
			min="0"
			value={shownSpeed}
			onchange={(event) => onSpeedChange(event.currentTarget.value)}
		/></label
	>
	<label class="hit-dice-label"
		><span
			>{locale === 'en' ? 'Hit dice' : 'Dados de vida'}<small
				>{sheet.level - sheet.hitDiceSpent}/{sheet.level}</small
			></span
		><input bind:value={sheet.hitDice} /></label
	>
	<label
		>{locale === 'en' ? 'Initiative bonus' : 'Bônus de iniciativa'}<input
			type="number"
			min="-20"
			max="20"
			bind:value={sheet.initiative}
			oninput={onSyncToken}
		/></label
	>
	<div class="initiative-actions">
		<button
			type="button"
			class="initiative-roll"
			onclick={() => void onRollInitiative()}
			disabled={!initiativeTokenId}
			>{locale === 'en' ? 'Roll initiative' : 'Rolar iniciativa'}</button
		>
		<label
			class="initiative-advantage-toggle"
			title={locale === 'en'
				? 'Advantage on the next initiative roll'
				: 'Aplica vantagem à próxima rolagem de iniciativa'}
		>
			<input
				type="checkbox"
				class="switch-input"
				checked={sheet.initiativeAdvantage ?? false}
				onchange={(event) => void onSetInitiativeAdvantage(event.currentTarget.checked)}
			/>
			<span class="switch-track" aria-hidden="true"></span>{locale === 'en'
				? 'Advantage'
				: 'Vantagem'}
		</label>
	</div>
</section>

<style>
	.profile-combat-fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.profile-combat-fields label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.profile-combat-fields input {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.profile-combat-fields h3 {
		grid-column: 1 / -1;
		margin: 0;
		color: #e7c98c;
		font-size: 1rem;
	}
	.initiative-actions {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hit-dice-label > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.hit-dice-label small {
		color: #d8ad67;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.initiative-roll {
		min-height: 2.35rem;
		border: 1px solid #8c6d43;
		border-radius: 7px;
		padding: 0.45rem 0.7rem;
		color: #f5e4c0;
		background: linear-gradient(180deg, #423126, #2b211c);
		font: 650 0.75rem inherit;
		white-space: nowrap;
		cursor: pointer;
	}
	.initiative-roll:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #493020;
	}
	.initiative-roll:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.initiative-advantage-toggle {
		display: flex !important;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem !important;
		cursor: pointer;
	}
	.switch-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.switch-track {
		position: relative;
		flex: 0 0 auto;
		width: 2.25rem;
		height: 1.25rem;
		border: 1px solid #80603b;
		border-radius: 999px;
		background: #30282a;
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}
	.switch-track::after {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 50%;
		background: #c6b8ac;
		content: '';
		transition:
			transform 140ms ease,
			background 140ms ease;
	}
	.switch-input:checked + .switch-track {
		border-color: #c89655;
		background: #684829;
	}
	.switch-input:checked + .switch-track::after {
		transform: translateX(1rem);
		background: #ffe0a5;
	}
	.switch-input:focus-visible + .switch-track {
		outline: 2px solid #f2d49a;
		outline-offset: 2px;
	}
	@media (max-width: 700px) {
		.profile-combat-fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.initiative-actions {
			grid-column: 1 / -1;
			align-items: center;
		}
		.initiative-roll {
			width: auto;
		}
	}
</style>
