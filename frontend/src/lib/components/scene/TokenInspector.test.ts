import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import TokenInspector, { type TokenInspectorPermissions } from './TokenInspector.svelte';
import type { Personagem } from '$lib/stores/gameStore';
import type { NPC } from '$lib/services/npcApi';
import { createEmptySheet } from '$lib/services/characterApi';

const token: Personagem = {
	id: 7,
	persistedId: 'token-7',
	actorId: 'actor-7',
	isOwned: true,
	visibility: {
		showName: true,
		showHP: true,
		showAC: true,
		showStatuses: true,
		transparentBackground: false
	},
	nome: 'Thorin',
	cor: 0x884422,
	x: 2,
	y: 3,
	hpAtual: 14,
	hpMax: 18,
	ca: 16,
	proficiencia: 2,
	atributos: { for: 14, des: 10, con: 12, int: 10, sab: 10, car: 8 },
	armas: [],
	iniciativa: 3,
	visionRange: 6,
	lightRange: 0,
	tamanho: 1,
	fotoEscala: 1,
	fotoOffsetX: 0,
	fotoOffsetY: 0
};

const allPermissions: TokenInspectorPermissions = {
	canEditHitPoints: true,
	canViewCharacterSummary: true,
	canEditAppearance: true,
	canEditVision: true,
	canInteractWithDoor: false,
	canOpenSheet: true,
	canRemoveToken: true,
	canRollInitiative: true,
	canUseNpcActions: true,
	canManageConditions: true,
	canChangeVisibility: true
};

function createProps(permissions = allPermissions, npc: NPC | null = null, includeSheet = true) {
	const noop = vi.fn();
	const characterSheet = {
		...createEmptySheet(),
		name: 'Thorin Carvalho',
		class: 'Guerreiro',
		subclass: 'Campeão',
		level: 4,
		species: 'Anão',
		background: 'Soldado',
		armorClass: 16,
		hitPointsCurrent: 14,
		hitPointsMax: 18,
		proficiencyBonus: 2,
		savingThrows: ['Strength'],
		skillProficiencies: ['Atletismo'],
		inventory: [
			{
				entryId: 'longsword',
				name: 'Espada longa',
				quantity: 1,
				equipped: true,
				rules: { category: 'weapon', damage: '1d8' }
			}
		]
	};
	return {
		token,
		npc,
		characterSheet: includeSheet ? characterSheet : undefined,
		hitPointsUpdating: false,
		permissions,
		initiativeAdvantage: true,
		effectDefinitions: [{ slug: 'blinded', name: 'Cego', summary: 'Não enxerga.', source: 'SRD' }],
		selectedEffectSlug: 'blinded',
		effectDuration: '2',
		activeEffects: [
			{
				id: 'effect-1',
				tokenId: 'token-7',
				name: 'Cego',
				source: 'SRD',
				remainingTurns: 2,
				tickAt: 'turn_end' as const
			}
		],
		onClose: noop,
		onAppearanceChange: noop,
		onColorChange: noop,
		onToggleTransparentBackground: noop,
		onVisionChange: noop,
		onLightChange: noop,
		onInteractWithDoor: noop,
		onOpenSheet: noop,
		onOpenSheetInNewWindow: noop,
		onRemoveToken: noop,
		onRollInitiative: noop,
		onInitiativeAdvantageChange: noop,
		onNpcAction: noop,
		onHitPointsChange: noop,
		onHitPointsSet: noop,
		onEffectSelectionChange: noop,
		onEffectDurationChange: noop,
		onApplyEffect: noop,
		onRemoveEffect: noop,
		onVisibilityChange: noop
	};
}

