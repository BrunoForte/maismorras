import { writable } from 'svelte/store';

export type RulerMode = 'line' | 'circle' | 'cone';
export const rulerMode = writable<RulerMode>('line');
