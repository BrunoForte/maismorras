export type CustomInventoryItemDraft = {
	name: string;
	category: 'weapon' | 'armor' | 'consumable' | 'gear';
	damage: string;
	defense: number;
	bonus: number;
	weight: number;
	quantity: number;
};
