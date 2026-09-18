<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { activeDiceRolls, diceRendererEffective } from '$lib/stores/diceOverlayStore';

	let { mode = '3d-overlay' }: { mode?: '3d-overlay' | '3d-table' } = $props();

	let host = $state<HTMLDivElement>();
	let box: {
		init: () => Promise<unknown>;
		roll: (notation: string) => unknown;
		add: (notation: string) => unknown;
		clear?: () => void;
	} | null = null;
	let initialized = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private de-duplication cache
	const seen = new Set<string>();

	onMount(async () => {
		if (!host) return;
		try {
			const module = await import('@3d-dice/dice-box');
			const DiceBox = module.default;
			const instance = new DiceBox(host, {
				assetPath: '/assets/dice-box/',
				theme: 'default',
				sounds: false,
				offscreen: false,
				scale: 6
			});
			// A versão instalada expõe `add` em runtime, embora a tipagem publicada não o declare.
			box = instance as unknown as NonNullable<typeof box>;
			await instance.init();
			initialized = true;
			for (const result of $activeDiceRolls) play(result);
		} catch {
			// WebGL/worker indisponível: o DiceOverlay continua como fallback visual.
			initialized = false;
			diceRendererEffective.set('2d');
		}
	});

	function play(result: { expression: string; nonce?: string }) {
		if (!initialized || !box) return;
		const id = result.nonce ?? `${result.expression}`;
		if (seen.has(id)) return;
		seen.add(id);
		const notation = result.expression.replace(/\s+/g, '');
		// `roll` limpa a mesa; `add` preserva os dados já parados no modo persistente.
		if (mode === '3d-table') box.add(notation);
		else box.roll(notation);
		if (seen.size > 100) seen.delete(seen.values().next().value as string);
	}

	$effect(() => {
		for (const result of $activeDiceRolls) play(result);
	});
	onDestroy(() => box?.clear?.());
</script>

<div
	bind:this={host}
	class:dice-table={mode === '3d-table'}
	class="dice-box-3d"
	aria-label={mode === '3d-table' ? 'Dados 3D persistentes na mesa' : 'Dados 3D rolando'}
></div>

<style>
	.dice-box-3d {
		position: absolute;
		inset: 0;
		z-index: 8;
		pointer-events: none;
		overflow: hidden;
	}
	.dice-box-3d :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
