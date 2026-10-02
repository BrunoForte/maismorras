import type { Session } from '@supabase/supabase-js';
import type { AudioPlaybackState } from '$lib/services/audioPlayback';
import {
	connectSceneSocket,
	type SceneSocket,
	type RealtimeStatus,
	type SceneDelta,
	type TokenUpdateSignal
} from '$lib/services/sceneRealtime';

export type SceneRealtimeLifecycleContext = {
	session: Session;
	campaignId: string;
	sceneId: string;
	isGM: boolean;
};

export type SceneRealtimeLifecycleHandlers = {
	onRefresh?: () => void;
	onPing?: (ping: { x: number; y: number; color: number }) => void;
	onStatus?: (status: RealtimeStatus) => void;
	onAudio?: (state: AudioPlaybackState) => void;
	onAudioEffects?: (state: AudioPlaybackState) => void;
	onPresentation?: (data?: unknown) => void;
	onLayout?: (data?: unknown) => void;
	onTokens?: (data?: TokenUpdateSignal) => void;
	onCombat?: (data?: unknown) => void;
	onChat?: () => void;
	onSceneDelta?: (data: SceneDelta) => void;
};

export type SceneRealtimeLifecycleDependencies = {
	getContext: () => SceneRealtimeLifecycleContext;
	connect?: (
		context: SceneRealtimeLifecycleContext,
		handlers: SceneRealtimeLifecycleHandlers
	) => SceneSocket;
	handlers: SceneRealtimeLifecycleHandlers;
	setSocket: (socket: SceneSocket | null) => void;
	onFallbackRefresh: () => void;
	fallbackIntervalMs?: number;
};

/** Owns a scene socket subscription and its disconnected-state reconciliation timer. */
export class SceneRealtimeLifecycleController {
	private generation = 0;
	private contextKey = '';
	private socket: SceneSocket | null = null;
	private fallbackTimer: ReturnType<typeof setInterval> | null = null;
	private disposed = false;
	private readonly fallbackIntervalMs: number;

	constructor(private readonly dependencies: SceneRealtimeLifecycleDependencies) {
		this.fallbackIntervalMs = dependencies.fallbackIntervalMs ?? 60_000;
	}

	/** Call from a reactive effect whenever session, scene, campaign, or role may change. */
	syncContext(): void {
		if (this.disposed) return;
		const context = this.dependencies.getContext();
		const nextKey = this.keyFor(context);
		if (nextKey === this.contextKey && this.socket) return;

		this.generation += 1;
		const generation = this.generation;
		this.contextKey = nextKey;
		this.clearFallbackTimer();
		this.socket?.close();
		this.socket = null;
		this.dependencies.setSocket(null);

		if (!context.session.user.id || !context.session.access_token || !context.sceneId) return;

		const isCurrent = () => this.isCurrent(generation);
		const handlers = this.dependencies.handlers;
		const guarded =
			<Args extends unknown[]>(callback: ((...args: Args) => void) | undefined) =>
			(...args: Args) => {
				if (isCurrent()) callback?.(...args);
			};
		const status = (value: RealtimeStatus) => {
			if (!isCurrent()) return;
			if (value === 'connected') this.clearFallbackTimer();
			else this.startFallbackTimer(generation);
			handlers.onStatus?.(value);
		};

		const activeHandlers: SceneRealtimeLifecycleHandlers = {
			onRefresh: guarded(handlers.onRefresh),
			onPing: guarded(handlers.onPing),
			onStatus: status,
			onAudio: guarded(handlers.onAudio),
			onAudioEffects: guarded(handlers.onAudioEffects),
			onPresentation: guarded(handlers.onPresentation),
			onLayout: guarded(handlers.onLayout),
			onTokens: guarded(handlers.onTokens),
			onCombat: guarded(handlers.onCombat),
			onChat: guarded(handlers.onChat),
			onSceneDelta: guarded(handlers.onSceneDelta)
		};

		try {
			const socket = (this.dependencies.connect ?? connectSceneContext)(context, activeHandlers);
			if (!isCurrent()) {
				socket.close();
				return;
			}
			this.socket = socket;
			this.dependencies.setSocket(socket);
		} catch {
			if (!isCurrent()) return;
			this.startFallbackTimer(generation);
			handlers.onStatus?.('disconnected');
		}
	}

	cleanup(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation += 1;
		this.contextKey = '';
		this.clearFallbackTimer();
		this.socket?.close();
		this.socket = null;
		this.dependencies.setSocket(null);
	}

	private startFallbackTimer(generation: number): void {
		if (this.fallbackTimer) return;
		this.fallbackTimer = setInterval(() => {
			if (this.isCurrent(generation)) this.dependencies.onFallbackRefresh();
		}, this.fallbackIntervalMs);
	}

	private clearFallbackTimer(): void {
		if (!this.fallbackTimer) return;
		clearInterval(this.fallbackTimer);
		this.fallbackTimer = null;
	}

	private isCurrent(generation: number): boolean {
		return (
			!this.disposed &&
			generation === this.generation &&
			this.contextKey === this.keyFor(this.dependencies.getContext())
		);
	}

	private keyFor(context: SceneRealtimeLifecycleContext): string {
		return [
			context.session.user.id,
			context.session.access_token,
			context.campaignId,
			context.sceneId,
			context.isGM ? 'gm' : 'player'
		].join('|');
	}
}

function connectSceneContext(
	context: SceneRealtimeLifecycleContext,
	handlers: SceneRealtimeLifecycleHandlers
): SceneSocket {
	return connectSceneSocket(
		context.session,
		context.sceneId,
		handlers.onRefresh,
		handlers.onPing,
		handlers.onStatus,
		handlers.onAudio,
		handlers.onPresentation,
		handlers.onLayout,
		handlers.onTokens,
		handlers.onCombat,
		handlers.onChat,
		handlers.onSceneDelta,
		handlers.onAudioEffects
	);
}

export function createSceneRealtimeLifecycleController(
	dependencies: SceneRealtimeLifecycleDependencies
): SceneRealtimeLifecycleController {
	return new SceneRealtimeLifecycleController(dependencies);
}
