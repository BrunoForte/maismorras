import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createCharacterSheetLifecycle,
	type CharacterSheetLifecycleContext,
	type CharacterSheetLifecycleDependencies
} from './characterSheetLifecycle.svelte';

function setup(
	overrides: Partial<CharacterSheetLifecycleDependencies> = {},
	contextOverrides: Partial<CharacterSheetLifecycleContext> = {}
) {
	const sheet = {
		armorClass: 10,
		name: 'Antes'
	} as CharacterSheetLifecycleDependencies['getSheet'] extends () => infer T ? T : never;
	const saved = vi.fn(async (_session, _campaignId, _characterId, value) => ({
		id: 'char-1',
		sheet: value
	}));
	const savedMine = vi.fn(async (_session, _campaignId, value) => ({ id: 'char-1', sheet: value }));
	const setSheet = vi.fn();
	const socketClose = vi.fn();
	const connectPresentationSocket = vi.fn(() => ({ close: socketClose }));
	const getCharacterForGM = vi.fn(async () => ({ id: 'char-1', sheet: {} }));
	const loadScene = vi.fn(async () => ({ tokens: [] }));
	const session = { user: { id: 'user-1' }, access_token: 'session-token' } as never;
	let context: CharacterSheetLifecycleContext = {
		campaignId: 'campaign-1',
		sceneId: '',
		characterId: 'char-1',
		isGM: true,
		session,
		onTokenCreated: vi.fn(),
		...contextOverrides
	};
	const deps = {
		getContext: () => context,
		onContextChanged: vi.fn(),
		getSheet: () => sheet,
		setSheet,
		calculateArmorClass: () => 15,
		getCompendium: vi.fn(async () => ({ sources: [], entries: [] })),
		onCompendiumLoaded: vi.fn(),
		getCharacterForGM,
		getMyCharacter: vi.fn(async () => ({ id: 'char-1', sheet: {} })),
		onCharacterLoaded: vi.fn(),
		loadScene,
		listSceneEffects: vi.fn(async () => ({ effects: [] })),
		setDiceColor: vi.fn(),
		connectPresentationSocket,
		saveCharacterForGM: saved,
		saveMyCharacter: savedMine,
		createTokenFromCharacter: vi.fn(async () => undefined),
		onInitiativeAdvantageUpdated: vi.fn(),
		...overrides
	} as unknown as CharacterSheetLifecycleDependencies;
	return {
		sheet,
		setSheet,
		saved,
		savedMine,
		deps,
		socketClose,
		connectPresentationSocket,
		getCharacterForGM,
		loadScene,
		setContext: (next: Partial<CharacterSheetLifecycleContext>) => {
			context = { ...context, ...next };
		},
		lifecycle: createCharacterSheetLifecycle(deps)
	};
}

afterEach(() => vi.useRealTimers());

