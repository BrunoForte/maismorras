import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneSocket } from '$lib/services/sceneRealtime';
import {
	createSceneRealtimeLifecycleController,
	type SceneRealtimeLifecycleContext,
	type SceneRealtimeLifecycleHandlers
} from './sceneRealtimeLifecycleController';

function makeContext(
	patch: Partial<{
		userId: string;
		accessToken: string;
		campaignId: string;
		sceneId: string;
		isGM: boolean;
	}> = {}
): SceneRealtimeLifecycleContext {
	return {
		session: {
			user: { id: patch.userId ?? 'user-a' },
			access_token: patch.accessToken ?? 'token-a'
		} as Session,
		campaignId: patch.campaignId ?? 'campaign-a',
		sceneId: patch.sceneId ?? 'scene-a',
		isGM: patch.isGM ?? true
	};
}

function makeSocket(): SceneSocket {
	return {
		publishRefresh: vi.fn(),
		publishPing: vi.fn(),
		publishAudioState: vi.fn(),
		publishAudioEffects: vi.fn(),
		publishPresentationUpdated: vi.fn(),
		publishLayoutUpdated: vi.fn(),
		publishTokenUpdated: vi.fn(),
		publishCombatUpdated: vi.fn(),
		publishSceneDelta: vi.fn(),
		publishChatUpdated: vi.fn(),
		close: vi.fn()
	};
}

function setup(fallbackIntervalMs = 60_000) {
	let currentContext = makeContext();
	const connections: {
		context: SceneRealtimeLifecycleContext;
		handlers: SceneRealtimeLifecycleHandlers;
		socket: SceneSocket;
	}[] = [];
	const setSocket = vi.fn();
	const onFallbackRefresh = vi.fn();
	const handlers: SceneRealtimeLifecycleHandlers = {
		onRefresh: vi.fn(),
		onTokens: vi.fn(),
		onSceneDelta: vi.fn(),
		onStatus: vi.fn()
	};
	const controller = createSceneRealtimeLifecycleController({
		getContext: () => currentContext,
		connect: (context, callbacks) => {
			const socket = makeSocket();
			connections.push({ context, handlers: callbacks, socket });
			callbacks.onStatus?.('connecting');
			return socket;
		},
		handlers,
		setSocket,
		onFallbackRefresh,
		fallbackIntervalMs
	});
	activeControllers.add(controller);
	return {
		controller,
		connections,
		handlers,
		setSocket,
		onFallbackRefresh,
		setContext: (context: SceneRealtimeLifecycleContext) => (currentContext = context)
	};
}

const activeControllers = new Set<ReturnType<typeof createSceneRealtimeLifecycleController>>();

afterEach(() => {
	for (const controller of activeControllers) controller.cleanup();
	activeControllers.clear();
	vi.useRealTimers();
});

describe('scene realtime lifecycle controller', () => {
	it.each([
		['campaign', () => makeContext({ campaignId: 'campaign-b' })],
		['scene', () => makeContext({ sceneId: 'scene-b' })],
		['user', () => makeContext({ userId: 'user-b' })],
		['role', () => makeContext({ isGM: false })],
		['access token', () => makeContext({ accessToken: 'token-b' })]
	])('reconnects once when %s changes', (_label, nextContext) => {
		const state = setup();
		state.controller.syncContext();
		state.setContext(nextContext());
		state.controller.syncContext();
		state.controller.syncContext();

		expect(state.connections).toHaveLength(2);
		expect(state.connections[0].socket.close).toHaveBeenCalledOnce();
		expect(state.connections[1].context).toEqual(nextContext());
	});

	it('ignores messages from a prior scene after context changes', () => {
		const state = setup();
		state.controller.syncContext();
		const staleHandlers = state.connections[0].handlers;
		state.setContext(makeContext({ sceneId: 'scene-b' }));
		state.controller.syncContext();

		staleHandlers.onRefresh?.();
		staleHandlers.onTokens?.({ tokenId: 'old-token' });
		state.connections[1].handlers.onRefresh?.();

		expect(state.handlers.onRefresh).toHaveBeenCalledOnce();
		expect(state.handlers.onTokens).not.toHaveBeenCalled();
	});

	it('runs one reconciliation callback for a reconnect without creating another socket', () => {
		const state = setup();
		state.controller.syncContext();
		const active = state.connections[0].handlers;

		active.onStatus?.('reconnecting');
		active.onRefresh?.();

		expect(state.handlers.onRefresh).toHaveBeenCalledOnce();
		expect(state.connections).toHaveLength(1);
	});

	it('closes a pending connection and ignores its late callbacks on cleanup', () => {
		vi.useFakeTimers();
		const state = setup(100);
		state.controller.syncContext();
		const staleHandlers = state.connections[0].handlers;

		state.controller.cleanup();
		staleHandlers.onRefresh?.();
		vi.advanceTimersByTime(500);

		expect(state.connections[0].socket.close).toHaveBeenCalledOnce();
		expect(state.setSocket).toHaveBeenLastCalledWith(null);
		expect(state.handlers.onRefresh).not.toHaveBeenCalled();
		expect(state.onFallbackRefresh).not.toHaveBeenCalled();
	});

	it('does not duplicate sockets or fallback timers for repeated context syncs', () => {
		vi.useFakeTimers();
		const state = setup(100);
		state.controller.syncContext();
		state.controller.syncContext();
		state.controller.syncContext();
		state.connections[0].handlers.onStatus?.('reconnecting');
		state.connections[0].handlers.onStatus?.('reconnecting');
		vi.advanceTimersByTime(100);

		expect(state.connections).toHaveLength(1);
		expect(state.onFallbackRefresh).toHaveBeenCalledOnce();
	});
});
