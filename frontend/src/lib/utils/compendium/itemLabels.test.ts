import { describe, expect, it } from 'vitest';
import { displayItemCategory, displayWeaponProperties, displayWeaponProperty } from './itemLabels';
import { equipmentCategory, weaponRange } from '$lib/utils/characterEquipment';
import { filterItemEntries } from '$lib/utils/inventoryRules';

describe('SRD item display labels', () => {
	it('localizes the distinct SRD item categories without changing unknown values', () => {
		const categories = [
			['Simple Melee', 'Armas Simples Corpo a Corpo'],
			['Simple Ranged', 'Armas Simples à Distância'],
			['Martial Melee', 'Armas Marciais Corpo a Corpo'],
			['Martial Ranged', 'Armas Marciais à Distância'],
			['Light', 'Armadura Leve'],
			['Medium', 'Armadura Média'],
			['Heavy', 'Armadura Pesada'],
			['Shield', 'Escudo']
		] as const;

		for (const [canonical, localized] of categories) {
			expect(displayItemCategory(canonical, 'pt-BR')).toBe(localized);
			expect(displayItemCategory(canonical, 'en')).toBe(canonical);
		}
		expect(displayItemCategory('Custom Category', 'pt-BR')).toBe('Custom Category');
		expect(displayItemCategory(null, 'pt-BR')).toBe('');
	});

	it('localizes every distinct SRD weapon property and keeps parameters unchanged', () => {
		const properties = [
			['Versatile (1d10)', 'Versátil (1d10)'],
			['Ammunition (25/100)', 'Munição (25/100)'],
			['Loading', 'Recarga'],
			['Light', 'Leve'],
			['Finesse', 'Acuidade'],
			['Thrown (20/60)', 'Arremesso (20/60)'],
			['Heavy', 'Pesada'],
			['Reach', 'Alcance'],
			['Two-Handed', 'Duas Mãos'],
			['Ammunition (30/120)', 'Munição (30/120)'],
			['Ammunition (100/400)', 'Munição (100/400)'],
			['Thrown (30/120)', 'Arremesso (30/120)'],
			['Ammunition (80/320)', 'Munição (80/320)'],
			['Ammunition (150/600)', 'Munição (150/600)'],
			['Ammunition (40/120)', 'Munição (40/120)'],
			['Ammunition (30/90)', 'Munição (30/90)'],
			['Versatile (1d8)', 'Versátil (1d8)']
		] as const;

		for (const [canonical, localized] of properties) {
			expect(displayWeaponProperty(canonical, 'pt-BR')).toBe(localized);
			expect(displayWeaponProperty(canonical, 'en')).toBe(canonical);
		}

		const canonicalProperties = ['Light', 'Thrown (20/60)', 'Unknown Property'];
		expect(displayWeaponProperties(canonicalProperties, 'pt-BR')).toBe(
			'Leve, Arremesso (20/60), Unknown Property'
		);
		expect(canonicalProperties).toEqual(['Light', 'Thrown (20/60)', 'Unknown Property']);
		expect(displayWeaponProperties('Finesse', 'pt-BR')).toBe('Acuidade');
		expect(displayWeaponProperties(undefined, 'pt-BR')).toBe('');
	});

	it('keeps canonical category and properties intact for inventory filtering and weapon rules', () => {
		const item = {
			name: 'Shortbow',
			entryType: 'item',
			rules: {
				category: 'Martial Ranged',
				damage: '1d6',
				properties: ['Ammunition (80/320)', 'Heavy', 'Two-Handed']
			}
		};

		expect(equipmentCategory(item)).toBe('weapon');
		expect(weaponRange(item)).toBe('ranged');
		expect(filterItemEntries([item], 'weapon')).toEqual([item]);
		displayItemCategory(item.rules.category, 'pt-BR');
		displayWeaponProperties(item.rules.properties, 'pt-BR');
		expect(item.rules).toEqual({
			category: 'Martial Ranged',
			damage: '1d6',
			properties: ['Ammunition (80/320)', 'Heavy', 'Two-Handed']
		});
	});
});
