<script lang="ts">
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import { DAMAGE_DIE_TYPES } from '$lib/utils/weaponDamageBuilder';

	let {
		sides,
		label,
		invalid = false,
		describedBy,
		onchange
	}: {
		sides: number | '';
		label: string;
		invalid?: boolean;
		describedBy?: string;
		onchange: (sides: number) => void;
	} = $props();

	function choose(event: MouseEvent, value: number) {
		const picker = (event.currentTarget as HTMLElement).closest('details');
		const summary = picker?.querySelector('summary');
		onchange(value);
		picker?.removeAttribute('open');
		summary?.focus();
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		const picker = (event.currentTarget as HTMLElement).closest('details');
		picker?.removeAttribute('open');
		picker?.querySelector('summary')?.focus();
	}
</script>

<details class="die-type-picker">
	<summary
		aria-label={`${label}: ${sides === '' ? '—' : `d${sides}`}`}
		aria-describedby={invalid ? describedBy : undefined}
		title={sides === '' ? label : `d${sides}`}
	>
		{#if sides === ''}<span class="empty-die">—</span>
		{:else}<RpgIcon name={`d${sides}`} size={24} />{/if}
		<span class="visually-hidden">{sides === '' ? label : `d${sides}`}</span>
	</summary>
	<div class="die-type-options" role="group" aria-label={label}>
		{#if typeof sides === 'number' && !DAMAGE_DIE_TYPES.includes(sides as (typeof DAMAGE_DIE_TYPES)[number])}
			<button
				type="button"
				aria-pressed="true"
				onclick={(event) => choose(event, sides)}
				onkeydown={closeOnEscape}
			>
				<RpgIcon name={`d${sides}`} size={24} /><span>d{sides}</span>
			</button>
		{/if}
		{#each DAMAGE_DIE_TYPES as option (option)}
			<button
				type="button"
				aria-pressed={sides === option}
				title={`d${option}`}
				onclick={(event) => choose(event, option)}
				onkeydown={closeOnEscape}
			>
				<RpgIcon name={`d${option}`} size={24} /><span>d{option}</span>
			</button>
		{/each}
	</div>
</details>

<style>
	.die-type-picker {
		position: relative;
		justify-self: start;
	}
	.die-type-picker summary {
		width: 2.65rem;
		height: 2.55rem;
		display: grid;
		place-items: center;
		border: 1px solid #765d3d;
		border-radius: 6px;
		background: #211a1b;
		cursor: pointer;
		list-style: none;
	}
	.die-type-picker summary::-webkit-details-marker {
		display: none;
	}
	.die-type-picker summary::marker {
		content: '';
	}
	.die-type-picker summary:focus-visible,
	.die-type-options button:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	.die-type-options {
		position: absolute;
		bottom: calc(100% + 0.35rem);
		left: 0;
		z-index: 20;
		min-width: 7rem;
		display: grid;
		gap: 0.2rem;
		padding: 0.35rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		background: #211a1b;
		box-shadow: 0 8px 24px #0008;
	}
	.die-type-options button {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 0;
		border-radius: 5px;
		padding: 0.25rem 0.4rem;
		color: #e8c786;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.die-type-options button:hover,
	.die-type-options button[aria-pressed='true'] {
		background: #3b2c24;
	}
	.die-type-options span {
		font-size: 0.78rem;
	}
	.empty-die {
		color: #f0a29b;
		font-size: 1.1rem;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
