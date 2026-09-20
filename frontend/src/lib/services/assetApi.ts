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
	const cacheKey = campaignId + ':' + assetPath;
	const cached = signedUrlCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.url;
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
		const body = (await response.json()) as { url?: string };
		if (!body.url) return null;
		signedUrlCache.set(cacheKey, { url: body.url, expiresAt: Date.now() + cacheLifetimeMs });
		return body.url;
	} catch {
		return null;
	}
}
