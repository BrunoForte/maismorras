import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createEmptySheet, type CharacterSheet, type Spell } from '$lib/services/characterApi';
import type { Personagem } from '$lib/stores/gameStore';
import type {
	SceneCharacterSummaryCombatDependencies,
	SceneCharacterSummaryContext,
	SceneCharacterSummaryDependencies
} from './sceneCharacterSummaryController.svelte';
import { createSceneCharacterSummaryController } from './sceneCharacterSummaryController.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function token(id: number, actorId: string, isOwned: boolean): Personagem {
	return {
		id,
		persistedId: `token-${id}`,
		actorId,
		isOwned,
		visibility: { showName: true, showHP: true, showAC: true, showStatuses: true },
		nome: `Token ${id}`,
		cor: 0x123456,
		x: 1,
		y: 1,
		hpAtual: 10,
		hpMax: 10,
		ca: 12,
		proficiencia: 2,
		atributos: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
		armas: [],
		iniciativa: 0,
		visionRange: 0,
		lightRange: 0,
		tamanho: 1,
		fotoEscala: 1,
		fotoOffsetX: 0,
		fotoOffsetY: 0
	};
}

function spell(level: number): Spell {
	return { name: level ? 'Magia de teste' : 'Truque de teste', level, notes: '' };
}

function sheet(): CharacterSheet {
	const result = createEmptySheet();
	result.name = 'Ficha selecionada';
	result.spells = [spell(0), spell(1)];
	result.spellSlots = [{ level: 1, current: 1, max: 1 }];
	return result;
}

function setup(initial: Partial<SceneCharacterSummaryContext> = {}) {
	let selected = token(1, 'actor-a', true);
	let context: SceneCharacterSummaryContext = {
		session: { user: { id: 'user-a' }, access_token: 'session-a' } as Session,
		campaignId: 'campaign-a',
		sceneId: 'scene-a',
		isGM: false,
		locale: 'pt-BR',
		selectedToken: selected,
		selectedTokenIsNPC: false,
		onTokenCreated: vi.fn(),
		...initial
	};
	const gmSheet = sheet();
	const playerSheet = sheet();
	const chat = vi.fn();
	const presentation = vi.fn(async () => undefined);
	const cast = vi.fn(async () => ({
		eventId: 41,
		sheet: { ...playerSheet, spellSlots: [{ level: 1, current: 0, max: 1 }] },
		spellName: 'Magia de teste',
		baseLevel: 1,
		slotLevel: 1,
		effect: 'efeito'
	}));
	const display = vi.fn(async () => ({
		id: 'chat-spell',
		autor: 'Ficha selecionada',
		texto: 'Magia de teste',
		tipo: 'texto' as const,
		canal: 'chat' as const
	}));
	const getGM = vi.fn(async () => ({
		id: 'actor-a',
		campaignId: 'campaign-a',
		ownerId: 'user-a',
		sheet: gmSheet
	}));
	const getMine = vi.fn(async (session: Session, campaignId: string) => ({
		id: 'actor-a',
		campaignId,
		ownerId: session.user.id,
		sheet: playerSheet
	}));
	const messages = vi.fn();
	const publishChat = vi.fn();
	const publishPresentation = vi.fn();
	const updateCharacters = vi.fn();
	const combat = {
		getAttackMode: () => 'normal' as const,
		isWeapon: () => true,
		getWeaponRollDetails: () => ({
			attackBonus: 0,
			damageBonus: 0,
			damageFormula: '1d6',
			stableWeaponKey: 'weapon',
			profileKey: 'default',
			damageType: ''
		}),
		getAbilityModifier: () => 0,
		getPreviousLevel: () => 1,
		setPreviousLevel: vi.fn(),
		setLevelChoiceOpen: vi.fn(),
		getSpellPresentation: (value: Spell) => ({ title: value.name, description: 'Descrição' }),
		getSaving: () => false,
		syncTokenSoon: vi.fn(),
		syncProgression: vi.fn(),
		save: vi.fn(async () => undefined),
		beginExternalSaving: vi.fn(() => ({ revision: 1, generation: 1 })),
		isRevisionCurrent: () => true,
		finishExternalSaving: vi.fn(),
		rollMyCharacter: vi.fn(),
		rollDice: vi.fn(async () => ({
			id: 'roll-1',
			payload: { expressao: '1d20', dados: [12], total: 12 }
		})),
		restCharacter: vi.fn(async () => ({ kind: 'long' as const, sheet: sheet() })),
		castMySpell: cast,
		saveSpellDisplay: display,
		savePresentation: presentation,
		beginDiceBatch: vi.fn(),
		finishDiceBatch: vi.fn(),
		publishCombatUpdated: vi.fn(),
		publishPresentationUpdated: publishPresentation
	} as unknown as SceneCharacterSummaryCombatDependencies;
	const deps: SceneCharacterSummaryDependencies = {
		getContext: () => context,
		getCharacterForGM: getGM as unknown as SceneCharacterSummaryDependencies['getCharacterForGM'],
		getMyCharacter: getMine as unknown as SceneCharacterSummaryDependencies['getMyCharacter'],
		updateHitPoints: vi.fn(async (tokenId) => ({
			id: tokenId,
			actorId: selected.actorId ?? null,
			isOwner: Boolean(selected.isOwned),
			name: selected.nome,
			imageUrl: null,
			color: selected.cor,
			x: selected.x,
			y: selected.y,
			size: 1,
			hpCurrent: 4,
			hpMax: 10,
			armorClass: 12,
			initiative: 0,
			visionRange: 0,
			lightRange: 0,
			statuses: [],
			hidden: false,
			visibility: { showName: true, showHP: true, showAC: true, showStatuses: true }
		})),
		setInitiativeAdvantage: vi.fn(async (_session, _campaignId, _actorId, enabled) => ({
			enabled
		})),
		rollInitiative: vi.fn(async (_session, _sceneId, tokenId) => ({
			tokenId,
			roll: 12,
			rolls: [12],
			advantage: false,
			bonus: 2,
			initiative: 14
		})),
		updateCharacters,
		rememberToken: vi.fn(),
		clearSelection: vi.fn(),
		appendChat: chat,
		setDiceOverlay: vi.fn(),
		publishChatUpdated: publishChat,
		publishRefresh: vi.fn(),
		setMessage: messages,
		combat
	};
	const controller = createSceneCharacterSummaryController(deps);
	return {
		controller,
		deps,
		getGM,
		getMine,
		cast,
		display,
		chat,
		presentation,
		updateCharacters,
		messages,
		select: (next: Personagem | undefined) => {
			selected = next ?? token(99, 'no-actor', false);
			context = { ...context, selectedToken: next };
			controller.syncContext();
		},
		setContext: (next: Partial<SceneCharacterSummaryContext>) => {
			context = { ...context, ...next };
			controller.syncContext();
		}
	};
}

