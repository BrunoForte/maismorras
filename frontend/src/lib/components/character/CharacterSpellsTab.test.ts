import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Spell } from '$lib/services/characterApi';
import type { SpellFeatGrantProjection } from '$lib/utils/character/characterSpellRules';
import CharacterSpellsTab from './CharacterSpellsTab.svelte';

function renderSpellSlots(isGM: boolean, current = 1, maximum = 2, canAdjustSlots = isGM) {
	return render(CharacterSpellsTab, {
		props: {
			newSpellName: '',
			newSpellLevel: 1,
			expandedSpell: null,
			isGM,
			canDisplayCharacter: isGM,
			canAdjustSlots,
			canCastSpells: false,
			speciesSpellcastingAbility: '',
			hasSpeciesSpellGrants: false,
			castingSpell: null,
			spellbook: {
				addableCircles: () => [1],
				availableCircles: () => [1],
				slotForCircle: (level: number) =>
					level === 1 ? { level: 1, current, max: maximum } : undefined,
				spellsForCircle: () => [],
				entriesForCircle: () => [],
				compatibleSlots: () => [],
				selectedSlot: () => 1
			},
			presentation: {
				optionLabel: (entry: { name: string }) => entry.name,
				circleLabel: (level: number) => `Nível ${level}`,
				displayName: (spell: Spell) => spell.name,
				description: () => '',
				higherLevels: () => '',
				mechanics: () => ({ reviewed: false, damage: [], characterLevel: [], spellSlot: [] }),
				hasAITranslation: () => false
			},
			actions: {
				setNewSpellName: vi.fn(),
				setNewSpellLevel: vi.fn(),
				setExpandedSpell: vi.fn(),
				chooseSlot: vi.fn(),
				setAvailableSpellSlots: vi.fn(async () => true),
				setSpellGrantUseConfig: vi.fn(async () => true),
				setSpeciesSpellcastingAbility: vi.fn(),
				add: vi.fn(),
				remove: vi.fn(),
				change: vi.fn(),
				present: vi.fn(),
				rollEffect: vi.fn(),
				cast: vi.fn()
			}
		}
	}).body;
}

describe('CharacterSpellsTab manual available slots', () => {
	it('shows the level, available/max counts, and bounded control to the narrator', () => {
		const html = renderSpellSlots(true);
		expect(html).toContain('<strong>1</strong> / 2');
		expect(html).toContain('disponíveis / máximo');
		expect(html).toContain('Ajustar espaços disponíveis do círculo 1');
		expect(html).toContain('Diminuir espaços disponíveis do círculo 1');
		expect(html).toContain('Aumentar espaços disponíveis do círculo 1');
		expect(html).not.toContain('type="number"');
	});

	it('disables decrement at zero and increment at the progression maximum', () => {
		const atZero = renderSpellSlots(true, 0, 2);
		expect(atZero).toContain('<strong>0</strong> / 2');
		expect(atZero).toMatch(/aria-label="Diminuir espaços disponíveis do círculo 1"[^>]*disabled/);
		expect(atZero).toMatch(/aria-label="Aumentar espaços disponíveis do círculo 1"[^>]*>\+/);

		const atMaximum = renderSpellSlots(true, 2, 2);
		expect(atMaximum).toContain('<strong>2</strong> / 2');
		expect(atMaximum).toMatch(/aria-label="Diminuir espaços disponíveis do círculo 1"[^>]*>−/);
		expect(atMaximum).toMatch(
			/aria-label="Aumentar espaços disponíveis do círculo 1"[^>]*disabled/
		);
	});

	it('keeps narrator controls disabled until a saved character can be adjusted', () => {
		const html = renderSpellSlots(true, 1, 2, false);
		expect(html).toMatch(/aria-label="Diminuir espaços disponíveis do círculo 1"[^>]*disabled/);
		expect(html).toMatch(/aria-label="Aumentar espaços disponíveis do círculo 1"[^>]*disabled/);
	});

	it('does not expose the narrator adjustment control to a player', () => {
		const html = renderSpellSlots(false);
		expect(html).toContain('<strong>1</strong> / 2');
		expect(html).toContain('disponíveis / máximo');
		expect(html).not.toContain('Ajustar espaços disponíveis do círculo');
		expect(html).not.toContain('Diminuir espaços disponíveis do círculo');
		expect(html).not.toContain('Aumentar espaços disponíveis do círculo');
	});
});

