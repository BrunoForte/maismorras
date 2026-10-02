import type { Session } from '@supabase/supabase-js';
import type { Personagem } from '$lib/stores/gameStore';
import { ApiError } from '$lib/services/httpClient';
import {
	campaignAssetPath,
	clearSignedAssetCache,
	getSignedAssetUrl
} from '$lib/services/assetApi';
import { getSceneToken, type PersistedToken } from '$lib/services/sceneApi';
import {
	removeSceneCharacter,
	normalizeSceneCharacters,
	toSceneCharacter,
	upsertSceneCharacter
} from '$lib/utils/sceneTokenState';
import { normalizeSceneItemsById } from '$lib/utils/sceneDeltaState';

export type SceneTokenSyncContext = {
	session: Session;
	sceneId: string;
	campaignId: string;
	workspaceCampaignId?: string;
	isGM: boolean;
};

export type SceneTokenSyncOperation = { generation: number; contextKey: string };

type CachedTokenImage = { path: string | null; url: string | null; expiresAt: number };

export type SceneTokenSyncDependencies = {
	getContext: () => SceneTokenSyncContext;
	getCharacters: () => Personagem[];
	updateCharacters: (update: (characters: Personagem[]) => Personagem[]) => void;
	getSelectedLocalId: () => number | null;
	clearSelection: () => void;
	removeEffectsForToken: (tokenId: string) => void;
	clearPersistenceError: () => void;
	setPersistenceError: (message: string) => void;
	getSceneToken: typeof getSceneToken;
	resolveSignedAsset: typeof getSignedAssetUrl;
	clearSignedAssetCache: typeof clearSignedAssetCache;
	clearSnapshots: () => void;
	rememberToken: (token: Personagem) => void;
	forgetToken: (tokenId: string) => void;
	setWarning: (message: string, error: unknown) => void;
	now?: () => number;
};

/**
 * Owns token hydration/reconciliation and its transient signed-image cache.
 * Context is always read through getters so requests cannot commit into a
 * different campaign, scene, user session, or permission state.
 */
export class SceneTokenSyncController {
	private generation = 0;
	private contextKey = '';
	private disposed = false;
	private readonly imageCache = new Map<string, CachedTokenImage>();
	private readonly imageRetries = new Map<string, number>();
	private readonly localIdByToken = new Map<string, number>();

	constructor(private readonly dependencies: SceneTokenSyncDependencies) {
		this.syncContext();
	}

	/** Call from a reactive effect when scene/session/permissions can change. */
	syncContext(): void {
		const nextKey = this.keyFor(this.dependencies.getContext());
		if (nextKey === this.contextKey) return;
		this.contextKey = nextKey;
		this.generation += 1;
		this.imageCache.clear();
		this.imageRetries.clear();
		this.localIdByToken.clear();
	}

	beginOperation(): SceneTokenSyncOperation {
		this.syncContext();
		return { generation: this.generation, contextKey: this.contextKey };
	}

	isCurrent(operation: SceneTokenSyncOperation): boolean {
		this.syncContext();
		return (
			!this.disposed &&
			operation.generation === this.generation &&
			operation.contextKey === this.contextKey
		);
	}

	async loadTokens(
		tokens: readonly PersistedToken[],
		operation = this.beginOperation()
	): Promise<boolean> {
		const context = this.dependencies.getContext();
		try {
			if (!this.isCurrent(operation)) return false;
			const currentCharacters = this.dependencies.getCharacters();
			const normalized = normalizeSceneItemsById(tokens);
			const loaded = await Promise.all(
				normalized.map(async (token) => {
					const imageUrl = await this.resolveTokenImage(context, token, operation);
					return { token, imageUrl };
				})
			);
			if (!this.isCurrent(operation)) return false;

			const usedIds = new Set(currentCharacters.map((character) => character.id));
			const characters = loaded.map(({ token, imageUrl }) => {
				const existing = currentCharacters.find((item) => item.persistedId === token.id);
				return toSceneCharacter(token, this.localIdFor(token.id, existing?.id, usedIds), imageUrl);
			});
			const normalizedCharacters = normalizeSceneCharacters(characters);
			if (!this.isCurrent(operation)) return false;
			this.dependencies.clearSnapshots();
			normalizedCharacters.forEach((character) => this.dependencies.rememberToken(character));
			this.dependencies.updateCharacters(() => normalizedCharacters);
			if (
				this.dependencies.getSelectedLocalId() !== null &&
				!normalizedCharacters.some(
					(character) => character.id === this.dependencies.getSelectedLocalId()
				)
			)
				this.dependencies.clearSelection();
			this.dependencies.clearPersistenceError();
			return true;
		} catch (error) {
			if (this.isCurrent(operation)) {
				this.dependencies.setPersistenceError(
					error instanceof Error ? error.message : 'Não foi possível carregar os tokens.'
				);
			}
			return false;
		}
	}

