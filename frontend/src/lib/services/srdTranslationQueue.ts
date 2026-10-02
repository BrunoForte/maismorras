import { writable } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';
import { ApiError, notifyUserRequestError } from './httpClient';
import { hasPendingCompendiumTranslation } from '$lib/utils/compendium/compendiumRules';

export type TranslationPauseReason = 'rate_limited' | 'quota' | 'configuration' | 'provider';

export type TranslationQueueState = {
	campaignId: string | null;
	status: 'idle' | 'running' | 'completed' | 'paused';
	pauseReason: TranslationPauseReason | null;
	total: number;
	completed: number;
	processed: number;
	currentName: string;
	failedEntries: string[];
	updatedEntry: CompendiumEntry | null;
	error: string;
};

const initialState: TranslationQueueState = {
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
};

export const srdTranslationQueue = writable<TranslationQueueState>(initialState);
let activeCampaignId: string | null = null;
let activeTask: Promise<void> | null = null;

const MAX_TRANSIENT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
const RETRYABLE_HTTP_STATUSES = new Set([0, 408, 429, 502, 503, 504]);
const DEFERRED_HTTP_STATUSES = new Set([0, 408, 502, 503, 504]);

function translationErrorCode(error: unknown): string {
	if (!(error instanceof ApiError) || typeof error.body !== 'object' || !error.body) return '';
	const outer = error.body as { error?: { code?: unknown } };
	return String(outer.error?.code ?? '');
}

function isNonRetryableTranslationSetupError(error: unknown): boolean {
	return ['TRANSLATION_NOT_CONFIGURED', 'TRANSLATION_QUOTA_EXCEEDED'].includes(
		translationErrorCode(error)
	);
}

function pauseReasonFor(error: unknown): TranslationPauseReason {
	const code = translationErrorCode(error);
	if (code === 'TRANSLATION_NOT_CONFIGURED') return 'configuration';
	if (code === 'TRANSLATION_QUOTA_EXCEEDED') return 'quota';
	if (error instanceof ApiError && error.status === 429) return 'rate_limited';
	return 'provider';
}

function isTransientTranslationError(error: unknown): boolean {
	if (isNonRetryableTranslationSetupError(error)) return false;
	if (error instanceof ApiError)
		return error.status === 0 || RETRYABLE_HTTP_STATUSES.has(error.status);
	return false;
}

function canDeferTranslationError(error: unknown): boolean {
	if (isNonRetryableTranslationSetupError(error)) return false;
	return (
		error instanceof ApiError && (error.status === 0 || DEFERRED_HTTP_STATUSES.has(error.status))
	);
}

function waitBeforeRetry(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function canResumeTranslationQueue(input: {
	isGM: boolean;
	locale: string;
	isRunning: boolean;
	pendingCount: number;
}): boolean {
	return input.isGM && input.locale === 'pt-BR' && !input.isRunning && input.pendingCount > 0;
}

/**
 * This queue deliberately lives outside CompendiumView. Navigating to another
 * workspace tab unmounts that component, but must not cancel a translation
 * batch whose completed entries are already persisted by the API.
 */
export function startSrdTranslationQueue(
	campaignId: string,
	entries: CompendiumEntry[],
	translateOne: (entry: CompendiumEntry) => Promise<CompendiumEntry>,
	getName: (entry: CompendiumEntry) => string
): Promise<void> {
	if (activeTask && activeCampaignId === campaignId) return activeTask;
	if (activeTask) return activeTask;
	const pendingEntries = Array.from(
		new Map(
			entries.filter(hasPendingCompendiumTranslation).map((entry) => [entry.id, entry] as const)
		).values()
	);
	if (pendingEntries.length === 0) {
		srdTranslationQueue.set({
			...initialState,
			campaignId,
			status: 'completed'
		});
		return Promise.resolve();
	}

	activeCampaignId = campaignId;
	srdTranslationQueue.set({
		campaignId,
		status: 'running',
		pauseReason: null,
		total: pendingEntries.length,
		completed: 0,
		processed: 0,
		currentName: '',
		failedEntries: [],
		updatedEntry: null,
		error: ''
	});

	activeTask = (async () => {
		let completed = 0;
		let processed = 0;
		let consecutiveDeferredFailures = 0;
		const failedEntries: string[] = [];
		for (const [entryIndex, entry] of pendingEntries.entries()) {
			srdTranslationQueue.update((state) => ({
				...state,
				currentName: getName(entry),
				updatedEntry: null
			}));
			try {
				let updatedEntry: CompendiumEntry | undefined;
				for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
					try {
						updatedEntry = await translateOne(entry);
						break;
					} catch (error) {
						if (error instanceof ApiError && error.status === 429) {
							const waitMs = error.retryAfterMs;
							if (
								attempt === 0 &&
								waitMs !== undefined &&
								waitMs > 0 &&
								waitMs <= MAX_RATE_LIMIT_WAIT_MS
							) {
								await waitBeforeRetry(waitMs);
								continue;
							}
							throw error;
						}
						if (attempt >= MAX_TRANSIENT_RETRIES || !isTransientTranslationError(error))
							throw error;
						await waitBeforeRetry(800 * 2 ** attempt);
					}
				}
				if (!updatedEntry) throw new Error('O serviço não retornou a entrada traduzida.');
				completed += 1;
				processed += 1;
				consecutiveDeferredFailures = 0;
				srdTranslationQueue.update((state) => ({
					...state,
					completed,
					processed,
					updatedEntry
				}));
			} catch (error) {
				const failureMessage =
					error instanceof Error ? error.message : 'Falha do provedor de tradução.';
				processed += 1;
				if (canDeferTranslationError(error)) {
					failedEntries.push(getName(entry));
					consecutiveDeferredFailures += 1;
					if (consecutiveDeferredFailures < 3) {
						srdTranslationQueue.update((state) => ({
							...state,
							processed,
							failedEntries
						}));
						continue;
					}
					failedEntries.push(...pendingEntries.slice(entryIndex + 1).map(getName));
				} else {
					failedEntries.push(getName(entry), ...pendingEntries.slice(entryIndex + 1).map(getName));
				}
				notifyUserRequestError(failureMessage);
				srdTranslationQueue.update((state) => ({
					...state,
					status: 'paused',
					pauseReason: pauseReasonFor(error),
					processed,
					failedEntries,
					error:
						error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
							? 'A requisição foi interrompida ou excedeu o tempo limite.'
							: error instanceof Error
								? error.message
								: 'Falha do provedor de tradução.'
				}));
				return;
			}
		}
		if (failedEntries.length) {
			const message =
				'Algumas entradas tiveram falha temporária do servidor e permanecem pendentes. Clique novamente para tentar apenas essas entradas.';
			notifyUserRequestError(message);
			srdTranslationQueue.update((state) => ({
				...state,
				status: 'paused',
				pauseReason: 'provider',
				processed,
				failedEntries,
				currentName: failedEntries[0],
				error: message,
				updatedEntry: null
			}));
		} else {
			srdTranslationQueue.update((state) => ({
				...state,
				status: 'completed',
				processed,
				currentName: '',
				failedEntries: [],
				updatedEntry: null
			}));
		}
	})().finally(() => {
		activeTask = null;
		activeCampaignId = null;
	});
	return activeTask;
}
