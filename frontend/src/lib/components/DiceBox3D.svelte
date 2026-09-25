<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { get } from 'svelte/store';
	import { mapCameraView } from '$lib/stores/mapCameraStore';
	import {
		beginDiceBatch,
		diceOverlay,
		finishDiceBatch,
		reportDiceAnimationComplete
	} from '$lib/stores/diceOverlayStore';
	import { rollDice } from '$lib/services/eventApi';
	import { chatMensagens, type Mensagem } from '$lib/stores/chatStore';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import {
		pickProjectedDie,
		projectDieToViewport,
		worldDragDelta
	} from '$lib/services/dicePicking';
	import { activeDiceRolls, reportDiceRendererFailure } from '$lib/stores/diceOverlayStore';
	import {
		DiceBoxRuntime,
		diceNotation,
		unseenDiceRolls,
		type DiceBoxPort
	} from '$lib/services/diceBoxRuntime';

	let {
		mode = '3d-overlay',
		session,
		campaignId,
		sceneId
	}: {
		mode?: '3d-overlay' | '3d-table';
		session?: Session;
		campaignId?: string;
		sceneId?: string;
	} = $props();

	let host = $state<HTMLDivElement>();
	type DiceBoxEntry = { box: DiceBoxPort; runtime: DiceBoxRuntime };
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private cache for per-color WebGL instances
	const boxes = new Map<string, Promise<DiceBoxEntry>>();
	let clearTimer: ReturnType<typeof setTimeout> | undefined;
	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	let gestureMessage = $state('');
	let sceneSocket: SceneSocket | null = null;
	type DragState = {
		entry: DiceBoxEntry;
		die: DiceBoxPort['diceList'][number];
		color: string;
		slot: string;
		startX: number;
		startY: number;
		lastX: number;
		lastY: number;
		startTime: number;
		pixelsPerWorldUnit: number;
		worldX: number;
		worldY: number;
		worldZ: number;
		sides: number;
		originalValue: number | null;
		pointerId: number;
	};
	let draggedDie: DragState | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- private cache of initialized dice boxes
	const readyBoxes = new Map<string, { entry: DiceBoxEntry; color: string }>();
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
		boxes.set(key, creation);
		try {
			const entry = await creation;
			readyBoxes.set(key, { entry, color: color ?? '#8f6bdc' });
			return entry;
		} catch (error) {
			boxes.delete(key);
			throw error;
		}
	}

	function pointerInTable(event: PointerEvent) {
		if (!host) return null;
		const rect = host.getBoundingClientRect();
		const view = get(mapCameraView);
		const x = (event.clientX - rect.left - view.x) / view.zoom;
		const y = (event.clientY - rect.top - view.y) / view.zoom;
		if (x < 0 || y < 0 || x > host.clientWidth || y > host.clientHeight) return null;
		return { x, y, rect };
	}

	function findDieAtPointer(event: PointerEvent) {
		const pointer = pointerInTable(event);
		if (!pointer || !host) return null;
		const candidates: Array<{
			die: DiceBoxPort['diceList'][number];
			entry: DiceBoxEntry;
			color: string;
			slot: string;
			projected: NonNullable<ReturnType<typeof projectDieToViewport>>;
			details: ReturnType<DiceBoxRuntime['getDieDetails']>;
		}> = [];
		for (const { entry, color } of readyBoxes.values()) {
			const camera = entry.box.camera as
				| {
						matrixWorldInverse?: { elements: ArrayLike<number> };
						projectionMatrix?: { elements: ArrayLike<number> };
						updateMatrixWorld?: (force?: boolean) => void;
				  }
				| undefined;
			if (!camera?.matrixWorldInverse || !camera.projectionMatrix) continue;
			camera.updateMatrixWorld?.(true);
			for (const { die, slot } of entry.runtime.getPersistentDice()) {
				const details = entry.runtime.getDieDetails(die);
				if (!details.position) continue;
				const projected = projectDieToViewport(
					details.position,
					details.radius,
					camera.matrixWorldInverse.elements,
					camera.projectionMatrix.elements,
					host.clientWidth,
					host.clientHeight
				);
				if (projected) candidates.push({ die, entry, color, slot, projected, details });
			}
		}
		return pickProjectedDie(candidates, pointer.x, pointer.y) ?? null;
	}

	function stopPointer(event: PointerEvent) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	function onPointerDown(event: PointerEvent) {
		if (mode !== '3d-table' || event.button !== 0 || draggedDie) return;
		if (
			event.target instanceof Element &&
			event.target.closest('button, input, select, textarea, a, [role="button"]')
		)
			return;
		const picked = findDieAtPointer(event);
		if (!picked || !host) return;
		const position = picked.details.position;
		if (!position) return;
		stopPointer(event);
		try {
			host.setPointerCapture(event.pointerId);
		} catch {
			/* Window-level capture remains active if pointer capture is unavailable. */
		}
		picked.entry.runtime.movePersistentDie(picked.die, position.x, position.y);
		draggedDie = {
			entry: picked.entry,
			die: picked.die,
			color: picked.color,
			slot: picked.slot,
			startX:
				(event.clientX - host.getBoundingClientRect().left - get(mapCameraView).x) /
				get(mapCameraView).zoom,
			startY:
				(event.clientY - host.getBoundingClientRect().top - get(mapCameraView).y) /
				get(mapCameraView).zoom,
			lastX:
				(event.clientX - host.getBoundingClientRect().left - get(mapCameraView).x) /
				get(mapCameraView).zoom,
			lastY:
				(event.clientY - host.getBoundingClientRect().top - get(mapCameraView).y) /
				get(mapCameraView).zoom,
			startTime: performance.now(),
			pixelsPerWorldUnit: picked.projected.pixelsPerWorldUnit,
			worldX: position.x,
			worldY: position.y,
			worldZ: position.z,
			sides: picked.details.sides,
			originalValue: picked.details.value,
			pointerId: event.pointerId
		};
	}

	function onPointerMove(event: PointerEvent) {
		const drag = draggedDie;
		if (!drag || drag.pointerId !== event.pointerId) return;
		stopPointer(event);
		const point = pointerInTable(event);
		if (!point) return;
		const delta = worldDragDelta(
			point.x - drag.lastX,
			point.y - drag.lastY,
			drag.pixelsPerWorldUnit
		);
		drag.worldX += delta.x;
		drag.worldY += delta.y;
		drag.entry.runtime.movePersistentDie(drag.die, drag.worldX, drag.worldY);
		drag.lastX = point.x;
		drag.lastY = point.y;
	}

	function onPointerUp(event: PointerEvent) {
		const drag = draggedDie;
		if (!drag || drag.pointerId !== event.pointerId) return;
		stopPointer(event);
		draggedDie = null;
		const point = pointerInTable(event);
		const endX = point?.x ?? drag.lastX;
		const endY = point?.y ?? drag.lastY;
		const deltaX = endX - drag.startX;
		const deltaY = endY - drag.startY;
		const distance = Math.hypot(deltaX, deltaY);
		if (distance < 14) {
			drag.entry.runtime.movePersistentDie(drag.die, drag.worldX, drag.worldY);
			drag.entry.runtime.releasePersistentDie(drag.die);
			return;
		}
		const elapsed = Math.max(40, performance.now() - drag.startTime);
		const speed = Math.min(2400, Math.max(450, (distance / elapsed) * 1000 * 2.8));
		const velocity = { x: (deltaX / distance) * speed, y: (-deltaY / distance) * speed };
		void rollDraggedDie(drag, velocity);
	}

	function onPointerCancel(event: PointerEvent) {
		const drag = draggedDie;
		if (!drag || drag.pointerId !== event.pointerId) return;
		stopPointer(event);
		draggedDie = null;
		drag.entry.runtime.movePersistentDie(drag.die, drag.worldX, drag.worldY);
		drag.entry.runtime.releasePersistentDie(drag.die);
	}

	async function rollDraggedDie(drag: DragState, velocity: { x: number; y: number }) {
		if (!session || !campaignId) {
			drag.entry.runtime.releasePersistentDie(drag.die);
			return;
		}
		const nonce = crypto.randomUUID();
		beginDiceBatch();
		const animation = drag.entry.runtime.throwPersistentDie(drag.die, velocity);
		try {
			const event = await rollDice(session, campaignId, `1d${drag.sides}`, undefined, 'chat', 0);
			const result = event.payload as { expressao: string; dados: number[]; total: number };
			await animation;
			const value = result.dados[0];
			if (!Number.isInteger(value)) throw new Error('O servidor não retornou o resultado do dado.');
			drag.entry.runtime.setAuthoritativeDieFace(drag.die, value);
			seen.add(nonce);
			const author =
				event.author || session.user.user_metadata?.display_name || session.user.email || 'Jogador';
			const message: Mensagem = {
				id: String(event.id),
				autor: author,
				texto: `Dado lançado manualmente · [${result.dados.join(', ')}] · resultado ${result.total}`,
				tipo: 'rolagem',
				canal: 'chat',
				detalhesRolagem: {
					expressao: result.expressao,
					dados: result.dados,
					modificador: 0,
					total: result.total,
					label: 'Dado lançado manualmente',
					channel: 'chat'
				}
			};
			chatMensagens.update((messages) => [...messages, message].slice(-100));
			diceOverlay.set({
				expression: `${author} · dado lançado`,
				notation: result.expressao,
				total: result.total,
				dice: result.dados,
				color: drag.color,
				slot: drag.slot,
				nonce
			});
			reportDiceAnimationComplete([nonce]);
			sceneSocket?.publishChatUpdated();
		} catch {
			await animation.catch(() => undefined);
			if (drag.originalValue !== null)
				drag.entry.runtime.setAuthoritativeDieFace(drag.die, drag.originalValue);
			gestureMessage = 'Não foi possível registrar essa rolagem. Tente novamente.';
			if (messageTimer) clearTimeout(messageTimer);
			messageTimer = setTimeout(() => (gestureMessage = ''), 3500);
		} finally {
			finishDiceBatch();
		}
	}

	onMount(() => {
		if (mode !== '3d-table' || !session || !sceneId) return;
		sceneSocket = connectSceneSocket(
			session,
			sceneId,
			() => {},
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => {}
		);
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('pointermove', onPointerMove, true);
		window.addEventListener('pointerup', onPointerUp, true);
		window.addEventListener('pointercancel', onPointerCancel, true);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('pointermove', onPointerMove, true);
			window.removeEventListener('pointerup', onPointerUp, true);
			window.removeEventListener('pointercancel', onPointerCancel, true);
			sceneSocket?.close();
			sceneSocket = null;
		};
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
		if (clearTimer) clearTimeout(clearTimer);
		const unseen = unseenDiceRolls(results, seen);
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
			void entry.then(({ box }) => {
				if (box.clearDice) box.clearDice();
				else box.clear?.();
			});
		}
		boxes.clear();
		readyBoxes.clear();
		if (messageTimer) clearTimeout(messageTimer);
	});
