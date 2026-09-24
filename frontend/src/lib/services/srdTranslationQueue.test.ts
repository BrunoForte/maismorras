import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';
import {
	srdTranslationQueue,
	startSrdTranslationQueue,
	type TranslationQueueState
} from './srdTranslationQueue';

const entry = (id: string): CompendiumEntry => ({
	id,
	sourceId: 'srd',
	entryType: 'spell',
	name: id,
	summary: '',
	rules: {},
	translations: {},
	isPublished: true
});

afterEach(() => {
	srdTranslationQueue.set({
		campaignId: null,
		status: 'idle',
		total: 0,
		completed: 0,
		currentName: '',
		updatedEntry: null,
		error: ''
	});
});

describe('SRD translation queue', () => {
	it('continues sequentially in the module queue and publishes each persisted result', async () => {
		const calls: string[] = [];
		const updates: string[] = [];
		const unsubscribe = srdTranslationQueue.subscribe((state) => {
			if (state.updatedEntry) updates.push(state.updatedEntry.id);
		});
		await startSrdTranslationQueue(
			'campaign-1',
			[entry('spell-1'), entry('spell-2')],
			async (item) => {
				calls.push(item.id);
				return { ...item, translations: { 'pt-BR': item.id } };
			},
			(item) => item.name
		);
		unsubscribe();
		expect(calls).toEqual(['spell-1', 'spell-2']);
		expect(updates).toEqual(['spell-1', 'spell-2']);
		expect(get(srdTranslationQueue).status).toBe('completed');
	});

	it('pauses after a failed entry without discarding completed entries', async () => {
		const first = entry('spell-1');
		await startSrdTranslationQueue(
			'campaign-1',
			[first, entry('spell-2')],
			async (item) => {
				if (item.id === 'spell-2') throw new Error('provider down');
				return { ...item, translations: { 'pt-BR': 'salvo' } };
			},
			(item) => item.name
		);
		let snapshot!: TranslationQueueState;
		const unsubscribe = srdTranslationQueue.subscribe((state) => (snapshot = state));
		unsubscribe();
		expect(snapshot.status).toBe('failed');
		expect(snapshot.completed).toBe(1);
		expect(snapshot.error).toBe('provider down');
	});
});
