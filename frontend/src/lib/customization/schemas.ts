export const CUSTOMIZATION_SCHEMA_VERSION = 1 as const;

export type ThemePanelStyle = 'classic' | 'arcane' | 'minimal';

export type CampaignTheme = {
	version: typeof CUSTOMIZATION_SCHEMA_VERSION;
	primary: string;
	accent: string;
	background: string;
	panel: string;
	text: string;
	font: string;
	panelStyle: ThemePanelStyle;
};

export const defaultCampaignTheme: CampaignTheme = {
	version: CUSTOMIZATION_SCHEMA_VERSION,
	primary: '#8b5cf6',
	accent: '#d6a85f',
	background: '#141114',
	panel: '#211a20',
	text: '#f4eadf',
	font: 'system-ui',
	panelStyle: 'classic'
};

const colorPattern = /^#[0-9a-f]{6}$/i;

export function normalizeCampaignTheme(value: unknown): CampaignTheme {
	if (!value || typeof value !== 'object') return { ...defaultCampaignTheme };
	const candidate = value as Partial<CampaignTheme>;
	return {
		...defaultCampaignTheme,
		...candidate,
		version: CUSTOMIZATION_SCHEMA_VERSION,
		primary: colorPattern.test(candidate.primary ?? '')
			? candidate.primary!
			: defaultCampaignTheme.primary,
		accent: colorPattern.test(candidate.accent ?? '')
			? candidate.accent!
			: defaultCampaignTheme.accent,
		background: colorPattern.test(candidate.background ?? '')
			? candidate.background!
			: defaultCampaignTheme.background,
		panel: colorPattern.test(candidate.panel ?? '') ? candidate.panel! : defaultCampaignTheme.panel,
		text: colorPattern.test(candidate.text ?? '') ? candidate.text! : defaultCampaignTheme.text,
		panelStyle:
			candidate.panelStyle && ['classic', 'arcane', 'minimal'].includes(candidate.panelStyle)
				? candidate.panelStyle
				: defaultCampaignTheme.panelStyle
	};
}

export function campaignThemeStyle(theme: CampaignTheme): string {
	const safe = normalizeCampaignTheme(theme);
	return `--campaign-primary:${safe.primary};--campaign-accent:${safe.accent};--campaign-bg:${safe.background};--campaign-panel:${safe.panel};--campaign-text:${safe.text};`;
}

export type SheetFieldKind = 'text' | 'number' | 'select' | 'resource' | 'roll';

export type SheetField = {
	id: string;
	label: string;
	kind: SheetFieldKind;
	path: string;
	readonly?: boolean;
	options?: string[];
	formula?: string;
};

export type SheetSection = {
	id: string;
	label: string;
	fields: SheetField[];
};

export type CampaignSheetSchema = {
	version: typeof CUSTOMIZATION_SCHEMA_VERSION;
	id: string;
	label: string;
	sections: SheetSection[];
};

export const defaultDnd2024SheetSchema: CampaignSheetSchema = {
	version: CUSTOMIZATION_SCHEMA_VERSION,
	id: 'dnd2024-default',
	label: 'Ficha D&D 2024',
	sections: []
};
