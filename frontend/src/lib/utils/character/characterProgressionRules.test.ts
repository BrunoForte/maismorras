import { describe, expect, it } from 'vitest';
import type { AbilityScores, CharacterResource, SpellSlot } from '$lib/services/characterApi';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import {
	deriveCharacterFeatures,
	expertiseChoicesForLevel,
	hitDieForClass,
	hitDieSidesFromNotation,
	levelHitPointGain,
	proficiencyBonusForLevel,
	resolveCharacterClass,
	spellcastingEnabled,
	spellSlotsForProgression,
	synchronizeProgressionResources,
	synchronizeSpellSlots
} from './characterProgressionRules';

const scores: AbilityScores = {
	strength: 10,
	dexterity: 10,
	constitution: 14,
	intelligence: 10,
	wisdom: 10,
	charisma: 10
};

const featureEntry = (
	id: string,
	entryType: string,
	name: string,
	features?: unknown[]
): CompendiumEntry => ({
	id,
	sourceId: 'source',
	entryType,
	name,
	summary: '',
	rules: features ? { features } : {},
	translations: {},
	isPublished: true
});

describe('character progression rules', () => {
	it('combines class and subclass compendium features and prefers detailed descriptions', () => {
		const derived = deriveCharacterFeatures(
			featureEntry('fighter', 'class', 'Guerreiro', [
				{
					id: 'action-surge',
					name: 'Surto de Ação',
					level: 2,
					description: 'Uma vez por descanso.'
				}
			]),
			featureEntry('champion', 'subclass', 'Champion', [
				{
					id: 'improved-critical',
					name: 'Crítico Aprimorado',
					level: 3,
					description: 'Crítico em 19.'
				}
			]),
			[],
			'fighter',
			5,
			'Champion'
		);
		expect(derived.map(({ name }) => name)).toContain('Surto de Ação');
		expect(derived.map(({ name }) => name)).toContain('Crítico Aprimorado');
		expect(derived.find(({ name }) => name === 'Surto de Ação')?.description).toBe(
			'Uma vez por descanso.'
		);
	});

	it('keeps local class fallback when a subclass entry exists but has no feature list', () => {
		const derived = deriveCharacterFeatures(
			featureEntry('fighter', 'class', 'Guerreiro'),
			featureEntry('champion', 'subclass', 'Champion', []),
			[],
			'fighter',
			2,
			'Champion'
		);
		expect(derived.map(({ name }) => name)).toContain(
			'Estilo de Luta, Segundo Fôlego e Maestria em Armas'
		);
		expect(derived.map(({ name }) => name)).toContain('Surto de Ação');
	});

	it('keeps local subclass fallback when class compendium has features but subclass does not', () => {
		const derived = deriveCharacterFeatures(
			featureEntry('fighter', 'class', 'Guerreiro', [
				{ name: 'Técnica Superior', level: 1, description: 'Descrição detalhada.' }
			]),
			featureEntry('champion', 'subclass', 'Champion'),
			[],
			'fighter',
			3,
			'Champion'
		);
		expect(derived.map(({ name }) => name)).toContain('Técnica Superior');
		expect(derived.map(({ name }) => name)).toContain('Champion');
	});

	it('deduplicates semantically with stable ids and orders by level then name', () => {
		const derived = deriveCharacterFeatures(
			featureEntry('fighter', 'class', 'Guerreiro', [
				{ id: 'first', name: 'Foco Árcano', level: 2, description: '' },
				{ id: 'duplicate', name: 'Foco Arcano', level: 2, description: 'A descrição oficial.' },
				{ id: 'higher', name: 'Alerta', level: 3, description: 'Detalhes.' },
				{ id: 'lower', name: 'Resiliência', level: 1, description: 'Detalhes.' }
			]),
			undefined,
			[],
			'fighter',
			3,
			''
		);
		const duplicate = derived.filter(({ name }) => name.toLowerCase().includes('foco arcano'));
		expect(duplicate).toHaveLength(1);
		expect(duplicate[0].description).toBe('A descrição oficial.');
		expect(new Set(derived.map(({ id }) => id)).size).toBe(derived.length);
		expect(derived).toEqual(
			[...derived].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
		);
	});

	it('normalizes localized class names and derives level-based proficiency and hit dice', () => {
		expect(resolveCharacterClass('Clérigo')).toBe('cleric');
		expect(proficiencyBonusForLevel(1)).toBe(2);
		expect(proficiencyBonusForLevel(5)).toBe(3);
		expect(proficiencyBonusForLevel(9)).toBe(4);
		expect(hitDieForClass('guerreiro')).toBe('1d10');
		expect(hitDieForClass('unknown', '1d8')).toBe('1d8');
	});

	it('derives class resources by level and preserves custom resources through synchronization', () => {
		const previous: CharacterResource[] = [
			{
				id: 'second-wind',
				name: 'Segundo Fôlego',
				current: 1,
				max: 2,
				restoreOn: 'long'
			},
			{
				id: 'custom-favor',
				name: 'Favor da guilda',
				current: 2,
				max: 3,
				restoreOn: 'long'
			}
		];
		const resources = synchronizeProgressionResources('fighter', 10, scores, previous);
		expect(resources.find(({ id }) => id === 'second-wind')).toMatchObject({ max: 4, current: 1 });
		expect(resources.find(({ id }) => id === 'custom-favor')).toEqual(previous[1]);
		expect(synchronizeProgressionResources('fighter', 1, scores, previous)[0].current).toBe(1);
	});

	it('preserves valid spent slots and clamps a slot when its maximum decreases', () => {
		const defaults: SpellSlot[] = [
			{ level: 1, current: 4, max: 4 },
			{ level: 2, current: 2, max: 2 }
		];
		const previous: SpellSlot[] = [
			{ level: 1, current: 3, max: 4 },
			{ level: 2, current: 4, max: 4 }
		];
		expect(synchronizeSpellSlots(defaults, previous)).toEqual([
			{ level: 1, current: 3, max: 4 },
			{ level: 2, current: 2, max: 2 }
		]);
		expect(synchronizeSpellSlots(spellSlotsForProgression('wizard', 1), [])).toEqual([
			{ level: 1, current: 2, max: 2 }
		]);
	});

	it('shows spellcasting only from mapped rules, progression, or an explicit override', () => {
		expect(spellcastingEnabled('fighter', 5, undefined)).toBe(false);
		expect(spellcastingEnabled('fighter', 5, { enabled: true })).toBe(true);
		expect(spellcastingEnabled('fighter', 5, undefined, true)).toBe(true);
		expect(spellcastingEnabled('wizard', 1, undefined)).toBe(true);
	});

	it('derives expertise progression and hit point increases while tolerating invalid notation', () => {
		expect(expertiseChoicesForLevel('bard', 2)).toBe(2);
		expect(expertiseChoicesForLevel('ladino', 6)).toBe(4);
		expect(expertiseChoicesForLevel('fighter', 20)).toBe(0);
		expect(hitDieSidesFromNotation('1d10')).toBe(10);
		expect(hitDieSidesFromNotation('invalid')).toBe(8);
		expect(levelHitPointGain('max', 2, 10, 2)).toBe(24);
		expect(levelHitPointGain('roll', 2, 10, 2, [5, 7])).toBe(12);
		expect(levelHitPointGain('keep', 2, 10, 2)).toBe(0);
	});
});
