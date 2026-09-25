import type { Session } from '@supabase/supabase-js';
import { request } from './httpClient';
export type Presentation = {
	assetPath: string;
	title: string;
	description: string;
	visible: boolean;
	visibleUserIds: string[];
	audienceRestricted: boolean;
	overlayVisible: boolean;
	updatedAt?: string;
};
export async function getPresentation(session: Session, sceneId: string, surface?: 'overlay') {
	return request<Presentation>(
		session,
		`/api/v1/scenes/${sceneId}/presentation${surface ? '?surface=overlay' : ''}`,
		{},
		'Não foi possível carregar a apresentação.'
	);
}
export async function savePresentation(
	session: Session,
	sceneId: string,
	presentation: Presentation
) {
	return request<Presentation>(
		session,
		`/api/v1/scenes/${sceneId}/presentation`,
		{ method: 'PUT', body: JSON.stringify(presentation) },
		'Não foi possível atualizar a apresentação.'
	);
}
