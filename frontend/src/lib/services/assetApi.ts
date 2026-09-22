import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const cacheLifetimeMs = 15 * 60 * 1000;
const inFlight = new Map<string, Promise<string | null>>();

export function clearSignedAssetCache(campaignId?: string, path?: string) {
	if (!campaignId) {
		signedUrlCache.clear();
		return;
	}
	const suffix = ':' + campaignId + ':' + (path ?? '');
	for (const key of signedUrlCache.keys()) if (key.includes(suffix)) signedUrlCache.delete(key);
}

/** Resolve a private campaign asset through the backend authorization boundary. */
export async function getSignedAssetUrl(
	session: Session,
	campaignId: string,
	path: string
): Promise<string | null> {
	if (!path) return null;
	let assetPath = path;
	try {
		const parsed = new URL(path);
		const marker = '/storage/v1/object/sign/campaign-assets/';
		const markerIndex = parsed.pathname.indexOf(marker);
		if (markerIndex >= 0)
			assetPath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
	} catch {
		/* relative Storage paths are handled below */
	}
	if (assetPath.startsWith('http') || assetPath.startsWith('data:')) return assetPath;
	const cacheKey = session.user.id + ':' + campaignId + ':' + assetPath;
	const cached = signedUrlCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.url;
	const existing = inFlight.get(cacheKey);
	if (existing) return existing;
	const request = (async () => {
		try {
			const response = await fetch(`${apiBase}/api/v1/campaigns/${campaignId}/assets/signed-url`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ path: assetPath })
			});
			if (!response.ok) {
				signedUrlCache.delete(cacheKey);
				return null;
			}
			const body = (await response.json()) as { url?: string; expiresAt?: number };
			if (!body.url) return null;
			const expiresAt = body.expiresAt ? body.expiresAt * 1000 : Date.now() + cacheLifetimeMs;
			signedUrlCache.set(cacheKey, {
				url: body.url,
				expiresAt: Math.max(Date.now() + 30_000, expiresAt - 30_000)
			});
			return body.url;
		} catch {
			return null;
		} finally {
			inFlight.delete(cacheKey);
		}
	})();
	inFlight.set(cacheKey, request);
	return request;
}
