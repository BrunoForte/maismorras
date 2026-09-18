import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import type { Mensagem } from '$lib/stores/chatStore';

const base = apiBase;
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
	type: 'chat.message' | 'dice.roll' | 'combat.log' | 'system.info';
	payload: unknown;
};
function asMessage(event: StoredEvent): Mensagem | null {
	if (
		event.type === 'chat.message' ||
		event.type === 'combat.log' ||
		event.type === 'system.info'
	) {
		const p = event.payload as { text?: string };
		return p.text
			? {
					id: String(event.id),
					autor: event.author,
					texto: p.text,
					tipo: 'texto',
					canal:
						event.type === 'combat.log'
							? 'combat'
							: event.type === 'system.info'
								? 'info'
								: p.text.startsWith('⚔️')
									? 'combat'
									: 'chat'
				}
			: null;
	}
	const p = event.payload as Mensagem['detalhesRolagem'] & {
		text?: string;
		channel?: 'chat' | 'combat';
		modo?: 'normal' | 'advantage' | 'disadvantage';
		label?: string;
	};
	return p?.expressao
		? {
				id: String(event.id),
				autor: event.author,
				texto: p.text ?? '',
				tipo: 'rolagem',
				canal: p.channel ?? 'chat',
				detalhesRolagem: { ...p, mode: p.mode ?? p.modo, label: p.label }
			}
		: null;
}
export async function loadMessages(session: Session, campaignId: string, afterId?: number) {
	const cursor = afterId && afterId > 0 ? `?after=${encodeURIComponent(afterId)}` : '';
	const result = await request<{ events: StoredEvent[] }>(
		session,
		`/api/v1/campaigns/${campaignId}/events${cursor}`
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

export const rollDice = (
	session: Session,
	campaignId: string,
	expression: string,
	mode?: 'advantage' | 'disadvantage',
	channel: 'chat' | 'combat' = 'chat'
) =>
	request<StoredEvent>(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({ type: 'dice.roll', payload: { expression, mode, channel } })
	});
