let nextLayer = 40;

/** Returns a layer above built-in map controls and previously focused panels. */
export function nextFloatingPanelLayer(): number {
	nextLayer += 1;
	return nextLayer;
}
