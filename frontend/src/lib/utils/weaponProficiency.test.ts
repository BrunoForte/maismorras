import { describe, expect, it } from 'vitest';
import { hasWeaponProficiency } from './weaponProficiency';

describe('weapon proficiency', () => {
	it('matches simple and martial weapon categories from class rules', () => {
		expect(hasWeaponProficiency(['Simple weapons'], 'Dagger', 'Simple Melee')).toBe(true);
		expect(hasWeaponProficiency(['Simple weapons'], 'Battleaxe', 'Martial Melee')).toBe(false);
		expect(hasWeaponProficiency(['Martial weapons'], 'Battleaxe', 'Martial Melee')).toBe(true);
	});

	it('matches a proficiency granted for a specific weapon', () => {
		expect(hasWeaponProficiency(['Longbow'], 'Longbow', 'Martial Ranged')).toBe(true);
		expect(hasWeaponProficiency(['Longbow'], 'Shortbow', 'Martial Ranged')).toBe(false);
	});
});
