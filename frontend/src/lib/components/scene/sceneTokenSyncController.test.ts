import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Personagem } from '$lib/stores/gameStore';
import { ApiError } from '$lib/services/httpClient';
import type { PersistedToken } from '$lib/services/sceneApi';
import {
	createSceneTokenSyncController,
	type SceneTokenSyncContext,
	type SceneTokenSyncDependencies
} from './sceneTokenSyncController';

function token(id: string, name = id): PersistedToken {
	return {
		id,
		actorId: null,
		isOwner: true,
		name,
		imageUrl: null,
		color: 0x123456,
		x: 2,
		y: 3,
		size: 1,
		hpCurrent: 10,
		hpMax: 10,
		armorClass: 12,
		initiative: 0,
		visionRange: 0,
		lightRange: 0,
		statuses: [],
		hidden: false,
		visibility: { showName: true, showHP: true, showAC: true, showStatuses: true }
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function setup() {
	const session = { user: { id: 'user-a' }, access_token: 'session-a' } as Session;
	let context: SceneTokenSyncContext = {
		session,
		sceneId: 'scene-a',
		campaignId: 'campaign-a',
		isGM: true
	};
	let characters: Personagem[] = [];
	let selectedLocalId: number | null = null;
	const getSceneToken = vi.fn(async (_session: Session, _sceneId: string, id: string) => token(id));
	const resolveSignedAsset = vi.fn(async () => 'signed-image-url');
	const updateCharacters = vi.fn((update: (current: Personagem[]) => Personagem[]) => {
		characters = update(characters);
	});
	const clearSelection = vi.fn(() => (selectedLocalId = null));
	const rememberToken = vi.fn();
	const forgetToken = vi.fn();
	const clearSnapshots = vi.fn();
	const dependencies: SceneTokenSyncDependencies = {
		getContext: () => context,
		getCharacters: () => characters,
		updateCharacters,
		getSelectedLocalId: () => selectedLocalId,
		clearSelection,
		removeEffectsForToken: vi.fn(),
		clearPersistenceError: vi.fn(),
		setPersistenceError: vi.fn(),
		getSceneToken,
		resolveSignedAsset,
		clearSignedAssetCache: vi.fn(),
		clearSnapshots,
		rememberToken,
		forgetToken,
		setWarning: vi.fn(),
		now: () => 1_000
	};
	return {
		controller: createSceneTokenSyncController(dependencies),
		dependencies,
		get characters() {
			return characters;
		},
		setCharacters: (value: Personagem[]) => (characters = value),
		setSelectedLocalId: (value: number | null) => (selectedLocalId = value),
		setContext: (value: Partial<SceneTokenSyncContext>) => (context = { ...context, ...value })
	};
}

describe('scene token sync controller', () => {
	it('normalizes token snapshots by persisted ID and keeps local IDs stable', async () => {
		const state = setup();
		const loaded = await state.controller.loadTokens([
			token('token-a', 'Old name'),
			token('token-b'),
			token('token-a', 'Latest name')
		]);

		expect(loaded).toBe(true);
		expect(state.characters).toHaveLength(2);
		expect(state.characters.find((item) => item.persistedId === 'token-a')?.nome).toBe(
			'Latest name'
		);
		const firstLocalId = state.characters.find((item) => item.persistedId === 'token-a')?.id;
		expect(firstLocalId).toBeDefined();

		await state.controller.updateToken('token-a');
		expect(state.characters).toHaveLength(2);
		expect(state.characters.find((item) => item.persistedId === 'token-a')?.id).toBe(firstLocalId);
		expect(state.dependencies.rememberToken).toHaveBeenCalled();
	});

	it('ignores a token response when the scene context changes while it is pending', async () => {
		const state = setup();
		const response = deferred<PersistedToken>();
		vi.mocked(state.dependencies.getSceneToken).mockReturnValueOnce(response.promise);
		const pending = state.controller.updateToken('token-a');

		state.setContext({ sceneId: 'scene-b' });
		state.controller.syncContext();
		response.resolve(token('token-a', 'Stale scene token'));
		await pending;

		expect(state.characters).toEqual([]);
		expect(state.dependencies.updateCharacters).not.toHaveBeenCalled();
	});

	it('does not commit an image lookup that finishes after controller cleanup', async () => {
		const state = setup();
		const url = deferred<string>();
		vi.mocked(state.dependencies.getSceneToken).mockResolvedValueOnce({
			...token('token-a'),
			imageUrl: 'campaigns/campaign-a/portraits/token-a.png'
		});
		vi.mocked(state.dependencies.resolveSignedAsset).mockReturnValueOnce(url.promise);
		const pending = state.controller.updateToken('token-a');
		await vi.waitFor(() => expect(state.dependencies.resolveSignedAsset).toHaveBeenCalledOnce());
		state.controller.dispose();
		url.resolve('signed-image-url');
		await pending;

		expect(state.characters).toEqual([]);
		expect(state.dependencies.updateCharacters).not.toHaveBeenCalled();
	});

	it('removes a deleted token and its related state only for the active context', async () => {
		const state = setup();
		await state.controller.loadTokens([token('token-a')]);
		state.setSelectedLocalId(state.characters[0].id);
		vi.mocked(state.dependencies.getSceneToken).mockRejectedValueOnce(new ApiError(404, 'missing'));
		await state.controller.updateToken('token-a');

		expect(state.characters).toEqual([]);
		expect(state.dependencies.clearSelection).toHaveBeenCalledOnce();
		expect(state.dependencies.removeEffectsForToken).toHaveBeenCalledWith('token-a');
		expect(state.dependencies.forgetToken).toHaveBeenCalledWith('token-a');
	});
});
