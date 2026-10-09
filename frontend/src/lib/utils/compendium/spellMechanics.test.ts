import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import { presentSpellMechanics } from './spellMechanics';

describe('SRD spell mechanics presentation', () => {
	it('presents reviewed damage and keeps character and slot scaling distinct', () => {
		const rules: Record<string, unknown> = {
			mechanicsAudit: { status: 'reviewed', source: 'D&D SRD 5.2.1' },
			damage: {
				components: [
					{
						formula: '1d8',
						type: 'varies',
						types: ['acid', 'cold', 'fire', 'lightning', 'poison', 'psychic', 'thunder'],
						explodingDice: {
							die: 'd8',
							triggersOn: 8,
							maxAdditionalDice: 'spellcasting-ability-modifier'
						}
					}
				]
			},
			scaling: {
				characterLevel: [
					{ level: 5, effects: [{ kind: 'damage-formula', formula: '2d8', type: 'varies' }] }
				],
				spellSlot: {
					baseLevel: 1,
					effects: [
						{
							kind: 'damage-increase',
							fromSlotLevel: 2,
							everySlotLevels: 1,
							formula: '1d8',
							type: 'varies'
						}
					]
				}
			}
		};
		const pt = presentSpellMechanics(rules, 'pt-BR');
		expect(pt.reviewed).toBe(true);
		expect(pt.damage[0]).toContain('1d8');
		expect(pt.damage[0]).toContain('ácido, frio, fogo, elétrico, venenoso, psíquico, trovejante');
		expect(pt.damage[0]).toContain('modificador da habilidade de conjuração');
		expect(pt.characterLevel).toEqual(['Nível 5: 2d8 à escolha indicada pela magia']);
		expect(pt.spellSlot).toEqual([
			'Espaço de nível 2+: +1d8 à escolha indicada pela magia por nível do espaço'
		]);
	});

	it('does not fabricate damage or scaling for reviewed entries marked not applicable', () => {
		expect(
			presentSpellMechanics(
				{ mechanicsAudit: { status: 'reviewed' }, damage: null, scaling: null },
				'pt-BR'
			)
		).toEqual({ reviewed: true, damage: [], characterLevel: [], spellSlot: [] });
		expect(presentSpellMechanics({ damage: null, scaling: null }, 'pt-BR').reviewed).toBe(false);
	});

	it('renders the audited SRD data and PT-BR translations through both spell views', () => {
		const packPath = resolve(process.cwd(), '../backend/internal/compendium/packs/srd_5_2_1.json');
		const pack = JSON.parse(readFileSync(packPath, 'utf8')) as { entries: CompendiumEntry[] };
		const spells = pack.entries.filter(
			(entry) => entry.entryType === 'spell' && [0, 1].includes(Number(entry.rules.level))
		);
		expect(spells).toHaveLength(85);
		for (const entry of spells) {
			const view = presentSpellMechanics(entry.rules, 'pt-BR');
			expect(view.reviewed, `${entry.name} audit status`).toBe(true);
			expect(entry.translations['pt-BR.rules.description'], `${entry.name} description`).toBeTruthy();
			expect(entry.translations['pt-BR.rules.description.source']).toBe('reviewed');
		}
		const compendiumView = readFileSync(
			resolve(process.cwd(), 'src/lib/components/compendium/CompendiumEntryDetails.svelte'),
			'utf8'
		);
		const characterView = readFileSync(
			resolve(process.cwd(), 'src/lib/components/character/CharacterSpellsTab.svelte'),
			'utf8'
		);
		expect(compendiumView).toContain('presentSpellMechanics(detail, locale)');
		expect(characterView).toContain('presentation.mechanics(spell)');
	});
});
