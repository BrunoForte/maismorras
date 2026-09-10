import { writable } from 'svelte/store';

export type DiceOverlayResult = { expression: string; total: number; dice: number[]; nonce?: string };
export const diceOverlay = writable<DiceOverlayResult | null>(null);
