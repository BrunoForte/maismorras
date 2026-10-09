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

	it('normalizes legacy weapon damage and unified bonus once without discarding unsupported text', async () => {
		const legacySheet = {
			...createEmptySheet(),
			inventory: [
				{
					entryId: 'old',
					name: 'Machado',
					quantity: 1,
					equipped: true,
					rules: {
						category: 'weapon',
						damage: '2d6+3',
						bonus: 2,
						enchantmentBonus: 1,
						attackProfiles: [
							{ id: 'flurry', damage: '1d8+2', attackBonus: 1, damageBonus: 1 },
							{ id: 'old-heavy', damage: '11d6+3', attackBonus: 0, damageBonus: 2 }
						]
					}
				},
				{
					entryId: 'ambiguous',
					name: 'Arma especial',
					quantity: 1,
					equipped: true,
					rules: {
						category: 'weapon',
						damage: 'dano variável',
						bonus: 4,
						attackProfiles: [{ id: 'special', damage: '1d4', attackBonus: 0, damageBonus: 0 }]
					}
				},
				{
					entryId: 'longbow',
					name: 'Arco longo',
					quantity: 1,
					equipped: true,
					rules: { category: 'weapon', damage: '1d8+1d6', bonus: -1, enchantmentBonus: 2 }
				}
			]
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ id: 'a', campaignId: 'c', ownerId: 'p', sheet: legacySheet }),
					{ status: 200 }
				)
			);
		vi.stubGlobal('fetch', fetchMock);
		const normalized = await getMyCharacter(session, 'campaign-1');
		expect(normalized.sheet.inventory[0].rules).toMatchObject({
			damage: '2d6',
			attackBonus: 2,
			damageBonus: 5,
			enchantmentBonus: 1
		});
		expect(normalized.sheet.inventory[0].rules.attackProfiles).toEqual([
			{ id: 'flurry', damage: '1d8', attackBonus: 1, damageBonus: 5, damageNeedsRepair: false },
			{ id: 'old-heavy', damage: '11d6', attackBonus: 0, damageBonus: 7, damageNeedsRepair: false }
		]);
		expect(normalized.sheet.inventory[1].rules).toMatchObject({
			damage: 'dano variável',
			damageNeedsRepair: true,
			attackBonus: 4,
			damageBonus: 4,
			attackProfiles: [{ id: 'special', damage: '1d4', attackBonus: 0, damageBonus: 4 }]
		});
		expect(normalized.sheet.inventory[2].rules).toMatchObject({
			damage: '1d8+1d6',
			attackBonus: -1,
			damageBonus: -1,
			enchantmentBonus: 2
		});
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(normalized), { status: 200 }));
		const reloaded = await getMyCharacter(session, 'campaign-1');
		expect(reloaded.sheet.inventory).toEqual(normalized.sheet.inventory);
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
