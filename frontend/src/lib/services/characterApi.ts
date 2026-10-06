import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';
import { EMPTY_DND2024_MONEY, normalizeDnd2024Money } from '$lib/utils/character/dnd2024Money';
import type { Dnd2024Money } from '$lib/utils/character/dnd2024Money';

export type { Dnd2024Money } from '$lib/utils/character/dnd2024Money';

export type AbilityScores = {
	strength: number;
	dexterity: number;
	constitution: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
};
export type Attack = {
	name: string;
	attackBonus: number;
	damage: string;
	notes: string;
	attackType?: 'melee' | 'ranged';
	ability?: keyof AbilityScores;
};
export type Spell = {
	entryId?: string;
	name: string;
	level: number;
	notes: string;
	description?: string;
	diceFormula?: string;
	higherLevels?: string;
	scalingDicePerLevel?: number;
	origin?: 'class' | 'species' | 'feat';
};
export type CharacterResource = {
	id: string;
	name: string;
	current: number;
	max: number;
	/** Optional user override; absent values follow the class/level progression. */
	maxOverride?: number;
	/** Number of expended uses recovered after a short rest. */
	shortRestRecovery?: number;
	restoreOn: 'short' | 'long';
};
export type SpellSlot = { level: number; current: number; max: number };
/** A reviewed D&D 2024 feat-to-spell selection. Uses are reported by the server. */
export type Dnd2024FeatSpellGrant = {
	id: string;
	featId: string;
	spellList: string;
	ability: 'intelligence' | 'wisdom' | 'charisma';
	cantripEntryIds: string[];
	firstLevelSpellEntryId: string;
	freeCastsRemaining: number;
	active?: boolean;
};
export type CampaignFeatSpellGrant = {
	id: string;
	featEntryId: string;
	spellcastingAbilities: Record<string, 'intelligence' | 'wisdom' | 'charisma'>;
	freeCastsRemaining: Record<string, number>;
	active?: boolean;
};
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
	tokenPortraitPath?: string;
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
	initiative: number;
	initiativeAdvantage?: boolean;
	speed: number;
	hitPointsCurrent: number;
	hitPointsMax: number;
	temporaryHP: number;
	hitDice: string;
	hitDiceSpent: number;
	passivePerception: number;
	attacks: Attack[];
	spells: Spell[];
	spellcastingOverride?: boolean;
	features: string;
	feats: string;
	equipment: string;
	inventory: InventoryItem[];
	resources: CharacterResource[];
	spellSlots: SpellSlot[];
	money?: Dnd2024Money;
	featSpellGrants?: Dnd2024FeatSpellGrant[];
	campaignFeatSpellGrants?: CampaignFeatSpellGrant[];
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

