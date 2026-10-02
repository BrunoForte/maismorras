import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';
import { ApiError } from './httpClient';
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
	vi.useRealTimers();
	srdTranslationQueue.set({
		campaignId: null,
		status: 'idle',
		retryable: true,
		total: 0,
		completed: 0,
		processed: 0,
		currentName: '',
		failedEntries: [],
		updatedEntry: null,
		error: ''
	});
});

describe('SRD translation queue', () => {
	it('defers a repeatedly failing gateway entry and continues the batch', async () => {
		vi.useFakeTimers();
		const calls: string[] = [];
		const task = startSrdTranslationQueue(
			'campaign-defer',
			[entry('spell-unstable'), entry('spell-next')],
			async (item) => {
				calls.push(item.id);
				if (item.id === 'spell-unstable')
					throw new ApiError(502, 'gateway temporarily unavailable');
				return { ...item, translations: { 'pt-BR': 'Mago' } };
			},
			(item) => item.name
		);
		await vi.advanceTimersByTimeAsync(2_400);
		await task;

		expect(calls).toEqual(['spell-unstable', 'spell-unstable', 'spell-unstable', 'spell-next']);
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'failed',
			completed: 1,
			processed: 2,
			failedEntries: ['spell-unstable']
		});
	});

	it('retries transient gateway errors and continues without duplicating completed entries', async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const task = startSrdTranslationQueue(
			'campaign-retry',
			[entry('spell-1')],
			async (item) => {
				attempts += 1;
				if (attempts === 1) throw new ApiError(502, 'gateway temporarily unavailable');
				return { ...item, translations: { 'pt-BR': 'Mago' } };
			},
			(item) => item.name
		);
		await vi.advanceTimersByTimeAsync(800);
		await task;
		expect(attempts).toBe(2);
		expect(get(srdTranslationQueue).status).toBe('completed');
		expect(get(srdTranslationQueue).completed).toBe(1);
		vi.useRealTimers();
	});

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

	it('does not retry a missing-provider configuration error', async () => {
		let attempts = 0;
		const err = new ApiError(503, 'A tradução por IA não está configurada.', {
			error: { code: 'TRANSLATION_NOT_CONFIGURED', message: 'safe message' }
		});
		await startSrdTranslationQueue(
			'campaign-config',
			[entry('spell-1')],
			async () => {
				attempts += 1;
				throw err;
			},
			(item) => item.name
		);
		expect(attempts).toBe(1);
		expect(get(srdTranslationQueue)).toMatchObject({ status: 'failed', processed: 1 });
	});

	it('does not retry quota exhaustion as a transient provider outage', async () => {
		let attempts = 0;
		await startSrdTranslationQueue(
			'campaign-quota',
			[entry('spell-1')],
			async () => {
				attempts += 1;
				throw new ApiError(503, 'Cota encerrada.', {
					error: { code: 'TRANSLATION_QUOTA_EXCEEDED', message: 'safe message' }
				});
			},
			(item) => item.name
		);
		expect(attempts).toBe(1);
		expect(get(srdTranslationQueue).failedEntries).toEqual(['spell-1']);
	});
});
