import type { Session } from '@supabase/supabase-js';
import { request as httpRequest } from './httpClient';
import type { Mensagem } from '$lib/stores/chatStore';
import type { CampaignEvent } from './campaignRealtime';

async function request<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
	return httpRequest<T>(session, path, init);
}
export type StoredEvent = CampaignEvent;
export function campaignEventToMessage(event: StoredEvent): Mensagem | null {
	if (
		event.type === 'chat.message' ||
		event.type === 'combat.log' ||
		event.type === 'system.info'
	) {
		const p = event.payload as { text?: string } | null;
		return p?.text
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
	const p = event.payload as
		| (Mensagem['detalhesRolagem'] & {
				text?: string;
				channel?: 'chat' | 'combat';
				modo?: 'normal' | 'advantage' | 'disadvantage';
				dadoEscolhido?: number;
				label?: string;
		  })
		| undefined;
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
	return result.events.map(campaignEventToMessage).filter((m): m is Mensagem => m !== null);
}
export const saveMessage = (session: Session, campaignId: string, text: string) =>
	request<StoredEvent>(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({ type: 'chat.message', payload: { text } })
	});

/** Publishes a spell card as a normal campaign chat event; audience is always campaign members. */
export async function publishSpellToChat(
	session: Session,
	campaignId: string,
	characterName: string,
	spellName: string,
	description: string
): Promise<Mensagem> {
	const text = `✨ ${characterName || 'Personagem'}: ${spellName}${description ? `\n${description}` : ''}`;
	const message = campaignEventToMessage(await saveMessage(session, campaignId, text));
	if (!message) throw new Error('Não foi possível publicar a magia no chat.');
	return message;
}
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
	channel: 'chat' | 'combat' = 'chat',
	minimumDamageDie?: 0 | 3,
	weaponDamage = false,
	critical = false
) =>
	request<StoredEvent>(session, `/api/v1/campaigns/${campaignId}/events`, {
		method: 'POST',
		body: JSON.stringify({
			type: 'dice.roll',
			payload: {
				expression,
				mode,
				channel,
				...(minimumDamageDie ? { minimumDamageDie } : {}),
				...(weaponDamage ? { weaponDamage: true, critical } : {})
			}
		})
	});
