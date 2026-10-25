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
				class="danger-button"
				aria-label={`${$appLocale === 'en' ? 'Remove damage component' : 'Remover componente de dano'} ${index + 1}`}
				onclick={() => onchange(removeDamageComponent(components, index))}>×</button
			>
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
	{/if}
	<button
		id={`damage-add-${identifier}`}
		type="button"
		class="secondary-button"
		disabled={components.reduce((total, part) => total + (Number(part.count) || 0), 0) >= 10}
		onclick={() => onchange(addDamageComponent(components))}
	>
		+ {$appLocale === 'en' ? 'die' : 'dado'}
	</button>
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
		grid-template-columns: minmax(3.5rem, 4.5rem) minmax(3.5rem, 4rem) auto;
		align-items: end;
		gap: 0.5rem;
	}
	.damage-component label,
	.die-type-field {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
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
	.damage-builder > :global(.secondary-button) {
		align-self: end;
	}
	@media (max-width: 520px) {
		.damage-component {
			grid-template-columns: minmax(3.25rem, 1fr) minmax(3.25rem, 1fr) auto;
		}
	}
</style>
