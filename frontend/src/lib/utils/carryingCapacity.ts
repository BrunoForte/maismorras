import type { Dnd2024Money, InventoryItem } from '$lib/services/characterApi';
import { normalizeSpecies } from './speciesRules';

export const DND2024_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;

export type Dnd2024Size = (typeof DND2024_SIZES)[number];

const carryMultiplier: Record<Dnd2024Size, number> = {
	tiny: 7.5,
	small: 15,
	medium: 15,
	large: 30,
	huge: 60,
	gargantuan: 120
};

const nextSize: Record<Dnd2024Size, Dnd2024Size> = {
	tiny: 'small',
	small: 'medium',
	medium: 'large',
	large: 'huge',
	huge: 'gargantuan',
	gargantuan: 'gargantuan'
};

const coinDenominations = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;

export function isDnd2024Size(value: unknown): value is Dnd2024Size {
	return typeof value === 'string' && DND2024_SIZES.includes(value as Dnd2024Size);
}

/** SRD species with a fixed Small size default to Small; other existing sheets default to Medium. */
export function defaultCharacterSize(species: unknown): 'small' | 'medium' {
	return ['gnome', 'halfling'].includes(normalizeSpecies(species)) ? 'small' : 'medium';
}

export function calculateDnd2024CarryingCapacity(input: {
	strength: number;
	size: Dnd2024Size;
	powerfulBuild?: boolean;
	largeFormActive?: boolean;
}): { effectiveSize: Dnd2024Size; capacityLb: number } | null {
	if (!Number.isSafeInteger(input.strength) || input.strength < 1 || input.strength > 30)
		return null;
	const actualSize = input.largeFormActive ? 'large' : input.size;
	const effectiveSize = input.powerfulBuild ? nextSize[actualSize] : actualSize;
	return {
		effectiveSize,
		capacityLb: input.strength * carryMultiplier[effectiveSize]
	};
}

export type CarriedWeight = {
	weightLb: number;
	incomplete: boolean;
	unknownItemCount: number;
};

function parseKnownNonNegativeNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
	if (typeof value !== 'string' || value.trim() === '') return null;
	const parsed = Number(value.trim());
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Inventory weights and the result are in pounds; 50 SRD coins weigh one pound. */
export function calculateDnd2024CarriedWeight(
	inventory: readonly InventoryItem[],
	money?: Partial<Dnd2024Money> | null
): CarriedWeight {
	let weightLb = 0;
	let unknownItemCount = 0;
	for (const item of inventory) {
		const weight = parseKnownNonNegativeNumber(item.rules?.weight);
		const quantity = parseKnownNonNegativeNumber(item.quantity);
		if (weight === null || quantity === null || !Number.isSafeInteger(quantity)) {
			unknownItemCount += 1;
			continue;
		}
		const itemTotal = weight * quantity;
		if (!Number.isFinite(itemTotal) || !Number.isFinite(weightLb + itemTotal)) {
			unknownItemCount += 1;
			continue;
		}
		weightLb += itemTotal;
	}
	const coinCount = coinDenominations.reduce(
		(total, denomination) => total + (parseKnownNonNegativeNumber(money?.[denomination]) ?? 0),
		0
	);
	weightLb += coinCount / 50;
	return {
		weightLb: Math.round((weightLb + Number.EPSILON) * 100) / 100,
		incomplete: unknownItemCount > 0,
		unknownItemCount
	};
}
