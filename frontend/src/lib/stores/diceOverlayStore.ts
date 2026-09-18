import { derived, get, writable, type Writable } from 'svelte/store';

export type DiceRendererMode = 'auto' | '2d' | '3d-overlay' | '3d-table';
export type EffectiveDiceRenderer = Exclude<DiceRendererMode, 'auto'>;

export type DiceOverlayResult = {
	expression: string;
	total: number;
	dice: number[];
	nonce?: string;
	color?: string;
	slot?: string;
};
const state = writable<DiceOverlayResult | null>(null);
export const activeDiceRolls = writable<DiceOverlayResult[]>([]);
export const diceRendererMode = writable<DiceRendererMode>('auto');
export const diceRendererEffective = writable<EffectiveDiceRenderer>('2d');
export const dice3dEnabled = derived(diceRendererEffective, (mode) => mode !== '2d');
export const diceColor = writable<string | undefined>(undefined);
export const diceBatchOpen = writable(false);
let current: DiceOverlayResult | null = null;
const pending: DiceOverlayResult[] = [];
let flushScheduled = false;
let batchDepth = 0;
let rollSequence = 0;

function withNonce(value: DiceOverlayResult): DiceOverlayResult {
	if (value.nonce && value.color) return value;
	const nonce =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `roll-${Date.now()}-${rollSequence++}`;
	return {
		...value,
		nonce: value.nonce ?? nonce,
		color: value.color ?? get(diceColor),
		slot: value.slot ?? value.expression
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
	if (saved === 'auto' || saved === '2d' || saved === '3d-overlay' || saved === '3d-table') {
		setDiceRendererMode(saved);
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
	applyRendererMode(mode);
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('maismorras:dice-renderer-mode', mode);
		localStorage.removeItem('maismorras:dice-renderer');
	}
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
	const batch = pending.splice(0, 4);
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
		state.set(null);
		schedulePromotion();
	},
	update(updater) {
		diceOverlay.set(updater(current));
	}
};
