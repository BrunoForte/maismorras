import type { Session } from '@supabase/supabase-js';
import type { Character, CharacterSheet } from '$lib/services/characterApi';
import type { CompendiumEntry, CompendiumSource } from '$lib/services/compendiumApi';
import type { PersistedToken, SceneEffect } from '$lib/services/sceneApi';
import type { SceneSocket } from '$lib/services/sceneRealtime';

export type CharacterSheetLifecycleState = {
	loading: boolean;
	saving: boolean;
	message: string;
	isNewCharacter: boolean;
	activeConditions: string[];
	initiativeTokenId: string | null;
	resolvedCharacterId: string | null;
};

export type CharacterSheetLifecycleContext = {
	campaignId: string;
	sceneId: string;
	characterId: string | null;
	isGM: boolean;
	session: Session;
	onTokenCreated: () => void;
};

export type CharacterSheetSaveOperation = { revision: number; generation: number };

export type CharacterSheetLifecycleDependencies = {
	getContext: () => CharacterSheetLifecycleContext;
	onContextChanged: () => void;
	getSheet: () => CharacterSheet;
	setSheet: (sheet: CharacterSheet) => void;
	calculateArmorClass: () => number;
	getCompendium: (
		session: Session,
		campaignId: string
	) => Promise<{ sources: CompendiumSource[]; entries: CompendiumEntry[] }>;
	onCompendiumLoaded: (sources: CompendiumSource[], entries: CompendiumEntry[]) => void;
	getCharacterForGM: (
		session: Session,
		campaignId: string,
		characterId: string
	) => Promise<Character>;
	getMyCharacter: (session: Session, campaignId: string) => Promise<Character>;
	onCharacterLoaded: (character: Character) => void;
	loadScene: (session: Session, sceneId: string) => Promise<{ tokens: PersistedToken[] }>;
	listSceneEffects: (session: Session, sceneId: string) => Promise<{ effects: SceneEffect[] }>;
	setDiceColor: (color: number) => void;
	connectPresentationSocket: (
		session: Session,
		sceneId: string,
		onAdvantageUpdated: () => void
	) => SceneSocket;
	saveCharacterForGM: (
		session: Session,
		campaignId: string,
		characterId: string,
		sheet: CharacterSheet
	) => Promise<Character>;
	saveMyCharacter: (
		session: Session,
		campaignId: string,
		sheet: CharacterSheet
	) => Promise<Character>;
	createTokenFromCharacter: (
		session: Session,
		sceneId: string,
		characterId: string
	) => Promise<unknown>;
	onInitiativeAdvantageUpdated: (enabled: boolean) => void;
};

