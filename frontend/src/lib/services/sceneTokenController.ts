import type { Session } from '@supabase/supabase-js';
import type { Personagem } from '$lib/stores/gameStore';
import {
	createToken,
	deleteSceneToken,
	moveToken,
	updateToken,
	updateTokenAppearance,
	type PersistedToken
} from './sceneApi';

export type TokenUpdateSignal = { tokenId: string; deleted?: boolean };
type NewPersistedToken = Omit<PersistedToken, 'id' | 'actorId' | 'isOwner'>;

export function toPersistedToken(personagem: Personagem): NewPersistedToken {
	return {
		name: personagem.nome,
		imageUrl: personagem.fotoUrl ?? null,
		color: personagem.cor,
		x: personagem.x,
		y: personagem.y,
		size: personagem.tamanho,
		hpCurrent: personagem.hpAtual,
		hpMax: personagem.hpMax,
		armorClass: personagem.ca,
		initiative: personagem.iniciativa,
		visionRange: personagem.visionRange,
		lightRange: personagem.lightRange,
		statuses: personagem.status ?? [],
		hidden: personagem.hidden ?? false,
		visibility: {
			...personagem.visibility,
			imageScale: personagem.fotoEscala,
			imageOffsetX: personagem.fotoOffsetX,
			imageOffsetY: personagem.fotoOffsetY
		}
	};
}

type SceneTokenControllerOptions = {
	session: () => Session;
	sceneId: () => string;
	isGM: () => boolean;
	publish: (signal: TokenUpdateSignal) => void;
};

/** Owns scene-token API writes and deduplicates persistence from reactive stores. */
export class SceneTokenController {
	private readonly pendingCreates = new Set<number>();
	private readonly savedSnapshots = new Map<string, string>();

	constructor(private readonly options: SceneTokenControllerOptions) {}

	shouldPersist(personagem: Personagem): boolean {
		if (!this.options.isGM() || !personagem.persistedId) return false;
		return (
			this.savedSnapshots.get(personagem.persistedId) !==
			JSON.stringify(toPersistedToken(personagem))
		);
	}

	beginCreate(localId: number): boolean {
		if (this.pendingCreates.has(localId)) return false;
		this.pendingCreates.add(localId);
		return true;
	}

	finishCreate(localId: number): void {
		this.pendingCreates.delete(localId);
	}

	remember(personagem: Personagem): void {
		if (!personagem.persistedId) return;
		this.savedSnapshots.set(personagem.persistedId, JSON.stringify(toPersistedToken(personagem)));
	}

	forget(tokenId: string): void {
		this.savedSnapshots.delete(tokenId);
	}

	clearSnapshots(): void {
		this.savedSnapshots.clear();
	}

	async create(personagem: Personagem): Promise<PersistedToken> {
		return createToken(
			this.options.session(),
			this.options.sceneId(),
			toPersistedToken(personagem)
		);
	}

	async save(personagem: Personagem): Promise<void> {
		if (!personagem.persistedId) throw new Error('Token ainda não foi persistido.');
		if (!this.options.isGM()) {
			if (!personagem.isOwned) throw new Error('Você não pode editar este token.');
			await updateTokenAppearance(
				this.options.session(),
				this.options.sceneId(),
				personagem.persistedId,
				personagem.fotoUrl ?? null,
				personagem.cor,
				{
					...personagem.visibility,
					imageScale: personagem.fotoEscala,
					imageOffsetX: personagem.fotoOffsetX,
					imageOffsetY: personagem.fotoOffsetY
				}
			);
		} else {
			await updateToken(this.options.session(), this.options.sceneId(), {
				id: personagem.persistedId,
				...toPersistedToken(personagem)
			});
			this.remember(personagem);
		}
		this.options.publish({ tokenId: personagem.persistedId });
	}

	async move(personagem: Personagem, x: number, y: number): Promise<void> {
		if (!personagem.persistedId) throw new Error('Token ainda não foi persistido.');
		await moveToken(this.options.session(), this.options.sceneId(), personagem.persistedId, x, y);
		this.options.publish({ tokenId: personagem.persistedId });
	}

	async remove(tokenId: string): Promise<void> {
		await deleteSceneToken(this.options.session(), this.options.sceneId(), tokenId);
		this.forget(tokenId);
		this.options.publish({ tokenId, deleted: true });
	}
}
