import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import { request } from './httpClient';

export function createOverlayPairing(session: Session, campaignId: string, sceneId: string) {
	return request<{ code: string; expiresAt: number }>(
		session,
		`/api/v1/campaigns/${campaignId}/overlay-pairings`,
		{ method: 'POST', body: JSON.stringify({ sceneId }) },
		'Não foi possível gerar o link de pareamento do OBS.'
	);
}

export function revokeOverlayAccess(session: Session, campaignId: string) {
	return request<{ ok: boolean }>(
		session,
		`/api/v1/campaigns/${campaignId}/overlay-pairings`,
		{ method: 'DELETE' },
		'Não foi possível revogar o acesso da overlay.'
	);
}

export async function exchangeOverlayPairing(code: string) {
	const response = await fetch(`${apiBase}/api/v1/overlay/pair`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code })
	});
	const body = (await response.json().catch(() => null)) as {
		accessToken?: string;
		expiresAt?: number;
		error?: { message?: string };
	} | null;
	if (!response.ok || !body?.accessToken || !body.expiresAt)
		throw new Error(
			body?.error?.message ||
				'O link do OBS expirou ou já foi usado. Gere outro na aba Campanha > Overlay.'
		);
	return { accessToken: body.accessToken, expiresAt: body.expiresAt };
}

export function createOverlaySession(accessToken: string, campaignId: string): Session {
	return {
		access_token: accessToken,
		user: { id: `overlay:${campaignId}` }
	} as Session;
}