</script>

<div
	bind:this={host}
	class:dice-table={mode === '3d-table'}
	style={`--map-camera-x: ${$mapCameraView.x}px; --map-camera-y: ${$mapCameraView.y}px; --map-camera-zoom: ${$mapCameraView.zoom}`}
	class="dice-box-3d"
	aria-label={mode === '3d-table' ? 'Dados 3D persistentes na mesa' : 'Dados 3D rolando'}
></div>
{#if mode === '3d-table'}<div class="dice-hint" aria-hidden="true">
		Arraste um dado e solte para lançá-lo
	</div>{/if}
{#if gestureMessage}<div class="dice-gesture-message" role="status">{gestureMessage}</div>{/if}

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
	.dice-box-3d.dice-table :global(.dice-box-instance) {
		transform: translate(var(--map-camera-x), var(--map-camera-y)) scale(var(--map-camera-zoom));
		transform-origin: 0 0;
	}
	.dice-box-3d :global(canvas) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.dice-hint,
	.dice-gesture-message {
		position: absolute;
		z-index: 9;
		left: 50%;
		bottom: 0.75rem;
		transform: translateX(-50%);
		padding: 0.4rem 0.7rem;
		border: 1px solid rgba(240, 203, 133, 0.55);
		border-radius: 999px;
		color: #f8eedf;
		background: rgba(23, 16, 18, 0.82);
		font-size: 0.72rem;
		pointer-events: none;
	}
	.dice-gesture-message {
		bottom: 3rem;
		border-color: #c87965;
		background: rgba(48, 25, 24, 0.96);
	}
</style>
