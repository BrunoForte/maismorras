import { describe, expect, it } from 'vitest';
import {
	canAccessWorkspaceTab,
	createInitialCampaignViewState,
	type WorkspaceTab
} from './campaignWorkspaceState';

describe('campaign workspace state', () => {
	it('allows players shared tabs but not GM-only panels', () => {
		const sharedTabs: WorkspaceTab[] = ['map', 'sheets', 'library', 'compendium'];
		const gmTabs: WorkspaceTab[] = ['bestiary', 'campaign', 'overlay'];

		for (const tab of sharedTabs) expect(canAccessWorkspaceTab(tab, 'player')).toBe(true);
		for (const tab of gmTabs) expect(canAccessWorkspaceTab(tab, 'player')).toBe(false);
		for (const tab of [...sharedTabs, ...gmTabs])
			expect(canAccessWorkspaceTab(tab, 'gm')).toBe(true);
	});

	it('starts every campaign with a clean scene, tab, modal, and editor selection', () => {
		expect(createInitialCampaignViewState()).toEqual({
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
		});
	});
});
