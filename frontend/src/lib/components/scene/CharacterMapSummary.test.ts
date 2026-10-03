import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptySheet } from '$lib/services/characterApi';
import CharacterMapSummary from './CharacterMapSummary.svelte';

describe('CharacterMapSummary', () => {
	it('shows only compact identity, AC, editable HP, attacks and spells grouped by circle', () => {
		const sheet = createEmptySheet();
		sheet.name = 'Aela';
		sheet.armorClass = 16;
		sheet.hitPointsCurrent = 18;
		sheet.hitPointsMax = 24;
		sheet.inventory = [
			{
				entryId: 'longsword',
				name: 'Espada longa',
				quantity: 1,
				equipped: true,
				rules: {
					category: 'weapon',
					damage: '1d8+3',
					attackProfiles: [
						{
							id: 'sweep',
							name: 'Golpe varredor',
							description: '',
							attackAbility: 'strength',
							damage: '1d8',
							attackBonus: 0,
							damageBonus: 0,
							greatWeaponFighting: false
						}
					]
				}
			},
			{
				entryId: 'shortbow',
				name: 'Arco curto guardado',
				quantity: 1,
				equipped: false,
				rules: { category: 'weapon', damage: '1d6' }
			}
		];
		sheet.attacks = [{ name: 'Golpe pesado', attackBonus: 5, damage: '2d6+3', notes: '' }];
		sheet.spells = [
			{ name: 'Luz', level: 0, notes: 'Long description hidden in the map summary.' },
			{ name: 'Mísseis mágicos', level: 1, notes: 'Another long description hidden.' }
		];
		sheet.spellSlots = [{ level: 1, current: 1, max: 1 }];
		const { body } = render(CharacterMapSummary, {
			props: {
				sheet,
				canCastSpells: true,
				onHitPointsSet: vi.fn(),
				onWeaponRoll: vi.fn(),
				onCustomAttack: vi.fn(),
				onCastSpell: vi.fn(),
				onPresentSpell: vi.fn()
			}
		});

		expect(body).toContain('Aela');
		expect(body).toContain('CA');
		expect(body).toContain('16');
		expect(body).toContain('Espada longa');
		expect(body).toContain('Arco curto guardado');
		expect(body).toContain('Golpe varredor');
		expect(body).toContain('Golpe pesado');
		expect(body).toContain('Ataque');
		expect(body).toContain('Dano');
		expect(body).toMatch(/<details class="summary-section(?:\s[^>]*)?">/);
		expect(body.indexOf('PV atuais')).toBeLessThan(body.indexOf('summary-section'));
		expect(body.indexOf('Ataques')).toBeLessThan(body.indexOf('Magias'));
		expect(body).toContain('Truques');
		expect(body).toContain('1º círculo');
		expect(body).toContain('Mísseis mágicos');
		expect(body).toContain('Lançar');
		expect(body).toContain('Exibir');
		expect(body).not.toContain('disabled=""');
		expect(body).toContain('Digite -10 para sofrer 10 de dano.');
		expect(body).not.toContain('Salvaguardas');
		expect(body).not.toContain('Perícias');
		expect(body).not.toContain('Recursos');
		expect(body).not.toContain('Another long description');
	});

	it('allows display to a visible authorized sheet and disables casting for non-owners', () => {
		const sheet = createEmptySheet();
		sheet.spells = [
			{ name: 'Luz', level: 0, notes: '' },
			{ name: 'Escudo', level: 1, notes: '' }
		];
		const { body } = render(CharacterMapSummary, {
			props: { sheet, canCastSpells: false }
		});

		expect(body.match(/disabled=""/g)).toHaveLength(2);
		expect(body.match(/Exibir/g)).toHaveLength(2);
	});

	it('allows an owning player to cast a cantrip and display it in campaign chat', () => {
		const sheet = createEmptySheet();
		sheet.spells = [{ name: 'Luz', level: 0, notes: '' }];
		const { body } = render(CharacterMapSummary, {
			props: { sheet, canCastSpells: true }
		});

		expect(body).not.toContain('disabled=""');
		expect(body).toContain('Lançar');
		expect(body).toContain('Exibir');
	});

	it('disables leveled spells when the owner has no compatible available slot', () => {
		const sheet = createEmptySheet();
		sheet.spells = [{ name: 'Escudo', level: 1, notes: '' }];
		const { body } = render(CharacterMapSummary, {
			props: { sheet, canCastSpells: true }
		});

		expect(body).toContain('disabled=""');
	});

	it('omits the spells accordion when the sheet has no spells', () => {
		const sheet = createEmptySheet();
		sheet.spells = [];
		sheet.attacks = [{ name: 'Ataque simples', attackBonus: 2, damage: '1d4', notes: '' }];
		const { body } = render(CharacterMapSummary, { props: { sheet } });

		expect(body).toContain('Ataque simples');
		expect(body).not.toContain('Magias');
		expect(body).not.toContain('Truques');
	});

	it('keeps duplicated legacy item and spell identities as distinct stable rows', () => {
		const sheet = createEmptySheet();
		sheet.inventory = [
			{
				entryId: 'legacy-shared-entry',
				name: 'Espada repetida',
				quantity: 1,
				equipped: true,
				rules: { category: 'weapon', damage: '1d6' }
			},
			{
				entryId: 'legacy-shared-entry',
				name: 'Espada repetida',
				quantity: 1,
				equipped: true,
				rules: { category: 'weapon', damage: '1d6' }
			}
		];
		sheet.spells = [
			{ entryId: 'legacy-spell', name: 'Luz repetida', level: 0, notes: '' },
			{ entryId: 'legacy-spell', name: 'Luz repetida', level: 0, notes: '' }
		];
		const { body } = render(CharacterMapSummary, { props: { sheet, canCastSpells: true } });

		expect(body.split('Espada repetida').length - 1).toBe(2);
		expect(body.split('Luz repetida').length - 1).toBe(2);
	});
});
