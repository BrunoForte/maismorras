import type { Session } from '@supabase/supabase-js';
type SceneRefresh = { type: 'scene.refresh' };
export type SceneSocket = {
	publishRefresh: () => void;
	close: () => void;
};

export function connectSceneSocket(
	session: Session,
	sceneId: string,
	onRefresh: () => void
): SceneSocket {
	const api = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
	const url = new URL('/api/v1/ws', api);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('sceneId', sceneId);
	const socket = new WebSocket(url, ['maismorras-auth', session.access_token]);
	socket.onmessage = (event) => {
		try {
			const payload = JSON.parse(String(event.data)) as SceneRefresh;
			if (payload.type === 'scene.refresh') onRefresh();
		} catch {
			/* Ignore malformed peer events. */
		}
	};
	return {
		publishRefresh() {
			if (socket.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'scene.refresh' }));
		},
		close() {
			socket.close();
		}
	};
}
