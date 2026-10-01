import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import { getSupabaseClient } from './supabase';

export type CampaignEvent = {
	id: number;
	author: string;
	type: 'chat.message' | 'dice.roll' | 'combat.log' | 'system.info';
	payload: unknown;
	createdAt: string;
};
export type CampaignEventUpdate = { type: 'campaign.event'; event: CampaignEvent };
export type CampaignRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type CampaignSocket = { close: () => void };
type Subscriber = {
	onEvent: (event: CampaignEvent) => void;
	onRefresh?: () => void;
	onStatus?: (status: CampaignRealtimeStatus) => void;
};

const connections = new Map<string, CampaignConnection>();

class CampaignConnection {
	private socket: WebSocket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempt = 0;
	private closed = false;
	private token: string;
	private readonly subscribers = new Set<Subscriber>();
	private readonly url: URL;
	private authSubscription?: { unsubscribe: () => void };

	constructor(
		private readonly key: string,
		campaignId: string,
		session: Session
	) {
		this.token = session.access_token;
		this.url = new URL('/api/v1/ws', apiBase);
		this.url.protocol = this.url.protocol === 'https:' ? 'wss:' : 'ws:';
		this.url.searchParams.set('campaignId', campaignId);
		void getSupabaseClient()
			.then((supabase) => {
				if (!supabase || this.closed) return;
				this.authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
					const nextToken = nextSession?.access_token;
					if (!nextToken || nextToken === this.token || this.closed) return;
					this.token = nextToken;
					this.socket?.close(1000, 'session refreshed');
					this.socket = null;
					this.scheduleReconnect();
				}).data.subscription;
			})
			.catch(() => {
				// Keep the supplied access token; HTTP history remains a fallback.
			});
	}

	add(session: Session, subscriber: Subscriber): CampaignSocket {
		if (session.access_token !== this.token) {
			this.token = session.access_token;
			this.socket?.close(1000, 'session refreshed');
			this.socket = null;
			this.scheduleReconnect();
		}
		this.subscribers.add(subscriber);
		if (!this.socket && !this.reconnectTimer && !this.closed) this.connect();
		return { close: () => this.remove(subscriber) };
	}

	private notify(status: CampaignRealtimeStatus) {
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
		};
		socket.onmessage = (message) => {
			try {
				const update = JSON.parse(String(message.data)) as {
					type?: string;
					event?: CampaignEvent;
				};
				if (update.type === 'campaign.refresh') {
					for (const subscriber of this.subscribers) subscriber.onRefresh?.();
					return;
				}
				const event = update.event;
				if (
					update.type !== 'campaign.event' ||
					!event ||
					!Number.isSafeInteger(event.id) ||
					event.id <= 0 ||
					!['chat.message', 'dice.roll', 'combat.log', 'system.info'].includes(event.type)
				)
					return;
				for (const subscriber of this.subscribers) subscriber.onEvent(event as CampaignEvent);
			} catch {
				// Ignore malformed or unrelated frames.
			}
		};
		socket.onclose = () => {
			if (this.socket === socket) this.socket = null;
			if (!this.closed && this.subscribers.size) this.scheduleReconnect();
		};
		socket.onerror = () => {
			// onclose owns reconnection.
		};
	}

	private remove(subscriber: Subscriber) {
		this.subscribers.delete(subscriber);
		if (this.subscribers.size) return;
		this.closed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.socket?.close(1000, 'campaign workspace closed');
		this.socket = null;
		this.authSubscription?.unsubscribe();
		connections.delete(this.key);
		subscriber.onStatus?.('disconnected');
	}
}

export function connectCampaignSocket(
	session: Session,
	campaignId: string,
	onEvent: (event: CampaignEvent) => void,
	onStatus?: (status: CampaignRealtimeStatus) => void,
	onRefresh?: () => void
): CampaignSocket {
	const key = `${session.user.id}:${campaignId}`;
	let connection = connections.get(key);
	if (!connection) {
		connection = new CampaignConnection(key, campaignId, session);
		connections.set(key, connection);
	}
	return connection.add(session, { onEvent, onStatus, onRefresh });
}

export function activeCampaignRealtimeConnections() {
	return connections.size;
}
