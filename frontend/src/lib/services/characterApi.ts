import type { Session } from '@supabase/supabase-js';

export type AbilityScores = {
	strength: number;
	dexterity: number;
	constitution: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
};
export type Attack = { name: string; attackBonus: number; damage: string; notes: string };
export type Spell = { name: string; level: number; notes: string };
export type CharacterSheet = {
	name: string;
	class: string;
	level: number;
	species: string;
	background: string;
	alignment: string;
	abilityScores: AbilityScores;
	proficiencyBonus: number;
	savingThrows: string[];
	skillProficiencies: string[];
	armorClass: number;
	speed: number;
	hitPointsCurrent: number;
	hitPointsMax: number;
	temporaryHP: number;
	hitDice: string;
	passivePerception: number;
	attacks: Attack[];
	spells: Spell[];
	features: string;
	equipment: string;
};
export type Character = { id: string; campaignId: string; ownerId: string; sheet: CharacterSheet };
export type Participant = {
	userId: string;
	displayName: string;
	role: 'gm' | 'player';
	character: Character | null;
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
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		const error = new Error(
			body?.error?.message ?? 'Não foi possível carregar a ficha.'
		) as Error & { status?: number };
		error.status = response.status;
		throw error;
	}
	return response.json() as Promise<T>;
}
export const getMyCharacter = (session: Session, campaignId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/character`);
export const saveMyCharacter = (session: Session, campaignId: string, sheet: CharacterSheet) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/character`, {
		method: 'PUT',
		body: JSON.stringify(sheet)
	});
export const listParticipants = (session: Session, campaignId: string) =>
	request<{ participants: Participant[] }>(session, `/api/v1/campaigns/${campaignId}/participants`);
export const getCharacterForGM = (session: Session, campaignId: string, characterId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`);
export const saveCharacterForGM = (
	session: Session,
	campaignId: string,
	characterId: string,
	sheet: CharacterSheet
) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`, {
		method: 'PUT',
		body: JSON.stringify(sheet)
	});

export function createEmptySheet(): CharacterSheet {
	return {
		name: '',
		class: '',
		level: 1,
		species: '',
		background: '',
		alignment: '',
		abilityScores: {
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10
		},
		proficiencyBonus: 2,
		savingThrows: [],
		skillProficiencies: [],
		armorClass: 10,
		speed: 9,
		hitPointsCurrent: 10,
		hitPointsMax: 10,
		temporaryHP: 0,
		hitDice: '1d8',
		passivePerception: 10,
		attacks: [],
		spells: [],
		features: '',
		equipment: ''
	};
}
