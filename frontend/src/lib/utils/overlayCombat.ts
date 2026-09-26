export type OverlayCombatant = {
	id: string;
	name: string;
	initiative: number;
	hidden?: boolean;
};

export type OverlayInitiative = { tokenId: string; initiative: number };

export function getOverlayInitiativeOrder<T extends OverlayCombatant>(
	combatants: T[],
	initiatives: OverlayInitiative[]
): T[] {
	const visible = combatants.filter((combatant) => !combatant.hidden);
	const initiativeByToken = new Map(initiatives.map((entry) => [entry.tokenId, entry.initiative]));
	const source = initiatives.length
		? visible.filter((combatant) => initiativeByToken.has(combatant.id))
		: visible.filter((combatant) => Number.isFinite(combatant.initiative));
	return [...source].sort((left, right) => {
		const leftInitiative = initiativeByToken.get(left.id) ?? left.initiative;
		const rightInitiative = initiativeByToken.get(right.id) ?? right.initiative;
		return rightInitiative - leftInitiative || left.name.localeCompare(right.name, 'pt-BR');
	});
}

export function getOverlayNextCombatant<T extends OverlayCombatant>(
	order: T[],
	activeId: string | null
) {
	const activeIndex = order.findIndex((combatant) => combatant.id === activeId);
	if (activeIndex < 0 || order.length < 2) return null;
	return order[(activeIndex + 1) % order.length] ?? null;
}
