import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '$lib/services/characterApi';
import {
	cloneInventoryRules,
	filterItemEntries,
	projectInventory,
	totalInventoryWeight
} from './inventoryRules';

const items: InventoryItem[] = [
	{
		entryId: 'sword',
		name: 'Espada',
		quantity: 1,
		equipped: true,
		rules: { category: 'weapon', weight: 3 }
	},
	{
		entryId: 'rations',
		name: 'Rações',
		quantity: 2,
		equipped: false,
		rules: { category: 'consumable', weight: 2 }
	}
];

describe('cloneInventoryRules', () => {
	it('copies JSON rules wrapped in a reactive proxy', () => {
		const source = new Proxy(
			{ damage: '1d6', properties: ['acuidade'], nested: { category: 'arma' } },
			{}
		);
		const copy = cloneInventoryRules(source);

		expect(copy).toEqual({ damage: '1d6', properties: ['acuidade'], nested: { category: 'arma' } });
		expect(copy).not.toBe(source);
		expect(copy.nested).not.toBe(source.nested);
	});

	it('projects filtered inventory with stable source indexes and total weight', () => {
		expect(projectInventory(items, 'weapon')).toEqual([{ item: items[0], index: 0 }]);
		expect(projectInventory(items, 'consumable')).toEqual([{ item: items[1], index: 1 }]);
		expect(totalInventoryWeight(items)).toBe(7);
	});

	it('filters compendium item entries by category and excludes unrelated entry types', () => {
		const entries = [
			{ id: 'sword', name: 'Espada', entryType: 'item', rules: { category: 'weapon' } },
			{ id: 'armor', name: 'Cota', entryType: 'item', rules: { category: 'armor' } },
			{ id: 'feat', name: 'Lutador', entryType: 'feat', rules: {} }
		];
		expect(filterItemEntries(entries, 'all')).toHaveLength(2);
		expect(filterItemEntries(entries, 'weapon').map((entry) => entry.id)).toEqual(['sword']);
		expect(filterItemEntries(entries, 'tool')).toEqual([]);
	});
});