/** Owns one mounted sheet's remote lifecycle, save queue and scene socket. */
export function createCharacterSheetLifecycle(deps: CharacterSheetLifecycleDependencies) {
	const state = $state<CharacterSheetLifecycleState>({
		loading: true,
		saving: false,
		message: '',
		isNewCharacter: false,
		activeConditions: [],
		initiativeTokenId: null,
		resolvedCharacterId: null
	});
	let editRevision = 0;
	let saveQueued = false;
	let tokenSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let presentationSocket: SceneSocket | null = null;
	let disposed = false;
	let started = false;
	let contextGeneration = 0;
	let sceneGeneration = 0;
	let socketGeneration = 0;
	let activeContext: CharacterSheetLifecycleContext | null = null;

	function readContext() {
		return deps.getContext();
	}

	function sameSheetContext(
		left: CharacterSheetLifecycleContext,
		right: CharacterSheetLifecycleContext
	) {
		return (
			left.campaignId === right.campaignId &&
			left.characterId === right.characterId &&
			left.isGM === right.isGM &&
			left.session.user.id === right.session.user.id
		);
	}

	function isCurrent(generation: number) {
		return !disposed && contextGeneration === generation;
	}

	function clearTokenSyncTimer() {
		if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
		tokenSyncTimer = undefined;
	}

	function finishSavingOperation(savedRevision: number, generation: number) {
		if (!isCurrent(generation)) return;
		state.saving = false;
		if (disposed || (!saveQueued && editRevision === savedRevision)) return;
		saveQueued = false;
		clearTokenSyncTimer();
		tokenSyncTimer = setTimeout(() => {
			tokenSyncTimer = undefined;
			if (isCurrent(generation)) void save();
		}, 0);
	}

	async function persist(sheet: CharacterSheet, context = readContext()) {
		return context.characterId
			? deps.saveCharacterForGM(context.session, context.campaignId, context.characterId, sheet)
			: deps.saveMyCharacter(context.session, context.campaignId, sheet);
	}

	async function save() {
		if (disposed) return;
		if (state.saving) {
			saveQueued = true;
			return;
		}
		state.saving = true;
		state.message = '';
		const savedRevision = editRevision;
		const generation = contextGeneration;
		try {
			// Armor class is derived from authoritative sheet data, never a manual override.
			const sheet = deps.getSheet();
			sheet.armorClass = deps.calculateArmorClass();
			const snapshot = JSON.parse(JSON.stringify(sheet)) as CharacterSheet;
			const savedCharacter = await persist(snapshot);
			if (!isCurrent(generation)) return;
			state.resolvedCharacterId = savedCharacter.id;
			// A stale response must not discard edits performed while the save was in flight.
			if (editRevision === savedRevision) deps.setSheet(savedCharacter.sheet);
			state.isNewCharacter = false;
			state.message = 'Ficha salva.';
			readContext().onTokenCreated();
		} catch (error) {
			if (isCurrent(generation))
				state.message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
		} finally {
			finishSavingOperation(savedRevision, generation);
		}
	}

	function syncTokenSoon() {
		if (disposed) return;
		editRevision += 1;
		clearTokenSyncTimer();
		tokenSyncTimer = setTimeout(() => {
			tokenSyncTimer = undefined;
			if (state.saving) saveQueued = true;
			else void save();
		}, 450);
	}

	function beginExternalSaving(): CharacterSheetSaveOperation | null {
		if (disposed || state.saving) return null;
		state.saving = true;
		return { revision: editRevision, generation: contextGeneration };
	}

	function finishExternalSaving(operation: CharacterSheetSaveOperation) {
		finishSavingOperation(operation.revision, operation.generation);
	}

	function isRevisionCurrent(operation: CharacterSheetSaveOperation) {
		return operation.generation === contextGeneration && editRevision === operation.revision;
	}

	async function createBoardToken() {
		const context = readContext();
		const generation = contextGeneration;
		if (!context.isGM) return;
		if (!context.sceneId) {
			state.message = 'O narrador ainda não criou uma cena para vincular o personagem.';
			return;
		}
		state.saving = true;
		state.message = '';
		try {
			const sheet = deps.getSheet();
			sheet.armorClass = deps.calculateArmorClass();
			const character = await persist(sheet, context);
			if (!isCurrent(generation)) return;
			deps.setSheet(character.sheet);
			await deps.createTokenFromCharacter(context.session, context.sceneId, character.id);
			if (!isCurrent(generation)) return;
			state.message = 'Token criado e vinculado à ficha.';
			readContext().onTokenCreated();
		} catch (error) {
			if (isCurrent(generation))
				state.message = error instanceof Error ? error.message : 'Não foi possível criar o token.';
		} finally {
			if (isCurrent(generation)) state.saving = false;
		}
	}

	async function load(generation: number) {
		if (!isCurrent(generation)) return;
		const context = readContext();
		const sceneVersion = sceneGeneration;
		// Compendium options load in parallel with the character, as before.
		void deps
			.getCompendium(context.session, context.campaignId)
			.then((data) => {
				if (isCurrent(generation)) deps.onCompendiumLoaded(data.sources, data.entries);
			})
			.catch(() => undefined);
		try {
			const loadedCharacter = context.characterId
				? await deps.getCharacterForGM(context.session, context.campaignId, context.characterId)
				: await deps.getMyCharacter(context.session, context.campaignId);
			if (!isCurrent(generation)) return;
			state.resolvedCharacterId = loadedCharacter.id;
			deps.onCharacterLoaded(loadedCharacter);
			state.activeConditions = [];
			if (context.sceneId && sceneVersion === sceneGeneration) {
				const scene = await deps.loadScene(context.session, context.sceneId);
				if (!isCurrent(generation) || sceneVersion !== sceneGeneration) return;
				const token = context.characterId
					? scene.tokens.find((item) => item.actorId === context.characterId)
					: scene.tokens.find((item) => item.isOwner);
				if (token) {
					state.initiativeTokenId = token.id;
					deps.setDiceColor(token.color);
					const effects = await deps.listSceneEffects(context.session, context.sceneId);
					if (isCurrent(generation) && sceneVersion === sceneGeneration)
						state.activeConditions = effects.effects
							.filter((effect) => effect.tokenId === token.id)
							.map((effect) => effect.name);
				}
			}
		} catch (error) {
			if (!isCurrent(generation)) return;
			if (!context.characterId && (error as Error & { status?: number }).status === 404)
				state.isNewCharacter = true;
			else
				state.message =
					error instanceof Error ? error.message : 'Não foi possível carregar a ficha.';
		} finally {
			if (isCurrent(generation)) state.loading = false;
		}
	}

	function connect(context: CharacterSheetLifecycleContext, generation: number) {
		if (!context.sceneId || !isCurrent(generation)) return;
		const socketVersion = ++socketGeneration;
		presentationSocket = deps.connectPresentationSocket(context.session, context.sceneId, () => {
			if (
				!state.resolvedCharacterId ||
				!isCurrent(generation) ||
				socketVersion !== socketGeneration
			)
				return;
			const current = readContext();
			void deps
				.getCharacterForGM(current.session, current.campaignId, state.resolvedCharacterId)
				.then((character) => {
					if (isCurrent(generation))
						deps.onInitiativeAdvantageUpdated(character.sheet.initiativeAdvantage ?? false);
				})
				.catch(() => undefined);
		});
	}

	function restart(context: CharacterSheetLifecycleContext, notifyParent: boolean) {
		contextGeneration += 1;
		sceneGeneration += 1;
		const generation = contextGeneration;
		clearTokenSyncTimer();
		saveQueued = false;
		state.loading = true;
		state.saving = false;
		state.message = '';
		state.isNewCharacter = false;
		state.activeConditions = [];
		state.initiativeTokenId = null;
		state.resolvedCharacterId = null;
		activeContext = context;
		if (notifyParent) deps.onContextChanged();
		presentationSocket?.close();
		presentationSocket = null;
		connect(context, generation);
		void load(generation);
	}

	async function reloadScene(context: CharacterSheetLifecycleContext, generation: number) {
		const sceneVersion = ++sceneGeneration;
		state.initiativeTokenId = null;
		state.activeConditions = [];
		if (!context.sceneId) return;
		try {
			const scene = await deps.loadScene(context.session, context.sceneId);
			if (!isCurrent(generation) || sceneVersion !== sceneGeneration) return;
			const token = context.characterId
				? scene.tokens.find((item) => item.actorId === context.characterId)
				: scene.tokens.find((item) => item.isOwner);
			if (!token) return;
			state.initiativeTokenId = token.id;
			deps.setDiceColor(token.color);
			const effects = await deps.listSceneEffects(context.session, context.sceneId);
			if (isCurrent(generation) && sceneVersion === sceneGeneration)
				state.activeConditions = effects.effects
					.filter((effect) => effect.tokenId === token.id)
					.map((effect) => effect.name);
		} catch (error) {
			if (isCurrent(generation) && sceneVersion === sceneGeneration)
				state.message =
					error instanceof Error ? error.message : 'Não foi possível carregar a cena.';
		}
	}

	function start() {
		if (disposed) return;
		started = true;
		restart(readContext(), false);
	}

	function updateContext() {
		if (disposed || !started) return;
		const context = readContext();
		const previous = activeContext;
		if (!previous || !sameSheetContext(previous, context)) {
			restart(context, true);
			return;
		}
		activeContext = context;
		if (previous.sceneId !== context.sceneId) {
			presentationSocket?.close();
			presentationSocket = null;
			connect(context, contextGeneration);
			void reloadScene(context, contextGeneration);
			return;
		}
		if (previous.session.access_token !== context.session.access_token) {
			presentationSocket?.close();
			presentationSocket = null;
			connect(context, contextGeneration);
		}
	}

	function cleanup() {
		disposed = true;
		contextGeneration += 1;
		sceneGeneration += 1;
		socketGeneration += 1;
		clearTokenSyncTimer();
		presentationSocket?.close();
		presentationSocket = null;
	}

	return {
		state,
		start,
		updateContext,
		cleanup,
		save,
		syncTokenSoon,
		createBoardToken,
		beginExternalSaving,
		finishExternalSaving,
		isRevisionCurrent,
		publishChatUpdated: () => presentationSocket?.publishChatUpdated(),
		publishCombatUpdated: () => presentationSocket?.publishCombatUpdated(),
		publishPresentationUpdated: (data?: unknown) =>
			presentationSocket?.publishPresentationUpdated(data)
	};
}
