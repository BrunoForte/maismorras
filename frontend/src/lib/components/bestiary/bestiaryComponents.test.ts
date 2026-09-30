import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { NPC } from '$lib/services/npcApi';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import BestiaryCatalog from './BestiaryCatalog.svelte';
import BestiaryCreatureEditor from './BestiaryCreatureEditor.svelte';
import BestiarySrdDetails from './BestiarySrdDetails.svelte';
import { createFreshCreatureSheet } from '$lib/utils/bestiary/bestiaryRules';

const npc = {
	id: 'npc-1',
	name: 'Aranha gigante',
	sheet: { ...createFreshCreatureSheet(), challenge: '1' }
} as NPC;
const srd: CompendiumEntry = {
	id: 'srd-1',
	sourceId: 'srd',
	entryType: 'other',
	name: 'Giant Spider',
	summary: 'A spider.',
	rules: {
		kind: 'monster',
		challenge: '1',
		hpMax: 26,
		armorClass: 14,
		actions: [{ name: 'Bite', damage: '1d8' }]
	},
	translations: {},
	isPublished: true
};

describe('bestiary visual panels', () => {
	it('renders private and SRD catalogs with selection affordances', () => {
		const html = render(BestiaryCatalog, {
			props: {
				locale: 'en',
				loading: false,
				query: '',
				sortMode: 'name',
				npcs: [{ id: npc.id, name: npc.name, meta: 'CR 1 · HP 10 · AC 10' }],
				srdCreatures: [{ id: srd.id, name: srd.name, meta: 'SRD · CR 1' }],
				selectedNpcId: npc.id,
				selectedSrdId: null,
				onQueryChange: vi.fn(),
				onSortChange: vi.fn(),
				onSelectNpc: vi.fn(),
				onSelectSrd: vi.fn()
			}
		}).body;
		expect(html).toContain('Campaign creatures');
		expect(html).toContain('Aranha gigante');
		expect(html).toContain('SRD creatures');
		expect(html).toContain('Giant Spider');
	});

	it('renders the private editor and its save/placement actions without API dependencies', () => {
		const actions = {
			onSave: vi.fn(),
			onAddTrait: vi.fn(),
			onRemoveTrait: vi.fn(),
			onAddAction: vi.fn(),
			onRemoveAction: vi.fn(),
			onPlace: vi.fn()
		};
		const html = render(BestiaryCreatureEditor, {
			props: {
				name: npc.name,
				sheet: npc.sheet,
				selected: npc,
				saving: false,
				placing: false,
				locale: 'pt-BR',
				...actions
			}
		}).body;
		expect(html).toContain('Editar criatura');
		expect(html).toContain('Salvar alterações');
		expect(html).toContain('Adicionar à cena');
		expect(actions.onSave).not.toHaveBeenCalled();
		expect(actions.onPlace).not.toHaveBeenCalled();
	});

	it('shows SRD statistics and only exposes the scene action for a valid stat block', () => {
		const onPlace = vi.fn();
		const html = render(BestiarySrdDetails, {
			props: {
				entry: srd,
				locale: 'en',
				placing: false,
				formatDistance: (value: string) => value,
				onPlace
			}
		}).body;
		expect(html).toContain('SRD CREATURE · READ ONLY');
		expect(html).toContain('HP 26');
		expect(html).toContain('Bite');
		expect(html).toContain('Add to scene');
		expect(onPlace).not.toHaveBeenCalled();
		const unavailable = render(BestiarySrdDetails, {
			props: {
				entry: { ...srd, rules: { kind: 'monster' } },
				locale: 'en',
				placing: false,
				formatDistance: (value: string) => value,
				onPlace
			}
		}).body;
		expect(unavailable).toContain('não pode ser adicionada à cena');
		expect(unavailable).not.toContain('Add to scene');
	});
});
