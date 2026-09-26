<script lang="ts">
	import { onDestroy } from 'svelte';
	import { mapCameraView } from '$lib/stores/mapCameraStore';
	import {
		activeDiceRolls,
		reportDiceAnimationComplete,
		reportDiceRendererFailure
	} from '$lib/stores/diceOverlayStore';
	import {
		DiceBoxRuntime,
		diceNotation,
		unseenDiceRolls,
		type DiceBoxPort
	} from '$lib/services/diceBoxRuntime';

	let host = $state<HTMLDivElement>();
	type DiceBoxEntry = { box: DiceBoxPort; runtime: DiceBoxRuntime };
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- DiceBox instances are imperative WebGL resources.
	const boxes = new Map<string, Promise<DiceBoxEntry>>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- prevents duplicate animations for the same roll nonce.
	const seen = new Set<string>();
	let clearTimer: ReturnType<typeof setTimeout> | undefined;

	function colorSet(color?: string) {
		const hex = /^#?([\da-f]{6})$/i.exec(color ?? '')?.[1] ?? '8f6bdc';
		const normalized = `#${hex}`;
		const luminance =
			(Number.parseInt(hex.slice(0, 2), 16) * 299 +
				Number.parseInt(hex.slice(2, 4), 16) * 587 +
				Number.parseInt(hex.slice(4, 6), 16) * 114) /
			1000;
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
		const existing = boxes.get(config.name);
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
			// eslint-disable-next-line svelte/no-dom-manipulating -- DiceBox owns the canvas in this isolated host.
			host?.appendChild(child);
			const instance = new DiceBoxConstructor(`#${child.id}`, {
				assetPath: '/assets/dice-box-threejs/',
				sounds: false,
				shadows: true,
				theme_colorset: 'white',
				theme_texture: 'none',
				theme_material: 'plastic',
				theme_customColorset: config,
				baseScale: 100
			});
			try {
				await instance.initialize();
				return { box: instance, runtime: new DiceBoxRuntime(instance) };
			} catch (error) {
				child.remove();
				throw error;
			}
		})();
		boxes.set(config.name, creation);
		try {
			return await creation;
		} catch (error) {
			boxes.delete(config.name);
			throw error;
		}
	}

	async function playBatch(results: typeof $activeDiceRolls) {
		if (clearTimer) clearTimeout(clearTimer);
		const unseen = unseenDiceRolls(results, seen);
		if (seen.size > 100) seen.delete(seen.values().next().value as string);
		try {
			const byColor: Record<string, typeof unseen> = {};
			for (const result of unseen) {
				const color = result.color ?? 'default';
				byColor[color] = [...(byColor[color] ?? []), result];
			}
			await Promise.all(
				Object.entries(byColor).map(async ([color, colorRolls]) => {
					const { runtime } = await ensureBox(color === 'default' ? undefined : color);
					await runtime.playBatch(
						colorRolls.map((roll) => ({
							notation: diceNotation(roll),
							dice: roll.dice
						}))
					);
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
		const rolls = $activeDiceRolls;
		if (!rolls.length) {
			if (clearTimer) clearTimeout(clearTimer);
			// Keep temporary dice on the map briefly after the result card closes.
			clearTimer = setTimeout(() => {
				for (const entry of boxes.values())
					void entry.then(({ runtime }) => runtime.clearTemporary());
			}, 2500);
			return;
		}
		void playBatch(rolls);
	});

	onDestroy(() => {
		if (clearTimer) clearTimeout(clearTimer);
		for (const entry of boxes.values()) {
			void entry.then(({ runtime }) => runtime.clearTemporary());
		}
		boxes.clear();
	});
</script>

<div
	bind:this={host}
	style={`--map-camera-x: ${$mapCameraView.x}px; --map-camera-y: ${$mapCameraView.y}px; --map-camera-zoom: ${$mapCameraView.zoom}`}
	class="dice-box-3d"
	aria-label="Dados 3D temporários rolando na mesa"
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
		transform: translate(var(--map-camera-x), var(--map-camera-y)) scale(var(--map-camera-zoom));
		transform-origin: 0 0;
	}
	.dice-box-3d :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
