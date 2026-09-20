import { describe, expect, it } from 'vitest';
import { defaultCampaignTheme, normalizeCampaignTheme, campaignThemeStyle } from './schemas';

describe('customization schemas', () => {
	it('keeps the current theme as the safe default', () => {
		expect(normalizeCampaignTheme(null)).toEqual(defaultCampaignTheme);
	});

	it('rejects unsafe theme values', () => {
		const theme = normalizeCampaignTheme({
			primary: 'url(javascript:alert(1))',
			panelStyle: 'unknown'
		});
		expect(theme.primary).toBe(defaultCampaignTheme.primary);
		expect(theme.panelStyle).toBe('classic');
	});

	it('serializes only validated CSS variables', () => {
		expect(campaignThemeStyle(defaultCampaignTheme)).toContain('--campaign-primary:#8b5cf6');
	});
});
