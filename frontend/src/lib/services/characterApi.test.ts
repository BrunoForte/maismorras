import { describe, expect, it } from 'vitest';
import { createEmptySheet } from './characterApi';

describe('createEmptySheet', () => {
	it('creates a valid level-one D&D sheet with safe defaults', () => {
		const sheet = createEmptySheet();
		expect(sheet.level).toBe(1);
		expect(sheet.proficiencyBonus).toBe(2);
		expect(sheet.hitPointsCurrent).toBe(sheet.hitPointsMax);
		expect(sheet.abilityScores).toEqual({ strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 });
		expect(sheet.inventory).toEqual([]);
		expect(sheet.resources).toEqual([]);
	});
});
