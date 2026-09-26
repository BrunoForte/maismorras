import type { Session } from '@supabase/supabase-js';
import { request } from './httpClient';
export type OverlayCamera = {
	url: string;
	playerName: string;
	characterName: string;
	characterId?: string;
	email?: string;
};
export type OverlaySettings = {
	enabled: boolean;
	cameras: OverlayCamera[];
	activeSceneId: string | null;
};
export const getOverlaySettings = (session: Session, campaignId: string) =>
	request<OverlaySettings>(
		session,
		`/api/v1/campaigns/${campaignId}/overlay-settings`,
		{},
		'Não foi possível carregar a configuração da overlay.'
	);
export const saveOverlaySettings = (
	session: Session,
	campaignId: string,
	settings: OverlaySettings
) =>
	request<OverlaySettings>(
		session,
		`/api/v1/campaigns/${campaignId}/overlay-settings`,
		{ method: 'PUT', body: JSON.stringify(settings) },
		'Não foi possível salvar a configuração da overlay.'
	);
