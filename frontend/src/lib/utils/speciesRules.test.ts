import { describe, expect, it } from 'vitest';
import {
	displayedSpeed,
	getActiveSpeciesTraits,
	getSpeciesHPBonus,
	getSpeciesLineageOptions,
	getSpeciesProfile,
	getSpeciesResistances,
	getSpeciesSpeed,
	normalizeSpecies,
	normalizeSpeciesLineage,
	speciesTraitDescription,
	storedSpeedFromDisplay,
	updateSpeciesSelection
} from './speciesRules';

describe('species rules', () => {
	it('normalizes localized, accented, and legacy species names', () => {
		expect(normalizeSpecies(' Draconáto ')).toBe('dragonborn');
		expect(normalizeSpecies('ANÃO')).toBe('dwarf');
		expect(normalizeSpecies('Wood Elf')).toBe('wood elf');
		expect(normalizeSpecies(undefined)).toBe('');
	});

	it('uses catalog speed and a lineage override, preserving unknown legacy speed', () => {
		expect(getSpeciesSpeed('Humano', '', 7)).toBe(9);
		expect(getSpeciesSpeed('Golias', '', 7)).toBe(10.5);
		expect(getSpeciesSpeed('Elfo', 'Elfo da Floresta', 7)).toBe(10.5);
		expect(getSpeciesSpeed('espécie antiga', 'linhagem antiga', 7)).toBe(7);
	});

	it('derives dwarf HP bonus by level and handles incomplete level values', () => {
		expect(getSpeciesHPBonus('Anão', 5)).toBe(5);
		expect(getSpeciesHPBonus('Dwarf', 0)).toBe(1);
		expect(getSpeciesHPBonus('Humano', 10)).toBe(0);
		expect(getSpeciesHPBonus('Anão', Number.NaN)).toBe(1);
	});

	it('returns base and selected-lineage traits and their derived resistances', () => {
		expect(getSpeciesLineageOptions('Tiefling')).toContain('Abissal');
		expect(getActiveSpeciesTraits('Tiefling', 'Abissal')).toContain('Resistência a veneno');
		expect(getSpeciesResistances('Tiefling', 'Abissal')).toEqual(['veneno']);
		expect(getActiveSpeciesTraits('Tiefling', 'invalid')).toHaveLength(2);
		expect(getActiveSpeciesTraits('espécie antiga', 'linhagem antiga')).toEqual([]);
	});

	it('normalizes a legacy lineage value and preserves every unrelated sheet field', () => {
		const original = {
			species: 'elf',
			speciesLineage: 'wood elf',
			name: 'Ari',
			hitPointsCurrent: 12,
			inventory: [{ name: 'Bow' }],
			spells: [{ name: 'Light' }],
			customFlag: true
		};
		const updated = updateSpeciesSelection(original, 'Elfo', 'wood elf');
		expect(updated.species).toBe('Elfo');
		expect(updated.speciesLineage).toBe('Elfo da Floresta');
		expect(updated).toMatchObject({ name: 'Ari', hitPointsCurrent: 12, customFlag: true });
		expect(updated.inventory).toBe(original.inventory);
		expect(updated.spells).toBe(original.spells);
	});

	it('clears an invalid lineage when species changes and tolerates empty legacy profile data', () => {
		expect(
			updateSpeciesSelection({ species: 'elf', speciesLineage: 'Drow' }, 'Humano')
		).toMatchObject({ species: 'Humano', speciesLineage: '' });
		expect(getSpeciesProfile(null)).toBeUndefined();
		expect(normalizeSpeciesLineage('Elf', null)).toBe('');
		expect(speciesTraitDescription('Investida de Adrenalina', 'pt-BR')).toContain('ação bônus');
		expect(speciesTraitDescription('Adrenaline Rush', 'en')).toContain('bonus action');
	});

	it('converts speed for display while storing metric values canonically', () => {
		expect(displayedSpeed(10.5, 'en')).toBe(34);
		expect(storedSpeedFromDisplay('35', 'en')).toBe(10.7);
		expect(storedSpeedFromDisplay('10.5', 'pt-BR')).toBe(10.5);
		expect(storedSpeedFromDisplay('-1', 'en')).toBeNull();
	});
});