async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}
// Fichas criadas antes do inventário estruturado possuem arrays serializados
// como null. Normalizar na borda mantém os dados antigos compatíveis.
function normalizeCharacter(character: Character): Character {
	character.sheet = {
		...character.sheet,
		attacks: character.sheet.attacks ?? [],
		spells: character.sheet.spells ?? [],
		spellcastingOverride: character.sheet.spellcastingOverride ?? false,
		inventory: character.sheet.inventory ?? [],
		savingThrows: character.sheet.savingThrows ?? [],
		skillProficiencies: character.sheet.skillProficiencies ?? [],
		skillExpertise: character.sheet.skillExpertise ?? [],
		speciesLineage: character.sheet.speciesLineage ?? '',
		feats: character.sheet.feats ?? '',
		portraitPath: character.sheet.portraitPath ?? '',
		resources: character.sheet.resources ?? [],
		spellSlots: character.sheet.spellSlots ?? [],
		money: normalizeDnd2024Money(character.sheet.money),
		featSpellGrants: character.sheet.featSpellGrants ?? [],
		campaignFeatSpellGrants: character.sheet.campaignFeatSpellGrants ?? [],
		hitDiceSpent: character.sheet.hitDiceSpent ?? 0,
		visibleRolls: character.sheet.visibleRolls ?? [],
		resistances: character.sheet.resistances ?? [],
		automaticTraits: character.sheet.automaticTraits ?? [],
		speciesHPBonusApplied: character.sheet.speciesHPBonusApplied ?? 0,
		initiative:
			character.sheet.initiative ??
			Math.floor(((character.sheet.abilityScores?.dexterity ?? 10) - 10) / 2),
		initiativeAdvantage: character.sheet.initiativeAdvantage ?? false
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
export const setCharacterInitiativeAdvantage = (
	session: Session,
	campaignId: string,
	characterId: string,
	enabled: boolean
) =>
	request<{ enabled: boolean }>(
		session,
		`/api/v1/campaigns/${campaignId}/characters/${characterId}/initiative-advantage`,
		{ method: 'PATCH', body: JSON.stringify({ enabled }) }
	);
export const createCharacterForGM = (session: Session, campaignId: string, ownerId: string) =>
	request<Character>(session, `/api/v1/campaigns/${campaignId}/characters`, {
		method: 'POST',
		body: JSON.stringify({ ownerId })
	}).then(normalizeCharacter);
export const deleteCharacterForGM = (session: Session, campaignId: string, characterId: string) =>
	request<void>(session, `/api/v1/campaigns/${campaignId}/characters/${characterId}`, {
		method: 'DELETE'
	});
export type SheetRoll = {
	eventId: number;
	dados: number[];
	modo: 'normal' | 'advantage' | 'disadvantage';
	modificador: number;
	total: number;
	label: string;
};
export const rollMyCharacter = (
	session: Session,
	campaignId: string,
	kind: 'skill' | 'save' | 'spell',
	key: string,
	mode: SheetRoll['modo']
) =>
	request<SheetRoll>(session, `/api/v1/campaigns/${campaignId}/character/roll`, {
		method: 'POST',
		body: JSON.stringify({ kind, key, mode })
	});
export type CharacterRest = {
	eventId?: number;
	sheet: CharacterSheet;
	kind: 'short' | 'long';
	dados?: number[];
	modificador?: number;
	total?: number;
	label?: string;
};
export const restCharacter = (
	session: Session,
	campaignId: string,
	kind: CharacterRest['kind'],
	characterId?: string | null
) => {
	const path = characterId
		? `/api/v1/campaigns/${campaignId}/characters/${characterId}/rest`
		: `/api/v1/campaigns/${campaignId}/character/rest`;
	return request<CharacterRest>(session, path, {
		method: 'POST',
		body: JSON.stringify({ kind })
	}).then((result) => ({
		...result,
		sheet: normalizeCharacter({
			id: characterId ?? '',
			campaignId,
			ownerId: '',
			sheet: result.sheet
		}).sheet
	}));
};
export type SpellCast = {
	eventId: number;
	sheet: CharacterSheet;
	spellName: string;
	baseLevel: number;
	slotLevel: number;
	effect: string;
	expression?: string;
	dados?: number[];
	modificador?: number;
	total?: number;
	spellcastingAbility?: keyof AbilityScores | string;
	freeCastRemaining?: number;
};
export const castMySpell = (
	session: Session,
	campaignId: string,
	spellIndex: number,
	slotLevel: number,
	featGrant?: { grantId: string; entryId: string; freeCast: boolean }
) =>
	request<SpellCast>(session, `/api/v1/campaigns/${campaignId}/character/cast-spell`, {
		method: 'POST',
		body: JSON.stringify({ spellIndex: featGrant ? -1 : spellIndex, slotLevel, ...featGrant })
	}).then((result) => ({
		...result,
		sheet: normalizeCharacter({ id: '', campaignId, ownerId: '', sheet: result.sheet }).sheet
	}));

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
		initiative: 0,
		initiativeAdvantage: false,
		speed: 9,
		hitPointsCurrent: 10,
		hitPointsMax: 10,
		temporaryHP: 0,
		hitDice: '1d8',
		hitDiceSpent: 0,
		passivePerception: 10,
		attacks: [],
		spells: [],
		spellcastingOverride: false,
		features: '',
		feats: '',
		equipment: '',
		inventory: [],
		resources: [],
		spellSlots: [],
		money: { ...EMPTY_DND2024_MONEY },
		featSpellGrants: [],
		campaignFeatSpellGrants: [],
		visibleRolls: [],
		resistances: [],
		automaticTraits: [],
		speciesHPBonusApplied: 0
	};
}
