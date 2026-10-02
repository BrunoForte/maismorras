import type { Session } from '@supabase/supabase-js';
import {
	createEmptySheet,
	getCharacterForGM,
	getMyCharacter,
	setCharacterInitiativeAdvantage,
	type CharacterSheet
} from '$lib/services/characterApi';
import { rollTokenInitiative, type PersistedToken } from '$lib/services/sceneApi';
import type { Personagem } from '$lib/stores/gameStore';
import type { Mensagem } from '$lib/stores/chatStore';
import type { DiceOverlayResult } from '$lib/stores/diceOverlayStore';
import type { HitPointUpdate } from '$lib/utils/sceneCharacterSummary';
import { parseHitPointInput } from '$lib/utils/sceneCharacterSummary';
import { toSceneCharacter, upsertSceneCharacter } from '$lib/utils/sceneTokenState';
import {
	createCharacterCombatActions,
	type CharacterCombatActionDependencies,
	type CharacterCombatContext
} from '../character/characterCombatActions.svelte';

export type SceneCharacterSummaryContext = {
	session: Session;
	campaignId: string;
	sceneId: string;
	isGM: boolean;
	locale: 'en' | 'pt-BR';
	selectedToken: Personagem | undefined;
	selectedTokenIsNPC: boolean;
	onTokenCreated: () => void;
};

export type SceneCharacterSummaryCombatDependencies = Omit<
	CharacterCombatActionDependencies,
	| 'getContext'
	| 'getSheet'
	| 'getCanCastSelectedCharacter'
	| 'getCanDisplaySelectedCharacter'
	| 'setSheet'
	| 'getResolvedCharacterId'
	| 'getInitiativeTokenId'
	| 'getActiveConditions'
	| 'setMessage'
	| 'appendChat'
	| 'setDiceOverlay'
	| 'publishChatUpdated'
	| 'rollTokenInitiative'
	| 'setInitiativeAdvantage'
>;

export type SceneCharacterSummaryState = {
	sheetsByActor: Record<string, CharacterSheet>;
	initiativeAdvantageByActor: Record<string, boolean>;
	hitPointsUpdating: boolean;
};

export type SceneCharacterSummaryDependencies = {
	getContext: () => SceneCharacterSummaryContext;
	getCharacterForGM: typeof getCharacterForGM;
	getMyCharacter: typeof getMyCharacter;
	updateHitPoints: (tokenId: string, update: HitPointUpdate) => Promise<PersistedToken>;
	setInitiativeAdvantage: typeof setCharacterInitiativeAdvantage;
	rollInitiative: typeof rollTokenInitiative;
	updateCharacters: (update: (characters: Personagem[]) => Personagem[]) => void;
	rememberToken: (token: Personagem) => void;
	clearSelection: () => void;
	appendChat: (message: Mensagem) => void;
	setDiceOverlay: (result: DiceOverlayResult) => void;
	publishChatUpdated: () => void;
	publishRefresh: () => void;
	setMessage: (message: string) => void;
	combat: SceneCharacterSummaryCombatDependencies;
};

export type SceneCharacterSummaryOperation = {
	generation: number;
	contextKey: string;
	selectionKey: string;
};

/**
 * Owns the selected-token sheet projection and its map actions. Data access is
 * always scoped to the live selection/session; stale loads and actions cannot
 * update a different token after a structural context, session or selection change.
 */
