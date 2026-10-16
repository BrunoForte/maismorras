import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import type { NPC } from '$lib/services/npcApi';
import {
	challengeSortWeight,
	createFreshCreatureSheet,
	filterAndSortCreatures,
	getChallenge,
	hasAITranslation,
	hasValidMonsterStatBlock,
	isSRDMonster,
	localizedEntryLabel,
	localizedMonsterField,
	normalizeCreatureSheet,
	parseCreatureCsv,
	readMonsterRules
} from './bestiaryRules';

const entry = (name: string, challenge: string | number): CompendiumEntry => ({
	id: name,
	sourceId: 'srd',
	entryType: 'other',
	name,
	summary: 'summary',
	rules: { kind: 'monster', challenge, hpMax: 8, armorClass: 12 },
	translations: {},
	isPublished: true
});

describe('bestiaryRules', () => {
	it('normalizes incomplete sheets while preserving supplied attributes and arrays', () => {
		const traits = [{ name: 'Resistência', description: 'Fogo' }];
		const abilities = { strength: 18 } as NPC['sheet']['abilities'];
		const result = normalizeCreatureSheet({ traits, abilities, hitPointsMax: 30 } as Partial<
			NPC['sheet']
		>);
		expect(result.hitPointsMax).toBe(30);
		expect(result.traits).toBe(traits);
		expect(result.abilities.strength).toBe(18);
		expect(result.abilities.dexterity).toBe(10);
		expect(result.actions).toEqual([]);
		expect(createFreshCreatureSheet().traits).toEqual([]);
	});

	it('uses safe defaults for invalid arrays and malformed values', () => {
		const result = normalizeCreatureSheet({ traits: null, actions: {} } as unknown as Partial<
			NPC['sheet']
		>);
		expect(result.traits).toEqual([]);
		expect(result.actions).toEqual([]);
		expect(() => readMonsterRules({ rules: null } as unknown as CompendiumEntry)).not.toThrow();
		expect(readMonsterRules({ rules: null } as unknown as CompendiumEntry)).toEqual({});
	});

	it('parses CSV by trimming values and dropping empty entries', () => {
		expect(parseCreatureCsv(' fogo, , veneno ,,')).toEqual(['fogo', 'veneno']);
	});

	it('searches by localized name and sorts challenge ratings including fractions', () => {
		const creatures = [entry('Troll', '5'), entry('Goblin', '1/4'), entry('Kobold', '1/8')];
		expect(
			filterAndSortCreatures(creatures, 'go', 'name', (item) => item.name).map((item) => item.name)
		).toEqual(['Goblin']);
		expect(
			filterAndSortCreatures(creatures, '', 'challenge', (item) => item.name, getChallenge).map(
				(item) => item.name
			)
		).toEqual(['Kobold', 'Goblin', 'Troll']);
		expect(challengeSortWeight('1/2')).toBe(0.5);
		expect(challengeSortWeight('bad')).toBe(Number.MAX_SAFE_INTEGER);
	});

	it('reads challenge aliases and rejects incomplete stat blocks for placement', () => {
		const creature = {
			...entry('Ogre', 2),
			rules: { challengeRating: '2', hpMax: '59', armorClass: '11' }
		};
		expect(getChallenge(creature)).toBe('2');
		expect(hasValidMonsterStatBlock(creature)).toBe(true);
		expect(hasValidMonsterStatBlock({ ...creature, rules: { hpMax: 0, armorClass: 11 } })).toBe(
			false
		);
	});

	it('identifies SRD creatures and resolves translated display fields', () => {
		const creature = {
			...entry('Ogre', 2),
			translations: { 'pt-BR': 'Ogro', 'pt-BR.summary': 'Um ogro', 'pt-BR.summary.source': 'ai' }
		};
		expect(isSRDMonster(creature, new Set(['srd']))).toBe(true);
		expect(isSRDMonster(creature, new Set())).toBe(false);
		expect(localizedEntryLabel(creature, 'pt-BR')).toBe('Ogro');
		expect(localizedMonsterField(creature, 'summary', 'original', 'pt-BR')).toBe('Um ogro');
		expect(hasAITranslation(creature, 'pt-BR')).toBe(true);
		expect(hasAITranslation(creature, 'en')).toBe(false);
	});

	it('presents restored creature metadata in Portuguese and falls back to source text', () => {
		const creature = {
			...entry('Barbed Devil', 5),
			translations: {
				'pt-BR.rules.senses':
					'Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 18'
			}
		};
		expect(
			localizedMonsterField(
				creature,
				'rules.senses',
				'Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 18',
				'pt-BR'
			)
		).toBe('Visão no Escuro 120 ft. (não é impedida por Escuridão mágica); Percepção Passiva 18');
		expect(
			localizedMonsterField(
				creature,
				'rules.senses',
				'Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 18',
				'en'
			)
		).toBe('Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 18');
	});
});
