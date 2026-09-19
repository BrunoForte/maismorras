import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const cacheLifetimeMs = 50 * 60 * 1000;

/** Resolve a private campaign asset through the backend authorization boundary. */
export async function getSignedAssetUrl(
	session: Session,
	campaignId: string,
	path: string
): Promise<string | null> {
	if (!path || path.startsWith('http') || path.startsWith('data:')) return path || null;
	const cacheKey = `${campaignId}:${path}`;
	const cached = signedUrlCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.url;
	try {
		const response = await fetch(`${apiBase}/api/v1/campaigns/${campaignId}/assets/signed-url`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${session.access_token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ path })
		});
		if (!response.ok) {
			signedUrlCache.delete(cacheKey);
			return null;
		}
		const body = (await response.json()) as { url?: string };
		if (!body.url) return null;
		signedUrlCache.set(cacheKey, { url: body.url, expiresAt: Date.now() + cacheLifetimeMs });
		return body.url;
	} catch {
		return null;
	}
}
