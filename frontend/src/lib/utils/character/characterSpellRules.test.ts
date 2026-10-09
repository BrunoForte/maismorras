import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { Spell, SpellSlot } from '$lib/services/characterApi';
import {
	addSpellToSheet,
	availableSpellCircles,
	compatibleSpellSlots,
	defaultSpellSlot,
	deriveGrantedSpells,
	eligibleSpellEntries,
	groupSpellsByCircle,
	groupCharacterSpellsByCircle,
	localizedSpellField,
	hasActiveFeatGrantedSpells,
	hasAISpellTranslation,
	normalizeSpellName,
	removeSpellFromSheet,
	resolveSpellOrigin,
	updateSpellOnSheet,
	projectCharacterSpells
} from './characterSpellRules';

const entry = (overrides: Partial<CompendiumEntry> = {}): CompendiumEntry => ({
	id: 'fireball',
	sourceId: 'srd',
	entryType: 'spell',
	name: 'Fireball',
	summary: 'A bright streak flashes.',
	rules: { level: 3, classes: ['wizard'], damage: { dice: '8d6' } },
	translations: {},
	isPublished: true,
	...overrides
});
const spell = (overrides: Partial<Spell> = {}): Spell => ({
	name: 'Bola de Fogo',
	level: 3,
	notes: '',
	...overrides
});
const slots: SpellSlot[] = [
	{ level: 1, current: 2, max: 4 },
	{ level: 2, current: 0, max: 3 },
	{ level: 3, current: 1, max: 2 }
];

