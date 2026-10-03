import { describe, expect, it } from 'vitest';
import {
	campaignChatModeStorageKey,
	campaignChatPanelKey,
	resolveCampaignChatCollapsed
} from './campaignChatPreferences';

describe('campaign chat preferences', () => {
	it('generates stable, campaign-scoped keys for shared panel geometry and mode', () => {
		expect(campaignChatPanelKey('campaign-a')).toBe('campaign-chat:campaign-a');
		expect(campaignChatModeStorageKey('campaign-a')).toBe(
			'maismorras:campaign-chat-mode:campaign-a'
		);
		expect(campaignChatPanelKey('campaign-a')).not.toBe(campaignChatPanelKey('campaign-b'));
	});

	it('prefers a campaign collapse setting over the legacy global setting', () => {
		expect(resolveCampaignChatCollapsed(false, true)).toBe(false);
		expect(resolveCampaignChatCollapsed(true, false)).toBe(true);
	});

	it('uses the legacy global collapse setting only when the campaign has no setting', () => {
		expect(resolveCampaignChatCollapsed(undefined, true)).toBe(true);
		expect(resolveCampaignChatCollapsed(null, false)).toBe(false);
		expect(resolveCampaignChatCollapsed(undefined, undefined)).toBe(false);
	});
});
