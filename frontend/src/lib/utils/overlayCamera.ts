import type { PersistedToken } from '$lib/services/sceneApi';

export type OverlayCameraLink = {
	characterId?: string;
	characterName: string;
	playerName: string;
};

export function findCameraCharacterToken(
	camera: OverlayCameraLink,
	tokens: PersistedToken[]
): PersistedToken | null {
	if (!camera.characterId) return null;
	return tokens.find((token) => !token.hidden && token.actorId === camera.characterId) ?? null;
}

export function cameraCharacterLabel(
	camera: OverlayCameraLink,
	token: PersistedToken | null,
	fallback: string
): string {
	return token?.name || camera.characterName || camera.playerName || fallback;
}

export function cameraHPPercent(token: PersistedToken): number {
	if (token.hpMax <= 0) return 0;
	return Math.max(0, Math.min(100, (token.hpCurrent / token.hpMax) * 100));
}
