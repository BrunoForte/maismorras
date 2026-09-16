import type { Session } from '@supabase/supabase-js';

type SceneRefresh = { type: 'scene.refresh' };
type MapPing = { type: 'map.ping'; x: number; y: number; color: number };
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type SceneSocket = {
	publishRefresh: () => void;
	publishPing: (x: number, y: number, color?: number) => void;
	close: () => void;
};

// A Cloud Run instance can be replaced while people are playing. Keep the socket
// self-healing so the board resumes receiving updates without a page reload.
export function connectSceneSocket(
	session: Session,
	sceneId: string,
	onRefresh: () => void,
	onPing?: (ping: Omit<MapPing, 'type'>) => void,
	onStatus?: (status: RealtimeStatus) => void
): SceneSocket {
	const configuredApi = String(import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
	const api =
		configuredApi && !configuredApi.includes('maismorras.vercel.app')
			? configuredApi
			: import.meta.env.DEV
				? 'http://localhost:8080'
				: 'https://maismorras-api-454646414754.southamerica-east1.run.app';
	const url = new URL('/api/v1/ws', api);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('sceneId', sceneId);

	let socket: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectAttempt = 0;
	let failedAttempts = 0;
	let manuallyClosed = false;

	function scheduleReconnect() {
		if (manuallyClosed || reconnectTimer) return;
		const delay = Math.min(10_000, 500 * 2 ** reconnectAttempt++);
		onStatus?.('reconnecting');
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	function connect() {
		if (manuallyClosed) return;
		onStatus?.(reconnectAttempt ? 'reconnecting' : 'connecting');
		socket = new WebSocket(url, ['maismorras-auth', session.access_token]);
		socket.onopen = () => {
			reconnectAttempt = 0;
			failedAttempts = 0;
			onStatus?.('connected');
		};
		socket.onmessage = (event) => {
			try {
				const payload = JSON.parse(String(event.data)) as SceneRefresh | MapPing;
				if (payload.type === 'scene.refresh') onRefresh();
				if (payload.type === 'map.ping') onPing?.(payload);
			} catch {
				// Ignore malformed peer events.
			}
		};
		socket.onclose = () => {
			failedAttempts += 1;
			if (failedAttempts >= 5) {
				onStatus?.('disconnected');
				return;
			}
			scheduleReconnect();
		};
	}

	connect();
	return {
		publishRefresh() {
			if (socket?.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'scene.refresh' }));
		},
		publishPing(x, y, color = 0xf2cf77) {
			if (socket?.readyState === WebSocket.OPEN)
				socket.send(JSON.stringify({ type: 'map.ping', x, y, color }));
		},
		close() {
			manuallyClosed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			reconnectTimer = null;
			socket?.close();
			onStatus?.('disconnected');
		}
	};
}
