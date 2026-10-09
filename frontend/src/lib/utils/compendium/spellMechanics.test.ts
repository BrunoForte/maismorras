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

	it('presents typed higher-slot rules in the selected locale', () => {
		const rules = {
			mechanicsAudit: { status: 'reviewed', source: 'D&D SRD 5.2.1' },
			damage: null,
			scaling: {
				spellSlot: {
					baseLevel: 2,
					effects: [
						{
							kind: 'rule-text',
							fromSlotLevel: 3,
							text: {
								en: 'you can target one additional creature.',
								ptBR: 'você pode escolher uma criatura adicional.'
							}
						}
					]
				}
			}
		};
		expect(presentSpellMechanics(rules, 'pt-BR').spellSlot).toEqual([
			'Espaço de nível 3+: você pode escolher uma criatura adicional.'
		]);
		expect(presentSpellMechanics(rules, 'en').spellSlot).toEqual([
			'Slot 3+: you can target one additional creature.'
		]);
	});

	it('renders audited levels 0–6 data and PT-BR translations through both spell views', () => {
		const packPath = resolve(process.cwd(), '../backend/internal/compendium/packs/srd_5_2_1.json');
		const pack = JSON.parse(readFileSync(packPath, 'utf8')) as { entries: CompendiumEntry[] };
		const spells = pack.entries.filter(
			(entry) =>
				entry.entryType === 'spell' &&
				Number(entry.rules.level) >= 0 &&
				Number(entry.rules.level) <= 6
		);
		expect(spells).toHaveLength(286);
		for (const entry of spells) {
			const view = presentSpellMechanics(entry.rules, 'pt-BR');
			expect(view.reviewed, `${entry.name} audit status`).toBe(true);
			expect(
				entry.translations['pt-BR.rules.description'],
				`${entry.name} description`
			).toBeTruthy();
			expect(entry.translations['pt-BR.rules.description.source']).toBe('reviewed');
			expect(entry.translations['pt-BR.summary'], `${entry.name} summary`).toBeTruthy();
			expect(entry.translations['pt-BR.summary.source']).toBe('reviewed');
			if (Number(entry.rules.level) >= 2) {
				expect(entry.translations['pt-BR.rules.description']).not.toMatch(
					/\b(?:feet|foot|miles?|pés?|milhas?)\b/i
				);
				const rules = entry.rules as Record<string, unknown>;
				if (rules.damage === null) expect(view.damage).toEqual([]);
				else expect(view.damage.length).toBeGreaterThan(0);
				if (rules.scaling === null) expect(view.spellSlot).toEqual([]);
				else expect(view.spellSlot.length).toBeGreaterThan(0);
			}
		}
		expect(
			spells.find((entry) => entry.name === 'Instant Summons')?.translations[
				'pt-BR.rules.description'
			]
		).toContain('1,8 m');
		expect(
			spells.find((entry) => entry.name === 'Secret Chest')?.translations['pt-BR.rules.description']
		).toContain('3,6 m³');
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
