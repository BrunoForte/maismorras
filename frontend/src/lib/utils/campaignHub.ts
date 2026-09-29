import type { CampaignSummary } from '$lib/services/campaignApi';

export type CampaignSystemFilter = 'all' | CampaignSummary['systemId'];

export function filterCampaigns(
	campaigns: readonly CampaignSummary[],
	nameFilter: string,
	systemFilter: CampaignSystemFilter
): CampaignSummary[] {
	const normalizedName = nameFilter.trim().toLowerCase();
	return campaigns.filter(
		(campaign) =>
			campaign.name.toLowerCase().includes(normalizedName) &&
			(systemFilter === 'all' || campaign.systemId === systemFilter)
	);
}
