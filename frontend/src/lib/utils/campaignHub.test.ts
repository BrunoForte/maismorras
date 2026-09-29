import { describe, expect, it } from 'vitest';
import { filterCampaigns, type CampaignSystemFilter } from './campaignHub';

const campaigns = [
	{ id: 'gm-table', name: 'Crônicas da Lua', role: 'gm', systemId: 'dnd2024' },
	{ id: 'player-table', name: 'Sombras do Porto', role: 'player', systemId: 'dnd2024' }
] as const;

describe('filterCampaigns', () => {
	it('matches names without case or surrounding-space sensitivity', () => {
		expect(filterCampaigns(campaigns, '  LUA ', 'all').map(({ id }) => id)).toEqual(['gm-table']);
	});

	it('keeps all campaigns when both filters are empty or unrestricted', () => {
		expect(filterCampaigns(campaigns, '', 'all')).toEqual(campaigns);
	});

	it('combines the name and system filters', () => {
		const systemFilter: CampaignSystemFilter = 'dnd2024';
		expect(filterCampaigns(campaigns, 'porto', systemFilter).map(({ id }) => id)).toEqual([
			'player-table'
		]);
	});
});
