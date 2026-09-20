import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';

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
		abilities: {
			strength: number;
			dexterity: number;
			constitution: number;
			intelligence: number;
			wisdom: number;
			charisma: number;
		};
		traits: { name: string; description: string }[];
		actions: {
			name: string;
			kind: 'action' | 'bonus' | 'reaction';
			toHit: number;
			range: string;
			damage: string;
			saveDC: number;
			description: string;
		}[];
		resistances: string[];
		immunities: string[];
		senses: string;
		languages: string;
	};
};

async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
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
export const updateNPC = (
	session: Session,
	campaignId: string,
	npcId: string,
	input: Omit<NPC, 'id' | 'campaignId'>
) =>
	request<NPC>(session, `/api/v1/campaigns/${campaignId}/npcs/${npcId}`, {
		method: 'PUT',
		body: JSON.stringify(input)
	});
export const deleteNPC = (session: Session, campaignId: string, npcId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}/npcs/${npcId}`, { method: 'DELETE' });
