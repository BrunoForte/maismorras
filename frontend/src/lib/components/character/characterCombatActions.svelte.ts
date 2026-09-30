import type { Session } from '@supabase/supabase-js';
import type {
	Attack,
	CharacterRest,
	CharacterSheet,
	Spell,
	SpellCast,
	SheetRoll,
	AbilityScores,
	InventoryItem
} from '$lib/services/characterApi';
import type { Mensagem } from '$lib/stores/chatStore';
import type { DiceOverlayResult } from '$lib/stores/diceOverlayStore';
import type { Presentation } from '$lib/services/presentationApi';
import type { WeaponAttackProfile } from '$lib/utils/weaponRules';
import { compatibleSpellSlots, defaultSpellSlot } from '$lib/utils/character/characterSpellRules';
import {
	defaultResourceMaximumFor,
	hitDieSidesFromNotation,
	levelHitPointGain
} from '$lib/utils/character/characterProgressionRules';
import type { CharacterSheetSaveOperation } from './characterSheetLifecycle.svelte';

export type CharacterCombatContext = {
	campaignId: string;
	sceneId: string;
	characterId: string | null;
	isGM: boolean;
	session: Session;
	locale: 'en' | 'pt-BR';
	onTokenCreated: () => void;
};

export type CharacterCombatActionState = {
	rollingWeaponAction: string | null;
	rollingAttack: number | null;
	rollingAttackAction: 'attack' | 'damage' | null;
	castingSpell: number | null;
	spellSlotChoice: Record<number, number>;
};

type DiceEvent = { id: number | string; author?: string; payload: unknown };
type InitiativeResult = {
	roll: number;
	rolls?: number[];
	advantage: boolean;
	bonus: number;
	initiative: number;
};
type WeaponRollDetails = {
	attackBonus: number;
	damageBonus: number;
	damageFormula: string;
	stableWeaponKey: string;
	profileKey: string;
	damageType: string;
	minimumDamageDie?: 3;
};

export type CharacterCombatActionDependencies = {
	getContext: () => CharacterCombatContext;
	getSheet: () => CharacterSheet;
	setSheet: (sheet: CharacterSheet) => void;
	getResolvedCharacterId: () => string | null;
	getInitiativeTokenId: () => string | null;
	getActiveConditions: () => readonly string[];
	getAttackMode: () => SheetRoll['modo'];
	isWeapon: (item: InventoryItem) => boolean;
	getWeaponRollDetails: (item: InventoryItem, profile?: WeaponAttackProfile) => WeaponRollDetails;
	getAbilityModifier: (ability: keyof AbilityScores) => number;
	getPreviousLevel: () => number;
	setPreviousLevel: (level: number) => void;
	setLevelChoiceOpen: (open: boolean) => void;
	getSpellPresentation: (spell: Spell) => { title: string; description: string };
	setMessage: (message: string) => void;
	getSaving: () => boolean;
	syncTokenSoon: () => void;
	syncProgression: () => void;
	save: () => Promise<unknown>;
	beginExternalSaving: () => CharacterSheetSaveOperation | null;
	isRevisionCurrent: (operation: CharacterSheetSaveOperation) => boolean;
	finishExternalSaving: (operation: CharacterSheetSaveOperation) => void;
	rollMyCharacter: (
		session: Session,
		campaignId: string,
		kind: 'skill' | 'save' | 'spell',
		key: string,
		mode: SheetRoll['modo']
	) => Promise<SheetRoll>;
	rollDice: (
		session: Session,
		campaignId: string,
		expression: string,
		mode?: 'advantage' | 'disadvantage',
		channel?: 'chat' | 'combat',
		minimumDamageDie?: 0 | 3
	) => Promise<DiceEvent>;
	rollTokenInitiative: (
		session: Session,
		sceneId: string,
		tokenId: string
	) => Promise<InitiativeResult>;
	setInitiativeAdvantage: (
		session: Session,
		campaignId: string,
		characterId: string,
		enabled: boolean
	) => Promise<{ enabled: boolean }>;
	restCharacter: (
		session: Session,
		campaignId: string,
		kind: CharacterRest['kind'],
		characterId?: string | null
	) => Promise<CharacterRest>;
	castMySpell: (
		session: Session,
		campaignId: string,
		spellIndex: number,
		slotLevel: number
	) => Promise<SpellCast>;
	savePresentation: (
		session: Session,
		sceneId: string,
		presentation: Presentation
	) => Promise<unknown>;
	appendChat: (message: Mensagem) => void;
	setDiceOverlay: (result: DiceOverlayResult) => void;
	beginDiceBatch: () => void;
	finishDiceBatch: () => void;
	publishChatUpdated: () => void;
	publishCombatUpdated: () => void;
	publishPresentationUpdated: (data: unknown) => void;
};

