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
		creatureType: string;
		challenge: string;
		speed: string;
		abilities: { strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number };
		traits: { name: string; description: string }[];
		actions: { name: string; kind: 'action' | 'bonus' | 'reaction'; toHit: number; range: string; damage: string; saveDC: number; description: string }[];
		resistances: string[];
		immunities: string[];
		senses: string;
		languages: string;
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
export const updateNPC = (session: Session, campaignId: string, npcId: string, input: Omit<NPC, 'id' | 'campaignId'>) =>
	request<NPC>(session, `/api/v1/campaigns/${campaignId}/npcs/${npcId}`, { method: 'PUT', body: JSON.stringify(input) });
export const deleteNPC = (session: Session, campaignId: string, npcId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}/npcs/${npcId}`, { method: 'DELETE' });
