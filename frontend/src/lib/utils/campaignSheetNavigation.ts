export type CampaignWorkspaceTab =
	'map' | 'sheets' | 'library' | 'compendium' | 'bestiary' | 'overlay' | 'campaign';

export function resolveCampaignSheetSelection(
	selectedCharacterId: string | null,
	availableCharacterIds: readonly string[]
): string | null {
	return selectedCharacterId && availableCharacterIds.includes(selectedCharacterId)
		? selectedCharacterId
		: null;
}

export function campaignSheetSelectionAfterTabChange<T>(
	selection: T | null,
	role: 'gm' | 'player',
	currentTab: CampaignWorkspaceTab,
	nextTab: CampaignWorkspaceTab
): T | null {
	if (role === 'gm' && currentTab !== nextTab && (currentTab === 'sheets' || nextTab === 'sheets'))
		return null;
	return selection;
}
