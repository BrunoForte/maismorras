import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import CharacterInventoryTab from './CharacterInventoryTab.svelte';
import type { CompendiumEntry } from '$lib/services/compendiumApi';

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
		rules: { catalog: 'magic-item' },
		translations: { 'pt-BR': 'Bolsa de Carga', 'pt-BR.source': 'reviewed' },
		isPublished: true
	}
];

describe('CharacterInventoryTab compendium picker', () => {
	it('renders accessible localized groups and keeps stable entry IDs as option values', () => {
		const html = render(CharacterInventoryTab, {
			props: {
				itemEntries: entries,
				visibleItems: [],
				carriedWeight: 151,
				capacityLb: 150,
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
		expect(html).toContain('151 / 150 lb');
		expect(html).toContain('O total pode estar incompleto');
		expect(html).toContain('Acima da capacidade de carga');
		expect(html).toContain('Forma Grande ativa');
	});
});
