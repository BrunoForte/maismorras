import { writable } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';
import { ApiError, notifyUserRequestError } from './httpClient';

export type TranslationQueueState = {
	campaignId: string | null;
	status: 'idle' | 'running' | 'completed' | 'failed';
	total: number;
	completed: number;
	currentName: string;
	updatedEntry: CompendiumEntry | null;
	error: string;
};

const initialState: TranslationQueueState = {
	campaignId: null,
	status: 'idle',
	total: 0,
	completed: 0,
	currentName: '',
	updatedEntry: null,
	error: ''
};

export const srdTranslationQueue = writable<TranslationQueueState>(initialState);
let activeCampaignId: string | null = null;
let activeTask: Promise<void> | null = null;

const MAX_TRANSIENT_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function isTransientTranslationError(error: unknown): boolean {
	if (error instanceof ApiError)
		return error.status === 0 || RETRYABLE_HTTP_STATUSES.has(error.status);
	return false;
}

function waitBeforeRetry(attempt: number): Promise<void> {
	const delayMs = 800 * 2 ** (attempt - 1);
	return new Promise((resolve) => setTimeout(resolve, delayMs));
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

	activeCampaignId = campaignId;
	srdTranslationQueue.set({
		campaignId,
		status: 'running',
		total: entries.length,
		completed: 0,
		currentName: '',
		updatedEntry: null,
		error: ''
	});

	activeTask = (async () => {
		let completed = 0;
		for (const entry of entries) {
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
						if (attempt >= MAX_TRANSIENT_RETRIES || !isTransientTranslationError(error))
							throw error;
						await waitBeforeRetry(attempt + 1);
					}
				}
				if (!updatedEntry) throw new Error('O serviço não retornou a entrada traduzida.');
				completed += 1;
				srdTranslationQueue.update((state) => ({
					...state,
					completed,
					updatedEntry
				}));
			} catch (error) {
				const failureMessage =
					error instanceof Error ? error.message : 'Falha do provedor de tradução.';
				notifyUserRequestError(failureMessage);
				srdTranslationQueue.update((state) => ({
					...state,
					status: 'failed',
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
		srdTranslationQueue.update((state) => ({
			...state,
			status: 'completed',
			currentName: '',
			updatedEntry: null
		}));
	})().finally(() => {
		activeTask = null;
		activeCampaignId = null;
	});
	return activeTask;
}
