import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';

export type CampaignSummary = {
	id: string;
	name: string;
	role: 'gm' | 'player';
	systemId: 'dnd2024';
	isAdmin?: boolean;
};

type CampaignDto = Partial<CampaignSummary> & {
	ID?: string;
	Name?: string;
	Role?: 'gm' | 'player';
	SystemID?: 'dnd2024';
	system_id?: 'dnd2024';
	is_admin?: boolean;
};

function normalizeCampaign(value: CampaignDto): CampaignSummary {
	return {
		id: value.id ?? value.ID ?? '',
		name: value.name ?? value.Name ?? '',
		role: value.role ?? value.Role ?? 'player',
		systemId: value.systemId ?? value.system_id ?? value.SystemID ?? 'dnd2024',
		isAdmin: value.isAdmin ?? value.is_admin ?? false
	};
}

async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}

export async function listCampaigns(session: Session): Promise<CampaignSummary[]> {
	const response = await request<{ campaigns?: CampaignDto[] }>(session, '/api/v1/campaigns');
	return (response.campaigns ?? []).map(normalizeCampaign);
}

export async function createCampaign(
	session: Session,
	input: { name: string; systemId: 'dnd2024' }
): Promise<CampaignSummary> {
	const created = await request<CampaignDto>(session, '/api/v1/campaigns', {
		method: 'POST',
		body: JSON.stringify(input)
	});
	return normalizeCampaign(created);
}

export async function acceptCampaignInvite(
	session: Session,
	code: string
): Promise<CampaignSummary> {
	const campaign = await request<CampaignDto>(session, `/api/v1/invites/${code}/accept`, {
		method: 'POST'
	});
	return normalizeCampaign(campaign);
}

export async function createCampaignInvite(session: Session, campaignId: string): Promise<string> {
	const response = await request<{ code: string }>(
		session,
		`/api/v1/campaigns/${campaignId}/invites`,
		{
			method: 'POST'
		}
	);
	return response.code;
}

export async function renameCampaign(
	session: Session,
	campaign: CampaignSummary,
	name: string
): Promise<CampaignSummary> {
	const updated = await request<CampaignDto>(session, `/api/v1/campaigns/${campaign.id}`, {
		method: 'PATCH',
		body: JSON.stringify({ name })
	});
	return { ...campaign, name: updated.name ?? updated.Name ?? name };
}

export const deleteCampaign = (session: Session, campaignId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}`, { method: 'DELETE' });

export const removeCampaignMember = (session: Session, campaignId: string, userId: string) =>
	request(session, `/api/v1/campaigns/${campaignId}/members/${userId}`, { method: 'DELETE' });
