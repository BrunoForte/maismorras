import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

const base = apiBase;
async function request(session: Session, path: string, init: RequestInit = {}) {
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error?.message ?? 'Não foi possível alterar a campanha.');
	}
}
export const removeCampaignMember = (session: Session, campaignId: string, userId: string) =>
	request(session, `/api/v1/campaigns/${campaignId}/members/${userId}`, { method: 'DELETE' });
