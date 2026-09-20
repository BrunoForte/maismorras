import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';

async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}
export const removeCampaignMember = (session: Session, campaignId: string, userId: string) =>
	request(session, `/api/v1/campaigns/${campaignId}/members/${userId}`, { method: 'DELETE' });
