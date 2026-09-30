import type { CompendiumEntry } from '$lib/services/compendiumApi';

export type CompendiumDetailsView = {
	entry: CompendiumEntry;
	artUrl: string;
	displayName: string;
	displaySummary: string;
	typeLabel: string;
	isMonster: boolean;
	hasMonsterSheet: boolean;
	sourceReadOnly: boolean;
	hasPrivateSource: boolean;
	isGM: boolean;
	canTranslate: boolean;
	canPlace: boolean;
	translating: boolean;
	placing: boolean;
};