describe('character spell rules', () => {
	it('renders all first-level SRD descriptions from the UI localization key', () => {
		const packPath = resolve(process.cwd(), '../backend/internal/compendium/packs/srd_5_2_1.json');
		const pack = JSON.parse(readFileSync(packPath, 'utf8')) as {
			entries: CompendiumEntry[];
		};
		const spells = pack.entries.filter(
			(item) => item.entryType === 'spell' && item.rules?.level === 1
		);
		expect(spells).toHaveLength(57);
		for (const item of spells) {
			const description = item.translations?.['pt-BR.rules.description'];
			expect(description, `${item.name} description`).toBeTruthy();
			expect(
				localizedSpellField(
					spell({ name: item.name, level: 1 }),
					item,
					'description',
					String(item.rules?.description ?? item.summary),
					'pt-BR'
				),
				`${item.name} UI description`
			).toBe(description);
		}
	});

	it('keeps the Spells tab available for active campaign-configured feat spells', () => {
		expect(hasActiveFeatGrantedSpells([], [])).toBe(false);
		expect(
			hasActiveFeatGrantedSpells(
				[],
				[
					{
						id: 'campaign-feat:feat-id:1',
						featEntryId: 'feat-id',
						spellcastingAbilities: {},
						freeCastsRemaining: {},
						active: true
					}
				]
			)
		).toBe(true);
		expect(
			hasActiveFeatGrantedSpells(
				[],
				[
					{
						id: 'campaign-feat:feat-id:1',
						featEntryId: 'feat-id',
						spellcastingAbilities: {},
						freeCastsRemaining: {},
						active: false
					}
				]
			)
		).toBe(false);
	});

	it('projects known and unlocked circles and groups spells without losing source indexes', () => {
		const spells = [spell({ level: 0 }), spell(), spell({ name: 'Escudo', level: 1 })];
		expect(availableSpellCircles(slots, spells)).toEqual([0, 1, 2, 3]);
		expect(groupSpellsByCircle(spells, 1)).toEqual([{ spell: spells[2], index: 2 }]);
	});

	it('filters eligible entries by circle, class, and duplicate id or localized name', () => {
		const entries = [
			entry(),
			entry({ id: 'shield', name: 'Shield', rules: { level: 1, classes: ['wizard'] } }),
			entry({ id: 'healing', name: 'Healing Word', rules: { level: 1, classes: ['bard'] } }),
			entry({ id: 'feat', entryType: 'feat' })
		];
		const known = [spell({ entryId: 'fireball', name: 'Outra coisa' }), spell({ name: 'Escudo' })];
		expect(
			eligibleSpellEntries(
				entries,
				known,
				(item) => (item.name === 'Shield' ? 'Escudo' : item.name),
				'Mago',
				1
			).map(({ id }) => id)
		).toEqual([]);
		expect(
			eligibleSpellEntries(entries, [], (item) => item.name, 'Bardo', 1).map(({ id }) => id)
		).toEqual(['healing']);
		expect(
			eligibleSpellEntries(entries, [], (item) => item.name, 'Mago', 3).map(({ id }) => id)
		).toEqual(['fireball']);
	});

	it('selects only compatible slots and repairs a stale slot choice to the first valid slot', () => {
		const known = spell({ level: 1 });
		expect(compatibleSpellSlots(known, slots).map(({ level }) => level)).toEqual([1, 3]);
		expect(defaultSpellSlot(known, 0, { 0: 3 }, slots)).toBe(3);
		expect(defaultSpellSlot(known, 0, { 0: 2 }, slots)).toBe(1);
		expect(defaultSpellSlot(spell({ level: 5 }), 0, {}, slots)).toBe(5);
	});

	it('projects a feat spell once while preserving class and feat origins', () => {
		const known = spell({ entryId: 'fireball', name: 'Bola de Fogo', origin: 'class' });
		const grant = {
			id: 'grant-1',
			featId: 'magic-initiate',
			spellList: 'wizard',
			ability: 'intelligence' as const,
			cantripEntryIds: ['light'],
			firstLevelSpellEntryId: 'fireball',
			freeCastsRemaining: 1
		};
		const projection = projectCharacterSpells(
			[known],
			[grant],
			[
				entry({ rules: { level: 3, classes: ['wizard'] } }),
				entry({ id: 'light', name: 'Light', rules: { level: 0, classes: ['wizard'] } })
			]
		);
		expect(projection).toHaveLength(2);
		expect(
			projection.find(({ spell: projected }) => projected.entryId === 'fireball')
		).toMatchObject({
			index: 0,
			origins: ['class', 'feat'],
			featGrants: [{ id: grant.id, spellEntryId: 'fireball', featName: 'Magic Initiate' }]
		});
		expect(groupCharacterSpellsByCircle(projection, 0)).toHaveLength(1);
	});

	it('projects campaign-configured feat spells, merges duplicate origins and keeps mechanics separate', () => {
		const feat = entry({
			id: 'feat-initiate',
			entryType: 'feat',
			name: 'Magic Initiate',
			rules: {
				campaignOverrides: {
					featSpellGrant: {
						enabled: true,
						spells: [
							{
								spellEntryId: 'fireball',
								canUseExistingSlots: false,
								freeUses: 2,
								recovery: 'long',
								abilityOptions: ['intelligence', 'wisdom']
							}
						]
					}
				}
			}
		});
		const saved = spell({ entryId: 'fireball', level: 3, origin: 'class' });
		const grant = {
			id: 'campaign-feat:feat-initiate:1',
			featEntryId: 'feat-initiate',
			active: true,
			spellcastingAbilities: { fireball: 'wisdom' as const },
			freeCastsRemaining: { fireball: 1 }
		};
		const projection = projectCharacterSpells(
			[saved],
			[],
			[entry()],
			(item) => item.name,
			[grant],
			[feat]
		);
		expect(projection).toHaveLength(1);
		expect(projection[0]).toMatchObject({
			index: 0,
			origins: ['class', 'feat'],
			featGrants: [
				{
					id: grant.id,
					featName: 'Magic Initiate',
					spellEntryId: 'fireball',
					ability: 'wisdom',
					freeCastsRemaining: 1,
					freeUses: 2,
					canUseExistingSlots: false,
					recovery: 'long',
					campaignConfigured: true
				}
			]
		});
		expect(saved.name).toBe('Bola de Fogo');
	});

	it('projects only active curated choices as virtual spells without mutating the sheet', () => {
		const grant = {
			id: 'grant-2',
			featId: 'magic-initiate',
			spellList: 'wizard',
			ability: 'wisdom' as const,
			cantripEntryIds: ['light', 'mage-hand'],
			firstLevelSpellEntryId: 'shield',
			freeCastsRemaining: 0
		};
		const entries = [
			entry({ id: 'light', name: 'Light', rules: { level: 0 } }),
			entry({ id: 'mage-hand', name: 'Mage Hand', rules: { level: 0 } }),
			entry({ id: 'shield', name: 'Shield', rules: { level: 1 } })
		];
		const projected = projectCharacterSpells([], [grant], entries);
		expect(projected.map(({ spell: item }) => item.level)).toEqual([0, 0, 1]);
		expect(projected.every(({ index }) => index < 0)).toBe(true);
		expect(projected[0].spell.origin).toBe('feat');
		expect(projectCharacterSpells([], [{ ...grant, active: false }], entries)).toEqual([]);
	});

	it('normalizes origins and derives racial/feat grants without duplicate names', () => {
		expect(resolveSpellOrigin(spell(), { sourceType: 'racial feature' })).toBe('species');
		expect(resolveSpellOrigin(spell(), { sourceType: 'feat' })).toBe('feat');
		expect(resolveSpellOrigin(spell(), {})).toBe('class');
		const known = [spell({ entryId: 'fireball', origin: 'species' })];
		const granted = deriveGrantedSpells(
			known,
			[entry()],
			[{ origin: 'feat', text: 'Fireball talent' }],
			(item) => (item.id === 'fireball' ? 'Bola de Fogo' : item.name)
		);
		expect(granted).toHaveLength(1);
		expect(granted[0].origin).toBe('species');
		const classKnown = [spell({ entryId: 'fireball', origin: 'class' })];
		expect(
			deriveGrantedSpells(
				classKnown,
				[entry()],
				[{ origin: 'feat', text: 'Fireball talent' }],
				(item) => item.name
			)
		).toEqual([]);
	});

	it('adds known and custom spells immutably and prevents duplicates', () => {
		const previous = [spell({ name: 'Escudo', level: 1 })];
		const addedKnown = addSpellToSheet(
			previous,
			'Fireball',
			3,
			[0, 1, 2, 3],
			entry(),
			'Bola de Fogo'
		);
		expect(addedKnown).toHaveLength(2);
		expect(addedKnown[1]).toMatchObject({ entryId: 'fireball', level: 3, diceFormula: '8d6' });
		const addedCustom = addSpellToSheet(previous, 'Raio de Gelo', 0, [0], undefined, '');
		expect(addedCustom[1]).toMatchObject({
			name: 'Raio de Gelo',
			level: 0,
			scalingDicePerLevel: 0
		});
		expect(addSpellToSheet(previous, 'escudo', 1, [0, 1], undefined, '')).toHaveLength(1);
		expect(addSpellToSheet(previous, 'Inacessível', 4, [0, 1], undefined, '')).toHaveLength(1);
		expect(previous).toHaveLength(1);
	});

	it('updates and removes spells immutably and safely ignores invalid indexes and malformed rules', () => {
		const previous = [spell(), spell({ name: 'Escudo', level: 1 })];
		const changed = updateSpellOnSheet(previous, 0, { notes: 'teste' });
		expect(changed[0].notes).toBe('teste');
		expect(previous[0].notes).toBe('');
		expect(updateSpellOnSheet(previous, 20, { notes: 'x' })).toEqual(previous);
		expect(removeSpellFromSheet(previous, 0)).toEqual([previous[1]]);
		expect(
			addSpellToSheet(
				[],
				'Inválida',
				1,
				[1],
				entry({ rules: { level: 'bad', damage: [] } }),
				'Inválida'
			)[0].level
		).toBe(1);
		expect(normalizeSpellName(' Bola  de Fógo ')).toBe('bola de fogo');
	});

	it('recognizes AI translation metadata and tolerates missing compendium fields', () => {
		expect(
			hasAISpellTranslation(entry({ translations: { 'pt-BR.rules.description.source': 'ai' } }))
		).toBe(true);
		expect(hasAISpellTranslation(undefined)).toBe(false);
		expect(
			eligibleSpellEntries([entry({ rules: {} })], [], (item) => item.name, '', undefined)
		).toHaveLength(1);
	});
});
