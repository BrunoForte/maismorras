export type WorkspaceTab =
	'map' | 'sheets' | 'library' | 'compendium' | 'bestiary' | 'campaign' | 'overlay';

export type CampaignWorkspaceRole = 'gm' | 'player';

export type CampaignViewState = {
	tab: WorkspaceTab;
	activeSceneId: string | null;
	sheetOpen: boolean;
	standaloneSheet: boolean;
	editingCharacter: { id: string; ownerName: string } | null;
	participantsOpen: boolean;
	npcsOpen: boolean;
	sceneSettingsOpen: boolean;
	sceneCreatorOpen: boolean;
	sceneDraft: string;
	sceneRevision: number;
};

const GM_ONLY_TABS = new Set<WorkspaceTab>(['bestiary', 'campaign', 'overlay']);

export function canAccessWorkspaceTab(tab: WorkspaceTab, role: CampaignWorkspaceRole): boolean {
	return role === 'gm' || !GM_ONLY_TABS.has(tab);
}

export function createInitialCampaignViewState(): CampaignViewState {
	return {
		tab: 'map',
		activeSceneId: null,
		sheetOpen: false,
		standaloneSheet: false,
		editingCharacter: null,
		participantsOpen: false,
		npcsOpen: false,
		sceneSettingsOpen: false,
		sceneCreatorOpen: false,
		sceneDraft: '',
		sceneRevision: 0
	};
}
