import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import TokenInspector, { type TokenInspectorPermissions } from './TokenInspector.svelte';
import type { Personagem } from '$lib/stores/gameStore';
import type { NPC } from '$lib/services/npcApi';

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

function createProps(permissions = allPermissions, npc: NPC | null = null) {
	const noop = vi.fn();
	return {
		token,
		npc,
		characterSummary: {
			name: 'Thorin Carvalho',
			class: 'Guerreiro',
			subclass: 'Campeão',
			level: 4,
			species: 'Anão',
			background: 'Soldado',
			proficiencyBonus: 2
		},
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
		expect(body).toContain('Guerreiro · Campeão · Nível 4');
		expect(body).toContain('Bônus de proficiência +2');
		expect(body).toContain('16');
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
		expect(body).not.toContain('Condições oficiais (SRD)');
		expect(body).not.toContain('VISIBILIDADE PARA OUTROS JOGADORES');
		expect(body).not.toContain('Visão na névoa');
		expect(body).not.toContain('Remover token da cena');
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
		const gmBody = render(TokenInspector, { props: gmProps }).body;
		const playerBody = render(TokenInspector, {
			props: createProps({ ...allPermissions, canUseNpcActions: false }, npc)
		}).body;

		expect(gmBody).toContain('Ações da criatura');
		expect(gmBody).toContain('Mordida');
		expect(playerBody).not.toContain('Ações da criatura');
	});
});
