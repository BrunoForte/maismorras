import type { Session } from '@supabase/supabase-js';

export type NPC = {
	id: string;
	campaignId: string;
	name: string;
	sheet: {
		hitPointsCurrent: number;
		hitPointsMax: number;
		armorClass: number;
		initiative: number;
		size: number;
		color: number;
		imageUrl: string;
	};
};

const base = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});
	if (!response.ok)
		throw new Error((await response.json()).error?.message ?? 'Não foi possível operar o NPC.');
	return response.json() as Promise<T>;
}
export const listNPCs = (session: Session, campaignId: string) =>
	request<{ npcs: NPC[] }>(session, `/api/v1/campaigns/${campaignId}/npcs`);
export const createNPC = (
	session: Session,
	campaignId: string,
	input: Omit<NPC, 'id' | 'campaignId'>
) =>
	request<NPC>(session, `/api/v1/campaigns/${campaignId}/npcs`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
