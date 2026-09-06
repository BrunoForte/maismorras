import type { Session } from '@supabase/supabase-js';
import type { Mensagem } from '$lib/stores/chatStore';

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
	if (!response.ok)
		throw new Error(
			(await response.json()).error?.message ?? 'Não foi possível acessar o histórico.'
		);
	return response.json() as Promise<T>;
}
type StoredEvent = {
	id: number;
	author: string;
	type: 'chat.message' | 'dice.roll';
	payload: unknown;
};
function asMessage(event: StoredEvent): Mensagem | null {
	if (event.type === 'chat.message') {
		const p = event.payload as { text?: string };
		return p.text
			? { id: String(event.id), autor: event.author, texto: p.text, tipo: 'texto' }
			: null;
	}
	const p = event.payload as Mensagem['detalhesRolagem'] & { text?: string };
	return p?.expressao
		? {
				id: String(event.id),
				autor: event.author,
				texto: p.text ?? '',
				tipo: 'rolagem',
				detalhesRolagem: p
			}
		: null;
}
export async function loadMessages(session: Session, campaignId: string) {
	const result = await request<{ events: StoredEvent[] }>(
		session,
		`/api/v1/campaigns/${campaignId}/events`
	);
	return result.events.map(asMessage).filter((m): m is Mensagem => m !== null);
}
export const saveMessage = (session: Session, campaignId: string, text: string) =>
	request(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({ type: 'chat.message', payload: { text } })
	});
export const saveRoll = (
	session: Session,
	campaignId: string,
	details: NonNullable<Mensagem['detalhesRolagem']>,
	text = ''
) =>
	request(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({ type: 'dice.roll', payload: { ...details, text } })
	});

export const rollDice = (session: Session, campaignId: string, expression: string) =>
	request<StoredEvent>(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({ type: 'dice.roll', payload: { expression } })
	});
