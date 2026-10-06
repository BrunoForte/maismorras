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
	canConfigureFeatSpellRule: boolean;
	canTranslate: boolean;
	translationStatus: 'pending' | 'ai' | 'official' | 'manual' | 'complete';
	canPlace: boolean;
	translating: boolean;
	placing: boolean;
};
