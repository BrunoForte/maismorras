export type Dnd2024RollMode = 'normal' | 'advantage' | 'disadvantage';

const disadvantageConditions = new Set(['Cego', 'Envenenado', 'Impedido']);

/** Resolves D&D 2024's advantage/disadvantage cancellation for character d20 tests. */
export function resolveDnd2024RollMode(
	requested: Dnd2024RollMode,
	activeConditions: readonly string[]
): Dnd2024RollMode {
	const hasDisadvantage = activeConditions.some((condition) =>
		disadvantageConditions.has(condition)
	);
	if (!hasDisadvantage) return requested;
	return requested === 'advantage' ? 'normal' : 'disadvantage';
}
