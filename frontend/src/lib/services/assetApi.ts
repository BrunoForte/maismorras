import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import { fetchAuthenticated } from './httpClient';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const missingAssetCache = new Map<string, number>();
const failedRequestCache = new Map<string, number>();
const cacheLifetimeMs = 15 * 60 * 1000;
const inFlight = new Map<string, Promise<string | null>>();

const signedObjectMarker = '/storage/v1/object/sign/campaign-assets/';
const publicObjectMarker = '/storage/v1/object/public/campaign-assets/';
const authenticatedObjectMarker = '/storage/v1/object/authenticated/campaign-assets/';

/** Extracts a stable Storage path from Supabase URLs, including stale signed URLs. */
export function campaignAssetPath(value: string): string | null {
	try {
		const parsed = new URL(value);
		for (const marker of [signedObjectMarker, publicObjectMarker, authenticatedObjectMarker]) {
			const index = parsed.pathname.indexOf(marker);
			if (index < 0) continue;
			return decodeURIComponent(parsed.pathname.slice(index + marker.length));
		}
	} catch {
		return null;
	}
	return null;
}

export function clearSignedAssetCache(campaignId?: string, path?: string) {
	if (!campaignId) {
		signedUrlCache.clear();
		missingAssetCache.clear();
		failedRequestCache.clear();
		return;
	}
	const suffix = ':' + campaignId + ':' + (path ?? '');
	for (const key of signedUrlCache.keys()) if (key.includes(suffix)) signedUrlCache.delete(key);
	for (const key of missingAssetCache.keys())
		if (key.includes(suffix)) missingAssetCache.delete(key);
	for (const key of failedRequestCache.keys())
		if (key.includes(suffix)) failedRequestCache.delete(key);
}

/** Resolve a private campaign asset through the backend authorization boundary. */
export async function getSignedAssetUrl(
	session: Session,
	campaignId: string,
	path: string
): Promise<string | null> {
	if (!path) return null;
	const assetPath = campaignAssetPath(path) ?? path;
	if (/^https?:\/\//i.test(assetPath) || assetPath.startsWith('data:')) return assetPath;
	const cacheKey = session.user.id + ':' + campaignId + ':' + assetPath;
	const missingUntil = missingAssetCache.get(cacheKey);
	if (missingUntil && missingUntil > Date.now()) return null;
	if (missingUntil) missingAssetCache.delete(cacheKey);
	const failedUntil = failedRequestCache.get(cacheKey);
	if (failedUntil && failedUntil > Date.now()) return null;
	if (failedUntil) failedRequestCache.delete(cacheKey);
	const cached = signedUrlCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.url;
	const existing = inFlight.get(cacheKey);
	if (existing) return existing;
	const request = (async () => {
		try {
			const response = await fetchAuthenticated(
				session,
				`${apiBase}/api/v1/campaigns/${campaignId}/assets/signed-url`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ path: assetPath })
				}
			);
			if (!response.ok) {
				signedUrlCache.delete(cacheKey);
				let code = '';
				try {
					const body = (await response.json()) as { error?: { code?: unknown } };
					if (typeof body.error?.code === 'string') code = body.error.code;
				} catch {
					// A route-level 404 can be plain text/HTML; don't cache it as a missing object.
				}
				if (response.status === 404 && code === 'ASSET_NOT_FOUND') {
					missingAssetCache.set(cacheKey, Date.now() + 5 * 60 * 1000);
				} else {
					failedRequestCache.set(cacheKey, Date.now() + 15_000);
				}
				console.warn('Falha ao solicitar URL de asset.', {
					status: response.status,
					code: code || 'UNKNOWN'
				});
				return null;
			}
			const body = (await response.json()) as { url?: string; expiresAt?: number };
			if (!body.url) return null;
			const expiresAt = body.expiresAt ? body.expiresAt * 1000 : Date.now() + cacheLifetimeMs;
			const safeExpiry = expiresAt - 30_000;
			if (safeExpiry > Date.now())
				signedUrlCache.set(cacheKey, { url: body.url, expiresAt: safeExpiry });
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
