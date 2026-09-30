import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createCharacterSheetLifecycle,
	type CharacterSheetLifecycleDependencies
} from './characterSheetLifecycle.svelte';

function setup(overrides: Partial<CharacterSheetLifecycleDependencies> = {}) {
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
	const deps = {
		campaignId: 'campaign-1',
		sceneId: '',
		characterId: 'char-1',
		isGM: true,
		session: {} as CharacterSheetLifecycleDependencies['session'],
		getSheet: () => sheet,
		setSheet,
		calculateArmorClass: () => 15,
		getCompendium: vi.fn(async () => ({ sources: [], entries: [] })),
		onCompendiumLoaded: vi.fn(),
		getCharacterForGM: vi.fn(),
		getMyCharacter: vi.fn(),
		onCharacterLoaded: vi.fn(),
		loadScene: vi.fn(),
		listSceneEffects: vi.fn(),
		setDiceColor: vi.fn(),
		connectPresentationSocket: vi.fn(() => ({ close: vi.fn() })),
		saveCharacterForGM: saved,
		saveMyCharacter: savedMine,
		createTokenFromCharacter: vi.fn(),
		onTokenCreated: vi.fn(),
		refreshPortraitPreview: vi.fn(),
		onInitiativeAdvantageUpdated: vi.fn(),
		...overrides
	} as unknown as CharacterSheetLifecycleDependencies;
	return {
		sheet,
		setSheet,
		saved,
		savedMine,
		deps,
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
		const { lifecycle, savedMine, saved } = setup({ characterId: null });
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
		const player = setup({ isGM: false, createTokenFromCharacter: token });
		await player.lifecycle.createBoardToken();
		expect(token).not.toHaveBeenCalled();
		player.lifecycle.cleanup();

		const noScene = setup({ sceneId: '' });
		await noScene.lifecycle.createBoardToken();
		expect(noScene.lifecycle.state.message).toContain('cena');
		noScene.lifecycle.cleanup();

		const gm = setup({ sceneId: 'scene-1', createTokenFromCharacter: token });
		await gm.lifecycle.createBoardToken();
		expect(token).toHaveBeenCalledOnce();
		gm.lifecycle.cleanup();
	});
});
