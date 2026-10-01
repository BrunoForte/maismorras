import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { Character } from '$lib/services/characterApi';
import { resolveStandaloneSheetAccess } from './standaloneSheetAccess';

const session = {} as Session;
const campaign = { id: 'campaign-1', name: 'Mesa', role: 'player', systemId: 'dnd2024' } as const;
const ownCharacter = { id: 'character-1', campaignId: campaign.id } as unknown as Character;

function dependencies(role: 'gm' | 'player' = 'player') {
	return {
		listCampaigns: vi.fn().mockResolvedValue([{ ...campaign, role }]),
		listScenes: vi.fn().mockResolvedValue({ scenes: [] }),
		getMyCharacter: vi.fn().mockResolvedValue(ownCharacter),
		getCharacterForGM: vi.fn().mockResolvedValue(ownCharacter)
	};
}

describe('resolveStandaloneSheetAccess', () => {
	it('authorizes a player only for the character returned by their own campaign endpoint', async () => {
		const deps = dependencies();
		await expect(
			resolveStandaloneSheetAccess(session, campaign.id, ownCharacter.id, deps)
		).resolves.toMatchObject({
			characterId: ownCharacter.id,
			isGM: false
		});
		await expect(
			resolveStandaloneSheetAccess(session, campaign.id, 'another-character', deps)
		).rejects.toThrow('Você não tem acesso a esta ficha.');
		expect(deps.getCharacterForGM).not.toHaveBeenCalled();
	});

	it('uses the backend-authorized character read for a GM', async () => {
		const deps = dependencies('gm');
		await expect(
			resolveStandaloneSheetAccess(session, campaign.id, ownCharacter.id, deps)
		).resolves.toMatchObject({
			isGM: true,
			characterId: ownCharacter.id
		});
		expect(deps.getCharacterForGM).toHaveBeenCalledWith(session, campaign.id, ownCharacter.id);
	});

	it('denies a campaign outside the user membership list and rejects missing identifiers', async () => {
		const deps = dependencies();
		deps.listCampaigns.mockResolvedValue([]);
		await expect(
			resolveStandaloneSheetAccess(session, campaign.id, ownCharacter.id, deps)
		).rejects.toThrow('Você não tem acesso a esta campanha.');
		await expect(resolveStandaloneSheetAccess(session, '', ownCharacter.id, deps)).rejects.toThrow(
			'Ficha ou campanha não informada.'
		);
		expect(deps.getMyCharacter).not.toHaveBeenCalled();
	});

	it('returns a safe null scene when a campaign has no scene yet', async () => {
		const deps = dependencies('gm');
		await expect(
			resolveStandaloneSheetAccess(session, campaign.id, ownCharacter.id, deps)
		).resolves.toMatchObject({
			scene: null
		});
	});
});
