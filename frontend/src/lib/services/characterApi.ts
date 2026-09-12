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
export type CharacterResource = {
	id: string;
	name: string;
	current: number;
	max: number;
	restoreOn: 'short' | 'long';
};
export type SpellSlot = { level: number; current: number; max: number };
export type InventoryItem = {
	entryId: string;
	name: string;
	quantity: number;
	equipped: boolean;
	rules: Record<string, unknown>;
};
export type CharacterSheet = {
	name: string;
	portraitPath: string;
	class: string;
	subclass: string;
	level: number;
	species: string;
	speciesLineage: string;
	background: string;
	alignment: string;
	abilityScores: AbilityScores;
	proficiencyBonus: number;
	savingThrows: string[];
	skillProficiencies: string[];
	skillExpertise: string[];
	armorClass: number;
	speed: number;
	hitPointsCurrent: number;
	hitPointsMax: number;
	temporaryHP: number;
	hitDice: string;
	hitDiceSpent: number;
	passivePerception: number;
	attacks: Attack[];
	spells: Spell[];
	features: string;
	feats: string;
	equipment: string;
	inventory: InventoryItem[];
	resources: CharacterResource[];
	spellSlots: SpellSlot[];
	visibleRolls?: string[];
	resistances?: string[];
	automaticTraits?: string[];
	speciesHPBonusApplied?: number;
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
// Fichas criadas antes do inventário estruturado possuem arrays serializados
// como null. Normalizar na borda mantém os dados antigos compatíveis.
function normalizeCharacter(character: Character): Character {
	character.sheet = {
		...character.sheet,
		attacks: character.sheet.attacks ?? [],
		spells: character.sheet.spells ?? [],
		inventory: character.sheet.inventory ?? [],
		savingThrows: character.sheet.savingThrows ?? [],
		skillProficiencies: character.sheet.skillProficiencies ?? [],
		skillExpertise: character.sheet.skillExpertise ?? [],
		speciesLineage: character.sheet.speciesLineage ?? '',
		feats: character.sheet.feats ?? '',
		portraitPath: character.sheet.portraitPath ?? '',
		resources: character.sheet.resources ?? [],
		spellSlots: character.sheet.spellSlots ?? [],
		hitDiceSpent: character.sheet.hitDiceSpent ?? 0,
		visibleRolls: character.sheet.visibleRolls ?? [],
		resistances: character.sheet.resistances ?? [],
		automaticTraits: character.sheet.automaticTraits ?? [],
		speciesHPBonusApplied: character.sheet.speciesHPBonusApplied ?? 0
	};
	return character;
}
export const getMyCharacter = (session: Session, campaignId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/character`).then(normalizeCharacter);
export const saveMyCharacter = (session: Session, campaignId: string, sheet: CharacterSheet) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/character`, {
		method: 'PUT',
		body: JSON.stringify(sheet)
	}).then(normalizeCharacter);
export const listParticipants = (session: Session, campaignId: string) =>
	request<{ participants: Participant[] }>(session, `/api/v1/campaigns/${campaignId}/participants`);
export const getCharacterForGM = (session: Session, campaignId: string, characterId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`).then(
		normalizeCharacter
	);
export const saveCharacterForGM = (
	session: Session,
	campaignId: string,
	characterId: string,
	sheet: CharacterSheet
) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`, {
		method: 'PUT',
		body: JSON.stringify(sheet)
	}).then(normalizeCharacter);
export const createCharacterForGM = (session: Session, campaignId: string, ownerId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters`, {
		method: 'POST',
		body: JSON.stringify({ ownerId })
	}).then(normalizeCharacter);
export const deleteCharacterForGM = (session: Session, campaignId: string, characterId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`, {
		method: 'DELETE'
	});

export function createEmptySheet(): CharacterSheet {
	return {
		name: '',
		portraitPath: '',
		class: '',
		subclass: '',
		level: 1,
		species: '',
		speciesLineage: '',
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
		skillExpertise: [],
		armorClass: 10,
		speed: 9,
		hitPointsCurrent: 10,
		hitPointsMax: 10,
		temporaryHP: 0,
		hitDice: '1d8',
		hitDiceSpent: 0,
		passivePerception: 10,
		attacks: [],
		spells: [],
		features: '',
		feats: '',
		equipment: '',
		inventory: [],
		resources: [],
		spellSlots: [],
		visibleRolls: [],
		resistances: [],
		automaticTraits: [],
		speciesHPBonusApplied: 0
	};
}
