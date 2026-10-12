import type { InventoryItem } from '$lib/services/characterApi';
import {
	equipmentCategory,
	inventoryOptionGroup,
	itemWeight,
	type InventoryCategory,
	type InventoryOptionGroup
} from './characterEquipment';

/**
 * Compendium data is JSON from the API but can be wrapped in Svelte reactive
 * proxies. JSON serialization safely unwraps those proxies; structuredClone
 * rejects them with DataCloneError.
 */
export function cloneInventoryRules(rules: Record<string, unknown> | null | undefined) {
	return JSON.parse(JSON.stringify(rules ?? {})) as Record<string, unknown>;
}
/** Returns inventory entries with their source indexes so filtered edits remain stable. */
export function projectInventory(
	inventory: readonly InventoryItem[],
	category: InventoryCategory
): { item: InventoryItem; index: number }[] {
	return inventory
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => category === 'all' || equipmentCategory(item) === category);
}

export function totalInventoryWeight(inventory: readonly InventoryItem[]): number {
	return inventory.reduce((total, item) => total + itemWeight(item), 0);
}

export function filterItemEntries<
	T extends { name: string; entryType: string; rules: Record<string, unknown> }
>(entries: readonly T[], category: InventoryCategory): T[] {
	return entries.filter(
		(entry) =>
			(entry.entryType === 'item' ||
				(entry.entryType === 'other' && entry.rules.catalog === 'magic-item')) &&
			(category === 'all' || equipmentCategory(entry) === category)
	);
}

export type InventoryOptionGroupItems<T> = {
	category: InventoryOptionGroup;
	items: T[];
};

const inventoryOptionGroupOrder: InventoryOptionGroup[] = [
	'weapon',
	'armor',
	'shield',
	'equipment',
	'tool',
	'other'
];

/** Groups and locale-sorts compendium options without changing their IDs or source objects. */
export function groupInventoryOptions<T extends { name: string; rules: Record<string, unknown> }>(
	entries: readonly T[],
	getDisplayName: (entry: T) => string,
	locale: string
): InventoryOptionGroupItems<T>[] {
	const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
	return inventoryOptionGroupOrder
		.map((category) => ({
			category,
			items: entries
				.filter((entry) => inventoryOptionGroup(entry) === category)
				.slice()
				.sort((left, right) => collator.compare(getDisplayName(left), getDisplayName(right)))
		}))
		.filter((group) => group.items.length > 0);
}
