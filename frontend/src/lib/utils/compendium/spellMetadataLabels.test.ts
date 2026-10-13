import { describe, expect, it } from 'vitest';
import { spellClassLabel, spellSchoolLabel } from './spellMetadataLabels';

describe('spell metadata presentation labels', () => {
	it('localizes the canonical SRD schools without changing their stored values', () => {
		const schools = {
			Abjuration: 'Abjuração',
			Conjuration: 'Conjuração',
			Divination: 'Adivinhação',
			Enchantment: 'Encantamento',
			Evocation: 'Evocação',
			Illusion: 'Ilusão',
			Necromancy: 'Necromancia',
			Transmutation: 'Transmutação'
		};

		for (const [school, localized] of Object.entries(schools)) {
			expect(spellSchoolLabel(school, 'pt-BR')).toBe(localized);
			expect(spellSchoolLabel(school, 'en')).toBe(school);
		}
	});

	it('uses the existing PT-BR class names for canonical spell lists', () => {
		const classes = {
			bard: 'Bardo',
			Cleric: 'Clérigo',
			Druid: 'Druida',
			Paladin: 'Paladino',
			Ranger: 'Patrulheiro',
			Sorcerer: 'Feiticeiro',
			Warlock: 'Bruxo',
			Wizard: 'Mago'
		};

		for (const [className, localized] of Object.entries(classes)) {
			expect(spellClassLabel(className, 'pt-BR')).toBe(localized);
		}
		expect(spellClassLabel('wizard', 'en')).toBe('Wizard');
		expect(spellClassLabel('custom class', 'pt-BR')).toBe('custom class');
	});

	it('falls back to unknown values and leaves canonical rule data untouched', () => {
		const entry = {
			rules: { school: 'Homebrew School', classes: ['custom-class', 'wizard'] }
		};

		expect(spellSchoolLabel(entry.rules.school, 'pt-BR')).toBe('Homebrew School');
		expect(spellClassLabel(entry.rules.classes[0], 'pt-BR')).toBe('custom-class');
		expect(entry.rules.school).toBe('Homebrew School');
		expect(entry.rules.classes).toEqual(['custom-class', 'wizard']);
	});
});