describe('TokenInspector', () => {
	it('renders selected token and linked character summary', () => {
		const { body } = render(TokenInspector, { props: createProps() });

		expect(body).toContain('Thorin Carvalho');
		expect(body).toContain('CA');
		expect(body).toContain('Ficha resumida do personagem');
		expect(body).toContain('Ataques');
		expect(body).toContain('Espada longa');
		expect(body).toContain('16');
		expect(body).not.toContain('Salvaguardas');
		expect(body).not.toContain('Perícias');
	});

	it('renders the authorized summary for a GM even when the token is not player-owned', () => {
		const gmToken = { ...token, isOwned: false };
		const { body } = render(TokenInspector, { props: { ...createProps(), token: gmToken } });
		expect(body).toContain('Ficha resumida do personagem');
		expect(body).toContain('Thorin Carvalho');
	});

	it('renders GM controls for conditions, visibility, token removal and vision', () => {
		const { body } = render(TokenInspector, { props: createProps() });

		expect(body).toContain('Remover token da cena');
		expect(body).toContain('Condições oficiais (SRD)');
		expect(body).toContain('VISIBILIDADE PARA OUTROS JOGADORES');
		expect(body).toContain('Visão na névoa');
		expect(body).toContain('Remover Cego');
	});

	it('keeps own-token player controls while omitting GM-only controls', () => {
		const playerPermissions: TokenInspectorPermissions = {
			...allPermissions,
			canEditVision: false,
			canRemoveToken: false,
			canUseNpcActions: false,
			canManageConditions: false,
			canChangeVisibility: false
		};
		const { body } = render(TokenInspector, { props: createProps(playerPermissions) });

		expect(body).toContain('Aparência do token');
		expect(body).toContain('Abrir ficha vinculada');
		expect(body).toContain('Rolar iniciativa');
		expect(body).toContain('Vantagem na próxima');
		expect(body).toContain('Digite -10 para sofrer 10 de dano');
		expect(body).toContain('Condições oficiais (SRD)');
		expect(body).toContain('Cego');
		expect(body).not.toContain('Aplicar');
		expect(body).not.toContain('VISIBILIDADE PARA OUTROS JOGADORES');
		expect(body).not.toContain('Visão na névoa');
		expect(body).not.toContain('Remover token da cena');
	});

	it('keeps initiative and both sheet actions outside the collapsed token settings', () => {
		const { body } = render(TokenInspector, { props: createProps() });
		expect(body).toContain('Rolar iniciativa');
		expect(body).toContain('Abrir ficha vinculada');
		expect(body).toContain('Abrir ficha em janela auxiliar');
		expect(body).toMatch(
			/<div class="sheet-actions(?:\s[^"]*)?">[\s\S]*class="open-sheet(?:\s[^"]*)?"[\s\S]*class="open-sheet-new-window(?:\s[^"]*)?"/
		);
		expect(body).toMatch(/<details class="token-settings(?:\s[^>]*)?">/);
		expect(body).not.toMatch(/<details class="token-settings(?:\s[^>]*)?" open/);
	});

	it('does not render a private character summary without explicit access', () => {
		const denied: TokenInspectorPermissions = {
			...allPermissions,
			canViewCharacterSummary: false,
			canEditHitPoints: false,
			canOpenSheet: false
		};
		const { body } = render(TokenInspector, { props: createProps(denied, null, false) });
		expect(body).not.toContain('Thorin Carvalho');
		expect(body).not.toContain('Ficha resumida do personagem');
		expect(body).not.toContain('Pontos de vida atuais');
	});

	it('hides own-token controls for a player without permission', () => {
		const deniedPermissions: TokenInspectorPermissions = {
			...allPermissions,
			canEditAppearance: false,
			canInteractWithDoor: false,
			canOpenSheet: false,
			canRemoveToken: false,
			canRollInitiative: false,
			canUseNpcActions: false,
			canManageConditions: false,
			canChangeVisibility: false
		};
		const { body } = render(TokenInspector, { props: createProps(deniedPermissions) });

		expect(body).not.toContain('Aparência do token');
		expect(body).not.toContain('Abrir ficha vinculada');
		expect(body).not.toContain('Rolar iniciativa');
		expect(body).not.toContain('VISIBILIDADE PARA OUTROS JOGADORES');
	});

	it('renders NPC actions only when the parent grants that capability', () => {
		const npc: NPC = {
			id: 'npc-1',
			campaignId: 'campaign-1',
			name: 'Lobo',
			sheet: {
				hitPointsCurrent: 11,
				hitPointsMax: 11,
				armorClass: 13,
				initiative: 2,
				size: 1,
				color: 0x777777,
				imageUrl: '',
				creatureType: 'besta',
				challenge: '1/4',
				speed: '12 m',
				abilities: {
					strength: 12,
					dexterity: 15,
					constitution: 12,
					intelligence: 3,
					wisdom: 12,
					charisma: 6
				},
				traits: [],
				actions: [
					{
						name: 'Mordida',
						kind: 'action',
						toHit: 4,
						range: '1,5 m',
						damage: '2d4+2',
						saveDC: 0,
						description: 'Ataque corpo a corpo.'
					}
				],
				resistances: [],
				immunities: [],
				senses: '',
				languages: ''
			}
		};
		const gmProps = createProps(allPermissions, npc);
		gmProps.npc!.sheet.actions.push({ ...gmProps.npc!.sheet.actions[0] });
		const gmBody = render(TokenInspector, { props: gmProps }).body;
		const playerBody = render(TokenInspector, {
			props: createProps({ ...allPermissions, canUseNpcActions: false }, npc)
		}).body;

		expect(gmBody).toContain('Ações da criatura');
		expect(gmBody).toContain('Mordida');
		expect(gmBody.match(/Mordida/g)).toHaveLength(1);
		expect(playerBody).not.toContain('Ações da criatura');
	});
});
