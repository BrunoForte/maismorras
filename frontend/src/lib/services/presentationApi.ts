import type { Session } from '@supabase/supabase-js';
import { request } from './httpClient';
export type Presentation = {
	assetPath: string;
	title: string;
	description: string;
	visible: boolean;
};
export async function getPresentation(session: Session, sceneId: string) {
	return request<Presentation>(
		session,
		`/api/v1/scenes/${sceneId}/presentation`,
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
