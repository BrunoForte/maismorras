import type { Session } from '@supabase/supabase-js';
import type { CampaignSummary } from '$lib/services/campaignApi';
import type { Character } from '$lib/services/characterApi';
import type { Scene } from '$lib/services/sceneApi';

export type StandaloneSheetAccess = {
	campaign: CampaignSummary;
	scene: Scene | null;
	characterId: string;
	isGM: boolean;
};

export type StandaloneSheetAccessDependencies = {
	listCampaigns: (session: Session) => Promise<CampaignSummary[]>;
	listScenes: (session: Session, campaignId: string) => Promise<{ scenes: Scene[] }>;
	getMyCharacter: (session: Session, campaignId: string) => Promise<Character>;
	getCharacterForGM: (
		session: Session,
		campaignId: string,
		characterId: string
	) => Promise<Character>;
};

/** URL identifiers locate resources only; each API call remains the authorization authority. */
export async function resolveStandaloneSheetAccess(
	session: Session,
	campaignId: string,
	characterId: string,
	dependencies: StandaloneSheetAccessDependencies
): Promise<StandaloneSheetAccess> {
	if (!campaignId || !characterId) throw new Error('Ficha ou campanha não informada.');
	const campaign = (await dependencies.listCampaigns(session)).find(
		(item) => item.id === campaignId
	);
	if (!campaign) throw new Error('Você não tem acesso a esta campanha.');
	const character =
		campaign.role === 'gm'
			? await dependencies.getCharacterForGM(session, campaign.id, characterId)
			: await dependencies.getMyCharacter(session, campaign.id);
	if (character.id !== characterId || character.campaignId !== campaign.id)
		throw new Error('Você não tem acesso a esta ficha.');
	const { scenes } = await dependencies.listScenes(session, campaign.id);
	return {
		campaign,
		scene: scenes[0] ?? null,
		characterId,
		isGM: campaign.role === 'gm'
	};
}
