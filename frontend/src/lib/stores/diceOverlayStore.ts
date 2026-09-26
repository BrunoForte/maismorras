import { derived, get, writable, type Writable } from 'svelte/store';

export type DiceRendererMode = 'auto' | '2d' | '3d-overlay';
export type EffectiveDiceRenderer = Exclude<DiceRendererMode, 'auto'>;

export type DiceOverlayResult = {
	expression: string;
	/** DiceBox notation; expression remains the human-facing label. */
	notation?: string;
	total: number;
	dice: number[];
	nonce?: string;
	color?: string;
	slot?: string;
};
const state = writable<DiceOverlayResult | null>(null);
export const activeDiceRolls = writable<DiceOverlayResult[]>([]);
export const completedDiceRollNonces = writable<string[]>([]);
export const diceRendererMode = writable<DiceRendererMode>('auto');
export const diceRendererEffective = writable<EffectiveDiceRenderer>('2d');
export const diceRendererError = writable('');
export const dice3dEnabled = derived(diceRendererEffective, (mode) => mode !== '2d');
export const diceColor = writable<string | undefined>(undefined);
export const diceBatchOpen = writable(false);
let current: DiceOverlayResult | null = null;
const pending: DiceOverlayResult[] = [];
let flushScheduled = false;
let batchDepth = 0;
let rollSequence = 0;

export function diceResultDisplayDuration(rollCount: number) {
	const count = Math.min(10, Math.max(1, Math.floor(rollCount)));
	return 5000 + (count - 1) * 1000;
}

function withNonce(value: DiceOverlayResult): DiceOverlayResult {
	const nonce =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `roll-${Date.now()}-${rollSequence++}`;
	const color = value.color ?? get(diceColor);
	return {
		...value,
		nonce: value.nonce ?? nonce,
		color,
		slot: value.slot ?? `${color ?? 'default'}:${value.notation ?? value.expression}`
	};
}

export function setDiceColor(value: number | string | null | undefined) {
	if (value === null || value === undefined || value === '') {
		diceColor.set(undefined);
		return;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		diceColor.set(`#${Math.max(0, Math.round(value)).toString(16).padStart(6, '0').slice(-6)}`);
		return;
	}
	const text = String(value).trim();
	diceColor.set(text.startsWith('#') ? text : `#${text}`);
}

export function restoreDicePreference() {
	if (typeof localStorage === 'undefined') return;
	const saved = localStorage.getItem('maismorras:dice-renderer-mode');
	if (saved === 'auto' || saved === '2d' || saved === '3d-overlay') {
		setDiceRendererMode(saved);
		return;
	}
	if (saved === '3d-table') {
		setDiceRendererMode('3d-overlay');
		return;
	}
	// Compatibilidade com a preferência binária usada nas versões anteriores.
	const legacy = localStorage.getItem('maismorras:dice-renderer');
	setDiceRendererMode(legacy === '3d' ? '3d-overlay' : 'auto');
}

function canUseWebGL() {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
	const device = navigator as Navigator & {
		connection?: { saveData?: boolean };
		deviceMemory?: number;
	};
	if (device.connection?.saveData) return false;
	if (
		(device.deviceMemory !== undefined && device.deviceMemory <= 1) ||
		navigator.hardwareConcurrency <= 2
	)
		return false;
	try {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
	} catch {
		return false;
	}
}

function detectAutomaticMode(): EffectiveDiceRenderer {
	return canUseWebGL() ? '3d-overlay' : '2d';
}

function applyRendererMode(mode: DiceRendererMode) {
	diceRendererEffective.set(mode === 'auto' ? detectAutomaticMode() : mode);
}

export function setDiceRendererMode(mode: DiceRendererMode) {
	diceRendererMode.set(mode);
	diceRendererError.set('');
	applyRendererMode(mode);
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('maismorras:dice-renderer-mode', mode);
		localStorage.removeItem('maismorras:dice-renderer');
	}
}

export function reportDiceRendererFailure() {
	diceRendererError.set(
		'Não foi possível iniciar os dados 3D neste navegador. A rolagem continuará no modo 2D; confira o suporte a WebGL e tente novamente.'
	);
	diceRendererEffective.set('2d');
}

export function reportDiceAnimationComplete(nonces: string[]) {
	if (!nonces.length) return;
	completedDiceRollNonces.update((completed) => {
		const next = [...new Set([...completed, ...nonces])].slice(-32);
		return next.length === completed.length &&
			next.every((nonce, index) => nonce === completed[index])
			? completed
			: next;
	});
}

export function setDice3dPreference(enabled: boolean) {
	setDiceRendererMode(enabled ? '3d-overlay' : '2d');
}

export function beginDiceBatch() {
	batchDepth += 1;
	diceBatchOpen.set(true);
}

export function finishDiceBatch() {
	batchDepth = Math.max(0, batchDepth - 1);
	if (batchDepth === 0) {
		diceBatchOpen.set(false);
		schedulePromotion();
	}
}

function promoteBatch() {
	if (current || pending.length === 0) return;
	// Display concurrent rolls in rows of four (4 + 4 + 2 at the ten-roll cap).
	const batch = pending.splice(0, 10);
	current = batch[0] ?? null;
	activeDiceRolls.set(batch);
	state.set(current);
}

function schedulePromotion() {
	if (batchDepth > 0) return;
	if (flushScheduled) return;
	flushScheduled = true;
	queueMicrotask(() => {
		flushScheduled = false;
		promoteBatch();
	});
}

// A roll can produce multiple events in the same turn (attack + damage), and
// different players can roll at once. Keep them FIFO so no animation is lost.
export const diceOverlay: Writable<DiceOverlayResult | null> = {
	subscribe: state.subscribe,
	set(value) {
		if (value) {
			pending.push(withNonce(value));
			schedulePromotion();
			return;
		}
		current = null;
		activeDiceRolls.set([]);
		completedDiceRollNonces.set([]);
		state.set(null);
		schedulePromotion();
	},
	update(updater) {
		diceOverlay.set(updater(current));
	}
};