export function createSceneCharacterSummaryController(
	dependencies: SceneCharacterSummaryDependencies
) {
	const state = $state<SceneCharacterSummaryState>({
		sheetsByActor: {},
		initiativeAdvantageByActor: {},
		hitPointsUpdating: false
	});
	let generation = 0;
	let contextKey = '';
	let sessionToken = '';
	let selectionKey = '';
	let disposed = false;

	function context(): SceneCharacterSummaryContext {
		return dependencies.getContext();
	}

	function contextIdentity(value: SceneCharacterSummaryContext) {
		return [
			value.session.user.id,
			value.campaignId,
			value.sceneId,
			value.isGM ? 'gm' : 'player'
		].join('|');
	}

	function selectionIdentity(value: SceneCharacterSummaryContext) {
		const token = value.selectedToken;
		return [
			token?.id ?? '',
			token?.persistedId ?? '',
			token?.actorId ?? '',
			token?.isOwned ? 'owned' : 'not-owned',
			value.selectedTokenIsNPC ? 'npc' : 'character'
		].join('|');
	}

	function syncContext(): void {
		if (disposed) return;
		const current = context();
		const nextContextKey = contextIdentity(current);
		const nextSessionToken = current.session.access_token;
		const nextSelectionKey = selectionIdentity(current);
		const structuralContextChanged = Boolean(contextKey && contextKey !== nextContextKey);
		const sessionTokenChanged = sessionToken !== nextSessionToken;
		if (structuralContextChanged) {
			state.sheetsByActor = {};
			state.initiativeAdvantageByActor = {};
			state.hitPointsUpdating = false;
			dependencies.clearSelection();
		}
		if (structuralContextChanged || sessionTokenChanged || selectionKey !== nextSelectionKey) {
			generation += 1;
			state.hitPointsUpdating = false;
		}
		contextKey = nextContextKey;
		sessionToken = nextSessionToken;
		selectionKey = nextSelectionKey;
		combatActions.updateContext();
	}

	function beginOperation(): SceneCharacterSummaryOperation {
		syncContext();
		return { generation, contextKey, selectionKey };
	}

	function isCurrent(operation: SceneCharacterSummaryOperation): boolean {
		syncContext();
		return (
			!disposed &&
			operation.generation === generation &&
			operation.contextKey === contextKey &&
			operation.selectionKey === selectionKey
		);
	}

	function canViewSelectedCharacter(value = context()): boolean {
		return Boolean(value.selectedToken?.actorId && (value.isGM || value.selectedToken.isOwned));
	}

	function canCastSelectedCharacter(value = context()): boolean {
		// GM lookup permission is not permission to cast through the "my sheet" API.
		return Boolean(value.selectedToken?.actorId && value.selectedToken.isOwned);
	}

	function canDisplaySelectedCharacter(value = context()): boolean {
		return canViewSelectedCharacter(value);
	}

	function selectedSheet(): CharacterSheet {
		const actorId = context().selectedToken?.actorId;
		return (actorId && state.sheetsByActor[actorId]) || createEmptySheet();
	}

	function characterCombatContext(): CharacterCombatContext {
		const current = context();
		return {
			campaignId: current.campaignId,
			sceneId: current.sceneId,
			characterId: current.selectedToken?.actorId ?? null,
			selectionKey: selectionIdentity(current),
			isGM: current.isGM,
			session: current.session,
			locale: current.locale,
			onTokenCreated: current.onTokenCreated
		};
	}

	function setSheet(next: CharacterSheet): void {
		const actorId = context().selectedToken?.actorId;
		if (actorId) state.sheetsByActor = { ...state.sheetsByActor, [actorId]: next };
	}

	const combatActions = createCharacterCombatActions({
		...dependencies.combat,
		getContext: characterCombatContext,
		getSheet: selectedSheet,
		getCanCastSelectedCharacter: canCastSelectedCharacter,
		getCanDisplaySelectedCharacter: canDisplaySelectedCharacter,
		setMessage: dependencies.setMessage,
		rollTokenInitiative: dependencies.rollInitiative,
		setInitiativeAdvantage: dependencies.setInitiativeAdvantage,
		appendChat: dependencies.appendChat,
		setDiceOverlay: dependencies.setDiceOverlay,
		publishChatUpdated: dependencies.publishChatUpdated,
		setSheet,
		getResolvedCharacterId: () => context().selectedToken?.actorId ?? null,
		getInitiativeTokenId: () => context().selectedToken?.persistedId ?? null,
		getActiveConditions: () => context().selectedToken?.status ?? []
	});

	async function loadSelectedCharacter(): Promise<void> {
		syncContext();
		const operation = beginOperation();
		const current = context();
		const token = current.selectedToken;
		const actorId = token?.actorId;
		if (
			!actorId ||
			current.selectedTokenIsNPC ||
			!canViewSelectedCharacter(current) ||
			actorId in state.initiativeAdvantageByActor
		)
			return;

		try {
			const character = current.isGM
				? await dependencies.getCharacterForGM(current.session, current.campaignId, actorId)
				: await dependencies.getMyCharacter(current.session, current.campaignId);
			if (!isCurrent(operation)) return;
			const sheet = character.sheet;
			state.sheetsByActor = { ...state.sheetsByActor, [actorId]: sheet };
			dependencies.updateCharacters((tokens) =>
				tokens.map((item) =>
					item.actorId === actorId ? { ...item, nome: sheet.name || item.nome } : item
				)
			);
			state.initiativeAdvantageByActor = {
				...state.initiativeAdvantageByActor,
				[actorId]: sheet.initiativeAdvantage ?? false
			};
		} catch {
			if (isCurrent(operation))
				state.initiativeAdvantageByActor = {
					...state.initiativeAdvantageByActor,
					[actorId]: false
				};
		}
	}

	async function saveHitPoints(update: HitPointUpdate): Promise<void> {
		const current = context();
		const selected = current.selectedToken;
		if (!selected?.persistedId || (!current.isGM && !selected.isOwned) || state.hitPointsUpdating)
			return;
		const operation = beginOperation();
		state.hitPointsUpdating = true;
		dependencies.setMessage('');
		try {
			const persisted = await dependencies.updateHitPoints(selected.persistedId, update);
			if (!isCurrent(operation)) return;
			const updated = toSceneCharacter(persisted, selected.id, selected.fotoUrl);
			dependencies.rememberToken(updated);
			dependencies.updateCharacters((items) => upsertSceneCharacter(items, updated));
		} catch (error) {
			if (isCurrent(operation))
				dependencies.setMessage(
					error instanceof Error
						? error.message
						: current.locale === 'en'
							? 'Could not update hit points.'
							: 'Não foi possível atualizar os pontos de vida.'
				);
		} finally {
			if (isCurrent(operation)) state.hitPointsUpdating = false;
		}
	}

	function changeHitPoints(delta: number): void {
		void saveHitPoints({ delta });
	}

	function setHitPointsFromInput(value: string): void {
		const update = parseHitPointInput(value);
		if (update) void saveHitPoints(update);
	}

	async function rollSelectedInitiative(): Promise<void> {
		const operation = beginOperation();
		const current = context();
		const selected = current.selectedToken;
		if (!selected?.persistedId || (!current.isGM && !selected.isOwned)) return;
		try {
			const result = await dependencies.rollInitiative(
				current.session,
				current.sceneId,
				selected.persistedId
			);
			if (!isCurrent(operation)) return;
			const actorId = selected.actorId ?? '';
			state.initiativeAdvantageByActor = {
				...state.initiativeAdvantageByActor,
				[actorId]: false
			};
			dependencies.updateCharacters((tokens) =>
				tokens.map((token) =>
					token.persistedId === result.tokenId ? { ...token, iniciativa: result.initiative } : token
				)
			);
			const rollMessageId = crypto.randomUUID();
			dependencies.setDiceOverlay({
				expression: `${selected.nome} · iniciativa${result.advantage ? ' · vantagem' : ''}`,
				notation: `${result.rolls?.length ?? 1}d20${result.bonus ? `${result.bonus >= 0 ? '+' : ''}${result.bonus}` : ''}`,
				total: result.initiative,
				dice: result.rolls?.length ? result.rolls : [result.roll],
				nonce: rollMessageId
			});
			dependencies.appendChat({
				id: rollMessageId,
				autor: selected.nome,
				texto: `Iniciativa: ${result.roll} ${result.bonus >= 0 ? '+' : ''}${result.bonus} = ${result.initiative}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: {
					expressao: `1d20${result.bonus >= 0 ? '+' : ''}${result.bonus}`,
					dados: [result.roll],
					modificador: result.bonus,
					total: result.initiative
				}
			});
			dependencies.publishChatUpdated();
			dependencies.publishRefresh();
		} catch (error) {
			if (isCurrent(operation))
				dependencies.setMessage(
					error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.'
				);
		}
	}

	async function setSelectedInitiativeAdvantage(enabled: boolean): Promise<void> {
		const operation = beginOperation();
		const current = context();
		const selected = current.selectedToken;
		const actorId = selected?.actorId;
		if (!actorId || (!current.isGM && !selected?.isOwned)) return;
		try {
			const result = await dependencies.setInitiativeAdvantage(
				current.session,
				current.campaignId,
				actorId,
				enabled
			);
			if (!isCurrent(operation)) return;
			state.initiativeAdvantageByActor = {
				...state.initiativeAdvantageByActor,
				[actorId]: result.enabled
			};
		} catch (error) {
			if (isCurrent(operation))
				dependencies.setMessage(
					error instanceof Error
						? error.message
						: 'Não foi possível atualizar a vantagem da iniciativa.'
				);
		}
	}

	function cleanup(): void {
		disposed = true;
		generation += 1;
		state.hitPointsUpdating = false;
		combatActions.cleanup();
	}

	return {
		state,
		combatActions,
		syncContext,
		loadSelectedCharacter,
		selectedSheet,
		canViewSelectedCharacter,
		canCastSelectedCharacter,
		canDisplaySelectedCharacter,
		saveHitPoints,
		changeHitPoints,
		setHitPointsFromInput,
		rollSelectedInitiative,
		setSelectedInitiativeAdvantage,
		cleanup
	};
}
