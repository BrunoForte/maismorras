import { resizablePanelPreference } from './resizablePanel';

const legacyPanelKey = 'campaign-chat';
const panelKeyPrefix = 'campaign-chat:';
const modeStoragePrefix = 'maismorras:campaign-chat-mode:';

/** One canonical per-campaign key is shared by chat movement and resize persistence. */
export function campaignChatPanelKey(campaignId: string): string {
	return `${panelKeyPrefix}${campaignId}`;
}

export function campaignChatModeStorageKey(campaignId: string): string {
	return `${modeStoragePrefix}${campaignId}`;
}

/** Campaign settings always win; the old global collapsed state is a read-only fallback. */
export function resolveCampaignChatCollapsed(
	campaignPreference: boolean | null | undefined,
	legacyPreference: boolean | null | undefined
): boolean {
	return campaignPreference ?? legacyPreference ?? false;
}

export function campaignChatStartsOpen(campaignId: string): boolean {
	const campaignPreference = resizablePanelPreference(campaignChatPanelKey(campaignId));
	const legacyPreference = resizablePanelPreference(legacyPanelKey);
	return !resolveCampaignChatCollapsed(campaignPreference?.collapsed, legacyPreference?.collapsed);
}

export function campaignChatStartsDocked(campaignId: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(campaignChatModeStorageKey(campaignId)) === 'docked';
	} catch {
		return false;
	}
}

export function saveCampaignChatDocked(campaignId: string, docked: boolean): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(campaignChatModeStorageKey(campaignId), docked ? 'docked' : 'floating');
	} catch {
		// The current component state remains usable when browser storage is unavailable.
	}
}
