import { writable } from 'svelte/store';
import type { CompendiumEntry } from './compendiumApi';

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
				const updatedEntry = await translateOne(entry);
				completed += 1;
				srdTranslationQueue.update((state) => ({
					...state,
					completed,
					updatedEntry
				}));
			} catch (error) {
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
