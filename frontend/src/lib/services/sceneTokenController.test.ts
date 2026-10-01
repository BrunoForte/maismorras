import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPersistedToken } from './sceneTokenController';
import { SceneTokenController } from './sceneTokenController';
import type { Personagem } from '$lib/stores/gameStore';

const token: Personagem = {
	id: 7,
	persistedId: 'token-id',
	isOwned: true,
	hidden: false,
	visibility: {
		showName: true,
		showHP: true,
		showAC: false,
		showStatuses: true,
		transparentBackground: true,
		imageScale: 1.2,
		imageOffsetX: -3,
		imageOffsetY: 4
	},
	nome: 'Arqueira',
	cor: 0x8844aa,
	x: 12,
	y: 18,
	hpAtual: 9,
	hpMax: 13,
	ca: 15,
	proficiencia: 2,
	atributos: { for: 10, des: 16, con: 12, int: 10, sab: 13, car: 8 },
	armas: [],
	iniciativa: 3,
	visionRange: 6,
	lightRange: 0,
	fotoUrl: 'portraits/archer.png',
	tamanho: 1,
	fotoEscala: 1.4,
	fotoOffsetX: 6,
	fotoOffsetY: -2,
	status: ['Caído']
};

describe('scene token controller mapping', () => {
	it('serializes only scene-persisted fields and uses the current image crop', () => {
		expect(toPersistedToken(token)).toEqual({
			name: 'Arqueira',
			imageUrl: 'portraits/archer.png',
			color: 0x8844aa,
			x: 12,
			y: 18,
			size: 1,
			hpCurrent: 9,
			hpMax: 13,
			armorClass: 15,
			initiative: 3,
			visionRange: 6,
			lightRange: 0,
			statuses: ['Caído'],
			hidden: false,
			visibility: {
				showName: true,
				showHP: true,
				showAC: false,
				showStatuses: true,
				transparentBackground: true,
				imageScale: 1.4,
				imageOffsetX: 6,
				imageOffsetY: -2
			}
		});
	});

	it('preserves the narrator-controlled hidden state when serializing an edited token', () => {
		expect(toPersistedToken({ ...token, hidden: true }).hidden).toBe(true);
	});

	it('does not mutate the local character while creating the request snapshot', () => {
		const before = {
			...token,
			visibility: { ...token.visibility },
			status: [...(token.status ?? [])]
		};
		toPersistedToken(token);
		expect(token).toEqual(before);
	});
});

describe('narrow hit point update', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends only the HP delta and publishes token invalidation after server success', async () => {
		const responseToken = {
			id: 'token-id',
			actorId: 'actor-id',
			isOwner: true,
			name: 'Arqueira',
			imageUrl: null,
			color: 0x8844aa,
			x: 12,
			y: 18,
			size: 1,
			hpCurrent: 8,
			hpMax: 13,
			armorClass: 15,
			initiative: 3,
			visionRange: 6,
			lightRange: 0,
			statuses: [],
			hidden: false,
			visibility: { showName: true, showHP: true, showAC: true, showStatuses: true }
		};
		let capturedRequest: [RequestInfo | URL, RequestInit | undefined] | undefined;
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			capturedRequest = [input, init];
			return new Response(JSON.stringify(responseToken), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		const publish = vi.fn();
		const session = { access_token: 'test-token', user: { id: 'user-id' } } as never;
		const controller = new SceneTokenController({
			session: () => session,
			sceneId: () => 'scene-id',
			isGM: () => false,
			publish
		});

		const result = await controller.updateHitPoints('token-id', { delta: -1 });
		const [url, init] = capturedRequest!;
		expect(String(url)).toContain('/api/v1/scenes/scene-id/tokens/token-id/hit-points');
		expect(init?.method).toBe('PATCH');
		expect(JSON.parse(String(init?.body))).toEqual({ delta: -1 });
		expect(result.hpCurrent).toBe(8);
		expect(publish).toHaveBeenCalledWith({ tokenId: 'token-id' });
	});

	it('does not publish an HP invalidation to a newly selected scene after a stale request resolves', async () => {
		let sceneId = 'scene-id';
		let resolveFetch!: (response: Response) => void;
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			void input;
			void init;
			return new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		const publish = vi.fn();
		const session = { access_token: 'test-token', user: { id: 'user-id' } } as never;
		const controller = new SceneTokenController({
			session: () => session,
			sceneId: () => sceneId,
			isGM: () => false,
			publish
		});

		const pending = controller.updateHitPoints('token-id', { delta: -1 });
		sceneId = 'new-scene';
		resolveFetch(
			new Response(
				JSON.stringify({
					id: 'token-id',
					name: 'Arqueira',
					hpCurrent: 8,
					hpMax: 13,
					visibility: { showName: true, showHP: true, showAC: true, showStatuses: true }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		await pending;
		expect(publish).not.toHaveBeenCalled();
	});
});