	async updateToken(tokenId: string | undefined): Promise<void> {
		if (!tokenId) return;
		const operation = this.beginOperation();
		const context = this.dependencies.getContext();
		try {
			const token = await this.dependencies.getSceneToken(
				context.session,
				context.sceneId,
				tokenId
			);
			if (!this.isCurrent(operation)) return;
			const imageUrl = await this.resolveTokenImage(context, token, operation);
			if (!this.isCurrent(operation)) return;
			this.dependencies.updateCharacters((characters) => {
				const existing = characters.find((item) => item.persistedId === token.id);
				const usedIds = new Set(characters.map((item) => item.id));
				const updated = toSceneCharacter(
					token,
					this.localIdFor(token.id, existing?.id, usedIds),
					imageUrl
				);
				// Record the authoritative snapshot before notifying store subscribers.
				this.dependencies.rememberToken(updated);
				return upsertSceneCharacter(characters, updated);
			});
		} catch (error) {
			if (!this.isCurrent(operation)) return;
			if (error instanceof ApiError && error.status === 404) {
				const selectedLocalId = this.dependencies.getSelectedLocalId();
				const selectedPersistedId = this.dependencies
					.getCharacters()
					.find((character) => character.id === selectedLocalId)?.persistedId;
				this.dependencies.updateCharacters((characters) =>
					removeSceneCharacter(characters, tokenId)
				);
				if (selectedPersistedId === tokenId) this.dependencies.clearSelection();
				this.imageCache.delete(tokenId);
				this.imageRetries.delete(tokenId);
				this.localIdByToken.delete(tokenId);
				this.dependencies.removeEffectsForToken(tokenId);
				this.dependencies.forgetToken(tokenId);
				return;
			}
			this.dependencies.setWarning('Não foi possível sincronizar o token recebido.', error);
		}
	}

	async refreshFailedImage(localTokenId: number): Promise<void> {
		const operation = this.beginOperation();
		const context = this.dependencies.getContext();
		const character = this.dependencies.getCharacters().find((item) => item.id === localTokenId);
		const tokenId = character?.persistedId;
		if (!character || !tokenId) return;
		const cached = this.imageCache.get(tokenId);
		if (!cached?.path) return;
		const retries = this.imageRetries.get(tokenId) ?? 0;
		if (retries >= 1) {
			this.imageCache.set(tokenId, {
				path: cached.path,
				url: null,
				expiresAt: this.now() + 5 * 60 * 1000
			});
			this.dependencies.updateCharacters((characters) =>
				characters.map((item) =>
					item.id === localTokenId ? { ...item, fotoUrl: undefined } : item
				)
			);
			return;
		}
		this.imageRetries.set(tokenId, retries + 1);
		this.dependencies.clearSignedAssetCache(context.campaignId, cached.path);
		try {
			const freshUrl = await this.dependencies.resolveSignedAsset(
				context.session,
				context.campaignId,
				cached.path
			);
			if (!this.isCurrent(operation)) return;
			this.imageCache.set(tokenId, {
				path: cached.path,
				url: freshUrl ?? null,
				expiresAt: this.now() + (freshUrl ? 45 * 60 * 1000 : 5 * 60 * 1000)
			});
			this.dependencies.updateCharacters((characters) =>
				characters.map((item) =>
					item.id === localTokenId ? { ...item, fotoUrl: freshUrl ?? undefined } : item
				)
			);
		} catch (error) {
			if (this.isCurrent(operation))
				this.dependencies.setPersistenceError(
					error instanceof Error ? error.message : 'Não foi possível atualizar a imagem do token.'
				);
		}
	}

	forgetToken(tokenId: string): void {
		this.imageCache.delete(tokenId);
		this.imageRetries.delete(tokenId);
		this.localIdByToken.delete(tokenId);
	}

	dispose(): void {
		this.disposed = true;
		this.generation += 1;
		this.imageCache.clear();
		this.imageRetries.clear();
		this.localIdByToken.clear();
	}

	private async resolveTokenImage(
		context: SceneTokenSyncContext,
		token: PersistedToken,
		operation: SceneTokenSyncOperation
	): Promise<string | undefined> {
		const path = token.imageUrl ? (campaignAssetPath(token.imageUrl) ?? token.imageUrl) : null;
		const cached = this.imageCache.get(token.id);
		if (cached?.path === path && cached.expiresAt > this.now()) return cached.url ?? undefined;
		const url = path
			? await this.dependencies.resolveSignedAsset(context.session, context.campaignId, path)
			: null;
		if (!this.isCurrent(operation)) return undefined;
		this.imageCache.set(token.id, {
			path,
			url: url ?? null,
			expiresAt: this.now() + 45 * 60 * 1000
		});
		return url ?? undefined;
	}

	private localIdFor(tokenId: string, preferred: number | undefined, used: Set<number>): number {
		const existing = this.localIdByToken.get(tokenId);
		if (existing !== undefined) return existing;
		let candidate = preferred;
		if (candidate === undefined) {
			candidate = Math.max(0, ...used) + 1;
			while (used.has(candidate)) candidate += 1;
		}
		used.add(candidate);
		this.localIdByToken.set(tokenId, candidate);
		return candidate;
	}

	private keyFor(context: SceneTokenSyncContext): string {
		return [
			context.session.user.id,
			context.session.access_token,
			context.campaignId,
			context.workspaceCampaignId ?? '',
			context.sceneId,
			context.isGM
		].join(':');
	}

	private now(): number {
		return this.dependencies.now?.() ?? Date.now();
	}
}

export function createSceneTokenSyncController(dependencies: SceneTokenSyncDependencies) {
	return new SceneTokenSyncController(dependencies);
}
