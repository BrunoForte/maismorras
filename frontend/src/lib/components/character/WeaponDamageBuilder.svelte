<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import {
		addDamageComponent,
		type DamageComponent,
		removeDamageComponent
	} from '$lib/utils/weaponDamageBuilder';
	import DamageDieSelector from './DamageDieSelector.svelte';

	let {
		identifier,
		components,
		invalidIndex = -1,
		error = '',
		onchange
	}: {
		identifier: string;
		components: DamageComponent[];
		invalidIndex?: number;
		error?: string;
		onchange: (components: DamageComponent[]) => void;
	} = $props();
</script>

<div class="damage-builder">
	{#if error}<p id={`damage-error-${identifier}`} class="damage-error" role="alert">{error}</p>{/if}
	{#each components as component, index (`${identifier}:${index}`)}
		<div class="damage-component">
			<label for={`damage-count-${identifier}-${index}`}>
				{$appLocale === 'en' ? 'Dice quantity' : 'Quantidade de dados'}
				<input
					id={`damage-count-${identifier}-${index}`}
					type="number"
					min="1"
					max={Math.max(
						1,
						10 -
							components.reduce(
								(total, part, partIndex) =>
									total + (partIndex === index ? 0 : Number(part.count) || 0),
								0
							)
					)}
					step="1"
					value={component.count}
					aria-invalid={invalidIndex === index}
					aria-describedby={invalidIndex === index && error
						? `damage-error-${identifier}`
						: undefined}
					oninput={(event) => {
						const value: number | '' =
							event.currentTarget.value === '' ? '' : event.currentTarget.valueAsNumber;
						onchange(
							components.map((part, partIndex) =>
								partIndex === index ? { ...part, count: value } : part
							)
						);
					}}
				/>
			</label>
			<div class="die-type-field">
				<span>{$appLocale === 'en' ? 'Die type' : 'Tipo de dado'}</span>
				<DamageDieSelector
					sides={component.sides}
					label={`${$appLocale === 'en' ? 'Die type for component' : 'Tipo de dado do componente'} ${index + 1}`}
					invalid={invalidIndex === index &&
						(Number(component.sides) < 2 || Number(component.sides) > 1000)}
					describedBy={invalidIndex === index && error ? `damage-error-${identifier}` : undefined}
					onchange={(sides) =>
						onchange(
							components.map((part, partIndex) => (partIndex === index ? { ...part, sides } : part))
						)}
				/>
			</div>
			<button
				type="button"
				class="damage-remove"
				aria-label={`${$appLocale === 'en' ? 'Remove damage component' : 'Remover componente de dano'} ${index + 1}`}
				onclick={() => onchange(removeDamageComponent(components, index))}>×</button
			>
			{#if index === components.length - 1}
				<button
					id={`damage-add-${identifier}`}
					type="button"
					class="damage-add"
					aria-label={$appLocale === 'en' ? 'Add damage die' : 'Adicionar dado de dano'}
					disabled={components.reduce((total, part) => total + (Number(part.count) || 0), 0) >= 10}
					onclick={() => onchange(addDamageComponent(components))}
				>
					+ {$appLocale === 'en' ? 'die' : 'dado'}
				</button>
			{/if}
		</div>
	{/each}
	{#if components.length === 0}
		<div class="no-damage-dice" data-testid="no-damage-dice">
			<small>
				{$appLocale === 'en'
					? 'Only the damage bonus and applicable ability modifier are used.'
					: 'Usa apenas o bônus de dano e o modificador de atributo aplicável.'}
			</small>
		</div>
		<button
			id={`damage-add-${identifier}`}
			type="button"
			class="damage-add"
			aria-label={$appLocale === 'en' ? 'Add damage die' : 'Adicionar dado de dano'}
			onclick={() => onchange(addDamageComponent(components))}
		>
			+ {$appLocale === 'en' ? 'die' : 'dado'}
		</button>
	{/if}
</div>

<style>
	.damage-builder {
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.55rem;
	}
	.damage-component {
		min-width: min(100%, 15rem);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
		align-items: end;
		gap: 0.5rem;
	}
	.damage-component label,
	.die-type-field {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
		color: #bcae9f;
		font-size: 0.68rem;
	}
	.damage-component input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		height: 2.3rem;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.damage-component button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.3rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		font: inherit;
		font-size: 0.75rem;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
	}
	.damage-remove {
		width: 2.3rem;
		padding: 0;
		color: #e3a09a;
		background: #2a1c1e;
	}
	.damage-add {
		color: #f0d29d;
		background: #2b211c;
	}
	.damage-add:not(:disabled):hover {
		border-color: #c89655;
		background: #38281f;
	}
	.damage-remove:hover {
		border-color: #a06b5f;
		color: #f0c1b4;
		background: #382321;
	}
	.damage-component button:focus-visible,
	.damage-builder > .damage-add:focus-visible {
		outline: 2px solid #f0d29d;
		outline-offset: 2px;
	}
	.damage-add:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.no-damage-dice small {
		display: block;
		color: #aa9d91;
	}
	.damage-error {
		flex-basis: 100%;
		margin: 0;
		color: #f0a29b;
		font-size: 0.72rem;
	}
	@media (max-width: 420px) {
		.damage-component {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2.2rem auto;
			gap: 0.35rem;
		}
		.damage-component label {
			font-size: 0.62rem;
		}
		.damage-component button {
			min-height: 2.2rem;
			font-size: 0.7rem;
		}
		.damage-remove {
			width: 2.2rem;
		}
		.damage-component .damage-add {
			padding-inline: 0.4rem;
		}
	}
	@media (max-width: 350px) {
		.damage-component {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2rem auto;
			gap: 0.25rem;
		}
		.damage-component label {
			font-size: 0.58rem;
		}
		.damage-remove {
			width: 2rem;
		}
		.damage-component .damage-add {
			padding-inline: 0.3rem;
			font-size: 0.65rem;
		}
	}
</style>
