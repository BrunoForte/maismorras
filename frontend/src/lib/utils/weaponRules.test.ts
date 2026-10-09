import { describe, expect, it } from 'vitest';
import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';
import {
	deriveWeaponEffects,
	resolveWeaponAttackMode,
	addWeaponProfile,
	parseWeaponEffect,
	removeWeaponProfile,
	selectedWeaponEffects,
	toggleWeaponEffect,
	updateInventoryItemRules,
	updateWeaponProfile,
	weaponAttackBonusTotal,
	weaponAttackProfiles,
	weaponDamageBonusTotal,
	weaponProficiencyStatus,
	weaponSupportsGreatWeaponFighting
} from './weaponRules';

const weapon = (rules: Record<string, unknown> = {}): InventoryItem => ({
	entryId: 'sword',
	name: 'Espada longa',
	quantity: 1,
	equipped: true,
	rules: { category: 'weapon', damage: '1d8', ...rules }
});
const scores: AbilityScores = {
	strength: 16,
	dexterity: 14,
	constitution: 10,
	intelligence: 10,
	wisdom: 10,
	charisma: 10
};

describe('weapon domain rules', () => {
	it('preserves the selected weapon attack mode except when conditions force disadvantage', () => {
		expect(resolveWeaponAttackMode('normal', [])).toBe('normal');
		expect(resolveWeaponAttackMode('advantage', [])).toBe('advantage');
		expect(resolveWeaponAttackMode('disadvantage', [])).toBe('disadvantage');
		expect(resolveWeaponAttackMode('advantage', ['Cego'])).toBe('disadvantage');
		expect(resolveWeaponAttackMode('normal', ['Impedido'])).toBe('disadvantage');
	});

	it('respects explicit proficiency overrides and class/subclass proficiency grants', () => {
		const item = weapon({ category: 'martial' });
		expect(weaponProficiencyStatus(item, ['martial'], [], {})).toBe(true);
		expect(weaponProficiencyStatus(item, [], ['espada longa'], {})).toBe(true);
		expect(weaponProficiencyStatus(item, [], [], {})).toBe(false);
		expect(weaponProficiencyStatus(weapon({ proficient: true }), [], [], {})).toBe(true);
		expect(weaponProficiencyStatus(weapon({ proficient: false }), ['martial'], [], {})).toBe(false);
	});

	it('calculates attack and damage with proficiencies, item bonuses and selected effects', () => {
		const item = weapon({ bonus: 1 });
		const effects = [{ key: 'duel', name: 'Dueling', attackBonus: 0, damageBonus: 2 }];
		expect(weaponAttackBonusTotal(item, scores, 3, effects)).toBe(7);
		expect(weaponDamageBonusTotal(item, scores, effects)).toBe(6);
		expect(weaponAttackBonusTotal(item, scores, 0, [])).toBe(4);
	});

	it('separates weapon attack and damage bonuses while keeping enchantment on both once', () => {
		const item = weapon({ attackBonus: 3, damageBonus: 5, enchantmentBonus: 2 });
		expect(weaponAttackBonusTotal(item, scores, 0, [])).toBe(8);
		expect(weaponDamageBonusTotal(item, scores, [])).toBe(10);
	});

	it('derives range-specific effects and applies two-handed and dual-wield restrictions', () => {
		expect(
			parseWeaponEffect(
				'ranged',
				'Feature',
				'+2 bonus to attack rolls with ranged weapons',
				'ranged'
			)
		).toMatchObject({ attackBonus: 2, damageBonus: 0 });
		expect(
			parseWeaponEffect(
				'wrong-range',
				'Feature',
				'+2 bonus to attack rolls with melee weapons',
				'ranged'
			)
		).toBeNull();
		const dueling = [{ id: 'duel', name: 'Dueling', description: '' }];
		const duelingWeapon = weapon();
		expect(deriveWeaponEffects(duelingWeapon, dueling, [], [duelingWeapon])).toHaveLength(1);
		expect(
			deriveWeaponEffects(weapon({ properties: ['two-handed'] }), dueling, [], [weapon()])
		).toEqual([]);
		const offhand = { ...weapon(), entryId: 'offhand' };
		expect(deriveWeaponEffects(weapon(), dueling, [], [weapon(), offhand])).toEqual([]);
	});

	it('supports selectable effects and updates custom profiles immutably', () => {
		const original = weapon({
			enabledCombatModifiers: [],
			attackProfiles: [{ id: 'heavy', name: 'Golpe forte' }]
		});
		const enabled = toggleWeaponEffect(original, 'duel');
		expect(original.rules.enabledCombatModifiers).toEqual([]);
		expect(
			selectedWeaponEffects(enabled, [
				{ key: 'duel', name: 'Dueling', attackBonus: 0, damageBonus: 2 }
			])
		).toHaveLength(1);
		const updated = updateWeaponProfile(enabled, 'heavy', { damageBonus: 3 });
		expect(weaponAttackProfiles(updated)[0]).toMatchObject({ id: 'heavy', damageBonus: 3 });
		expect(weaponAttackProfiles(enabled)[0]).toEqual({ id: 'heavy', name: 'Golpe forte' });
		expect(weaponAttackProfiles(removeWeaponProfile(updated, 'heavy'))).toEqual([]);
		const added = addWeaponProfile(enabled, {
			id: 'new',
			name: 'Corte potente',
			description: '',
			attackAbility: 'strength',
			damage: '1d10',
			attackBonus: 1,
			damageBonus: 2,
			greatWeaponFighting: false
		});
		expect(weaponAttackProfiles(added)).toHaveLength(2);
		expect(weaponAttackProfiles(enabled)).toHaveLength(1);
		expect(weaponSupportsGreatWeaponFighting(weapon())).toBe(false);
		expect(weaponSupportsGreatWeaponFighting(weapon({ properties: ['two-handed'] }))).toBe(true);
		expect(weaponSupportsGreatWeaponFighting(weapon({ properties: ['versatile'] }))).toBe(true);
		expect(
			weaponSupportsGreatWeaponFighting(weapon({ properties: ['ammunition', 'ranged'] }))
		).toBe(false);
	});

	it('never mutates the shared item or compendium rules when applying item changes', () => {
		const compendiumRules = { category: 'weapon', damage: '1d8' };
		const shared = { ...weapon(compendiumRules), rules: compendiumRules };
		const changed = updateInventoryItemRules([shared], shared, { attackAbility: 'dexterity' });
		expect(changed[0].rules.attackAbility).toBe('dexterity');
		expect(shared.rules).not.toHaveProperty('attackAbility');
		expect(compendiumRules).not.toHaveProperty('attackAbility');
		expect(updateInventoryItemRules([], shared, { bonus: 1 })).toEqual([]);
	});

	it('ignores invalid or incomplete rule values without throwing', () => {
		expect(parseWeaponEffect('empty', 'Effect', 'no numeric modifier', 'melee')).toBeNull();
		expect(
			weaponAttackProfiles(weapon({ attackProfiles: [null, {}, { id: 'ok' }, 'invalid'] }))
		).toEqual([{ id: 'ok' }]);
		expect(weaponProficiencyStatus(weapon({ proficient: 'yes' }), [], [], {})).toBe(false);
	});
});