/** Owns async combat/spell effects and invalidates results from stale sheet contexts. */
export function createCharacterCombatActions(deps: CharacterCombatActionDependencies) {
	const state = $state<CharacterCombatActionState>({
		rollingWeaponAction: null,
		rollingAttack: null,
		rollingAttackAction: null,
		castingSpell: null,
		spellSlotChoice: {}
	});
	let generation = 0;
	let contextKey = keyFor(deps.getContext());
	let lastCriticalWeapon: string | null = null;
	let lastCriticalAttack: number | null = null;

	function keyFor(context: CharacterCombatContext) {
		return [
			context.campaignId,
			context.sceneId,
			context.characterId ?? '',
			context.isGM ? 'gm' : 'player',
			context.session.user.id,
			context.session.access_token
		].join('|');
	}

	function updateContext() {
		const nextKey = keyFor(deps.getContext());
		if (contextKey === nextKey) return;
		contextKey = nextKey;
		generation += 1;
		state.rollingWeaponAction = null;
		state.rollingAttack = null;
		state.rollingAttackAction = null;
		state.castingSpell = null;
		state.spellSlotChoice = {};
		lastCriticalWeapon = null;
		lastCriticalAttack = null;
	}

	function cleanup() {
		generation += 1;
		state.rollingWeaponAction = null;
		state.rollingAttack = null;
		state.rollingAttackAction = null;
		state.castingSpell = null;
	}

	function captureOperation() {
		updateContext();
		return { generation, key: contextKey };
	}

	function isCurrent(operation: { generation: number; key: string }) {
		return generation === operation.generation && keyFor(deps.getContext()) === operation.key;
	}

	function localized(
		locale: CharacterCombatContext['locale'],
		portuguese: string,
		english: string
	) {
		return locale === 'en' ? english : portuguese;
	}

	function modifierText(value: number) {
		return `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
	}

	function addChat(message: Mensagem) {
		deps.appendChat(message);
		deps.publishChatUpdated();
	}

	async function rollAuthorized(
		kind: 'skill' | 'save' | 'spell',
		key: string,
		label: string,
		mode = deps.getAttackMode()
	) {
		const operation = captureOperation();
		const context = deps.getContext();
		try {
			const result = await deps.rollMyCharacter(
				context.session,
				context.campaignId,
				kind,
				key,
				mode
			);
			if (!isCurrent(operation)) return;
			const character = deps.getSheet();
			const modeLabel =
				mode === 'advantage' ? 'Vantagem' : mode === 'disadvantage' ? 'Desvantagem' : 'Normal';
			const rollCount = Math.max(1, result.dados.length);
			deps.setDiceOverlay({
				expression: `${character.name || 'Personagem'} · ${label} · ${modeLabel}`,
				notation: `${rollCount}d20${result.modificador ? `${result.modificador >= 0 ? '+' : ''}${result.modificador}` : ''}`,
				total: result.total,
				dice: result.dados,
				nonce: String(result.eventId)
			});
			addChat({
				id: String(result.eventId),
				autor: character.name || localized(context.locale, 'Personagem', 'Character'),
				texto: `${label} · ${modeLabel} · dados [${result.dados.join(', ')}] · modificador ${modifierText(result.modificador)} · resultado ${result.total}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: {
					expressao: '1d20',
					dados: result.dados,
					modificador: result.modificador,
					total: result.total,
					mode: result.modo,
					label
				}
			});
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : `Não foi possível rolar ${label}.`
				);
		}
	}

	async function setInitiativeAdvantage(enabled: boolean) {
		const operation = captureOperation();
		const context = deps.getContext();
		const characterId = deps.getResolvedCharacterId();
		if (!characterId) {
			deps.setMessage('Salve a ficha antes de configurar a vantagem de iniciativa.');
			return;
		}
		try {
			const result = await deps.setInitiativeAdvantage(
				context.session,
				context.campaignId,
				characterId,
				enabled
			);
			if (!isCurrent(operation)) return;
			deps.getSheet().initiativeAdvantage = result.enabled;
			deps.setMessage(
				result.enabled ? 'Vantagem preparada para a próxima iniciativa.' : 'Vantagem desativada.'
			);
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error
						? error.message
						: 'Não foi possível alterar a vantagem da iniciativa.'
				);
		}
	}

	async function rollInitiative() {
		const operation = captureOperation();
		const context = deps.getContext();
		const tokenId = deps.getInitiativeTokenId();
		if (!tokenId || !context.sceneId) {
			deps.setMessage('Esta ficha ainda não está vinculada a um token na cena.');
			return;
		}
		try {
			const result = await deps.rollTokenInitiative(context.session, context.sceneId, tokenId);
			if (!isCurrent(operation)) return;
			const sheet = deps.getSheet();
			sheet.initiativeAdvantage = false;
			const dice = result.rolls ?? [result.roll];
			const label = result.advantage ? `Iniciativa · vantagem (${dice.join(' e ')})` : 'Iniciativa';
			deps.setDiceOverlay({
				expression: `${sheet.name} · ${label}`,
				notation: `${dice.length}d20${result.bonus ? `${result.bonus >= 0 ? '+' : ''}${result.bonus}` : ''}`,
				total: result.initiative,
				dice
			});
			deps.publishCombatUpdated();
			deps.setMessage(
				`${label}: ${result.roll} ${result.bonus >= 0 ? '+' : '−'} ${Math.abs(result.bonus)} = ${result.initiative}`
			);
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.'
				);
		}
	}

	async function resolveLevelHP(choice: 'keep' | 'max' | 'roll') {
		const operation = captureOperation();
		const context = deps.getContext();
		const sheet = deps.getSheet();
		const previousLevel = deps.getPreviousLevel();
		const gained = Math.max(0, sheet.level - previousLevel);
		const hitDie = hitDieSidesFromNotation(sheet.hitDice);
		const constitutionModifier = deps.getAbilityModifier('constitution');
		const rolledTotals: number[] = [];
		try {
			if (choice === 'roll') {
				for (let i = 0; i < gained; i++) {
					const event = await deps.rollDice(
						context.session,
						context.campaignId,
						`1d${hitDie}${constitutionModifier >= 0 ? '+' : ''}${constitutionModifier}`
					);
					if (!isCurrent(operation)) return;
					rolledTotals.push((event.payload as { total: number }).total);
				}
			}
			if (!isCurrent(operation)) return;
			const gainedHP = levelHitPointGain(
				choice,
				gained,
				hitDie,
				constitutionModifier,
				rolledTotals
			);
			const currentSheet = deps.getSheet();
			if (choice !== 'keep') {
				currentSheet.hitPointsMax += gainedHP;
				currentSheet.hitPointsCurrent += gainedHP;
			}
			deps.setPreviousLevel(currentSheet.level);
			deps.setLevelChoiceOpen(false);
			deps.syncProgression();
			await deps.save();
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : 'Não foi possível calcular os pontos de vida.'
				);
		}
	}

	function spendResource(index: number) {
		const resource = deps.getSheet().resources[index];
		if (!resource) return;
		resource.current = Math.max(0, resource.current - 1);
		deps.syncTokenSoon();
	}

	function setResourceMax(index: number, value: string) {
		const sheet = deps.getSheet();
		const resource = sheet.resources[index];
		if (!resource) return;
		const parsed = value.trim() === '' ? undefined : Number(value);
		if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) return;
		const automatic =
			defaultResourceMaximumFor(sheet.class, sheet.level, sheet.abilityScores, resource.id) ??
			resource.max;
		const max = parsed === undefined ? automatic : Math.min(999, Math.floor(parsed));
		sheet.resources[index] = {
			...resource,
			max,
			...(parsed === undefined ? { maxOverride: undefined } : { maxOverride: max }),
			current: Math.min(resource.current, max)
		};
		deps.syncTokenSoon();
	}

	async function rest(kind: CharacterRest['kind']) {
		if (deps.getSaving()) return;
		const operation = captureOperation();
		const context = deps.getContext();
		const savedRevision = deps.beginExternalSaving();
		if (savedRevision === null) return;
		try {
			const result = await deps.restCharacter(
				context.session,
				context.campaignId,
				kind,
				context.characterId
			);
			if (!isCurrent(operation)) return;
			let sheet = deps.getSheet();
			if (deps.isRevisionCurrent(savedRevision)) {
				deps.setSheet(result.sheet);
				sheet = result.sheet;
			} else {
				sheet.hitPointsCurrent = result.sheet.hitPointsCurrent;
				sheet.temporaryHP = result.sheet.temporaryHP;
				sheet.hitDiceSpent = result.sheet.hitDiceSpent;
				sheet.resources = result.sheet.resources;
				sheet.spellSlots = result.sheet.spellSlots;
				sheet.armorClass = result.sheet.armorClass;
				sheet.proficiencyBonus = result.sheet.proficiencyBonus;
				sheet.passivePerception = result.sheet.passivePerception;
			}
			if (kind === 'short') {
				deps.setDiceOverlay({
					expression: result.label ?? `${sheet.name || 'Personagem'} · Dado de vida`,
					notation: `${sheet.hitDice}${result.modificador ? `${result.modificador > 0 ? '+' : ''}${result.modificador}` : ''}`,
					total: result.total ?? 0,
					dice: result.dados ?? []
				});
				deps.publishChatUpdated();
			}
			deps.setMessage(
				kind === 'long'
					? 'Descanso longo aplicado: PV, recursos e espaços restaurados.'
					: 'Descanso curto aplicado: dado de vida e recursos recuperados.'
			);
			deps.getContext().onTokenCreated();
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : 'Não foi possível aplicar o descanso.'
				);
		} finally {
			deps.finishExternalSaving(savedRevision);
		}
	}

	async function rollWeapon(
		item: InventoryItem,
		action: 'attack' | 'damage',
		profile?: WeaponAttackProfile
	) {
		const operation = captureOperation();
		const context = deps.getContext();
		const sheet = deps.getSheet();
		const details = deps.getWeaponRollDetails(item, profile);
		const damageMatch = details.damageFormula.match(/^([0-9]+)d([0-9]+)(?:\s*([+-])\s*([0-9]+))?/i);
		const actionKey = `${details.stableWeaponKey}:${details.profileKey}:${action}`;
		if (!deps.isWeapon(item) || state.rollingWeaponAction) return;
		if (action === 'damage' && !damageMatch) {
			deps.setMessage(
				localized(
					context.locale,
					'Esta arma não tem uma fórmula de dano.',
					'This weapon has no damage formula.'
				)
			);
			return;
		}
		if (
			action === 'attack' &&
			deps
				.getActiveConditions()
				.some((condition) =>
					['Incapacitado', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(
						condition
					)
				)
		) {
			deps.setMessage('Esta condição impede ações e reações; o ataque não pode ser rolado.');
			return;
		}
		state.rollingWeaponAction = actionKey;
		deps.setMessage('');
		deps.beginDiceBatch();
		try {
			const attackName = `${item.name}${profile ? ` · ${profile.name}` : ''}`;
			if (action === 'attack') {
				const mode = deps.getAttackMode();
				const event = await deps.rollDice(
					context.session,
					context.campaignId,
					`1d20${details.attackBonus >= 0 ? '+' : ''}${details.attackBonus}`,
					mode === 'normal' ? undefined : mode,
					'combat'
				);
				if (!isCurrent(operation)) return;
				const result = event.payload as { expressao: string; dados: number[]; total: number };
				const critical = result.dados.includes(20);
				lastCriticalWeapon = critical ? `${details.stableWeaponKey}:${details.profileKey}` : null;
				addChat({
					id: String(event.id),
					autor: event.author ?? '',
					texto: `${attackName} · ataque${critical ? ' · CRÍTICO!' : ''}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...result,
						modificador: details.attackBonus,
						label: `${attackName} · ataque`
					}
				});
				deps.setDiceOverlay({
					expression: `${sheet.name || 'Personagem'} · ${attackName} · ataque`,
					notation: result.expressao,
					total: result.total,
					dice: result.dados,
					nonce: String(event.id)
				});
			} else {
				const baseModifier =
					damageMatch?.[3] === '-' ? -Number(damageMatch[4] ?? 0) : Number(damageMatch?.[4] ?? 0);
				const damageModifier = baseModifier + details.damageBonus;
				const isCritical =
					lastCriticalWeapon === `${details.stableWeaponKey}:${details.profileKey}`;
				const diceCount = Number(damageMatch![1]) * (isCritical ? 2 : 1);
				const event = await deps.rollDice(
					context.session,
					context.campaignId,
					`${diceCount}d${damageMatch![2]}${damageModifier ? `${damageModifier >= 0 ? '+' : ''}${damageModifier}` : ''}`,
					undefined,
					'combat',
					details.minimumDamageDie
				);
				if (!isCurrent(operation)) return;
				const damage = event.payload as {
					expressao: string;
					dados: number[];
					total: number;
					regraAplicada?: string;
					dadosOriginais?: number[];
				};
				addChat({
					id: String(event.id),
					autor: event.author ?? '',
					texto: `${attackName} · dano${isCritical ? ' crítico' : ''}${damage.regraAplicada ? ` · ${damage.regraAplicada}` : ''} (${details.damageType})`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...damage,
						modificador: damageModifier,
						label: `${attackName} · dano${isCritical ? ' crítico' : ''}`,
						regraAplicada: damage.regraAplicada,
						dadosOriginais: damage.dadosOriginais
					}
				});
				deps.setDiceOverlay({
					expression: `${sheet.name || 'Personagem'} · ${attackName} · dano${isCritical ? ' crítico' : ''}`,
					notation: damage.expressao,
					total: damage.total,
					dice: damage.dados,
					nonce: String(event.id)
				});
				if (isCritical) lastCriticalWeapon = null;
			}
			deps.setMessage(
				action === 'attack'
					? localized(context.locale, 'Ataque registrado no chat.', 'Attack registered in chat.')
					: localized(context.locale, 'Dano registrado no chat.', 'Damage registered in chat.')
			);
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error
						? error.message
						: localized(
								context.locale,
								'Não foi possível rolar a arma.',
								'Could not roll the weapon.'
							)
				);
		} finally {
			deps.finishDiceBatch();
			if (isCurrent(operation)) state.rollingWeaponAction = null;
		}
	}

	async function rollSheet(label: string, bonus: number, attackIndex: number) {
		const operation = captureOperation();
		const context = deps.getContext();
		const sheet = deps.getSheet();
		const mode = deps.getAttackMode();
		const event = await deps.rollDice(
			context.session,
			context.campaignId,
			`1d20${bonus >= 0 ? '+' : ''}${bonus}`,
			mode === 'normal' ? undefined : mode,
			'combat'
		);
		if (!isCurrent(operation)) return;
		const attack = event.payload as { dados: number[]; total: number; expressao: string };
		const critical = attack.dados[0] === 20;
		lastCriticalAttack = critical ? attackIndex : null;
		addChat({
			id: String(event.id),
			autor: sheet.name || 'Personagem',
			texto: `${label}${critical ? ' · CRÍTICO!' : ''}`,
			tipo: 'rolagem',
			canal: 'combat',
			detalhesRolagem: { ...attack, modificador: bonus, label }
		});
		deps.setDiceOverlay({
			expression: `${sheet.name || 'Personagem'} · ${label}`,
			notation: attack.expressao,
			total: attack.total,
			dice: attack.dados,
			nonce: String(event.id)
		});
	}

	async function rollSheetDamage(label: string, damage: string, attackIndex: number) {
		const match = damage.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
		if (!match) return;
		const operation = captureOperation();
		const context = deps.getContext();
		const sheet = deps.getSheet();
		const critical = lastCriticalAttack === attackIndex;
		const count = Number(match[1]) * (critical ? 2 : 1);
		const modifier = match[3] === '-' ? -Number(match[4] ?? 0) : Number(match[4] ?? 0);
		const event = await deps.rollDice(
			context.session,
			context.campaignId,
			`${count}d${match[2]}${modifier ? `${modifier >= 0 ? '+' : ''}${modifier}` : ''}`,
			undefined,
			'combat'
		);
		if (!isCurrent(operation)) return;
		const result = event.payload as { dados: number[]; total: number; expressao: string };
		addChat({
			id: String(event.id),
			autor: sheet.name || 'Personagem',
			texto: `${label} · dano${critical ? ' crítico' : ''}`,
			tipo: 'rolagem',
			canal: 'combat',
			detalhesRolagem: {
				...result,
				modificador: modifier,
				label: `${label} · dano${critical ? ' crítico' : ''}`
			}
		});
		deps.setDiceOverlay({
			expression: `${sheet.name || 'Personagem'} · ${label} · dano${critical ? ' crítico' : ''}`,
			notation: result.expressao,
			total: result.total,
			dice: result.dados,
			nonce: String(event.id)
		});
		if (critical) lastCriticalAttack = null;
	}

	async function rollCustomAttack(attack: Attack, index: number) {
		if (state.rollingAttack !== null) return;
		const operation = captureOperation();
		const context = deps.getContext();
		state.rollingAttack = index;
		state.rollingAttackAction = 'attack';
		deps.beginDiceBatch();
		try {
			await rollSheet(
				attack.name || localized(context.locale, 'Ataque', 'Attack'),
				deps.getAbilityModifier(attack.ability ?? 'strength') + attack.attackBonus,
				index
			);
		} catch {
			if (isCurrent(operation))
				deps.setMessage(
					localized(
						context.locale,
						'Não foi possível rolar o ataque.',
						'Could not roll the attack.'
					)
				);
		} finally {
			deps.finishDiceBatch();
			if (isCurrent(operation)) {
				state.rollingAttack = null;
				state.rollingAttackAction = null;
			}
		}
	}

	async function rollCustomDamage(attack: Attack, index: number) {
		if (state.rollingAttack !== null || !attack.damage.trim()) return;
		const operation = captureOperation();
		const context = deps.getContext();
		state.rollingAttack = index;
		state.rollingAttackAction = 'damage';
		deps.beginDiceBatch();
		try {
			await rollSheetDamage(
				attack.name || localized(context.locale, 'Ataque', 'Attack'),
				attack.damage,
				index
			);
		} catch {
			if (isCurrent(operation))
				deps.setMessage(
					localized(context.locale, 'Não foi possível rolar o dano.', 'Could not roll the damage.')
				);
		} finally {
			deps.finishDiceBatch();
			if (isCurrent(operation)) {
				state.rollingAttack = null;
				state.rollingAttackAction = null;
			}
		}
	}

	async function rollSpellDamage(spell: Spell) {
		const expression = spell.diceFormula?.trim();
		if (!expression) return;
		const operation = captureOperation();
		const context = deps.getContext();
		deps.beginDiceBatch();
		try {
			const event = await deps.rollDice(
				context.session,
				context.campaignId,
				expression,
				undefined,
				'combat'
			);
			if (!isCurrent(operation)) return;
			const result = event.payload as {
				expressao: string;
				dados: number[];
				modificador?: number;
				total: number;
			};
			addChat({
				id: String(event.id),
				autor: event.author ?? '',
				texto: `${spell.name} · ${result.expressao} = ${result.total}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: {
					expressao: result.expressao,
					dados: result.dados,
					modificador: result.modificador ?? 0,
					total: result.total,
					label: `${spell.name} · efeito`
				}
			});
			deps.setDiceOverlay({
				expression: `${deps.getSheet().name || 'Personagem'} · ${spell.name}`,
				notation: result.expressao,
				total: result.total,
				dice: result.dados,
				nonce: String(event.id)
			});
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(error instanceof Error ? error.message : 'Não foi possível rolar a magia.');
		} finally {
			deps.finishDiceBatch();
		}
	}

	async function presentSpell(spell: Spell) {
		const operation = captureOperation();
		const context = deps.getContext();
		if (!context.isGM || !context.sceneId) return;
		const details = deps.getSpellPresentation(spell);
		const presentation = {
			assetPath: '',
			title: details.title,
			description: details.description || spell.notes,
			visible: true,
			visibleUserIds: [],
			audienceRestricted: false,
			overlayVisible: false
		};
		try {
			await deps.savePresentation(context.session, context.sceneId, presentation);
			if (!isCurrent(operation)) return;
			deps.publishPresentationUpdated({ presentation });
			deps.setMessage('Magia destacada para a mesa.');
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : 'Não foi possível destacar a magia.'
				);
		}
	}

	function compatibleSlots(spell: Spell) {
		return compatibleSpellSlots(spell, deps.getSheet().spellSlots);
	}

	function selectedSlot(spell: Spell, index: number) {
		return defaultSpellSlot(spell, index, state.spellSlotChoice, deps.getSheet().spellSlots);
	}

	function chooseSpellSlot(index: number, value: number) {
		state.spellSlotChoice[index] = value;
	}

	async function castSpell(spell: Spell, index: number) {
		if (state.castingSpell !== null || (spell.level > 0 && !compatibleSlots(spell).length)) return;
		const operation = captureOperation();
		const context = deps.getContext();
		state.castingSpell = index;
		try {
			const result = await deps.castMySpell(
				context.session,
				context.campaignId,
				index,
				spell.level === 0 ? 0 : selectedSlot(spell, index)
			);
			if (!isCurrent(operation)) return;
			deps.setSheet(result.sheet);
			const sheet = deps.getSheet();
			addChat({
				id: String(result.eventId),
				autor: sheet.name || 'Personagem',
				texto: `✨ ${result.spellName} · nível base ${result.baseLevel} · espaço usado ${result.slotLevel} · custo: ${result.slotLevel ? `1 espaço de nível ${result.slotLevel}` : 'nenhum'}${result.expression ? ` · rolagem: ${result.expression} = ${result.total ?? 0}` : ''} · efeito: ${result.effect}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: {
					expressao: result.expression || 'magia',
					dados: result.dados ?? [],
					modificador: result.modificador ?? 0,
					total: result.total ?? 0,
					label: result.spellName
				}
			});
			if (result.dados?.length)
				deps.setDiceOverlay({
					expression: `${sheet.name || 'Personagem'} · ${result.spellName} · ${result.expression ?? 'rolagem'}`,
					notation: result.expression,
					total: result.total ?? 0,
					dice: result.dados,
					nonce: String(result.eventId)
				});
			deps.setMessage('Magia lançada e espaço consumido.');
		} catch (error) {
			if (isCurrent(operation))
				deps.setMessage(
					error instanceof Error ? error.message : 'Não foi possível lançar a magia.'
				);
		} finally {
			if (isCurrent(operation)) state.castingSpell = null;
		}
	}

	return {
		state,
		updateContext,
		cleanup,
		rollAuthorized,
		setInitiativeAdvantage,
		rollInitiative,
		resolveLevelHP,
		spendResource,
		setResourceMax,
		rest,
		rollWeapon,
		rollCustomAttack,
		rollCustomDamage,
		rollSpellDamage,
		presentSpell,
		compatibleSlots,
		selectedSlot,
		chooseSpellSlot,
		castSpell
	};
}
