import type { Session } from '@supabase/supabase-js';
type SceneRefresh = { type: 'scene.refresh' };
type MapPing = { type: 'map.ping'; x: number; y: number; color: number };
export type SceneSocket = {
	publishRefresh: () => void;
	publishPing: (x: number, y: number, color?: number) => void;
	close: () => void;
};

export function connectSceneSocket(
	session: Session,
	sceneId: string,
	onRefresh: () => void,
	onPing?: (ping: Omit<MapPing, 'type'>) => void
): SceneSocket {
	const api = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';
	const url = new URL('/api/v1/ws', api);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('sceneId', sceneId);
	const socket = new WebSocket(url, ['maismorras-auth', session.access_token]);
	socket.onmessage = (event) => {
		try {
			const payload = JSON.parse(String(event.data)) as SceneRefresh | MapPing;
			if (payload.type === 'scene.refresh') onRefresh();
			if (payload.type === 'map.ping') onPing?.(payload);
		} catch {
			/* Ignore malformed peer events. */
		}
	};
	return {
		publishRefresh() {
			if (socket.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'scene.refresh' }));
		},
		publishPing(x, y, color = 0xf2cf77) {
			if (socket.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'map.ping', x, y, color }));
		},
		close() {
			socket.close();
		}
	};
}
