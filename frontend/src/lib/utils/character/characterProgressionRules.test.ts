import { describe, expect, it } from 'vitest';
import type { AbilityScores, CharacterResource, SpellSlot } from '$lib/services/characterApi';
import {
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

describe('character progression rules', () => {
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
