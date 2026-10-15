import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
	createEmptySheet,
	type CharacterSheet,
	type InventoryItem
} from '$lib/services/characterApi';
import type { AbilityScores } from '$lib/services/characterApi';
import type { CharacterCombatActionDependencies } from './characterCombatActions.svelte';
import { createCharacterCombatActions } from './characterCombatActions.svelte';
import { weaponAttackBonusTotal, weaponDamageBonusTotal } from '$lib/utils/weaponRules';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function setup(overrides: Partial<CharacterCombatActionDependencies> = {}) {
	let sheet = createEmptySheet();
	sheet.name = 'Heroína';
	sheet.hitDice = '1d8';
	sheet.spells = [{ name: 'Mísseis mágicos', level: 1, notes: '' }];
	sheet.spellSlots = [
		{ level: 1, current: 1, max: 1 },
		{ level: 2, current: 1, max: 1 }
	];
	let context = {
		campaignId: 'campaign-1',
		sceneId: 'scene-1',
		characterId: 'character-1',
		isGM: true,
		session: { user: { id: 'user-1' }, access_token: 'test-token' } as Session,
		locale: 'pt-BR' as const,
		onTokenCreated: vi.fn()
	};
	const setSheet = vi.fn((next: CharacterSheet) => {
		sheet = next;
	});
	const appendChat = vi.fn();
	const setDiceOverlay = vi.fn();
	const setMessage = vi.fn();
	const beginDiceBatch = vi.fn();
	const finishDiceBatch = vi.fn();
	const publishChatUpdated = vi.fn();
	const publishCombatUpdated = vi.fn();
	const publishPresentationUpdated = vi.fn();
	const savePresentation = vi.fn(async () => undefined);
	const saveSpellDisplay = vi.fn(async () => ({
		id: 'chat-1',
		autor: 'Heroína',
		texto: '✨ Heroína: Mísseis mágicos\nDescrição',
		tipo: 'texto' as const,
		canal: 'chat' as const
	}));
	const rollDice = vi.fn<CharacterCombatActionDependencies['rollDice']>(async (...args) => ({
		id: 'roll-1',
		author: 'Heroína',
		payload: { expressao: args[2], dados: [15], total: 20 }
	}));
	const castMySpell = vi.fn<CharacterCombatActionDependencies['castMySpell']>(async () => ({
		eventId: 8,
		sheet,
		spellName: 'Mísseis mágicos',
		baseLevel: 1,
		slotLevel: 2,
		effect: '4d4 + 4 de dano'
	}));
	const restCharacter = vi.fn(async () => ({
		kind: 'long' as const,
		sheet: { ...sheet, name: 'Ficha retornada' }
	}));
	const dependencies = {
		getContext: () => context,
		getSheet: () => sheet,
		getCanCastSelectedCharacter: () => true,
		getCanDisplaySelectedCharacter: () => true,
		setSheet,
		getResolvedCharacterId: () => 'character-1',
		getInitiativeTokenId: () => 'token-1',
		getActiveConditions: () => [],
		getAttackMode: () => 'normal' as const,
		isWeapon: (item: InventoryItem) => item.rules.category === 'weapon',
		getWeaponRollDetails: (item: InventoryItem) => ({
			attackBonus: 5,
			damageBonus: 2,
			damageFormula: String(item.rules.damage),
			stableWeaponKey: item.entryId,
			profileKey: 'default',
			damageType: 'cortante'
		}),
		getAbilityModifier: () => 1,
		getPreviousLevel: () => 1,
		setPreviousLevel: vi.fn(),
		setLevelChoiceOpen: vi.fn(),
		getSpellPresentation: () => ({ title: 'Mísseis mágicos', description: 'Descrição' }),
		setMessage,
		getSaving: () => false,
		syncTokenSoon: vi.fn(),
		syncProgression: vi.fn(),
		save: vi.fn(async () => undefined),
		beginExternalSaving: vi.fn(() => ({ revision: 1, generation: 1 })),
		isRevisionCurrent: () => true,
		finishExternalSaving: vi.fn(),
		rollMyCharacter: vi.fn(),
		rollDice,
		rollTokenInitiative: vi.fn(),
		setInitiativeAdvantage: vi.fn(),
		restCharacter,
		castMySpell,
		savePresentation,
		saveSpellDisplay,
		appendChat,
		setDiceOverlay,
		beginDiceBatch,
		finishDiceBatch,
		publishChatUpdated,
		publishCombatUpdated,
		publishPresentationUpdated,
		...overrides
	} as unknown as CharacterCombatActionDependencies;
	return {
		controller: createCharacterCombatActions(dependencies),
		context: (next: Partial<typeof context>) => (context = { ...context, ...next }),
		getSheet: () => sheet,
		setSheet,
		appendChat,
		setDiceOverlay,
		setMessage,
		beginDiceBatch,
		finishDiceBatch,
		publishChatUpdated,
		publishCombatUpdated,
		publishPresentationUpdated,
		savePresentation,
		saveSpellDisplay,
		rollDice: dependencies.rollDice as typeof rollDice,
		castMySpell,
		restCharacter
	};
}

