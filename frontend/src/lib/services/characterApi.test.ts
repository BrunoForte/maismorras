import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptySheet, setCharacterInitiativeAdvantage } from './characterApi';

const session = { access_token: 'test-token' } as never;

afterEach(() => vi.unstubAllGlobals());

describe('createEmptySheet', () => {
	it('creates a valid level-one D&D sheet with safe defaults', () => {
		const sheet = createEmptySheet();
		expect(sheet.level).toBe(1);
		expect(sheet.proficiencyBonus).toBe(2);
		expect(sheet.hitPointsCurrent).toBe(sheet.hitPointsMax);
		expect(sheet.abilityScores).toEqual({
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10
		});
		expect(sheet.inventory).toEqual([]);
		expect(sheet.resources).toEqual([]);
		expect(sheet.initiativeAdvantage).toBe(false);
	});

	it('persists the one-use initiative advantage through the authenticated API', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ enabled: true }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			setCharacterInitiativeAdvantage(session, 'campaign-1', 'actor-1', true)
		).resolves.toEqual({ enabled: true });
		const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
		expect(String(url)).toContain('/campaigns/campaign-1/characters/actor-1/initiative-advantage');
		expect(init.method).toBe('PATCH');
		expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
	});
});
