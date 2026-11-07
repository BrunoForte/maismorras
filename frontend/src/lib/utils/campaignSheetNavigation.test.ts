import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	campaignSheetSelectionAfterTabChange,
	resolveCampaignSheetSelection
} from './campaignSheetNavigation';

describe('campaign sheet navigation', () => {
	it('keeps the narrator on the cast when the sheet tab opens without an explicit selection', () => {
		expect(resolveCampaignSheetSelection(null, ['player-sheet', 'npc-sheet'])).toBeNull();
	});

	it('retains an explicitly selected sheet only while it remains in the campaign cast', () => {
		expect(resolveCampaignSheetSelection('player-sheet', ['player-sheet', 'npc-sheet'])).toBe(
			'player-sheet'
		);
		expect(resolveCampaignSheetSelection('removed-sheet', ['player-sheet'])).toBeNull();
	});

	it('clears narrator sheet selection when leaving or re-entering the cast tab', () => {
		const selection = { id: 'player-sheet', ownerName: 'Player' };
		expect(campaignSheetSelectionAfterTabChange(selection, 'gm', 'map', 'sheets')).toBeNull();
		expect(campaignSheetSelectionAfterTabChange(selection, 'gm', 'sheets', 'map')).toBeNull();
	});

	it('preserves the player sheet flow across workspace tab changes', () => {
		const selection = { id: 'player-sheet', ownerName: '' };
		expect(campaignSheetSelectionAfterTabChange(selection, 'player', 'sheets', 'map')).toBe(
			selection
		);
	});

	it('wires narrator cast loading and tab return to explicit selection state', () => {
		const sheets = readFileSync(
			resolve(process.cwd(), 'src/lib/components/CampaignSheets.svelte'),
			'utf8'
		);
		const workspace = readFileSync(
			resolve(process.cwd(), 'src/lib/components/CampaignWorkspace.svelte'),
			'utf8'
		);
		const mountBody = sheets.match(/onMount\(async \(\) => \{([\s\S]*?)\n\t\}\);/)?.[1];
		const tabChangeBody = workspace.match(
			/function setWorkspaceTab\(tab: WorkspaceTab\) \{([\s\S]*?)\n\t\}/
		)?.[1];

		expect(mountBody).toBeDefined();
		expect(mountBody).toContain('resolveCampaignSheetSelection');
		expect(mountBody).not.toContain('onselectcharacter(');
		expect(sheets).toContain('{#if resolvedSelectedCharacterId && hasSelectedSheet}');
		expect(sheets).toContain(
			'onselectcharacter(participant.character!.id, participant.displayName)'
		);
		expect(tabChangeBody).toContain('campaignSheetSelectionAfterTabChange');
		expect(workspace).toContain('ontabchange={(tab) => {\n\t\t\tsetWorkspaceTab(tab);');
	});

	it('renders participant characters before NPCs with keyboard-operable responsive cards', () => {
		const sheets = readFileSync(
			resolve(process.cwd(), 'src/lib/components/CampaignSheets.svelte'),
			'utf8'
		);
		const charactersSection = sheets.indexOf('<details class="cast-section" open>');
		const npcSection = sheets.indexOf('<details class="cast-section npc-sheets" open>');
		const characterOptions = sheets.indexOf(
			"label={$appLocale === 'en' ? 'Characters' : 'Personagens'}"
		);
		const npcOptions = sheets.indexOf('<optgroup label="NPCs">');

		expect(charactersSection).toBeGreaterThanOrEqual(0);
		expect(npcSection).toBeGreaterThan(charactersSection);
		expect(characterOptions).toBeGreaterThanOrEqual(0);
		expect(npcOptions).toBeGreaterThan(characterOptions);
		expect(sheets).toContain("'Characters' : 'Personagens'");
		expect(sheets).toContain("'NPCs' : 'NPCs'");
		expect(sheets).toContain("'Select sheet' : 'Selecionar ficha'");
		expect(sheets).toContain("'Open sheet' : 'Abrir ficha'");
		expect(sheets).toContain("'Delete'");
		expect(sheets).toContain("'Excluir'");
		expect(sheets).toContain('void deleteNPCCharacter(character)');
		expect(sheets).toContain('summary:focus-visible');
		expect(sheets).toContain('grid-template-columns: 2.8rem minmax(0, 1fr)');
		expect(sheets).toContain('justify-content: flex-end');
		expect(sheets).toContain('@media (max-width: 380px)');
		expect(sheets).toContain('@media (max-width: 480px)');
		expect(sheets).toContain('flex: 1 1 100%');
		expect(sheets).toContain('width: 100%');
		expect(sheets).toContain('class="quiet-action"');
	});

	it('renders an NPC card avatar from the character name instead of literal expression text', () => {
		const sheets = readFileSync(
			resolve(process.cwd(), 'src/lib/components/CampaignSheets.svelte'),
			'utf8'
		);

		expect(sheets).toMatch(/\{\s*character\.name\.slice\(0,\s*1\)\.toUpperCase\(\)\s*\}/);
	});
});