describe('scene character summary controller', () => {
	it('loads only the authorized player sheet or the GM-authorized target sheet', async () => {
		const player = setup({ selectedToken: token(1, 'other-actor', false) });
		await player.controller.loadSelectedCharacter();
		expect(player.getMine).not.toHaveBeenCalled();
		expect(player.getGM).not.toHaveBeenCalled();

		const gm = setup({ isGM: true, selectedToken: token(2, 'other-actor', false) });
		await gm.controller.loadSelectedCharacter();
		expect(gm.getGM).toHaveBeenCalledWith(
			gm.deps.getContext().session,
			'campaign-a',
			'other-actor'
		);
		expect(gm.controller.canViewSelectedCharacter()).toBe(true);
		expect(gm.controller.canCastSelectedCharacter()).toBe(false);
	});

	it('preserves the selected token, cached sheet and initiative state when only the access token refreshes', async () => {
		const test = setup();
		await test.controller.loadSelectedCharacter();
		test.controller.state.initiativeAdvantageByActor['actor-a'] = true;
		const selected = test.deps.getContext().selectedToken;
		const cachedSheet = test.controller.state.sheetsByActor['actor-a'];
		const refreshedSession = {
			user: { id: 'user-a' },
			access_token: 'session-b'
		} as Session;

		test.setContext({ session: refreshedSession });

		expect(test.deps.getContext().selectedToken).toBe(selected);
		expect(test.deps.clearSelection).not.toHaveBeenCalled();
		expect(test.controller.state.sheetsByActor['actor-a']).toBe(cachedSheet);
		expect(test.controller.state.initiativeAdvantageByActor['actor-a']).toBe(true);

		await test.controller.loadSelectedCharacter();
		expect(test.getMine).toHaveBeenCalledOnce();
		await test.controller.combatActions.castSpell(spell(1), 1);
		expect(test.cast).toHaveBeenCalledWith(refreshedSession, 'campaign-a', 1, 1, undefined);
	});

	it('ignores a sheet response started with the old token after a session refresh', async () => {
		const request = deferred<{
			id: string;
			campaignId: string;
			ownerId: string;
			sheet: CharacterSheet;
		}>();
		const test = setup();
		vi.mocked(test.deps.getMyCharacter).mockReturnValueOnce(request.promise);
		const staleSession = test.deps.getContext().session;
		const pending = test.controller.loadSelectedCharacter();

		test.setContext({
			session: { user: { id: 'user-a' }, access_token: 'session-b' } as Session
		});
		request.resolve({ id: 'actor-a', campaignId: 'campaign-a', ownerId: 'user-a', sheet: sheet() });
		await pending;

		expect(test.controller.state.sheetsByActor['actor-a']).toBeUndefined();
		expect(test.updateCharacters).not.toHaveBeenCalled();
		await test.controller.loadSelectedCharacter();
		expect(test.getMine).toHaveBeenLastCalledWith(test.deps.getContext().session, 'campaign-a');
		expect(test.getMine.mock.calls[0][0]).toBe(staleSession);
	});

	it.each([
		['user', { session: { user: { id: 'user-b' }, access_token: 'session-a' } as Session }],
		['campaign', { campaignId: 'campaign-b' }],
		['scene', { sceneId: 'scene-b' }],
		['role', { isGM: true }]
	] as const)(
		'clears cached sheets and selection when the structural %s changes',
		async (_label, patch) => {
			const test = setup();
			test.controller.syncContext();
			test.controller.state.sheetsByActor['actor-a'] = sheet();
			test.controller.state.initiativeAdvantageByActor['actor-a'] = true;

			test.setContext(patch);

			expect(test.controller.state.sheetsByActor).toEqual({});
			expect(test.controller.state.initiativeAdvantageByActor).toEqual({});
			expect(test.deps.clearSelection).toHaveBeenCalledOnce();
		}
	);

	it.each([spell(0), spell(1)])(
		'does not let a GM cast a third-party spell via the own-sheet route',
		async (selectedSpell) => {
			const test = setup({ isGM: true, selectedToken: token(2, 'other-actor', false) });
			await test.controller.combatActions.castSpell(selectedSpell, selectedSpell.level);
			expect(test.cast).not.toHaveBeenCalled();
			expect(test.messages).toHaveBeenCalledWith(
				'Só é possível lançar magias da sua própria ficha.'
			);
		}
	);

	it('lets a player cast only their own spell and stores the returned sheet for that actor', async () => {
		const test = setup();
		await test.controller.loadSelectedCharacter();
		await test.controller.combatActions.castSpell(spell(1), 1);
		expect(test.cast).toHaveBeenCalledWith(
			test.deps.getContext().session,
			'campaign-a',
			1,
			1,
			undefined
		);
		expect(test.controller.state.sheetsByActor['actor-a']?.spellSlots[0].current).toBe(0);
		expect(test.chat).toHaveBeenCalledOnce();
	});

	it('publishes spell display to chat for both roles and presentation only for the GM', async () => {
		const player = setup();
		await player.controller.combatActions.presentSpell(spell(0));
		expect(player.display).toHaveBeenCalledOnce();
		expect(player.chat).toHaveBeenCalledOnce();
		expect(player.presentation).not.toHaveBeenCalled();

		const gm = setup({ isGM: true, selectedToken: token(2, 'other-actor', false) });
		await gm.controller.combatActions.presentSpell(spell(0));
		expect(gm.display).toHaveBeenCalledOnce();
		expect(gm.chat).toHaveBeenCalledOnce();
		expect(gm.presentation).toHaveBeenCalledOnce();
		expect(gm.deps.combat.publishPresentationUpdated).toHaveBeenCalledOnce();
	});

	it('ignores a sheet load when the selected token changes before the response resolves', async () => {
		const request = deferred<{
			id: string;
			campaignId: string;
			ownerId: string;
			sheet: CharacterSheet;
		}>();
		const test = setup({ isGM: true, selectedToken: token(1, 'actor-a', false) });
		vi.mocked(test.deps.getCharacterForGM).mockReturnValueOnce(request.promise);
		const pending = test.controller.loadSelectedCharacter();
		test.select(token(2, 'actor-b', true));
		request.resolve({ id: 'actor-a', campaignId: 'campaign-a', ownerId: 'user-a', sheet: sheet() });
		await pending;
		expect(test.controller.state.sheetsByActor['actor-a']).toBeUndefined();
		expect(test.updateCharacters).not.toHaveBeenCalled();
	});

	it('does not let a pending spell action publish or mutate after selection changes', async () => {
		const test = setup();
		await test.controller.loadSelectedCharacter();
		const request = deferred<Awaited<ReturnType<typeof test.cast>>>();
		test.cast.mockReturnValueOnce(request.promise);
		const action = test.controller.combatActions.castSpell(spell(1), 1);
		test.select(token(2, 'actor-b', true));
		request.resolve({
			eventId: 42,
			sheet: sheet(),
			spellName: 'Magia antiga',
			baseLevel: 1,
			slotLevel: 1,
			effect: 'efeito'
		});
		await action;
		expect(test.controller.state.sheetsByActor['actor-a']?.spells[0].name).not.toBe('Magia antiga');
		expect(test.chat).not.toHaveBeenCalled();
	});

	it('applies signed PV input through the canonical parser and ignores it for third-party players', async () => {
		const test = setup();
		test.controller.setHitPointsFromInput('-10');
		await vi.waitFor(() =>
			expect(test.deps.updateHitPoints).toHaveBeenCalledWith('token-1', { delta: -10 })
		);
		expect(test.updateCharacters).toHaveBeenCalledOnce();

		const denied = setup({ selectedToken: token(2, 'other-actor', false) });
		await denied.controller.saveHitPoints({ delta: -10 });
		expect(denied.deps.updateHitPoints).not.toHaveBeenCalled();
	});
});
