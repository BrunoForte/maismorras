<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		activeDiceRolls,
		reportDiceAnimationComplete,
		reportDiceRendererFailure
	} from '$lib/stores/diceOverlayStore';
	import { DiceBoxRuntime, diceNotation, type DiceBoxPort } from '$lib/services/diceBoxRuntime';

	let { mode = '3d-overlay' }: { mode?: '3d-overlay' | '3d-table' } = $props();

	let host = $state<HTMLDivElement>();
	type DiceBoxEntry = { box: DiceBoxPort; runtime: DiceBoxRuntime };
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private cache for per-color WebGL instances
	const boxes = new Map<string, Promise<DiceBoxEntry>>();
	let clearTimer: ReturnType<typeof setTimeout> | undefined;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private de-duplication cache
	const seen = new Set<string>();

	function colorSet(color?: string) {
		const hex = /^#?([\da-f]{6})$/i.exec(color ?? '')?.[1] ?? '8f6bdc';
		const normalized = `#${hex}`;
		const red = Number.parseInt(hex.slice(0, 2), 16);
		const green = Number.parseInt(hex.slice(2, 4), 16);
		const blue = Number.parseInt(hex.slice(4, 6), 16);
		const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
		const label = luminance > 150 ? '#17131a' : '#ffffff';
		return {
			name: `maismorras-${hex.toLowerCase()}`,
			background: normalized,
			foreground: label,
			outline: label,
			edge: normalized,
			texture: 'none',
			material: 'plastic'
		};
	}

	async function ensureBox(color?: string): Promise<DiceBoxEntry> {
		if (!host) throw new Error('A área dos dados 3D ainda não está disponível.');
		const config = colorSet(color);
		const key = config.name;
		const existing = boxes.get(key);
		if (existing) return existing;

		const creation = (async () => {
			const module = await import('@3d-dice/dice-box-threejs');
			const DiceBoxConstructor = module.default as unknown as new (
				selector: string,
				options: Record<string, unknown>
			) => DiceBoxPort & { initialize: () => Promise<unknown> };
			const child = document.createElement('div');
			child.className = 'dice-box-instance';
			child.id = `maismorras-dicebox-${crypto.randomUUID()}`;
			// eslint-disable-next-line svelte/no-dom-manipulating -- DiceBox owns its canvas inside this isolated host
			host?.appendChild(child);
			const instance = new DiceBoxConstructor(`#${child.id}`, {
				assetPath: '/assets/dice-box-threejs/',
				sounds: false,
				shadows: true,
				theme_colorset: 'white',
				theme_texture: 'none',
				theme_material: 'plastic',
				theme_customColorset: config,
				baseScale: 6
			});
			try {
				await instance.initialize();
				return { box: instance, runtime: new DiceBoxRuntime(instance) };
			} catch (error) {
				child.remove();
				throw error;
			}
		})();
		boxes.set(key, creation);
		try {
			return await creation;
		} catch (error) {
			boxes.delete(key);
			throw error;
		}
	}

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
		if (clearTimer) clearTimeout(clearTimer);
		const unseen = results.filter((result) => {
			const id = result.nonce ?? `${result.expression}-${result.total}`;
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		});
		if (seen.size > 100) seen.delete(seen.values().next().value as string);
		const rolls = unseen.map((result) => ({
			notation: diceNotation(result),
			dice: result.dice,
			color: result.color,
			slot: result.slot ?? `${result.color ?? 'default'}:${diceNotation(result)}`
		}));
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- temporary grouping for this animation batch
			const byColor = new Map<string, typeof rolls>();
			for (const roll of rolls) {
				const key = roll.color ?? 'default';
				byColor.set(key, [...(byColor.get(key) ?? []), roll]);
			}
			await Promise.all(
				[...byColor.entries()].map(async ([color, colorRolls]) => {
					const { runtime } = await ensureBox(color === 'default' ? undefined : color);
					await runtime.playBatch(colorRolls, mode);
				})
			);
		} catch (error) {
			console.error('DiceBox roll animation failed', error);
			reportDiceRendererFailure();
		} finally {
			reportDiceAnimationComplete(unseen.map((result) => result.nonce).filter(Boolean) as string[]);
		}
	}

	$effect(() => {
		if (!$activeDiceRolls.length) {
			if (mode === '3d-overlay') {
				if (clearTimer) clearTimeout(clearTimer);
				// Keep the settled dice visible briefly after the result card closes.
				clearTimer = setTimeout(() => {
					for (const entry of boxes.values()) {
						void entry.then(({ runtime }) => runtime.clearTemporary());
					}
				}, 5000);
			}
			return;
		}
		void playBatch($activeDiceRolls);
	});
	onDestroy(() => {
		if (clearTimer) clearTimeout(clearTimer);
		for (const entry of boxes.values()) {
			void entry.then(({ box }) => box.clear());
		}
		boxes.clear();
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
	.dice-box-3d :global(.dice-box-instance) {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.dice-box-3d :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
