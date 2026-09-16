<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { activeDiceRolls } from '$lib/stores/diceOverlayStore';

	let host = $state<HTMLDivElement>();
	let box: {
		init: () => Promise<unknown>;
		roll: (notation: string) => unknown;
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
			box = instance;
			await instance.init();
			initialized = true;
			for (const result of $activeDiceRolls) play(result);
		} catch {
			// WebGL/worker indisponível: o DiceOverlay continua como fallback visual.
			initialized = false;
		}
	});

	function play(result: { expression: string; nonce?: string }) {
		if (!initialized || !box) return;
		const id = result.nonce ?? `${result.expression}`;
		if (seen.has(id)) return;
		seen.add(id);
		box.roll(result.expression.replace(/\s+/g, ''));
		if (seen.size > 100) seen.delete(seen.values().next().value as string);
	}

	$effect(() => {
		for (const result of $activeDiceRolls) play(result);
	});
	onDestroy(() => box?.clear?.());
</script>

<div bind:this={host} class="dice-box-3d" aria-label="Dados 3D rolando na mesa"></div>

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
