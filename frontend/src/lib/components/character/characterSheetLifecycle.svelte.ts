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

export type CharacterSheetLifecycleDependencies = {
	campaignId: string;
	sceneId: string;
	characterId: string | null;
	isGM: boolean;
	session: Session;
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
	connectPresentationSocket: (onAdvantageUpdated: () => void) => SceneSocket;
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
	onTokenCreated: () => void;
	refreshPortraitPreview: () => Promise<void>;
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

	function clearTokenSyncTimer() {
		if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
		tokenSyncTimer = undefined;
	}

	function finishSavingOperation(savedRevision: number) {
		state.saving = false;
		if (disposed || (!saveQueued && editRevision === savedRevision)) return;
		saveQueued = false;
		clearTokenSyncTimer();
		tokenSyncTimer = setTimeout(() => {
			tokenSyncTimer = undefined;
			void save();
		}, 0);
	}

	async function persist(sheet: CharacterSheet) {
		return deps.characterId
			? deps.saveCharacterForGM(deps.session, deps.campaignId, deps.characterId, sheet)
			: deps.saveMyCharacter(deps.session, deps.campaignId, sheet);
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
		try {
			// Armor class is derived from authoritative sheet data, never a manual override.
			const sheet = deps.getSheet();
			sheet.armorClass = deps.calculateArmorClass();
			const snapshot = JSON.parse(JSON.stringify(sheet)) as CharacterSheet;
			const savedCharacter = await persist(snapshot);
			if (disposed) return;
			state.resolvedCharacterId = savedCharacter.id;
			// A stale response must not discard edits performed while the save was in flight.
			if (editRevision === savedRevision) deps.setSheet(savedCharacter.sheet);
			state.isNewCharacter = false;
			state.message = 'Ficha salva.';
			deps.onTokenCreated();
		} catch (error) {
			if (!disposed)
				state.message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
		} finally {
			if (!disposed) finishSavingOperation(savedRevision);
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

	function beginExternalSaving(): number | null {
		if (disposed || state.saving) return null;
		state.saving = true;
		return editRevision;
	}

	function finishExternalSaving(savedRevision: number) {
		if (!disposed) finishSavingOperation(savedRevision);
	}

	function isRevisionCurrent(revision: number) {
		return editRevision === revision;
	}

	async function createBoardToken() {
		if (!deps.isGM) return;
		if (!deps.sceneId) {
			state.message = 'O narrador ainda não criou uma cena para vincular o personagem.';
			return;
		}
		state.saving = true;
		state.message = '';
		try {
			const sheet = deps.getSheet();
			sheet.armorClass = deps.calculateArmorClass();
			const character = await persist(sheet);
			if (disposed) return;
			deps.setSheet(character.sheet);
			await deps.createTokenFromCharacter(deps.session, deps.sceneId, character.id);
			if (disposed) return;
			state.message = 'Token criado e vinculado à ficha.';
			deps.onTokenCreated();
		} catch (error) {
			if (!disposed)
				state.message = error instanceof Error ? error.message : 'Não foi possível criar o token.';
		} finally {
			if (!disposed) state.saving = false;
		}
	}

	async function load() {
		if (disposed) return;
		// Compendium options load in parallel with the character, as before.
		void deps
			.getCompendium(deps.session, deps.campaignId)
			.then((data) => {
				if (!disposed) deps.onCompendiumLoaded(data.sources, data.entries);
			})
			.catch(() => undefined);
		try {
			const loadedCharacter = deps.characterId
				? await deps.getCharacterForGM(deps.session, deps.campaignId, deps.characterId)
				: await deps.getMyCharacter(deps.session, deps.campaignId);
			if (disposed) return;
			state.resolvedCharacterId = loadedCharacter.id;
			deps.onCharacterLoaded(loadedCharacter);
			state.activeConditions = [];
			if (deps.sceneId) {
				const scene = await deps.loadScene(deps.session, deps.sceneId);
				if (disposed) return;
				const token = deps.characterId
					? scene.tokens.find((item) => item.actorId === deps.characterId)
					: scene.tokens.find((item) => item.isOwner);
				if (token) {
					state.initiativeTokenId = token.id;
					deps.setDiceColor(token.color);
					const effects = await deps.listSceneEffects(deps.session, deps.sceneId);
					if (!disposed)
						state.activeConditions = effects.effects
							.filter((effect) => effect.tokenId === token.id)
							.map((effect) => effect.name);
				}
			}
		} catch (error) {
			if (disposed) return;
			if (!deps.characterId && (error as Error & { status?: number }).status === 404)
				state.isNewCharacter = true;
			else
				state.message =
					error instanceof Error ? error.message : 'Não foi possível carregar a ficha.';
		} finally {
			if (!disposed) state.loading = false;
		}
	}

	function connect() {
		if (!deps.sceneId || disposed) return;
		presentationSocket = deps.connectPresentationSocket(() => {
			if (!state.resolvedCharacterId || disposed) return;
			void deps
				.getCharacterForGM(deps.session, deps.campaignId, state.resolvedCharacterId)
				.then((character) => {
					if (!disposed)
						deps.onInitiativeAdvantageUpdated(character.sheet.initiativeAdvantage ?? false);
				})
				.catch(() => undefined);
		});
	}

	function start() {
		connect();
		void load();
	}

	function cleanup() {
		disposed = true;
		clearTokenSyncTimer();
		presentationSocket?.close();
		presentationSocket = null;
	}

	return {
		state,
		start,
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
