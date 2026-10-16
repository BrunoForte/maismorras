import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Spell } from '$lib/services/characterApi';
import CharacterSpellsTab from './CharacterSpellsTab.svelte';

function renderSpellSlots(isGM: boolean) {
	return render(CharacterSpellsTab, {
		props: {
			newSpellName: '',
			newSpellLevel: 1,
			expandedSpell: null,
			isGM,
			canAdjustSlots: isGM,
			canCastSpells: false,
			castingSpell: null,
			spellbook: {
				addableCircles: () => [1],
				availableCircles: () => [1],
				slotForCircle: (level: number) =>
					level === 1 ? { level: 1, current: 1, max: 2 } : undefined,
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
		expect(html).toContain('Espaços de magia disponíveis de nível 1 (máximo 2)');
		expect(html).toContain('max="2"');
	});

	it('does not expose the narrator adjustment control to a player', () => {
		const html = renderSpellSlots(false);
		expect(html).toContain('<strong>1</strong> / 2');
		expect(html).toContain('disponíveis / máximo');
		expect(html).not.toContain('Espaços de magia disponíveis de nível');
	});
});
