export type SheetPanelMode = 'docked' | 'floating';

const prefix = 'maismorras:sheet-panel-mode:';

export function sheetPanelModeKey(campaignId: string, characterId?: string | null): string {
	return `${prefix}${campaignId}:${characterId ?? 'mine'}`;
}

export function readSheetPanelMode(
	storage: Pick<Storage, 'getItem'> | null,
	key: string
): SheetPanelMode {
	try {
		return storage?.getItem(key) === 'floating' ? 'floating' : 'docked';
	} catch {
		return 'docked';
	}
}

export function writeSheetPanelMode(
	storage: Pick<Storage, 'setItem'> | null,
	key: string,
	mode: SheetPanelMode
): void {
	try {
		storage?.setItem(key, mode);
	} catch {
		// A blocked browser storage only resets the preferred mode on reload.
	}
}
