export type LibraryAccessMode = 'all' | 'restricted' | 'private';

/** Resolve the effective audience without changing the stored permission model. */
export function libraryAccessMode(
	visibleToPlayers: boolean,
	restricted: boolean
): LibraryAccessMode {
	if (!visibleToPlayers) return 'private';
	return restricted ? 'restricted' : 'all';
}

/** Keep only unique, canonical IDs belonging to the campaign's current player roster. */
export function normalizeSelectedPlayerIds(
	selectedIds: readonly string[],
	currentPlayerIds: readonly string[]
): string[] {
	const canonicalPlayers = new Map(
		currentPlayerIds
			.map((id) => id.trim())
			.filter(Boolean)
			.map((id) => [id.toLocaleLowerCase(), id] as const)
	);
	const selected = new Set<string>();
	for (const rawId of selectedIds) {
		const canonicalId = canonicalPlayers.get(rawId.trim().toLocaleLowerCase());
		if (canonicalId) selected.add(canonicalId);
	}
	return [...selected];
}