const weapon: InventoryItem = {
	entryId: 'weapon-1',
	name: 'Machado de batalha',
	quantity: 1,
	equipped: true,
	rules: { category: 'weapon', damage: '1d8+3', damageType: 'cortante' }
};

afterEach(() => vi.restoreAllMocks());

describe('character combat actions', () => {
	it.each(['normal', 'advantage', 'disadvantage'] as const)(
		'passes the selected D&D d20 mode to the authoritative character roll (%s)',
		async (mode) => {
			const rollMyCharacter = vi.fn<CharacterCombatActionDependencies['rollMyCharacter']>(
				async () => ({
					eventId: 41,
					dados: mode === 'normal' ? [12] : [5, 18],
					dadoEscolhido: mode === 'disadvantage' ? 5 : mode === 'advantage' ? 18 : 12,
					modo: mode,
					modificador: 4,
					total: (mode === 'disadvantage' ? 5 : mode === 'advantage' ? 18 : 12) + 4,
					label: 'Atletismo'
				})
			);
			const test = setup({ rollMyCharacter });

			await test.controller.rollAuthorized('skill', 'Atletismo', 'Teste de Atletismo', mode);

			expect(rollMyCharacter.mock.calls[0][4]).toBe(mode);
			expect(test.setDiceOverlay.mock.calls[0][0].dice).toEqual(mode === 'normal' ? [12] : [5, 18]);
			if (mode !== 'normal') {
				expect(test.appendChat.mock.calls[0][0].texto).toContain('d20 [5, 18]');
				expect(test.appendChat.mock.calls[0][0].texto).toContain(
					mode === 'advantage' ? 'escolhido 18' : 'escolhido 5'
				);
				expect(test.appendChat.mock.calls[0][0].detalhesRolagem).toMatchObject({
					dadosOriginais: [5, 18],
					dadoEscolhido: mode === 'advantage' ? 18 : 5
				});
			}
		}
	);

	it('registra uma rolagem de arma e limpa o estado após sucesso', async () => {
		const pending = deferred<{
			id: string;
			payload: { expressao: string; dados: number[]; total: number };
		}>();
		const test = setup({ rollDice: vi.fn(() => pending.promise) });
		const action = test.controller.rollWeapon(weapon, 'attack');
		expect(test.controller.state.rollingWeaponAction).toBe('weapon-1:default:attack');
		pending.resolve({
			id: 'roll-1',
			payload: { expressao: '1d20+5', dados: [15], total: 20 }
		});
		await action;

		expect(test.controller.state.rollingWeaponAction).toBeNull();
		expect(test.beginDiceBatch).toHaveBeenCalledOnce();
		expect(test.finishDiceBatch).toHaveBeenCalledOnce();
		expect(test.appendChat).toHaveBeenCalledOnce();
		expect(test.publishChatUpdated).toHaveBeenCalledOnce();
		expect(test.setDiceOverlay).toHaveBeenCalledOnce();
		expect(test.rollDice.mock.calls[0][3]).toBeUndefined();
	});

	it('envia vantagem/desvantagem autoritativa para ataques e nunca para dano', async () => {
		for (const mode of ['advantage', 'disadvantage'] as const) {
			const test = setup({
				getAttackMode: () => mode,
				rollDice: vi.fn(async (_session, _campaign, expression, requestedMode) => {
					void requestedMode;
					return {
						id: `roll-${mode}`,
						author: 'Heroína',
						payload: {
							expressao: `${expression} (${mode}: 17/8)`,
							dados: [17],
							dadosOriginais: [17, 8],
							total: 22
						}
					};
				})
			});
			await test.controller.rollWeapon(weapon, 'attack', {
				id: 'power-strike',
				name: 'Golpe poderoso',
				description: '',
				attackAbility: 'strength',
				damage: '1d8',
				attackBonus: 1,
				damageBonus: 0,
				greatWeaponFighting: false
			});
			await test.controller.rollWeapon(weapon, 'damage');
			expect(test.rollDice.mock.calls[0][3]).toBe(mode);
			expect(test.rollDice.mock.calls[1][3]).toBeUndefined();
			expect(test.appendChat.mock.calls[0][0].texto).toContain(
				mode === 'advantage' ? 'Vantagem' : 'Desvantagem'
			);
			expect(test.appendChat.mock.calls[0][0].texto).toContain('17, 8');
			expect(test.setDiceOverlay.mock.calls[0][0].dice).toEqual([17, 8]);
		}
	});

	it('envia a fórmula-base e marca o crítico para duplicação autoritativa', async () => {
		const test = setup();
		vi.mocked(test.rollDice)
			.mockResolvedValueOnce({
				id: 'attack',
				author: 'Heroína',
				payload: { expressao: '1d20+5', dados: [20], total: 25 }
			})
			.mockResolvedValueOnce({
				id: 'damage',
				author: 'Heroína',
				payload: { expressao: '2d8+5', dados: [5, 7], total: 17 }
			})
			.mockResolvedValueOnce({
				id: 'damage-again',
				author: 'Heroína',
				payload: { expressao: '1d8+5', dados: [3], total: 8 }
			});

		await test.controller.rollWeapon(weapon, 'attack');
		await test.controller.rollWeapon(weapon, 'damage');
		await test.controller.rollWeapon(weapon, 'damage');

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+5', '1d8+5', '1d8+5']);
		expect(test.rollDice.mock.calls[1][6]).toBe(true);
		expect(test.rollDice.mock.calls[1][7]).toBe(true);
	});

	it('rola dano fixo sem dados e mantém o bônus uma vez mesmo em crítico', async () => {
		const test = setup({
			getWeaponRollDetails: () => ({
				attackBonus: 5,
				damageBonus: 4,
				damageFormula: '',
				stableWeaponKey: 'weapon-1',
				profileKey: 'default',
				damageType: 'contundente'
			}),
			rollDice: vi
				.fn()
				.mockResolvedValueOnce({
					id: 'critical-attack',
					payload: { expressao: '1d20+5', dados: [20], total: 25 }
				})
				.mockResolvedValueOnce({
					id: 'fixed-damage',
					payload: { expressao: '4', dados: [], total: 4 }
				})
		});
		const fixedWeapon = { ...weapon, rules: { ...weapon.rules, damage: '' } };

		await test.controller.rollWeapon(fixedWeapon, 'attack');
		await test.controller.rollWeapon(fixedWeapon, 'damage');

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+5', '4']);
		expect(test.rollDice.mock.calls[1][6]).toBe(true);
		expect(test.rollDice.mock.calls[1][7]).toBe(true);
		expect(test.appendChat.mock.calls[1][0].detalhesRolagem).toMatchObject({
			modificador: 4,
			dados: [],
			total: 4
		});
	});

	it('aplica o bônus de ataque somente ao ataque e mantém o modificador da fórmula de dano', async () => {
		const test = setup();
		const attack = {
			name: 'Golpe preciso',
			attackBonus: 4,
			damageBonus: 0,
			damage: '1d8+2',
			notes: '',
			ability: 'strength' as const
		};

		await test.controller.rollCustomAttack(attack, 0);
		await test.controller.rollCustomDamage(attack, 0);

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+5', '1d8+2']);
		expect(test.appendChat.mock.calls[0][0].detalhesRolagem).toMatchObject({ modificador: 5 });
		expect(test.appendChat.mock.calls[1][0].detalhesRolagem).toMatchObject({ modificador: 2 });
		expect(test.setDiceOverlay.mock.calls.map((call) => call[0].notation)).toEqual([
			'1d20+5',
			'1d8+2'
		]);
	});

	it('aplica o bônus de dano somente ao dano e mantém o ataque independente', async () => {
		const test = setup();
		const attack = {
			name: 'Golpe pesado',
			attackBonus: 0,
			damageBonus: 3,
			damage: '1d8+2',
			notes: '',
			ability: 'strength' as const
		};

		await test.controller.rollCustomAttack(attack, 0);
		await test.controller.rollCustomDamage(attack, 0);

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+1', '1d8+5']);
		expect(test.appendChat.mock.calls[1][0].detalhesRolagem).toMatchObject({ modificador: 5 });
		expect(test.setDiceOverlay.mock.calls[1][0]).toMatchObject({ notation: '1d8+5' });
	});

	it('trata danoBonus ausente em ataques antigos como zero sem reinterpretar attackBonus', async () => {
		const test = setup();
		const legacyAttack = {
			name: 'Adaga antiga',
			attackBonus: 4,
			damage: '1d4+2',
			notes: ''
		};

		await test.controller.rollCustomAttack(legacyAttack, 0);
		await test.controller.rollCustomDamage(legacyAttack, 0);

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+5', '1d4+2']);
	});

	it('soma uma vez bônus mágico, bônus de ataque e bônus de dano de arma', async () => {
		const abilityScores: AbilityScores = {
			strength: 16,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10
		};
		const profile = {
			id: 'heavy-strike',
			name: 'Golpe pesado',
			description: '',
			attackAbility: 'strength' as const,
			damage: '1d8+1',
			attackBonus: 5,
			damageBonus: 4,
			greatWeaponFighting: false
		};
		const test = setup({
			getWeaponRollDetails: (item, selectedProfile) => ({
				attackBonus:
					weaponAttackBonusTotal(item, abilityScores, 2, []) + (selectedProfile?.attackBonus ?? 0),
				damageBonus:
					weaponDamageBonusTotal(item, abilityScores, []) + (selectedProfile?.damageBonus ?? 0),
				damageFormula: selectedProfile?.damage ?? String(item.rules.damage),
				stableWeaponKey: item.entryId,
				profileKey: selectedProfile?.id ?? 'default',
				damageType: 'cortante'
			})
		});
		const magicWeapon = { ...weapon, rules: { ...weapon.rules, bonus: 2 } };

		await test.controller.rollWeapon(magicWeapon, 'attack', profile);
		await test.controller.rollWeapon(magicWeapon, 'damage', profile);

		expect(test.rollDice.mock.calls.map((call) => call[2])).toEqual(['1d20+12', '1d8+10']);
		expect(test.appendChat.mock.calls.map((call) => call[0].detalhesRolagem?.modificador)).toEqual([
			12, 10
		]);
	});

	it('conjura usando slot compatível e atualiza a ficha retornada', async () => {
		const test = setup();
		const castSheet = {
			...test.getSheet(),
			name: 'Ficha após conjuração',
			spellSlots: [
				{ level: 1, current: 1, max: 1 },
				{ level: 2, current: 0, max: 1 }
			]
		};
		vi.mocked(test.castMySpell).mockResolvedValueOnce({
			eventId: 8,
			sheet: castSheet,
			spellName: 'Mísseis mágicos',
			baseLevel: 1,
			slotLevel: 2,
			effect: '4d4 + 4 de dano'
		});
		test.controller.chooseSpellSlot(0, 2);
		await test.controller.castSpell(test.getSheet().spells[0], 0);

		expect(test.castMySpell).toHaveBeenCalledWith(expect.anything(), 'campaign-1', 0, 2, undefined);
		expect(test.setSheet).toHaveBeenCalledOnce();
		expect(test.appendChat).toHaveBeenCalledOnce();
		expect(test.getSheet().name).toBe('Ficha após conjuração');
		expect(test.getSheet().spellSlots[1].current).toBe(0);
		expect(test.appendChat.mock.calls[0][0].texto).toContain('espaço usado 2');
	});

	it('registra truque sem rolar efeitos, sem gastar espaços e invalida a apresentação da mesa', async () => {
		const test = setup();
		const spell = { name: 'Luz', level: 0, notes: '', description: 'Uma luz aparece.' };
		vi.mocked(test.castMySpell).mockResolvedValueOnce({
			eventId: 18,
			sheet: test.getSheet(),
			spellName: 'Luz',
			baseLevel: 0,
			slotLevel: 0,
			effect: '',
			chatText: '✨ Heroína conjurou Luz · truque · nenhum espaço consumido',
			presentationUpdated: true
		});

		await test.controller.castSpell(spell, 0);

		expect(test.castMySpell).toHaveBeenCalledWith(
			expect.anything(),
			'campaign-1',
			0,
			0,
			undefined,
			'scene-1'
		);
		expect(test.getSheet().spellSlots[0].current).toBe(1);
		expect(test.appendChat.mock.calls[0][0]).toMatchObject({
			tipo: 'texto',
			texto: expect.stringContaining('nenhum espaço consumido')
		});
		expect(test.setDiceOverlay).not.toHaveBeenCalled();
		expect(test.publishChatUpdated).toHaveBeenCalledOnce();
		expect(test.publishPresentationUpdated).toHaveBeenCalledWith(undefined);
	});

	it('conjura magia de talento com uso gratuito sem enviar valores de uso como autoridade', async () => {
		const test = setup();
		test.getSheet().spellSlots[0].current = 0;
		const grant = {
			grantId: 'magic-initiate-1',
			entryId: 'shield',
			freeCast: true
		};
		const returnedSheet = {
			...test.getSheet(),
			spellSlots: [{ level: 1, current: 0, max: 1 }],
			featSpellGrants: [
				{
					id: grant.grantId,
					featId: 'magic-initiate',
					spellList: 'wizard',
					ability: 'intelligence' as const,
					cantripEntryIds: ['light', 'mage-hand'],
					firstLevelSpellEntryId: 'shield',
					freeCastsRemaining: 0,
					active: true
				}
			]
		};
		vi.mocked(test.castMySpell).mockResolvedValueOnce({
			eventId: 10,
			sheet: returnedSheet,
			spellName: 'Shield',
			baseLevel: 1,
			slotLevel: 0,
			effect: 'Protection',
			spellcastingAbility: 'intelligence',
			freeCastRemaining: 0
		});

		await test.controller.castSpell(
			{ name: 'Shield', entryId: 'shield', level: 1, notes: '' },
			-1,
			grant
		);

		expect(test.castMySpell).toHaveBeenCalledWith(expect.anything(), 'campaign-1', -1, 0, grant);
		expect(test.setSheet).toHaveBeenCalledWith(returnedSheet);
		expect(test.getSheet().spellSlots[0].current).toBe(0);
		expect(test.getSheet().featSpellGrants?.[0].freeCastsRemaining).toBe(0);
		expect(test.appendChat.mock.calls[0][0].texto).toContain(
			'uso gratuito do talento · restantes 0'
		);
	});

	it.each([
		{ name: 'truque', spell: { name: 'Luz', level: 0, notes: '' } },
		{ name: 'magia com espaço', spell: { name: 'Escudo', level: 1, notes: '' } }
	])(
		'narrador não usa a rota de ficha própria para $name de personagem de terceiro',
		async ({ spell }) => {
			const test = setup({ getCanCastSelectedCharacter: () => false });
			test.context({ characterId: 'player-character', isGM: true });

			await test.controller.castSpell(spell, 0);

			expect(test.castMySpell).not.toHaveBeenCalled();
			expect(test.setMessage).toHaveBeenCalledWith(
				'Só é possível lançar magias da sua própria ficha.'
			);
			expect(test.getSheet().spellSlots[0].current).toBe(1);
		}
	);

	it('publica Exibir no chat para jogador sem controlar a apresentação da cena', async () => {
		const test = setup({
			getContext: () => ({
				campaignId: 'campaign-1',
				sceneId: 'scene-1',
				characterId: 'character-1',
				isGM: false,
				session: { user: { id: 'user-1' }, access_token: 'test-token' } as Session,
				locale: 'pt-BR' as const,
				onTokenCreated: vi.fn()
			})
		});

		await test.controller.presentSpell(test.getSheet().spells[0]);

		expect(test.saveSpellDisplay).toHaveBeenCalledWith(
			expect.anything(),
			'campaign-1',
			'Heroína',
			'Mísseis mágicos',
			'Descrição'
		);
		expect(test.appendChat).toHaveBeenCalledOnce();
		expect(test.publishPresentationUpdated).not.toHaveBeenCalled();
		expect(test.castMySpell).not.toHaveBeenCalled();
	});

	it('Exibir do narrador publica no chat e também atualiza apresentação e overlay', async () => {
		const test = setup();

		await test.controller.presentSpell(test.getSheet().spells[0]);

		expect(test.saveSpellDisplay).toHaveBeenCalledOnce();
		expect(test.appendChat).toHaveBeenCalledOnce();
		expect(test.savePresentation).toHaveBeenCalledWith(
			expect.anything(),
			'scene-1',
			expect.objectContaining({
				assetPath: '',
				title: 'Mísseis mágicos',
				description: 'Descrição',
				visible: true,
				overlayVisible: false
			})
		);
		expect(test.publishPresentationUpdated).toHaveBeenCalledOnce();
		expect(test.setMessage).toHaveBeenCalledWith(
			'Magia publicada no chat e destacada para a mesa.'
		);
	});

	it('aplica à ficha o retorno remoto de um descanso', async () => {
		const test = setup();
		await test.controller.rest('long');

		expect(test.restCharacter).toHaveBeenCalledOnce();
		expect(test.getSheet().name).toBe('Ficha retornada');
		expect(test.controller.state.rollingAttack).toBeNull();
	});

	it('limpa estado transitório e apresenta mensagem quando a rolagem falha', async () => {
		const test = setup({ rollDice: vi.fn().mockRejectedValue(new Error('Falha simulada')) });
		await test.controller.rollWeapon(weapon, 'attack');

		expect(test.controller.state.rollingWeaponAction).toBeNull();
		expect(test.finishDiceBatch).toHaveBeenCalledOnce();
		expect(test.setMessage).toHaveBeenCalledWith('Falha simulada');
	});

	it('ignora conjuração pendente após mudança de contexto', async () => {
		const pending = deferred<{
			eventId: number;
			sheet: CharacterSheet;
			spellName: string;
			baseLevel: number;
			slotLevel: number;
			effect: string;
		}>();
		const test = setup({ castMySpell: vi.fn(() => pending.promise) });
		const spell = test.getSheet().spells[0];
		const action = test.controller.castSpell(spell, 0);
		expect(test.controller.state.castingSpell).toBe(0);

		test.context({ sceneId: 'scene-2' });
		test.controller.updateContext();
		pending.resolve({
			eventId: 44,
			sheet: { ...test.getSheet(), name: 'Ficha obsoleta' },
			spellName: spell.name,
			baseLevel: 1,
			slotLevel: 2,
			effect: '4d4 + 4 de dano'
		});
		await action;

		expect(test.getSheet().name).toBe('Heroína');
		expect(test.setSheet).not.toHaveBeenCalled();
		expect(test.appendChat).not.toHaveBeenCalled();
		expect(test.publishChatUpdated).not.toHaveBeenCalled();
		expect(test.setDiceOverlay).not.toHaveBeenCalled();
		expect(test.setMessage).not.toHaveBeenCalled();
		expect(test.controller.state.castingSpell).toBeNull();
	});
});
