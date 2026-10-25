import { describe, expect, it } from 'vitest';
import {
	displayedSpeed,
	catalogSpeciesTraits,
	getActiveSpeciesTraits,
	resolveSpeciesTraitReplacements,
	getSpeciesHPBonus,
	getSpeciesLineageOptions,
	getSpeciesProfile,
	getSpeciesResistances,
	getSpeciesSpeed,
	normalizeSpecies,
	normalizeSpeciesLineage,
	speciesTraitDescription,
	speciesTraitsForDisplay,
	storedSpeedFromDisplay,
	updateSpeciesSelection
} from './speciesRules';

describe('species rules', () => {
	it('uses reviewed catalog species trait text in Portuguese and source text as fallback', () => {
		const entry = {
			rules: {
				traits: [
					{ id: 'draconic-ancestry', name: 'Draconic Ancestry', description: 'Choose a dragon.' }
				]
			},
			translations: {
				'pt-BR.rules.traits.0.name': 'Ancestralidade Dracônica',
				'pt-BR.rules.traits.0.description': 'Escolha um dragão.'
			}
		};
		expect(catalogSpeciesTraits(entry, 'pt-BR')).toEqual([
			{
				id: 'draconic-ancestry',
				name: 'Ancestralidade Dracônica',
				description: 'Escolha um dragão.'
			}
		]);
		expect(catalogSpeciesTraits(entry, 'en')).toEqual([
			{ id: 'draconic-ancestry', name: 'Draconic Ancestry', description: 'Choose a dragon.' }
		]);
		expect(catalogSpeciesTraits({ rules: entry.rules }, 'pt-BR')).toEqual([
			{ id: 'draconic-ancestry', name: 'Draconic Ancestry', description: 'Choose a dragon.' }
		]);
	});

	it('shows the Elf Darkvision trait unchanged without a selected Drow lineage', () => {
		const traits = speciesTraitsForDisplay(
			'Elf',
			'',
			{
				rules: {
					traits: [
						{ id: 'darkvision-elf', name: 'Darkvision', description: 'Range 60 feet.' },
						{ id: 'fey-ancestry', name: 'Fey Ancestry', description: 'Advantage vs. Charmed.' },
						{ id: 'keen-senses', name: 'Keen Senses', description: 'Skill proficiency.' }
					]
				}
			},
			'en'
		);

		expect(traits).toContainEqual(
			expect.objectContaining({
				id: 'darkvision-elf',
				name: 'Darkvision',
				description: 'Range 60 feet.'
			})
		);
		expect(traits.some(({ id }) => id === 'darkvision-drow')).toBe(false);
	});

	it('uses Drow Darkvision as the explicit Elf replacement and preserves unrelated traits', () => {
		const traits = speciesTraitsForDisplay(
			'Elf',
			'Drow',
			{
				rules: {
					traits: [
						{ id: 'darkvision-elf', name: 'Darkvision', description: 'Range 60 feet.' },
						{ id: 'elven-lineage', name: 'Elven Lineage', description: 'Choose a lineage.' },
						{ id: 'fey-ancestry', name: 'Fey Ancestry', description: 'Advantage vs. Charmed.' }
					]
				}
			},
			'en'
		);

		expect(traits.filter(({ id }) => id === 'darkvision-elf' || id === 'darkvision-drow')).toEqual([
			expect.objectContaining({ id: 'darkvision-drow', name: 'Visão no escuro 36 m' })
		]);
		expect(traits.map(({ id }) => id)).toEqual(
			expect.arrayContaining(['elven-lineage', 'fey-ancestry'])
		);
		expect(traits.map(({ name }) => name)).toContain(
			'Luzes Dançantes; nível 3: Fogo das Fadas; nível 5: Escuridão'
		);
	});

	it('resolves explicit replacements independently of source order and deduplicates stable IDs', () => {
		const elf = { id: 'darkvision-elf', name: 'Elf Darkvision', description: '60 feet.' };
		const drow = {
			id: 'darkvision-drow',
			name: 'Drow Darkvision',
			description: '120 feet.',
			replaces: ['darkvision-elf']
		};
		const other = { id: 'fey-ancestry', name: 'Fey Ancestry', description: 'Charm defense.' };
		const duplicates = { ...other };
		const forward = resolveSpeciesTraitReplacements([elf, drow, other, duplicates, other]);
		const reverse = resolveSpeciesTraitReplacements([other, duplicates, drow, elf, other]);

		expect(forward.map(({ id }) => id).sort()).toEqual(['darkvision-drow', 'fey-ancestry']);
		expect(reverse.map(({ id }) => id).sort()).toEqual(['darkvision-drow', 'fey-ancestry']);
	});

	it('does not infer replacement from matching names without explicit metadata', () => {
		const traits = resolveSpeciesTraitReplacements([
			{ id: 'elf-darkvision', name: 'Darkvision', description: '60 feet.' },
			{ id: 'feat-darkvision-benefit', name: 'Darkvision', description: 'A separate feat benefit.' }
		]);

		expect(traits).toHaveLength(2);
	});
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
