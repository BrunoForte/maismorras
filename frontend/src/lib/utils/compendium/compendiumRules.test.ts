import { describe, expect, it } from 'vitest';
import type { CompendiumEntry, CompendiumSource } from '$lib/services/compendiumApi';
import {
	compendiumDraftFromEditor,
	canInitiateCompendiumTranslation,
	compendiumEntryTranslationStatus,
	compendiumRulesFromEditor,
	editorModelFromEntry,
	emptyCompendiumEditorModel,
	filterAndSortCompendiumEntries,
	hasPendingCompendiumTranslation,
	isCompendiumTranslationPending,
	normalizeCompendiumSearch,
	preferredCompendiumFeatEntries,
	resolveCompendiumFeatEntry,
	translatedCompendiumName,
	translatedCompendiumText,
	translatedFeatDetails
} from './compendiumRules';

const sources: CompendiumSource[] = [
	{
		id: 'srd',
		slug: 'srd',
		title: 'SRD',
		kind: 'srd',
		version: '5.2',
		attribution: '',
		licenseUrl: '',
		readOnly: true
	},
	{
		id: 'home',
		slug: 'home',
		title: 'Minha mesa',
		kind: 'private',
		version: '',
		attribution: '',
		licenseUrl: '',
		readOnly: false
	}
];
const entry = (
	id: string,
	name: string,
	type = 'other',
	sourceId = 'srd',
	challenge = 1
): CompendiumEntry => ({
	id,
	name,
	entryType: type,
	sourceId,
	summary: `Resumo ${name}`,
	rules: { challenge },
	translations: {},
	isPublished: true
});

