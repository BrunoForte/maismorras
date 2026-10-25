import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createEmptySheet } from '$lib/services/characterApi';
import type { WeaponCombatActions } from '$lib/utils/weaponRules';
import CharacterCombatTab from './CharacterCombatTab.svelte';

describe('CharacterCombatTab equipped armor description', () => {
	it('renders the description as its own full-row element', () => {
		const sheet = createEmptySheet();
		sheet.inventory = [
			{
				entryId: 'armor-1',
				name: 'Meia armadura',
				quantity: 1,
				equipped: true,
				rules: { category: 'armor', description: 'Placas articuladas cobrem o torso e os braços.' }
			}
		];
		const html = render(CharacterCombatTab, {
			props: {
				sheet,
				saving: false,
				armorClass: 15,
				attributes: [],
				rollingWeaponAction: null,
				rollingAttack: null,
				rollingAttackAction: null,
				spells: [],
				actions: {
					rest: () => {},
					syncTokenSoon: () => {},
					spendResource: () => {},
					setResourceMax: () => {},
					spellDisplayName: () => '',
					circleLabel: () => '',
					spellOrigin: () => '',
					equipmentCategory: (item: { name: string; rules: Record<string, unknown> }) =>
						item.rules.category === 'armor' ? 'armor' : 'weapon',
					weapons: {} as WeaponCombatActions,
					addAttack: () => {},
					toggleVisibleRoll: () => {},
					setAttackType: () => {},
					rollCustomAttack: () => {},
					rollCustomDamage: () => {},
					removeAttack: () => {}
				}
			}
		}).body;
		expect(html).toMatch(/class="combat-armor-list(?:\s|")/);
		expect(html).toMatch(/class="armor-description(?:\s|")/);
		expect(html).toContain('Placas articuladas cobrem o torso e os braços.');
	});

	it('offers only the available Hit Dice count, including zero', () => {
		const sheet = createEmptySheet();
		sheet.level = 4;
		sheet.hitDiceSpent = 2;
		const html = render(CharacterCombatTab, {
			props: {
				sheet,
				saving: false,
				armorClass: 15,
				attributes: [],
				rollingWeaponAction: null,
				rollingAttack: null,
				rollingAttackAction: null,
				spells: [],
				actions: {
					rest: () => {},
					syncTokenSoon: () => {},
					spendResource: () => {},
					setResourceMax: () => {},
					spellDisplayName: () => '',
					circleLabel: () => '',
					spellOrigin: () => '',
					equipmentCategory: () => 'weapon',
					weapons: {} as WeaponCombatActions,
					addAttack: () => {},
					toggleVisibleRoll: () => {},
					setAttackType: () => {},
					rollCustomAttack: () => {},
					rollCustomDamage: () => {},
					removeAttack: () => {}
				}
			}
		}).body;

		expect(html).toContain('aria-label="Dados de Vida a gastar"');
		expect(html).toContain('data-testid="short-rest-hit-dice-count"');
		expect(html).toMatch(/2\s+disponíveis de 4/);
		for (const count of [0, 1, 2]) expect(html).toContain(`<option value="${count}"`);
		expect(html).not.toContain('<option value="3"');
	});
});
