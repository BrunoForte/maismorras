<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import {
		addDamageComponent,
		DAMAGE_DIE_TYPES,
		type DamageComponent,
		removeDamageComponent
	} from '$lib/utils/weaponDamageBuilder';

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
			<label for={`damage-sides-${identifier}-${index}`}>
				{$appLocale === 'en' ? 'Die type' : 'Tipo de dado'}
				<select
					id={`damage-sides-${identifier}-${index}`}
					value={component.sides}
					aria-label={`${$appLocale === 'en' ? 'Die type for component' : 'Tipo de dado do componente'} ${index + 1}`}
					aria-invalid={invalidIndex === index &&
						(Number(component.sides) < 2 || Number(component.sides) > 1000)}
					aria-describedby={invalidIndex === index && error
						? `damage-error-${identifier}`
						: undefined}
					onchange={(event) =>
						onchange(
							components.map((part, partIndex) =>
								partIndex === index ? { ...part, sides: Number(event.currentTarget.value) } : part
							)
						)}
				>
					{#if !DAMAGE_DIE_TYPES.includes(component.sides as (typeof DAMAGE_DIE_TYPES)[number])}<option
							value={component.sides}>{component.sides}</option
						>{/if}
					{#each DAMAGE_DIE_TYPES as sides (sides)}<option value={sides}>d{sides}</option>{/each}
				</select>
			</label>
			<button
				type="button"
				class="danger-button"
				aria-label={`${$appLocale === 'en' ? 'Remove damage component' : 'Remover componente de dano'} ${index + 1}`}
				onclick={() => onchange(removeDamageComponent(components, index))}>×</button
			>
		</div>
	{/each}
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
		display: grid;
		gap: 0.55rem;
	}
	.damage-component {
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(5rem, 1fr) minmax(5rem, 1fr) auto;
		align-items: end;
		gap: 0.5rem;
	}
	.damage-component label {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
	}
	.damage-error {
		color: #f0a29b;
		font-size: 0.72rem;
	}
	@media (max-width: 520px) {
		.damage-component {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
		}
	}
</style>
