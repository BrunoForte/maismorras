import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';
import { ApiError } from './httpClient';
import {
	srdTranslationQueue,
	startSrdTranslationQueue,
	canResumeTranslationQueue,
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
		pauseReason: null,
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
			status: 'paused',
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
		const savedEntries: CompendiumEntry[] = [];
		const unsubscribe = srdTranslationQueue.subscribe((state) => {
			if (state.updatedEntry) savedEntries.push(state.updatedEntry);
		});
		await startSrdTranslationQueue(
			'campaign-1',
			[first, entry('spell-2')],
			async (item) => {
				if (item.id === 'spell-2') throw new Error('provider down');
				return { ...item, translations: { 'pt-BR': 'salvo' } };
			},
			(item) => item.name
		);
		unsubscribe();
		let snapshot!: TranslationQueueState;
		srdTranslationQueue.subscribe((state) => (snapshot = state))();
		expect(snapshot.status).toBe('paused');
		expect(snapshot.completed).toBe(1);
		expect(snapshot.error).toBe('provider down');
		expect(savedEntries).toHaveLength(1);
		expect(savedEntries[0].translations['pt-BR']).toBe('salvo');
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
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'configuration',
			processed: 1
		});
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
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'quota',
			failedEntries: ['spell-1']
		});
	});

	it('pauses on 429 without Retry-After and keeps manual resume available', async () => {
		let attempts = 0;
		await startSrdTranslationQueue(
			'campaign-429-manual',
			[entry('spell-1'), entry('spell-2')],
			async () => {
				attempts += 1;
				throw new ApiError(429, 'Aguarde antes de tentar novamente.');
			},
			(item) => item.name
		);

		expect(attempts).toBe(1);
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'rate_limited',
			failedEntries: ['spell-1', 'spell-2'],
			error: 'Aguarde antes de tentar novamente.'
		});
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'pt-BR', isRunning: false, pendingCount: 2 })
		).toBe(true);
	});

	it('honors Retry-After once before making another rate-limited request', async () => {
		vi.useFakeTimers();
		let attempts = 0;
		const task = startSrdTranslationQueue(
			'campaign-429-delay',
			[entry('spell-1')],
			async (item) => {
				attempts += 1;
				if (attempts <= 2) throw new ApiError(429, 'Rate limited.', null, 2_000);
				return { ...item, translations: { 'pt-BR': 'Tradução salva' } };
			},
			(item) => item.name
		);

		await vi.advanceTimersByTimeAsync(1_999);
		expect(attempts).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		await task;
		expect(attempts).toBe(2);
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'rate_limited'
		});
		await startSrdTranslationQueue(
			'campaign-429-delay',
			[entry('spell-1')],
			async (item) => {
				attempts += 1;
				return { ...item, translations: { 'pt-BR': 'Tradução salva' } };
			},
			(item) => item.name
		);
		expect(attempts).toBe(3);
		expect(get(srdTranslationQueue).status).toBe('completed');
	});

	it('does not retry automatically when Retry-After exceeds the bounded wait', async () => {
		let attempts = 0;
		await startSrdTranslationQueue(
			'campaign-429-long-delay',
			[entry('spell-1')],
			async () => {
				attempts += 1;
				throw new ApiError(429, 'Rate limited.', null, 60_000);
			},
			(item) => item.name
		);

		expect(attempts).toBe(1);
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'rate_limited'
		});
	});

	it('allows manual resume after quota renewal without retrying the failed request automatically', async () => {
		let attempts = 0;
		const completedItem = entry('spell-completed');
		const pendingItem = entry('spell-pending');
		let savedCompleted: CompendiumEntry | undefined;
		const translate = async (value: CompendiumEntry) => {
			attempts += 1;
			if (value.id === pendingItem.id && attempts === 2)
				throw new ApiError(503, 'Cota encerrada.', {
					error: { code: 'TRANSLATION_QUOTA_EXCEEDED', message: 'Cota encerrada.' }
				});
			const translated = { ...value, translations: { 'pt-BR': 'Tradução salva' } };
			if (value.id === completedItem.id) savedCompleted = translated;
			return translated;
		};

		await startSrdTranslationQueue(
			'campaign-quota-resume',
			[completedItem, pendingItem],
			translate,
			(value) => value.name
		);
		expect(attempts).toBe(2);
		expect(get(srdTranslationQueue)).toMatchObject({ status: 'paused', pauseReason: 'quota' });
		expect(savedCompleted?.translations['pt-BR']).toBe('Tradução salva');
		await startSrdTranslationQueue(
			'campaign-quota-resume',
			[savedCompleted!, pendingItem],
			translate,
			(value) => value.name
		);
		expect(attempts).toBe(3);
		expect(get(srdTranslationQueue).status).toBe('completed');
	});

	it('keeps a missing-configuration pause resumable without a request loop', async () => {
		let attempts = 0;
		const item = entry('spell-config');
		await startSrdTranslationQueue(
			'campaign-config-resume',
			[item],
			async () => {
				attempts += 1;
				throw new ApiError(503, 'Configuração ausente.', {
					error: { code: 'TRANSLATION_NOT_CONFIGURED', message: 'Configuração ausente.' }
				});
			},
			(value) => value.name
		);
		expect(attempts).toBe(1);
		expect(get(srdTranslationQueue)).toMatchObject({
			status: 'paused',
			pauseReason: 'configuration'
		});
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'pt-BR', isRunning: false, pendingCount: 1 })
		).toBe(true);
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'pt-BR', isRunning: true, pendingCount: 1 })
		).toBe(false);
		await startSrdTranslationQueue(
			'campaign-config-resume',
			[item],
			async (value) => ({
				...value,
				translations: { 'pt-BR': 'Tradução após corrigir configuração' }
			}),
			(value) => value.name
		);
		expect(get(srdTranslationQueue).status).toBe('completed');
	});

	it('only enables the queue action for a narrator with pending Portuguese entries', () => {
		expect(
			canResumeTranslationQueue({ isGM: false, locale: 'pt-BR', isRunning: false, pendingCount: 1 })
		).toBe(false);
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'en', isRunning: false, pendingCount: 1 })
		).toBe(false);
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'pt-BR', isRunning: true, pendingCount: 1 })
		).toBe(false);
		expect(
			canResumeTranslationQueue({ isGM: true, locale: 'pt-BR', isRunning: false, pendingCount: 0 })
		).toBe(false);
	});

	it('does not call already completed entries again when resuming a batch', async () => {
		const alreadySaved = { ...entry('spell-done'), translations: { 'pt-BR': 'Salva' } };
		const pending = entry('spell-pending');
		const calls: string[] = [];
		let pendingAttempts = 0;
		const translate = async (item: CompendiumEntry) => {
			calls.push(item.id);
			if (item.id === pending.id && pendingAttempts++ === 0)
				throw new ApiError(429, 'Rate limited.');
			return { ...item, translations: { 'pt-BR': 'Salva agora' } };
		};

		await startSrdTranslationQueue(
			'campaign-resume-pending',
			[alreadySaved, pending],
			translate,
			(item) => item.name
		);
		expect(get(srdTranslationQueue).status).toBe('paused');
		await startSrdTranslationQueue(
			'campaign-resume-pending',
			[alreadySaved, pending],
			translate,
			(item) => item.name
		);
		expect(calls).toEqual(['spell-pending', 'spell-pending']);
		expect(get(srdTranslationQueue)).toMatchObject({ status: 'completed', total: 1, completed: 1 });
	});
});