describe('CharacterSpellsTab spell disclosure icons and casting actions', () => {
	function renderSpell(
		expandedSpell: number | null,
		canCastSpells = false,
		spells: {
			spell: Spell;
			index: number;
			key: string;
			featGrants?: SpellFeatGrantProjection[];
			origins?: ('class' | 'feat' | 'species')[];
		}[] = [{ spell: { name: 'Luz', level: 0, notes: '' }, index: 0, key: 'luz' }],
		canDisplayCharacter = false,
		isGM = false,
		canAdjustSlots = isGM
	) {
		return render(CharacterSpellsTab, {
			props: {
				newSpellName: '',
				newSpellLevel: 0,
				expandedSpell,
				isGM,
				canDisplayCharacter,
				canAdjustSlots,
				canCastSpells,
				speciesSpellcastingAbility: 'wisdom',
				hasSpeciesSpellGrants: spells.some(({ featGrants = [] }) =>
					featGrants.some((grant) => grant.sourceKind === 'species')
				),
				castingSpell: null,
				spellbook: {
					addableCircles: () => [],
					availableCircles: () => [...new Set(spells.map(({ spell }) => spell.level))],
					slotForCircle: (level: number) =>
						level === 1 ? { level: 1, current: 1, max: 1 } : undefined,
					spellsForCircle: (level: number) => spells.filter(({ spell }) => spell.level === level),
					entriesForCircle: () => [],
					compatibleSlots: (spell: Spell) =>
						spell.level > 0 ? [{ level: 1, current: 1, max: 1 }] : [],
					selectedSlot: () => 1
				},
				presentation: {
					optionLabel: () => '',
					circleLabel: (level: number) => (level === 0 ? 'Truques' : `${level}º círculo`),
					displayName: (spell: Spell) => spell.name,
					description: () => '',
					higherLevels: () => '',
					mechanics: () => ({ reviewed: false, damage: [], characterLevel: [], spellSlot: [] }),
					hasAITranslation: () => false
				},
				actions: {
					setNewSpellName: vi.fn(),
					setNewSpellLevel: vi.fn(),
					setExpandedSpell: vi.fn(),
					chooseSlot: vi.fn(),
					setAvailableSpellSlots: vi.fn(async () => true),
					setSpellGrantUseConfig: vi.fn(async () => true),
					setSpeciesSpellcastingAbility: vi.fn(),
					add: vi.fn(),
					remove: vi.fn(),
					change: vi.fn(),
					present: vi.fn(),
					rollEffect: vi.fn(),
					cast: vi.fn()
				}
			}
		}).body;
	}

	it('shows the matching icon while retaining the button disclosure state', () => {
		const collapsed = renderSpell(null);
		expect(collapsed).toContain('data-icon="chevron-down"');
		expect(collapsed).toContain('aria-expanded="false"');
		expect(collapsed).toContain('<button');

		const expanded = renderSpell(0);
		expect(expanded).toContain('data-icon="chevron-up"');
		expect(expanded).toContain('aria-expanded="true"');
	});

	it('shows explicit cast controls for known spells even when details are collapsed', () => {
		const test = renderSpell(null, true, [
			{ spell: { name: 'Luz', level: 0, notes: '' }, index: 0, key: 'light' },
			{ spell: { name: 'Escudo', level: 1, notes: '' }, index: 1, key: 'shield' }
		]);
		expect(test).toContain('Lançar truque');
		expect(test).toContain('aria-label="Espaço de magia"');
		expect(test).toMatch(/>Lançar<\/button>/);
		expect(test).not.toContain('spell-details');
	});

	it('exposes the existing spell display action for an authorized own-sheet player', () => {
		const html = renderSpell(0, true, undefined, true);
		expect(html).toContain('Destacar na tela');
		expect(html).toContain('aria-label="Lançar magia"');
	});

	it('shows narrator-only per-source use settings and an explicit species ability', () => {
		const grant: SpellFeatGrantProjection = {
			id: 'species-grant',
			featId: 'elven-lineage',
			featName: 'elf · high-elf',
			spellEntryId: 'detect-magic',
			ability: 'wisdom',
			freeCastsRemaining: 0,
			freeUses: 1,
			canUseExistingSlots: true,
			recovery: 'short',
			campaignConfigured: false,
			sourceKind: 'species',
			freeCastsMax: 2,
			defaultFreeCasts: 1
		};
		const speciesSpell = {
			spell: { entryId: 'detect-magic', name: 'Detect Magic', level: 1, notes: '' },
			index: -1,
			key: 'species-grant',
			featGrants: [grant],
			origins: ['species' as const]
		};
		const narrator = renderSpell(-1, true, [speciesSpell], false, true, true);
		expect(narrator).toContain('Configurar usos de Alto Elfo');
		expect(narrator).toContain('Usos disponíveis de Alto Elfo');
		expect(narrator).toContain('Atributo das magias de espécie');
		expect(narrator).toContain('Descanso curto');
		expect(narrator).toContain('0/2');
		const player = renderSpell(-1, true, [speciesSpell]);
		expect(player).not.toContain('Configurar usos de Alto Elfo');
		expect(player).toContain('Espaço de magia');
	});
});
