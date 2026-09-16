import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

type SceneRefresh = { type: 'scene.refresh' };
type MapPing = { type: 'map.ping'; x: number; y: number; color: number };
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type SceneSocket = {
	publishRefresh: () => void;
	publishPing: (x: number, y: number, color?: number) => void;
	close: () => void;
};

type Subscriber = {
	onRefresh: () => void;
	onPing?: (ping: Omit<MapPing, 'type'>) => void;
	onStatus?: (status: RealtimeStatus) => void;
};

const sharedConnections = new Map<string, SharedSceneConnection>();

class SharedSceneConnection {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempt = 0;
	private failedAttempts = 0;
	private closed = false;
	private token: string;
	private readonly subscribers = new Set<Subscriber>();
	private readonly url: URL;

	constructor(private readonly key: string, sceneId: string, session: Session) {
		this.token = session.access_token;
		this.url = new URL('/api/v1/ws', apiBase);
		this.url.protocol = this.url.protocol === 'https:' ? 'wss:' : 'ws:';
		this.url.searchParams.set('sceneId', sceneId);
	}

	add(session: Session, subscriber: Subscriber): SceneSocket {
		this.token = session.access_token;
		if (this.failedAttempts >= 5) {
			this.failedAttempts = 0;
			this.reconnectAttempt = 0;
		}
		this.subscribers.add(subscriber);
		if (!this.socket && !this.closed) this.connect();
		return {
			publishRefresh: () => this.publish({ type: 'scene.refresh' }),
			publishPing: (x, y, color = 0xf2cf77) => this.publish({ type: 'map.ping', x, y, color }),
			close: () => this.remove(subscriber)
		};
	}

	private notify(status: RealtimeStatus) {
		for (const subscriber of this.subscribers) subscriber.onStatus?.(status);
	}

	private scheduleReconnect() {
		if (this.closed || this.reconnectTimer || this.subscribers.size === 0) return;
		const delay = Math.min(10_000, 500 * 2 ** this.reconnectAttempt++);
		this.notify('reconnecting');
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private connect() {
		if (this.closed || this.socket || this.subscribers.size === 0) return;
		this.notify(this.reconnectAttempt ? 'reconnecting' : 'connecting');
		const socket = new WebSocket(this.url, ['maismorras-auth', this.token]);
		this.socket = socket;
		socket.onopen = () => {
			this.reconnectAttempt = 0;
			this.failedAttempts = 0;
			this.notify('connected');
		};
		socket.onmessage = (event) => {
			try {
				const payload = JSON.parse(String(event.data)) as SceneRefresh | MapPing;
				if (payload.type === 'scene.refresh') {
					for (const subscriber of this.subscribers) subscriber.onRefresh();
				}
				if (payload.type === 'map.ping') {
					for (const subscriber of this.subscribers) subscriber.onPing?.(payload);
				}
			} catch {
				// Ignore malformed peer events.
			}
		};
		socket.onclose = () => {
			if (this.socket === socket) this.socket = null;
			this.failedAttempts += 1;
			if (this.closed || this.subscribers.size === 0) return;
			if (this.failedAttempts >= 5) {
				this.notify('disconnected');
				return;
			}
			this.scheduleReconnect();
		};
		socket.onerror = () => {
			// onclose is the single place that controls retries and status changes.
		};
	}

	private publish(payload: SceneRefresh | MapPing) {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
	}

	private remove(subscriber: Subscriber) {
		this.subscribers.delete(subscriber);
		if (this.subscribers.size > 0) return;
		this.closed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
		this.socket?.close();
		this.socket = null;
		sharedConnections.delete(this.key);
		subscriber.onStatus?.('disconnected');
	}
}

// Reutiliza um único socket entre mapa, combate e chat na mesma sessão/cena.
export function connectSceneSocket(
	session: Session,
	sceneId: string,
	onRefresh: () => void,
	onPing?: (ping: Omit<MapPing, 'type'>) => void,
	onStatus?: (status: RealtimeStatus) => void
): SceneSocket {
	const key = `${session.user.id}:${sceneId}`;
	let connection = sharedConnections.get(key);
	if (!connection) {
		connection = new SharedSceneConnection(key, sceneId, session);
		sharedConnections.set(key, connection);
	}
	return connection.add(session, { onRefresh, onPing, onStatus });
}
