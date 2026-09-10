const CACHE_NAME = 'maismorras-static-v1';
const STATIC_ASSETS = ['/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
		)
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	// Never cache API, Supabase, or authenticated content. The service worker only
	// speeds up static application files and cannot expose campaign data offline.
	if (request.method !== 'GET' || url.origin !== self.location.origin || request.mode === 'navigate') return;
	event.respondWith(
		caches.match(request).then((cached) =>
			cached ?? fetch(request).then((response) => {
				if (!response.ok || !url.pathname.startsWith('/_app/')) return response;
				const copy = response.clone();
				void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
				return response;
			})
		)
	);
});