describe('compendium rules', () => {
	it('shows reviewed magic item names in Portuguese and falls back to source text', () => {
		const magicItem: CompendiumEntry = {
			...entry('magic', 'Bag of Holding'),
			translations: { 'pt-BR': 'Bolsa de Carga', 'pt-BR.source': 'reviewed' }
		};
		expect(translatedCompendiumName(magicItem, 'pt-BR')).toBe('Bolsa de Carga');
		expect(translatedCompendiumName(magicItem, 'en')).toBe('Bag of Holding');
		expect(translatedCompendiumName({ ...magicItem, translations: {} }, 'pt-BR')).toBe(
			'Bag of Holding'
		);
	});

	it('resolves nested class features and feat benefits in Portuguese with English fallback', () => {
		const localized: CompendiumEntry = {
			...entry('feat', 'Alert', 'feat'),
			rules: {
				features: [{ name: 'Second Wind', description: 'Regain hit points.' }],
				benefits: ['Add proficiency to Initiative.']
			},
			translations: {
				'pt-BR.rules.features.0.name': 'Segundo Fôlego',
				'pt-BR.rules.features.0.description': 'Recupere pontos de vida.',
				'pt-BR.rules.benefits.0': 'Adicione proficiência à Iniciativa.'
			},
			isPublished: true
		};
		expect(
			translatedCompendiumText(localized, 'rules.features.0.name', 'Second Wind', 'pt-BR')
		).toBe('Segundo Fôlego');
		expect(
			translatedCompendiumText(
				localized,
				'rules.benefits.0',
				'Add proficiency to Initiative.',
				'pt-BR'
			)
		).toBe('Adicione proficiência à Iniciativa.');
		expect(
			translatedCompendiumText(
				localized,
				'rules.benefits.0',
				'Add proficiency to Initiative.',
				'en'
			)
		).toBe('Add proficiency to Initiative.');
		expect(
			translatedCompendiumText(
				{ ...localized, translations: {} },
				'rules.features.0.name',
				'Second Wind',
				'pt-BR'
			)
		).toBe('Second Wind');
	});

	it('builds the character-sheet feat text from localized description and benefit keys', () => {
		const feat: CompendiumEntry = {
			...entry('alert', 'Alert', 'feat'),
			summary: 'Always ready.',
			rules: { description: 'You are always ready.', benefits: ['Add proficiency to Initiative.'] },
			translations: {
				'pt-BR.rules.description': 'Você está sempre preparado.',
				'pt-BR.rules.benefits.0': 'Adicione proficiência à Iniciativa.'
			},
			isPublished: true
		};
		expect(translatedFeatDetails(feat, 'pt-BR')).toBe(
			'Você está sempre preparado.\n\nAdicione proficiência à Iniciativa.'
		);
		expect(translatedFeatDetails({ ...feat, translations: {} }, 'pt-BR')).toBe(
			'You are always ready.\n\nAdd proficiency to Initiative.'
		);
	});

	it('resolves legacy short fighting-style feat names to complete SRD entries without duplicates', () => {
		const aliases = [
			['Archery', 'Fighting Style: Archery', 'Estilo de Luta: Arquearia'],
			['Defense', 'Fighting Style: Defense', 'Estilo de Luta: Defesa'],
			[
				'Great Weapon Fighting',
				'Fighting Style: Great Weapon Fighting',
				'Estilo de Luta: Combate com Armas Grandes'
			],
			[
				'Two-Weapon Fighting',
				'Fighting Style: Two-Weapon Fighting',
				'Estilo de Luta: Combate com Duas Armas'
			]
		] as const;
		const entries = aliases.flatMap(([shortName, fullName, localizedName]) => {
			const legacy: CompendiumEntry = {
				...entry(`legacy-${shortName}`, shortName, 'feat'),
				summary: 'Entrada do System Reference Document 5.2.1.',
				rules: {},
				translations: { 'pt-BR': shortName }
			};
			const complete: CompendiumEntry = {
				...entry(`full-${shortName}`, fullName, 'feat'),
				rules: { description: `Descrição oficial de ${shortName}.` },
				translations: {
					'pt-BR': localizedName,
					'pt-BR.rules.description': `Descrição localizada de ${shortName}.`
				}
			};
			return [legacy, complete];
		});
		const preferred = preferredCompendiumFeatEntries(entries, sources);
		const catalogVisible = filterAndSortCompendiumEntries(
			entries,
			sources,
			{ query: '', entryType: 'feat', sourceId: 'all', sortMode: 'name' },
			(item) => item.name
		);
		const searchedByShortName = filterAndSortCompendiumEntries(
			entries,
			sources,
			{ query: 'Archery', entryType: 'feat', sourceId: 'all', sortMode: 'name' },
			(item) => item.name
		);

		expect(preferred).toHaveLength(aliases.length);
		expect(catalogVisible).toHaveLength(aliases.length);
		expect(searchedByShortName.map((item) => item.name)).toEqual(['Fighting Style: Archery']);
		for (const [shortName, fullName, localizedName] of aliases) {
			const resolved = resolveCompendiumFeatEntry(shortName, preferred);
			expect(resolved?.name).toBe(fullName);
			expect(translatedCompendiumName(resolved!, 'pt-BR')).toBe(localizedName);
			expect(translatedFeatDetails(resolved!, 'pt-BR')).toBe(
				`Descrição localizada de ${shortName}.`
			);
		}
	});

	it('shows translation capability only for the platform owner on shared SRD and GMs on private sources', () => {
		const sharedEntry = entry('shared-1', 'Wizard', 'class', 'srd');
		const privateEntry = entry('private-1', 'Homebrew spell', 'spell', 'home');
		expect(canInitiateCompendiumTranslation(sharedEntry, sources[0], true, false)).toBe(true);
		expect(canInitiateCompendiumTranslation(sharedEntry, sources[0], false, true)).toBe(false);
		expect(canInitiateCompendiumTranslation(privateEntry, sources[1], true, false)).toBe(false);
		expect(canInitiateCompendiumTranslation(privateEntry, sources[1], false, true)).toBe(true);
		expect(canInitiateCompendiumTranslation(sharedEntry, undefined, false, false)).toBe(false);
	});

	it('normalizes search text and filters by type, source, and localized/original name', () => {
		const entries = [
			entry('1', 'Goblin', 'other'),
			entry('2', 'Bola de fogo', 'spell', 'home'),
			entry('3', 'Orc', 'other')
		];
		expect(normalizeCompendiumSearch('  BOLA DE FOGO ')).toBe('bola de fogo');
		expect(
			filterAndSortCompendiumEntries(
				entries,
				sources,
				{ query: ' fogo ', entryType: 'spell', sourceId: 'home', sortMode: 'name' },
				(item) => item.name
			).map((item) => item.id)
		).toEqual(['2']);
	});

	it('orders by name, category, challenge rating, and source', () => {
		const entries = [
			entry('z', 'Zulu', 'spell', 'home', 2),
			entry('a', 'Alpha', 'other', 'srd', 0.5),
			entry('b', 'Beta', 'spell', 'srd', 1)
		];
		const sort = (sortMode: 'name' | 'category' | 'challenge' | 'source') =>
			filterAndSortCompendiumEntries(
				entries,
				sources,
				{ query: '', entryType: 'all', sourceId: 'all', sortMode },
				(item) => item.name
			).map((item) => item.id);
		expect(sort('name')).toEqual(['a', 'b', 'z']);
		expect(sort('category')).toEqual(['a', 'b', 'z']);
		expect(sort('challenge')).toEqual(['a', 'b', 'z']);
		expect(sort('source')).toEqual(['z', 'a', 'b']);
	});

	it('detects pending translations for nested fields and accepts completed translations', () => {
		expect(isCompendiumTranslationPending('  Dark Vision ', 'Dark Vision')).toBe(true);
		expect(isCompendiumTranslationPending('Dark Vision', 'Visão no escuro')).toBe(false);
		const pending = entry('1', 'Feat');
		pending.translations = { 'pt-BR': 'Talento', 'pt-BR.summary': 'Resumo' };
		pending.rules = { actions: [{ description: 'Darkness surrounds the target' }] };
		expect(hasPendingCompendiumTranslation(pending)).toBe(true);
		pending.translations['pt-BR.rules.actions.0.description'] = 'A escuridão envolve o alvo';
		expect(hasPendingCompendiumTranslation(pending)).toBe(false);
	});

	it('ignores mechanical fields, empty prose and preserves official, manual and AI provenance', () => {
		const item = entry('1', 'Fireball', 'spell');
		item.summary = '';
		item.rules = {
			id: 'spell-fireball',
			damage: '8d6 fire damage',
			range: '150 feet',
			name: 'Fireball',
			description: 'A bright streak deals 8d6 damage.'
		};
		item.translations = {
			'pt-BR': 'Fireball',
			'pt-BR.source': 'ai',
			'pt-BR.rules.name': 'Fireball',
			'pt-BR.rules.name.source': 'ai',
			'pt-BR.rules.description': 'Um raio brilhante causa 8d6 de dano.',
			'pt-BR.rules.description.source': 'official'
		};
		expect(hasPendingCompendiumTranslation(item)).toBe(false);
		expect(compendiumEntryTranslationStatus(item)).toBe('official');
		item.translations['pt-BR.source'] = 'manual';
		item.translations['pt-BR.rules.description.source'] = 'manual';
		expect(hasPendingCompendiumTranslation(item)).toBe(false);
		expect(compendiumEntryTranslationStatus(item)).toBe('manual');
		delete item.translations['pt-BR.rules.description.source'];
		item.translations['pt-BR.source'] = 'ai';
		expect(compendiumEntryTranslationStatus(item)).toBe('ai');
	});

	it('does not queue numeric mechanics as pending translation and exposes only missing prose', () => {
		const item = entry('1', 'Fireball', 'spell');
		item.rules = { damage: '8d6 fire damage', range: '150 feet', description: 'A flame erupts.' };
		expect(hasPendingCompendiumTranslation(item)).toBe(true);
		item.translations = { 'pt-BR': 'Bola de fogo', 'pt-BR.summary': 'Resumo' };
		item.translations['pt-BR.rules.description'] = 'Uma chama irrompe.';
		expect(hasPendingCompendiumTranslation(item)).toBe(false);
	});

	it('prepares edit fields and rules for each supported domain type', () => {
		const source = entry('spell', 'Shield', 'spell', 'home');
		source.rules = { level: 1, classes: ['wizard', 'sorcerer'] };
		expect(editorModelFromEntry(source)).toMatchObject({
			entryType: 'spell',
			spellLevel: 1,
			spellClasses: 'wizard, sorcerer'
		});
		expect(
			compendiumRulesFromEditor({
				...emptyCompendiumEditorModel(),
				entryType: 'species',
				speed: 10
			})
		).toEqual({ speed: 10 });
		expect(
			compendiumRulesFromEditor({
				...emptyCompendiumEditorModel(),
				entryType: 'class',
				classHitDie: 10,
				levelFeatures: [
					{ id: 'x', level: 2, name: '  Action Surge ', description: ' Extra action ' }
				]
			})
		).toEqual({
			hitDie: 10,
			features: [{ id: 'x', level: 2, name: 'Action Surge', description: 'Extra action' }]
		});
		expect(
			compendiumRulesFromEditor({
				...emptyCompendiumEditorModel(),
				entryType: 'subclass',
				parentClass: ' Fighter ',
				levelFeatures: [{ id: 'x', level: 3, name: 'Maneuvers', description: '' }]
			})
		).toEqual({
			className: 'Fighter',
			features: [{ id: 'x', level: 3, name: 'Maneuvers', description: '' }]
		});
		expect(
			compendiumRulesFromEditor({
				...emptyCompendiumEditorModel(),
				entryType: 'item',
				category: 'weapon',
				itemDamage: ' 1d8 slashing ',
				itemDefense: 0
			})
		).toEqual({ category: 'weapon', damage: '1d8 slashing' });
		expect(
			compendiumRulesFromEditor({
				...emptyCompendiumEditorModel(),
				entryType: 'other',
				category: 'monster',
				hpMax: 22,
				imageUrl: ' assets/ogre.webp '
			})
		).toMatchObject({ kind: 'monster', hpMax: 22, imageUrl: 'assets/ogre.webp' });
	});

	it('builds a draft without losing existing translations or mutating entry rules', () => {
		const original = entry('1', 'Ogre', 'other', 'home');
		original.rules = { kind: 'monster', hpMax: 30, armorClass: 11, extra: { preserved: true } };
		original.translations = { 'pt-BR': 'Ogro', 'pt-BR.rules.extra': 'mantido' };
		const model = editorModelFromEntry(original);
		model.hpMax = 35;
		const draft = compendiumDraftFromEditor(model);
		expect(draft.rules).toMatchObject({ hpMax: 35, extra: { preserved: true } });
		expect(draft.translations).toMatchObject(original.translations);
		expect(original.rules.hpMax).toBe(30);
	});

	it('marks an edited Portuguese name as manually reviewed without replacing official provenance', () => {
		const original = entry('manual', 'Wizard', 'class', 'home');
		const draft = editorModelFromEntry(original);
		draft.portugueseName = 'Mago';
		expect(compendiumDraftFromEditor(draft, original).translations).toMatchObject({
			'pt-BR': 'Mago',
			'pt-BR.source': 'manual'
		});
		original.translations = { 'pt-BR': 'Mago', 'pt-BR.source': 'official' };
		draft.portugueseName = 'Mago';
		expect(compendiumDraftFromEditor(draft, original).translations['pt-BR.source']).toBe(
			'official'
		);
	});
});