describe('character sheet lifecycle', () => {
	it('persists through the GM endpoint for an explicitly selected character', async () => {
		const { lifecycle, saved, savedMine } = setup();
		await lifecycle.save();

		expect(saved).toHaveBeenCalledOnce();
		expect(saved.mock.calls[0][2]).toBe('char-1');
		expect(saved.mock.calls[0][3]).toMatchObject({ armorClass: 15, name: 'Antes' });
		expect(savedMine).not.toHaveBeenCalled();
		lifecycle.cleanup();
	});

	it('uses the player endpoint for the current user character', async () => {
		const { lifecycle, savedMine, saved } = setup({}, { characterId: null });
		await lifecycle.save();

		expect(savedMine).toHaveBeenCalledOnce();
		expect(saved).not.toHaveBeenCalled();
		lifecycle.cleanup();
	});

	it('does not replace newer local edits with a slow save response', async () => {
		let resolveSave!: (value: { id: string; sheet: { name: string } }) => void;
		const saveCharacterForGM = vi.fn(
			() =>
				new Promise<{ id: string; sheet: { name: string } }>((resolve) => {
					resolveSave = resolve;
				})
		);
		const { lifecycle, setSheet } = setup({ saveCharacterForGM: saveCharacterForGM as never });
		const pending = lifecycle.save();
		lifecycle.syncTokenSoon();
		resolveSave({ id: 'char-1', sheet: { name: 'Resposta antiga' } });
		await pending;

		expect(setSheet).not.toHaveBeenCalled();
		lifecycle.cleanup();
	});

	it('queues a second persistence when an edit arrives during a save', async () => {
		vi.useFakeTimers();
		let resolveFirst!: (value: { id: string; sheet: { name: string } }) => void;
		const saveCharacterForGM = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<{ id: string; sheet: { name: string } }>((resolve) => {
						resolveFirst = resolve;
					})
			)
			.mockResolvedValue({ id: 'char-1', sheet: { name: 'Mais recente' } });
		const { lifecycle } = setup({ saveCharacterForGM: saveCharacterForGM as never });
		const firstSave = lifecycle.save();
		lifecycle.syncTokenSoon();
		resolveFirst({ id: 'char-1', sheet: { name: 'Antiga' } });
		await firstSave;
		await vi.runOnlyPendingTimersAsync();

		expect(saveCharacterForGM).toHaveBeenCalledTimes(2);
		lifecycle.cleanup();
	});

	it('debounces repeated edits into one save', () => {
		vi.useFakeTimers();
		const { lifecycle, saved } = setup();
		lifecycle.syncTokenSoon();
		lifecycle.syncTokenSoon();
		lifecycle.syncTokenSoon();
		vi.advanceTimersByTime(449);
		expect(saved).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(saved).toHaveBeenCalledOnce();
		lifecycle.cleanup();
	});

	it('only creates a board token for a GM with a scene', async () => {
		const token = vi.fn();
		const player = setup({ createTokenFromCharacter: token }, { isGM: false });
		await player.lifecycle.createBoardToken();
		expect(token).not.toHaveBeenCalled();
		player.lifecycle.cleanup();

		const noScene = setup();
		await noScene.lifecycle.createBoardToken();
		expect(noScene.lifecycle.state.message).toContain('cena');
		noScene.lifecycle.cleanup();

		const gm = setup({ createTokenFromCharacter: token }, { sceneId: 'scene-1' });
		await gm.lifecycle.createBoardToken();
		expect(token).toHaveBeenCalledOnce();
		gm.lifecycle.cleanup();
	});

	it('closes the socket and cancels a pending token-save timer on cleanup', async () => {
		vi.useFakeTimers();
		const { lifecycle, socketClose, saved } = setup({}, { sceneId: 'scene-1' });
		lifecycle.start();
		lifecycle.syncTokenSoon();
		await Promise.resolve();
		lifecycle.cleanup();
		vi.advanceTimersByTime(500);

		expect(socketClose).toHaveBeenCalledOnce();
		expect(saved).not.toHaveBeenCalled();
	});

	it('restarts socket and data loading when the sheet context changes', async () => {
		const {
			lifecycle,
			connectPresentationSocket,
			getCharacterForGM,
			setContext,
			deps,
			socketClose
		} = setup({}, { sceneId: 'scene-1' });
		lifecycle.start();
		const nextSession = { user: { id: 'user-2' }, access_token: 'new-token' } as never;
		setContext({
			campaignId: 'campaign-2',
			sceneId: 'scene-2',
			characterId: 'character-2',
			session: nextSession
		});
		lifecycle.updateContext();
		await Promise.resolve();

		expect(socketClose).toHaveBeenCalledOnce();
		expect(connectPresentationSocket).toHaveBeenLastCalledWith(
			nextSession,
			'scene-2',
			expect.any(Function)
		);
		expect(getCharacterForGM).toHaveBeenLastCalledWith(nextSession, 'campaign-2', 'character-2');
		expect(deps.onContextChanged).toHaveBeenCalledOnce();
		lifecycle.cleanup();
	});

	it('changes scene without resetting the character sheet context', async () => {
		const { lifecycle, setContext, deps, loadScene, socketClose } = setup(
			{},
			{ sceneId: 'scene-1' }
		);
		lifecycle.start();
		await Promise.resolve();
		setContext({ sceneId: 'scene-2' });
		lifecycle.updateContext();
		await Promise.resolve();

		expect(socketClose).toHaveBeenCalledOnce();
		expect(loadScene).toHaveBeenLastCalledWith(
			{ user: { id: 'user-1' }, access_token: 'session-token' },
			'scene-2'
		);
		expect(deps.onContextChanged).not.toHaveBeenCalled();
		lifecycle.cleanup();
	});
});
