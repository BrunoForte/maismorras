import { describe, expect, it } from 'vitest';
import { calculateArmorClass } from './armorClass';
import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';

const scores: AbilityScores = {
	strength: 10,
	dexterity: 18,
	constitution: 14,
	intelligence: 10,
	wisdom: 10,
	charisma: 10
};
const item = (name: string, rules: Record<string, unknown>): InventoryItem => ({
	entryId: name,
	name,
	quantity: 1,
	equipped: true,
	rules
});

describe('calculateArmorClass', () => {
	it('applies medium armor dexterity cap to half plate and shield', () => {
		expect(
			calculateArmorClass(scores, 'fighter', [
				item('Half Plate', { category: 'Medium', ac: '15 + Dex modifier (max 2)' }),
				item('Shield', { category: 'Shield', ac: '+2' })
			])
		).toBe(19);
	});
	it('handles light and heavy armor correctly', () => {
		expect(
			calculateArmorClass(scores, 'rogue', [
				item('Leather', { category: 'Light', ac: '11 + Dex modifier' })
			])
		).toBe(15);
		expect(
			calculateArmorClass(scores, 'fighter', [item('Plate', { category: 'Heavy', ac: '18' })])
		).toBe(18);
	});
	it('does not count unequipped armor and supports unarmored class defense', () => {
		const armor = item('Half Plate', { category: 'Medium', ac: '15 + Dex modifier (max 2)' });
		armor.equipped = false;
		expect(calculateArmorClass(scores, 'barbarian', [armor])).toBe(16);
	});
	it('adds explicit magical AC bonuses without stacking armor', () => {
		expect(
			calculateArmorClass(scores, 'fighter', [
				item('Half Plate +1', { category: 'Medium', ac: '15 + Dex modifier (max 2)', acBonus: 1 })
			])
		).toBe(18);
	});
});
