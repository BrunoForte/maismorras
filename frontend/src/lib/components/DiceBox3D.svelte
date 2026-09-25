<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { activeDiceRolls, reportDiceRendererFailure } from '$lib/stores/diceOverlayStore';
	import { DiceBoxRuntime, diceNotation, type DiceBoxPort } from '$lib/services/diceBoxRuntime';

	let { mode = '3d-overlay' }: { mode?: '3d-overlay' | '3d-table' } = $props();

	let host = $state<HTMLDivElement>();
	let box: {
		init: () => Promise<unknown>;
		roll: (notation: string, options?: { themeColor?: string }) => Promise<unknown> | unknown;
		add: (notation: string, options?: { themeColor?: string }) => Promise<unknown> | unknown;
		reroll: (
			die: Record<string, unknown> | Record<string, unknown>[],
			options?: { remove?: boolean }
		) => Promise<unknown> | unknown;
		clear?: () => void;
	} | null = null;
	let initialized = false;
	let runtime: DiceBoxRuntime | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private de-duplication cache
	const seen = new Set<string>();

	onMount(async () => {
		if (!host) return;
		try {
			const module = await import('@3d-dice/dice-box');
			const DiceBox = module.default;
			const DiceBoxConstructor = DiceBox as unknown as new (
				config: Record<string, unknown>
			) => NonNullable<typeof box>;
			host.id = `maismorras-dicebox-${crypto.randomUUID()}`;
			const instance = new DiceBoxConstructor({
				container: `#${host.id}`,
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
			runtime = new DiceBoxRuntime(instance as unknown as DiceBoxPort);
			await playBatch($activeDiceRolls);
		} catch (error) {
			console.error('DiceBox initialization failed', error);
			initialized = false;
			reportDiceRendererFailure();
		}
	});

	async function playBatch(
		results: Array<{
			expression: string;
			notation?: string;
			dice: number[];
			total: number;
			nonce?: string;
			color?: string;
			slot?: string;
		}>
	) {
		if (!initialized || !runtime) return;
		const unseen = results.filter((result) => {
			const id = result.nonce ?? `${result.expression}-${result.total}`;
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		});
		if (seen.size > 100) seen.delete(seen.values().next().value as string);
		await runtime.playBatch(
			unseen.map((result) => ({
				notation: diceNotation(result),
				color: result.color,
				slot: result.slot ?? `${result.color ?? 'default'}:${diceNotation(result)}`
			})),
			mode
		);
	}

	$effect(() => {
		if (!$activeDiceRolls.length) {
			if (mode === '3d-overlay' && initialized) runtime?.clearTemporary();
			return;
		}
		void playBatch($activeDiceRolls);
	});
	onDestroy(() => {
		if (initialized) box?.clear?.();
	});
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
