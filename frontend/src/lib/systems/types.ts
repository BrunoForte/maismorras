/** Stable identifiers pinned to a reviewed and immutable system release. */
export type GameSystemRef = {
	systemId: string;
	systemVersion: string;
};

/** Explicit version sent when a new campaign is created. */
export const DND2024_REF: GameSystemRef = {
	systemId: 'dnd2024',
	systemVersion: '1.0.0'
};
