import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteSceneToken, listScenes } from './sceneApi';

const session = { access_token: 'test-token' } as never;

afterEach(() => vi.unstubAllGlobals());

describe('sceneApi request wrapper', () => {
	it('sends bearer authentication and parses scene collections', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ scenes: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(listScenes(session, 'campaign-1')).resolves.toEqual({ scenes: [] });
		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/campaigns/campaign-1/scenes'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }));
	});

	it('accepts a 204 response for destructive operations', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
		await expect(deleteSceneToken(session, 'scene-1', 'token-1')).resolves.toBeUndefined();
	});
});
