import { writable, type Writable } from 'svelte/store';

export type DiceOverlayResult = {
	expression: string;
	total: number;
	dice: number[];
	nonce?: string;
};
const state = writable<DiceOverlayResult | null>(null);
export const activeDiceRolls = writable<DiceOverlayResult[]>([]);
export const dice3dEnabled = writable(false);
export const diceBatchOpen = writable(false);
let current: DiceOverlayResult | null = null;
const pending: DiceOverlayResult[] = [];
let flushScheduled = false;
let batchDepth = 0;

export function restoreDicePreference() {
	if (typeof localStorage === 'undefined') return;
	dice3dEnabled.set(localStorage.getItem('maismorras:dice-renderer') === '3d');
}

export function setDice3dPreference(enabled: boolean) {
	dice3dEnabled.set(enabled);
	if (typeof localStorage !== 'undefined')
		localStorage.setItem('maismorras:dice-renderer', enabled ? '3d' : '2d');
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
			pending.push(value);
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
