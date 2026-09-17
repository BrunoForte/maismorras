import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
export type Presentation = { assetPath: string; title: string; visible: boolean };
export async function getPresentation(session: Session, sceneId: string) {
	const r = await fetch(`${apiBase}/api/v1/scenes/${sceneId}/presentation`, {
		headers: { Authorization: `Bearer ${session.access_token}` }
	});
	if (!r.ok) throw new Error('Não foi possível carregar a apresentação.');
	return (await r.json()) as Presentation;
}
export async function savePresentation(
	session: Session,
	sceneId: string,
	presentation: Presentation
) {
	const r = await fetch(`${apiBase}/api/v1/scenes/${sceneId}/presentation`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${session.access_token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(presentation)
	});
	if (!r.ok) throw new Error('Não foi possível atualizar a apresentação.');
	return (await r.json()) as Presentation;
}
