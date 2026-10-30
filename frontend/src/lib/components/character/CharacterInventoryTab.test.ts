import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import CharacterInventoryTab from './CharacterInventoryTab.svelte';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import { setAppLocale } from '$lib/stores/locale';

const entries: CompendiumEntry[] = [
	{
		id: 'b',
		sourceId: 'srd',
		entryType: 'item',
		name: 'Besta',
		summary: '',
		rules: { category: 'weapon' },
		translations: {},
		isPublished: true
	},
	{
		id: 'a',
		sourceId: 'srd',
		entryType: 'item',
		name: 'Adaga',
		summary: '',
		rules: { category: 'weapon' },
		translations: {},
		isPublished: true
	},
	{
		id: 'shield',
		sourceId: 'srd',
		entryType: 'item',
		name: 'Escudo',
		summary: '',
		rules: { category: 'shield' },
		translations: {},
		isPublished: true
	},
	{
		id: 'other',
		sourceId: 'srd',
		entryType: 'item',
		name: 'Relíquia',
		summary: '',
		rules: {},
		translations: {},
		isPublished: true
	},
	{
		id: 'magic-catalog',
		sourceId: 'srd',
		entryType: 'other',
		name: 'Bag of Holding',
		summary: 'Item mágico do System Reference Document 5.2.1.',
		rules: {
			catalog: 'magic-item',
			description: 'This bag can hold up to 500 pounds and 64 cubic feet.'
		},
		translations: {
			'pt-BR': 'Bolsa de Carga',
			'pt-BR.source': 'reviewed',
			'pt-BR.rules.description': 'Esta bolsa comporta até 227 kg e 1,8 m³.',
			'pt-BR.rules.description.source': 'reviewed'
		},
		isPublished: true
	}
];

describe('CharacterInventoryTab compendium picker', () => {
	it('renders accessible localized groups and keeps stable entry IDs as option values', () => {
		const html = render(CharacterInventoryTab, {
			props: {
				itemEntries: entries,
				allCompendiumEntries: entries,
				visibleItems: [],
				carriedWeight: 151,
				capacityLb: 150,
				pushDragLiftLb: 300,
				powerfulBuildApplied: true,
				loadIncomplete: true,
				unknownItemCount: 1,
				canUseLargeForm: true,
				largeFormActive: true,
				onLargeFormChange: vi.fn(),
				money: { cp: 2, sp: 3, ep: 4, gp: 5, pp: 6 },
				onMoneyChange: vi.fn(),
				inventoryFilter: 'all',
				optionLabel: (entry) => entry.translations['pt-BR'] ?? entry.name,
				onAddCompendiumItem: vi.fn(),
				onAddCustomItem: vi.fn(async () => true),
				onRemoveItem: vi.fn(),
				onChangeQuantity: vi.fn(),
				onChangeDescription: vi.fn()
			}
		}).body;
		expect(html).toContain('aria-label="Escolher item do compêndio"');
		expect(html).toContain('<optgroup label="Armas">');
		expect(html).toContain('<optgroup label="Escudos">');
		expect(html).toContain('<optgroup label="Outros itens">');
		expect(html.indexOf('value="a"')).toBeLessThan(html.indexOf('value="b"'));
		expect(html).toContain('value="shield"');
		expect(html).toContain('value="other"');
		expect(html).toContain('value="magic-catalog"');
		expect(html).toContain('Bolsa de Carga');
		expect(html).toContain('Dinheiro');
		expect(html).toContain('aria-label="PC · Cobre"');
		expect(html).toContain('value="5"');
		expect(html).toContain('Peso carregado / capacidade máxima');
		expect(html).toContain('68,49 / 68,04 kg');
		expect(html).toContain('Limite para empurrar / arrastar / levantar');
		expect(html).toContain('136,08 kg</span>');
		expect(html).toContain('Pesos são arredondados a 0,01 kg');
		expect(html).toContain('distâncias são arredondadas ao múltiplo mais próximo de 1,5 m');
		expect(html).toContain('Porte Poderoso altera apenas a capacidade de carga');
		expect(html).toContain('deslocamento não pode exceder 1,5 m');
		expect(html).toContain('Peso (kg)');
		expect(html).toContain('O total pode estar incompleto');
		expect(html).toContain('Acima da capacidade de carga');
		expect(html).toContain('Forma Grande ativa');
	});

	it('shows the localized magic-item description in inventory with English fallback and separate player notes', () => {
		setAppLocale('pt-BR');
		const props = {
			itemEntries: entries,
			allCompendiumEntries: entries,
			visibleItems: [
				{
					item: {
						entryId: 'magic-catalog',
						name: 'Bolsa de Carga',
						quantity: 1,
						equipped: false,
						rules: { weight: 1, playerDescription: 'Nota pessoal da mesa.' }
					},
					index: 0
				}
			],
			carriedWeight: 0,
			capacityLb: 150,
			pushDragLiftLb: 300,
			powerfulBuildApplied: false,
			loadIncomplete: false,
			unknownItemCount: 0,
			canUseLargeForm: false,
			largeFormActive: false,
			onLargeFormChange: vi.fn(),
			money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
			onMoneyChange: vi.fn(),
			inventoryFilter: 'all' as const,
			optionLabel: (entry: CompendiumEntry) => entry.translations['pt-BR'] ?? entry.name,
			onAddCompendiumItem: vi.fn(),
			onAddCustomItem: vi.fn(async () => true),
			onRemoveItem: vi.fn(),
			onChangeQuantity: vi.fn(),
			onChangeDescription: vi.fn()
		};
		const localizedHtml = render(CharacterInventoryTab, { props }).body;
		expect(localizedHtml).toContain('Esta bolsa comporta até 227 kg e 1,8 m³.');
		expect(localizedHtml).toContain('0,45 kg');
		expect(localizedHtml).not.toContain('data-testid="powerful-build-capacity-note"');
		expect(localizedHtml).toContain('data-testid="hauling-speed-limit"');
		const fallbackEntries = entries.map((entry) =>
			entry.id === 'magic-catalog'
				? { ...entry, translations: { 'pt-BR': 'Bolsa de Carga', 'pt-BR.source': 'reviewed' } }
				: entry
		);
		const fallbackHtml = render(CharacterInventoryTab, {
			props: { ...props, itemEntries: fallbackEntries, allCompendiumEntries: fallbackEntries }
		}).body;
		expect(fallbackHtml).toContain('This bag can hold up to 500 pounds and 64 cubic feet.');
	});
});
