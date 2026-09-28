import { describe, expect, it } from 'vitest';
import {
	equipmentCategory,
	itemWeight,
	modifierText,
	weaponAbility,
	weaponItemBonus,
	weaponRange,
	weaponRangeFromText
} from './characterEquipment';

describe('character equipment helpers', () => {
	it('classifies common equipment without making the UI own mechanical rules', () => {
		expect(equipmentCategory({ name: 'Arco longo', rules: {} })).toBe('weapon');
		expect(equipmentCategory({ name: 'Meia armadura', rules: {} })).toBe('armor');
		expect(equipmentCategory({ name: 'Poção de cura', rules: {} })).toBe('consumable');
		expect(equipmentCategory({ name: 'Corda', rules: {} })).toBe('gear');
	});

	it('uses an explicit attack ability and defaults by weapon range', () => {
		expect(weaponAbility({ name: 'Arco', rules: { attackAbility: 'strength' } })).toBe('strength');
		expect(weaponAbility({ name: 'Arco longo', rules: {} })).toBe('dexterity');
		expect(weaponAbility({ name: 'Machado', rules: {} })).toBe('strength');
		expect(weaponRange({ name: 'Besta leve', rules: {} })).toBe('ranged');
	});

	it('combines explicit item and enchantment bonuses without parsing stale descriptions', () => {
		expect(weaponItemBonus({ name: 'Espada', rules: { bonus: 1, enchantmentBonus: 2 } })).toBe(3);
		expect(
			weaponItemBonus({
				name: 'Espada',
				rules: { bonus: 0, description: '+2 bonus to attack rolls and damage rolls' }
			})
		).toBe(0);
		expect(
			weaponItemBonus({
				name: 'Espada',
				rules: { description: '+2 bonus to attack rolls and damage rolls' }
			})
		).toBe(2);
	});

	it('calculates inventory weight and formats signed modifiers', () => {
		expect(itemWeight({ name: 'Ração', rules: { weight: '2' }, quantity: 3 })).toBe(6);
		expect(itemWeight({ name: 'Ração', rules: { weight: -2 }, quantity: 3 })).toBe(0);
		expect(modifierText(2)).toBe('+2');
		expect(modifierText(-1)).toBe('-1');
	});

	it('identifies prose-limited weapon ranges', () => {
		expect(weaponRangeFromText('Melee weapon attacks')).toBe('melee');
		expect(weaponRangeFromText('Armas à distância')).toBe('ranged');
		expect(weaponRangeFromText('Applies while equipped')).toBeNull();
	});
});
