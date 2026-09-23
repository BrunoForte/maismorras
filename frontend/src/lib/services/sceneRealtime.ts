import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import type { AudioPlaybackState } from './audioPlayback';
import { supabase } from './supabase';
import type { SceneArea, SceneEffect, SceneWall } from './sceneApi';

type SceneRefresh = { type: 'scene.refresh' };
type AudioStateEvent = { type: 'audio.state'; state: AudioPlaybackState };
type PresentationUpdated = { type: 'presentation.updated'; data?: unknown };
type LayoutUpdated = { type: 'overlay.layout.updated'; data?: unknown };
export type TokenUpdateSignal = { tokenId: string; deleted?: boolean };
type TokenUpdated = { type: 'token.updated'; data?: TokenUpdateSignal };
type CombatUpdated = { type: 'combat.updated'; data?: unknown };
export type SceneDelta =
	| { kind: 'area'; action: 'upsert'; item: SceneArea }
	| { kind: 'area'; action: 'delete'; id: string }
	| { kind: 'wall'; action: 'upsert'; item: SceneWall }
	| { kind: 'wall'; action: 'delete'; id: string }
	| { kind: 'effect'; action: 'upsert'; item: SceneEffect }
	| { kind: 'effect'; action: 'delete'; id: string };
type SceneDeltaEvent = { type: 'scene.delta'; data: SceneDelta };
type ChatUpdated = { type: 'chat.updated' };
type MapPing = { type: 'map.ping'; x: number; y: number; color: number };
export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type SceneSocket = {
	publishRefresh: () => void;
	publishPing: (x: number, y: number, color?: number) => void;
	publishAudioState: (state: AudioPlaybackState) => void;
	publishPresentationUpdated: (data?: unknown) => void;
	publishLayoutUpdated: (data?: unknown) => void;
	publishTokenUpdated: (data: TokenUpdateSignal) => void;
	publishCombatUpdated: (data?: unknown) => void;
	publishSceneDelta: (data: SceneDelta) => void;
	publishChatUpdated: () => void;
	close: () => void;
};
type Subscriber = {
	onRefresh: () => void;
	onPing?: (ping: Omit<MapPing, 'type'>) => void;
	onAudio?: (state: AudioPlaybackState) => void;
	onPresentation?: (data?: unknown) => void;
	onLayout?: (data?: unknown) => void;
	onTokens?: (data?: TokenUpdateSignal) => void;
	onCombat?: (data?: unknown) => void;
	onSceneDelta?: (data: SceneDelta) => void;
	onChat?: () => void;
	onStatus?: (status: RealtimeStatus) => void;
};
const sharedConnections = new Map<string, SharedSceneConnection>();
class SharedSceneConnection {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempt = 0;
	private closed = false;
	private token: string;
	private readonly subscribers = new Set<Subscriber>();
	private readonly pendingPayloads: (
		| SceneRefresh
		| AudioStateEvent
		| PresentationUpdated
		| LayoutUpdated
		| TokenUpdated
		| CombatUpdated
		| SceneDeltaEvent
		| ChatUpdated
		| MapPing
	)[] = [];
	private readonly url: URL;
	private readonly authSubscription?: { unsubscribe: () => void };
	constructor(
		private readonly key: string,
		sceneId: string,
		session: Session
	) {
		this.token = session.access_token;
		this.url = new URL('/api/v1/ws', apiBase);
		this.url.protocol = this.url.protocol === 'https:' ? 'wss:' : 'ws:';
		this.url.searchParams.set('sceneId', sceneId);
		this.authSubscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
			const nextToken = nextSession?.access_token;
			if (!nextToken || nextToken === this.token) return;
			this.token = nextToken;
			this.socket?.close(1000, 'session refreshed');
			this.socket = null;
		}).data.subscription;
	}
	add(session: Session, subscriber: Subscriber): SceneSocket {
		this.token = session.access_token;
		this.subscribers.add(subscriber);
		if (!this.socket && !this.closed) this.connect();
		return {
			publishRefresh: () => this.publish({ type: 'scene.refresh' }),
			publishPing: (x, y, color = 0xf2cf77) => this.publish({ type: 'map.ping', x, y, color }),
			publishAudioState: (state) => this.publish({ type: 'audio.state', state }),
			publishPresentationUpdated: (data) => this.publish({ type: 'presentation.updated', data }),
			publishLayoutUpdated: (data) => this.publish({ type: 'overlay.layout.updated', data }),
			publishTokenUpdated: (data) => this.publish({ type: 'token.updated', data }),
			publishCombatUpdated: (data) => this.publish({ type: 'combat.updated', data }),
			publishSceneDelta: (data) => this.publish({ type: 'scene.delta', data }),
			publishChatUpdated: () => this.publish({ type: 'chat.updated' }),
			close: () => this.remove(subscriber)
		};
	}
	private notify(status: RealtimeStatus) {
		for (const subscriber of this.subscribers) subscriber.onStatus?.(status);
	}
	private scheduleReconnect() {
		if (this.closed || this.reconnectTimer || this.subscribers.size === 0) return;
		const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++);
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
			this.notify('connected');
			for (const payload of this.pendingPayloads.splice(0)) socket.send(JSON.stringify(payload));
		};
		socket.onmessage = (event) => {
			try {
				const payload = JSON.parse(String(event.data)) as
					| SceneRefresh
					| AudioStateEvent
					| PresentationUpdated
					| LayoutUpdated
					| TokenUpdated
					| CombatUpdated
					| SceneDeltaEvent
					| ChatUpdated
					| MapPing;
				if (payload.type === 'scene.refresh')
					for (const subscriber of this.subscribers) subscriber.onRefresh();
				if (payload.type === 'presentation.updated')
					for (const subscriber of this.subscribers) subscriber.onPresentation?.(payload.data);
				if (payload.type === 'audio.state')
					for (const subscriber of this.subscribers) subscriber.onAudio?.(payload.state);
				if (payload.type === 'overlay.layout.updated')
					for (const subscriber of this.subscribers) subscriber.onLayout?.(payload.data);
				if (payload.type === 'token.updated')
					for (const subscriber of this.subscribers) subscriber.onTokens?.(payload.data);
				if (payload.type === 'combat.updated')
					for (const subscriber of this.subscribers) subscriber.onCombat?.(payload.data);
				if (payload.type === 'scene.delta')
					for (const subscriber of this.subscribers) subscriber.onSceneDelta?.(payload.data);
				if (payload.type === 'chat.updated')
					for (const subscriber of this.subscribers) subscriber.onChat?.();
				if (payload.type === 'map.ping')
					for (const subscriber of this.subscribers) subscriber.onPing?.(payload);
			} catch {
				/* Ignore malformed peer events. */
			}
		};
		socket.onclose = () => {
			if (this.socket === socket) this.socket = null;
			if (!this.closed && this.subscribers.size) this.scheduleReconnect();
		};
		socket.onerror = () => {
			/* onclose owns retries */
		};
	}
	private publish(
		payload:
			| SceneRefresh
			| AudioStateEvent
			| PresentationUpdated
			| LayoutUpdated
			| TokenUpdated
			| CombatUpdated
			| SceneDeltaEvent
			| ChatUpdated
			| MapPing
	) {
		if (
			payload.type === 'scene.refresh' &&
			this.pendingPayloads.some((item) => item.type === 'scene.refresh')
		)
			return;
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(payload));
			return;
		}
		if (this.pendingPayloads.length >= 20) this.pendingPayloads.shift();
		this.pendingPayloads.push(payload);
	}
	private remove(subscriber: Subscriber) {
		this.subscribers.delete(subscriber);
		if (this.subscribers.size) return;
		this.closed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.socket?.close();
		this.socket = null;
		this.pendingPayloads.length = 0;
		this.authSubscription?.unsubscribe();
		sharedConnections.delete(this.key);
		subscriber.onStatus?.('disconnected');
	}
}
export function connectSceneSocket(
	session: Session,
	sceneId: string,
	onRefresh: () => void,
	onPing?: (ping: Omit<MapPing, 'type'>) => void,
	onStatus?: (status: RealtimeStatus) => void,
	onAudio?: (state: AudioPlaybackState) => void,
	onPresentation?: (data?: unknown) => void,
	onLayout?: (data?: unknown) => void,
	onTokens?: (data?: TokenUpdateSignal) => void,
	onCombat?: (data?: unknown) => void,
	onChat?: () => void,
	onSceneDelta?: (data: SceneDelta) => void
): SceneSocket {
	const key = `${session.user.id}:${sceneId}`;
	let connection = sharedConnections.get(key);
	if (!connection) {
		connection = new SharedSceneConnection(key, sceneId, session);
		sharedConnections.set(key, connection);
	}
	return connection.add(session, {
		onRefresh,
		onPing,
		onStatus,
		onAudio,
		onPresentation,
		onLayout,
		onTokens,
		onCombat,
		onChat,
		onSceneDelta
	});
}
