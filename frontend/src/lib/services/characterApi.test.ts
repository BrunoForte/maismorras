import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	castMySpell,
	createEmptySheet,
	getMyCharacter,
	saveMyCharacter,
	setCharacterInitiativeAdvantage
} from './characterApi';

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
		expect(sheet.money).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
		expect(sheet.featSpellGrants).toEqual([]);
		expect(sheet.initiativeAdvantage).toBe(false);
	});

	it('normalizes old characters without money and preserves saved D&D denominations', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'actor-1',
					campaignId: 'campaign-1',
					ownerId: 'player-1',
					sheet: { ...createEmptySheet(), money: { cp: 7, gp: 12 }, featSpellGrants: [] }
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		const character = await getMyCharacter(session, 'campaign-1');
		expect(character.sheet.money).toEqual({ cp: 7, sp: 0, ep: 0, gp: 12, pp: 0 });
		expect(character.sheet.inventory).toEqual([]);
	});

	it('normalizes legacy attack damage bonus to zero and preserves independent values', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: 'actor-1',
					campaignId: 'campaign-1',
					ownerId: 'player-1',
					sheet: {
						...createEmptySheet(),
						attacks: [
							{ name: 'Ataque antigo', attackBonus: 4, damage: '1d6+2', notes: '' },
							{
								name: 'Ataque novo',
								attackBonus: 1,
								damageBonus: 3,
								damage: '1d8',
								notes: ''
							}
						]
					}
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const character = await getMyCharacter(session, 'campaign-1');

		expect(character.sheet.attacks).toMatchObject([
			{ attackBonus: 4, damageBonus: 0 },
			{ attackBonus: 1, damageBonus: 3 }
		]);
	});

	it('persists D&D money separately from inventory when saving a sheet', async () => {
		const sheet = {
			...createEmptySheet(),
			money: { cp: 13, sp: 4, ep: 2, gp: 51, pp: 1 },
			inventory: [{ entryId: 'rope', name: 'Rope', quantity: 1, equipped: false, rules: {} }]
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ id: 'actor-1', campaignId: 'campaign-1', ownerId: 'player-1', sheet }),
					{ status: 200 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		const saved = await saveMyCharacter(session, 'campaign-1', sheet);
		const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
		expect(String(url)).toContain('/campaigns/campaign-1/character');
		expect(init.method).toBe('PUT');
		expect(JSON.parse(String(init.body))).toMatchObject({
			money: { cp: 13, sp: 4, ep: 2, gp: 51, pp: 1 },
			inventory: [{ entryId: 'rope', name: 'Rope' }]
		});
		expect(saved.sheet.money).toEqual(sheet.money);
		expect(saved.sheet.inventory).toHaveLength(1);
	});

	it('sends a feat-grant identifier, never client usage counts, for an authorized spell cast request', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					eventId: 1,
					sheet: createEmptySheet(),
					spellName: 'Shield',
					baseLevel: 1,
					slotLevel: 0,
					effect: 'Protection',
					freeCastRemaining: 0
				}),
				{ status: 200 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		await castMySpell(session, 'campaign-1', -1, 0, {
			grantId: 'grant-1',
			entryId: 'shield',
			freeCast: true
		});
		const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
		expect(JSON.parse(String(init.body))).toEqual({
			spellIndex: -1,
			slotLevel: 0,
			grantId: 'grant-1',
			entryId: 'shield',
			freeCast: true
		});
		expect(String(init.body)).not.toContain('freeCastsRemaining');
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
