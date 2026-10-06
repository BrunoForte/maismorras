// Keep user-floating panels above the map's token inspector (z-index: 100).
// Focus/pointer interaction then reliably raises them instead of leaving
// minimized controls underneath the inspector.
let nextLayer = 120;

/** Returns a layer above built-in map controls and previously focused panels. */
export function nextFloatingPanelLayer(): number {
	nextLayer += 1;
	return nextLayer;
}
