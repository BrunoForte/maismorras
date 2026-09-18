<!-- eslint-disable svelte/require-each-key -- some editable sheet arrays are positional by design. -->
<script lang="ts">
	/* eslint-disable svelte/require-each-key, @typescript-eslint/no-unused-vars */
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createEmptySheet,
		getCharacterForGM,
		getMyCharacter,
		rollMyCharacter,
		castMySpell,
		saveCharacterForGM,
		saveMyCharacter,
		type CharacterSheet as Sheet,
		type InventoryItem
	} from '$lib/services/characterApi';
	import { createTokenFromCharacter, listSceneEffects, loadScene } from '$lib/services/sceneApi';
	import {
		createCompendiumEntry,
		getCompendium,
		type CompendiumEntry,
		type CompendiumSource
	} from '$lib/services/compendiumApi';
	import { rollDice } from '$lib/services/eventApi';
	import {
		beginDiceBatch,
		diceOverlay,
		finishDiceBatch,
		setDiceColor
	} from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { gerarImagemToken } from '$lib/services/tokenImageApi';
	import { supabase } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import {
		classData,
		classFeatures,
		canonicalClass as progressionClass,
		defaultResources,
		spellSlots
	} from '$lib/data/classProgression';
	import { appLocale, distance, distanceText } from '$lib/stores/locale';
	import { calculateArmorClass } from '$lib/utils/armorClass';

	let {
		campaignId,
		sceneId,
		session,
		isGM,
		characterId = null,
		characterOwnerName = '',
		docked = false,
		onclose,
		onTokenCreated
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		isGM: boolean;
		characterId?: string | null;
		characterOwnerName?: string;
		docked?: boolean;
		onclose: () => void;
		onTokenCreated: () => void;
	} = $props();
	let sheet = $state<Sheet>(createEmptySheet());
	let loading = $state(true);
	let saving = $state(false);
	let message = $state('');
	let isNewCharacter = $state(false);
	let compendiumEntries = $state<CompendiumEntry[]>([]);
	let compendiumSources = $state<CompendiumSource[]>([]);
	let selectedItemId = $state('');
	let selectedSpellId = $state('');
	let customItemName = $state('');
	let customItemCategory = $state<'weapon' | 'armor' | 'consumable' | 'gear'>('gear');
	let customItemDamage = $state('');
	let customItemDefense = $state(10);
	let customItemQuantity = $state(1);
	let spellCircle = $state('all');
	let activeTab = $state<'profile' | 'skills' | 'combat' | 'inventory' | 'spells' | 'details'>(
		'profile'
	);
	let inventoryFilter = $state<'all' | 'weapon' | 'armor' | 'consumable' | 'tool' | 'gear'>('all');
	let rollingWeapon = $state<string | null>(null);
	let rollingAttack = $state<number | null>(null);
	let rollMode = $state<'normal' | 'advantage' | 'disadvantage'>('normal');
	let castingSpell = $state<number | null>(null);
	let spellSlotChoice = $state<Record<number, number>>({});
	let newFeat = $state('');
	let selectedFeat = $state('');
	let tokenSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let minimized = $state(false);
	let activeConditions = $state<string[]>([]);
	let previousLevel = $state(1);
	let levelChoiceOpen = $state(false);
	let portraitPrompt = $state('');
	let portraitPreview = $state<string | null>(null);
	let portraitBusy = $state(false);
	let expandedFeature = $state<string | null>(null);
	const hasAttackDisadvantage = () =>
		activeConditions.some((condition) => ['Cego', 'Envenenado', 'Impedido'].includes(condition));
	const selectedAttackMode = () => (hasAttackDisadvantage() ? 'disadvantage' : rollMode);
	$effect(() => {
		if (hasAttackDisadvantage() && rollMode === 'advantage') rollMode = 'normal';
	});
	const skills = [
		['Acrobacia', 'dexterity'],
		['Adestrar Animais', 'wisdom'],
		['Arcanismo', 'intelligence'],
		['Atletismo', 'strength'],
		['Atuação', 'charisma'],
		['Enganação', 'charisma'],
		['Furtividade', 'dexterity'],
		['História', 'intelligence'],
		['Intimidação', 'charisma'],
		['Intuição', 'wisdom'],
		['Investigação', 'intelligence'],
		['Medicina', 'wisdom'],
		['Natureza', 'intelligence'],
		['Percepção', 'wisdom'],
		['Persuasão', 'charisma'],
		['Prestidigitação', 'dexterity'],
		['Religião', 'intelligence'],
		['Sobrevivência', 'wisdom']
	] as const;
	const attributes: { key: keyof Sheet['abilityScores']; label: string }[] = [
		{ key: 'strength', label: 'FOR' },
		{ key: 'dexterity', label: 'DES' },
		{ key: 'constitution', label: 'CON' },
		{ key: 'intelligence', label: 'INT' },
		{ key: 'wisdom', label: 'SAB' },
		{ key: 'charisma', label: 'CAR' }
	];
	const abilityLabel = (key: keyof Sheet['abilityScores']) => {
		const labels =
			$appLocale === 'en'
				? {
						strength: 'STR',
						dexterity: 'DEX',
						constitution: 'CON',
						intelligence: 'INT',
						wisdom: 'WIS',
						charisma: 'CHA'
					}
				: {
						strength: 'FOR',
						dexterity: 'DES',
						constitution: 'CON',
						intelligence: 'INT',
						wisdom: 'SAB',
						charisma: 'CAR'
					};
		return labels[key];
	};
	const skillLabel = (name: string) => {
		if ($appLocale === 'pt-BR') return name;
		return (
			(
				{
					Acrobacia: 'Acrobatics',
					'Adestrar Animais': 'Animal Handling',
					Arcanismo: 'Arcana',
					Atletismo: 'Athletics',
					Atuação: 'Performance',
					Enganação: 'Deception',
					Furtividade: 'Stealth',
					História: 'History',
					Intimidação: 'Intimidation',
					Intuição: 'Insight',
					Investigação: 'Investigation',
					Medicina: 'Medicine',
					Natureza: 'Nature',
					Percepção: 'Perception',
					Persuasão: 'Persuasion',
					Prestidigitação: 'Sleight of Hand',
					Religião: 'Religion',
					Sobrevivência: 'Survival'
				} as Record<string, string>
			)[name] ?? name
		);
	};
	const sheetTabs = () =>
		$appLocale === 'en'
			? [
					['profile', 'Profile'],
					['skills', 'Skills'],
					['combat', 'Combat'],
					['inventory', 'Inventory'],
					['spells', 'Spells'],
					['details', 'Details']
				]
			: [
					['profile', 'Perfil'],
					['skills', 'Perícias'],
					['combat', 'Combate'],
					['inventory', 'Inventário'],
					['spells', 'Magias'],
					['details', 'Detalhes']
				];
	const modifier = (score: number) => Math.floor((score - 10) / 2);
	const classHitDice: Record<string, string> = Object.fromEntries(
		Object.entries(classData).map(([name, data]) => [name, data.hitDice])
	);
	const classSavingThrows: Record<string, string[]> = {
		barbarian: ['strength', 'constitution'],
		bard: ['dexterity', 'charisma'],
		cleric: ['wisdom', 'charisma'],
		druid: ['intelligence', 'wisdom'],
		fighter: ['strength', 'constitution'],
		monk: ['strength', 'dexterity'],
		paladin: ['wisdom', 'charisma'],
		ranger: ['strength', 'dexterity'],
		rogue: ['dexterity', 'intelligence'],
		sorcerer: ['constitution', 'charisma'],
		warlock: ['wisdom', 'charisma'],
		wizard: ['intelligence', 'wisdom']
	};
	type SpeciesProfile = {
		label: string;
		speed: number;
		traits: string[];
		lineages?: Record<string, string[]>;
	};
	// These are the mechanical choices exposed by the CC-BY SRD 5.2.1. They are
	// calculated from the chosen species rather than copied into the free-form
	// notes field, so changing a lineage cannot leave stale traits on a sheet.
	const speciesProfiles: Record<string, SpeciesProfile> = {
		dragonborn: {
			label: 'Draconato',
			speed: 9,
			traits: [
				'Visão no escuro 18 m',
				'Arma de sopro (CON; usos = bônus de proficiência)',
				'Voo dracônico a partir do nível 5'
			],
			lineages: {
				'Negro (ácido)': ['Resistência a ácido', 'Sopro: ácido'],
				'Azul (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
				'Latão (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
				'Bronze (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
				'Cobre (ácido)': ['Resistência a ácido', 'Sopro: ácido'],
				'Ouro (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
				'Verde (veneno)': ['Resistência a veneno', 'Sopro: veneno'],
				'Vermelho (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
				'Prata (frio)': ['Resistência a frio', 'Sopro: frio'],
				'Branco (frio)': ['Resistência a frio', 'Sopro: frio']
			}
		},
		dwarf: {
			label: 'Anão',
			speed: 9,
			traits: [
				'Visão no escuro 36 m',
				'Resistência a veneno e vantagem contra Envenenado',
				'PV máximo +1 por nível (Robustez Anã)',
				'Conhecimento da Pedra'
			]
		},
		elf: {
			label: 'Elfo',
			speed: 9,
			traits: [
				'Visão no escuro 18 m',
				'Ancestralidade feérica: vantagem contra Enfeitiçado',
				'Sentidos aguçados; Transe (Descanso Longo em 4 h)'
			],
			lineages: {
				Drow: [
					'Visão no escuro 36 m',
					'Luzes Dançantes; nível 3: Fogo das Fadas; nível 5: Escuridão'
				],
				'Alto Elfo': [
					'Prestidigitação (pode trocar por truque de mago após Descanso Longo)',
					'nível 3: Detectar Magia; nível 5: Passo Nebuloso'
				],
				'Elfo da Floresta': [
					'Deslocamento 10,5 m',
					'Arte Druídica; nível 3: Passo Longo; nível 5: Passos sem Pegadas'
				]
			}
		},
		gnome: {
			label: 'Gnomo',
			speed: 9,
			traits: [
				'Visão no escuro 18 m',
				'Astúcia Gnômica: vantagem em testes de resistência de INT, SAB e CAR'
			],
			lineages: {
				'Gnomo da Floresta': ['Ilusão Menor; Falar com Animais preparado'],
				'Gnomo da Rocha': ['Consertar e Prestidigitação; engenhoca mecânica']
			}
		},
		goliath: {
			label: 'Golias',
			speed: 10.5,
			traits: [
				'Forma Grande a partir do nível 5',
				'Porte Poderoso',
				'Escolha uma Ancestralidade Gigante (usos = bônus de proficiência)'
			],
			lineages: {
				Nuvem: ['Passo da Nuvem: teleporte 9 m como ação bônus'],
				Fogo: ['Queimadura do Fogo: +1d10 fogo ao acertar'],
				Gelo: ['Frio do Gelo: +1d6 frio e -3 m de deslocamento'],
				Colina: ['Tombamento da Colina: derruba alvo Grande ou menor'],
				Pedra: ['Resistência da Pedra: reação reduz dano em 1d12 + CON'],
				Tempestade: ['Trovão da Tempestade: reação, 1d8 trovão']
			}
		},
		halfling: {
			label: 'Halfling',
			speed: 9,
			traits: [
				'Corajoso: vantagem contra Amedrontado',
				'Sorte: rerrola 1 em d20',
				'Nimbleza Halfling',
				'Furtividade Natural'
			]
		},
		human: {
			label: 'Humano',
			speed: 9,
			traits: [
				'Versátil: um talento de origem',
				'Habilidoso: proficiência em uma perícia',
				'Recursivo: Inspiração Heroica após Descanso Longo'
			]
		},
		orc: {
			label: 'Orc',
			speed: 9,
			traits: [
				'Visão no escuro 36 m',
				'Investida de Adrenalina',
				'Resistência Incansável: fica com 1 PV em vez de 0 (1/Descanso Longo)'
			]
		},
		tiefling: {
			label: 'Tiefling',
			speed: 9,
			traits: ['Visão no escuro 18 m', 'Presença Sobrenatural: Taumaturgia'],
			lineages: {
				Abissal: [
					'Resistência a veneno',
					'Rajada Venenosa; nível 3: Raio de Enjoo; nível 5: Imobilizar Pessoa'
				],
				Ctônico: [
					'Resistência a necrótico',
					'Toque Gélido; nível 3: Vida Falsa; nível 5: Raio Enfraquecedor'
				],
				Infernal: [
					'Resistência a fogo',
					'Raio de Fogo; nível 3: Repreensão Infernal; nível 5: Escuridão'
				]
			}
		}
	};
	function normalizedSpecies(value: string) {
		const species = value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
		return (
			(
				{
					draconato: 'dragonborn',
					anao: 'dwarf',
					elfo: 'elf',
					gnomo: 'gnome',
					golias: 'goliath',
					halfling: 'halfling',
					humano: 'human',
					orc: 'orc',
					tiefling: 'tiefling'
				} as Record<string, string>
			)[species] ?? species
		);
	}
	const speciesProfile = () => speciesProfiles[normalizedSpecies(sheet.species)];
	const lineageOptions = () => Object.keys(speciesProfile()?.lineages ?? {});
	const activeSpeciesTraits = () => {
		const profile = speciesProfile();
		if (!profile) return [];
		return [...profile.traits, ...(profile.lineages?.[sheet.speciesLineage] ?? [])];
	};
	const speciesSpeed = () =>
		normalizedSpecies(sheet.species) === 'elf' && sheet.speciesLineage === 'Elfo da Floresta'
			? 10.5
			: (speciesProfile()?.speed ?? sheet.speed);
	const speciesHPBonusPerLevel = () => (normalizedSpecies(sheet.species) === 'dwarf' ? 1 : 0);
	const displayedSpeed = () =>
		$appLocale === 'en' ? Math.round(sheet.speed * 3.28084) : sheet.speed;
	function updateDisplayedSpeed(value: string) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed < 0) return;
		// The sheet persists metric values. Conversion is only a presentation concern,
		// which keeps token ranges and scene geometry on the same canonical scale.
		sheet.speed = $appLocale === 'en' ? Math.round((parsed / 3.28084) * 10) / 10 : parsed;
	}
	function onSpeciesChanged() {
		const profile = speciesProfile();
		if (!profile?.lineages?.[sheet.speciesLineage]) sheet.speciesLineage = '';
		if (profile) sheet.speed = speciesSpeed();
		syncProgression();
		syncTokenSoon();
	}
	function onLineageChanged() {
		sheet.speed = speciesSpeed();
		syncProgression();
		syncTokenSoon();
	}

	onMount(async () => {
		// Lists come from the campaign compendium, so a GM can mix SRD choices,
		// private references and homebrew without exposing unpublished entries.
		void getCompendium(session, campaignId)
			.then((data) => {
				compendiumSources = data.sources;
				compendiumEntries = data.entries;
				syncProgression();
			})
			.catch(() => undefined);
		try {
			sheet = characterId
				? (await getCharacterForGM(session, campaignId, characterId)).sheet
				: (await getMyCharacter(session, campaignId)).sheet;
			sheet.inventory ??= [];
			sheet.resources ??= [];
			sheet.spellSlots ??= [];
			sheet.skillExpertise ??= [];
			previousLevel = sheet.level;
			syncProgression();
			if (sheet.portraitPath) void refreshPortraitPreview();
			activeConditions = [];
			if (sceneId) {
				const scene = await loadScene(session, sceneId);
				const token = characterId
					? scene.tokens.find((item) => item.actorId === characterId)
					: scene.tokens.find((item) => item.isOwner);
				if (token) {
					setDiceColor(token.color);
					const effects = await listSceneEffects(session, sceneId);
					activeConditions = effects.effects
						.filter((effect) => effect.tokenId === token.id)
						.map((effect) => effect.name);
				}
			}
		} catch (error) {
			if (!characterId && (error as Error & { status?: number }).status === 404)
				isNewCharacter = true;
			else message = error instanceof Error ? error.message : 'Não foi possível carregar a ficha.';
		} finally {
			loading = false;
		}
	});
	async function refreshPortraitPreview() {
		if (!sheet.portraitPath || !supabase) {
			portraitPreview = null;
			return;
		}
		portraitPreview = (await getSignedAssetUrl(session, campaignId, sheet.portraitPath)) ?? null;
	}
	async function optimizePortrait(blob: Blob): Promise<Blob> {
		if (!blob.type.startsWith('image/') || typeof createImageBitmap === 'undefined') return blob;
		const bitmap = await createImageBitmap(blob);
		const maxDimension = 1536;
		const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		return (
			(await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))) ??
			blob
		);
	}
	async function savePortrait(blob: Blob, filename: string) {
		blob = await optimizePortrait(blob);
		if (!supabase) throw new Error('Supabase não está configurado.');
		if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
		const { data: userData, error: userError } = await supabase.auth.getUser();
		if (userError || !userData.user) throw new Error('Sua sessão expirou. Faça login novamente.');
		if (userData.user.id !== session.user.id)
			throw new Error(
				'A sessão atual não corresponde ao usuário autenticado. Faça login novamente.'
			);
		const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
		const path = `campaigns/${campaignId}/portraits/${userData.user.id}/${crypto.randomUUID()}-${safeName}`;
		const { error } = await supabase.storage.from('campaign-assets').upload(path, blob, {
			contentType: blob.type || 'image/png',
			cacheControl: '3600'
		});
		if (error) throw error;
		sheet.portraitPath = path;
		await refreshPortraitPreview();
		message = 'Retrato selecionado. Salve a ficha para atualizar o token.';
	}
	async function uploadPortrait(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			message = 'Envie uma imagem JPG, PNG ou WebP.';
			input.value = '';
			return;
		}
		portraitBusy = true;
		try {
			await savePortrait(file, file.name);
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível enviar o retrato.';
		} finally {
			portraitBusy = false;
			input.value = '';
		}
	}
	async function generatePortrait() {
		if (portraitBusy || portraitPrompt.trim().length < 3) return;
		portraitBusy = true;
		try {
			const dataUrl = await gerarImagemToken(portraitPrompt.trim());
			const blob = await (await fetch(dataUrl)).blob();
			await savePortrait(blob, 'retrato-gerado.png');
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível gerar o retrato.';
		} finally {
			portraitBusy = false;
		}
	}
	const optionsFor = (entryType: string) =>
		compendiumEntries.filter((entry) => entry.entryType === entryType);
	const optionLabel = (entry: CompendiumEntry) =>
		$appLocale === 'pt-BR' ? entry.translations?.['pt-BR'] || entry.name : entry.name;
	const entryRules = (entry: CompendiumEntry) => entry.rules as Record<string, unknown>;
	function equipmentCategory(item: { name: string; rules: Record<string, unknown> }) {
		const category = String(item.rules.category ?? '');
		if (['weapon', 'armor', 'consumable', 'tool', 'gear'].includes(category))
			return category as typeof inventoryFilter;
		const name = item.name.toLowerCase();
		if (/armor|mail|plate|shield|couro|armadura|escudo/.test(name)) return 'armor';
		if (/potion|acid|fire|ration|po[cç][aã]o|ra[cç][oõ]es/.test(name)) return 'consumable';
		if (/tools|supplies|kit|instrument|ferramentas|suprimentos/.test(name)) return 'tool';
		if (
			/sword|axe|bow|crossbow|dagger|club|mace|spear|hammer|rapier|weapon|espada|arco|besta|adaga|ma[cç]a|lan[cç]a|martelo/.test(
				name
			)
		)
			return 'weapon';
		return 'gear';
	}
	const itemEntries = () =>
		compendiumEntries.filter(
			(entry) =>
				entry.entryType === 'item' &&
				(inventoryFilter === 'all' ||
					equipmentCategory({ name: entry.name, rules: entryRules(entry) }) === inventoryFilter)
		);
	const visibleInventory = () =>
		sheet.inventory.filter(
			(item) => inventoryFilter === 'all' || equipmentCategory(item) === inventoryFilter
		);
	const itemLabel = (item: InventoryItem) => item.name;
	const itemDetail = (item: InventoryItem) => {
		const category = equipmentCategory(item);
		if (category === 'weapon' && item.rules.damage)
			return `${$appLocale === 'en' ? 'Damage' : 'Dano'} ${item.rules.damage}`;
		if (category === 'armor' && (item.rules.ac || item.rules.armorClass))
			return `${$appLocale === 'en' ? 'Base AC' : 'Defesa base'} ${item.rules.ac ?? item.rules.armorClass}`;
		if (category === 'consumable')
			return `${$appLocale === 'en' ? 'Qty.' : 'Qtd.'} ${item.quantity}`;
		return '';
	};
	const modifierText = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
	function canonicalClass(value: string) {
		const normalized = value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
		return (
			(
				{
					barbaro: 'barbarian',
					bardo: 'bard',
					clerigo: 'cleric',
					druida: 'druid',
					guerreiro: 'fighter',
					monge: 'monk',
					paladino: 'paladin',
					patrulheiro: 'ranger',
					ladino: 'rogue',
					feiticeiro: 'sorcerer',
					bruxo: 'warlock',
					mago: 'wizard'
				} as Record<string, string>
			)[normalized] ?? normalized
		);
	}
	const normalizedClassName = (value: string) =>
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
	function onClassChanged() {
		const hitDice = classHitDice[canonicalClass(sheet.class)];
		if (hitDice) sheet.hitDice = hitDice;
		if (!subclassOptions().includes(sheet.subclass)) sheet.subclass = '';
		syncProgression();
	}
	const compendiumClass = () =>
		compendiumEntries.find(
			(entry) =>
				entry.entryType === 'class' &&
				(String(entry.rules.id ?? '') === progressionClass(sheet.class) ||
					entry.name.toLowerCase() === sheet.class.toLowerCase())
		);
	const compendiumSubclassOptions = () =>
		compendiumEntries
			.filter(
				(entry) =>
					entry.entryType === 'subclass' &&
					((!entry.rules.classId && !entry.rules.className && !entry.rules.parentClass) ||
						[entry.rules.classId, entry.rules.className, entry.rules.parentClass]
							.filter(Boolean)
							.some(
								(value) =>
									canonicalClass(String(value)) === progressionClass(sheet.class) ||
									normalizedClassName(String(value)) === normalizedClassName(sheet.class)
							))
			)
			.map((entry) => entry.name);
	const subclassOptions = () =>
		compendiumSubclassOptions().length
			? compendiumSubclassOptions()
			: (classData[progressionClass(sheet.class)]?.subclasses ?? []);
	const derivedFeatures = () => {
		const classFeaturesData = compendiumClass()?.rules.features;
		const classFeaturesList = Array.isArray(classFeaturesData) ? classFeaturesData : [];
		const classResult = classFeaturesList
			.filter((feature) => Number((feature as Record<string, unknown>).level ?? 0) <= sheet.level)
			.map((feature, index) => {
				const item = feature as Record<string, unknown>;
				return {
					id: `class-${String(item.id ?? index)}`,
					level: Number(item.level ?? 0),
					name: String(item.name ?? ''),
					description: String(item.description ?? '')
				};
			})
			.filter((feature) => feature.name);
		const subclassEntry = compendiumEntries.find(
			(entry) =>
				entry.entryType === 'subclass' &&
				(entry.name === sheet.subclass || optionLabel(entry) === sheet.subclass)
		);
		const customFeatures = compendiumEntries
			.filter((entry) => entry.entryType === 'feature')
			.flatMap((entry) =>
				Array.isArray(entry.rules.features)
					? entry.rules.features
					: [{ name: entry.name, description: entry.summary, level: entry.rules.level ?? 1 }]
			)
			.filter((feature) => Number((feature as Record<string, unknown>).level ?? 0) <= sheet.level)
			.map((feature, index) => ({
				id: `custom-${index}`,
				level: Number((feature as Record<string, unknown>).level ?? 1),
				name: String((feature as Record<string, unknown>).name ?? ''),
				description: String((feature as Record<string, unknown>).description ?? '')
			}))
			.filter((feature) => feature.name);
		const subclassFeatures = Array.isArray(subclassEntry?.rules.features)
			? subclassEntry.rules.features
			: [];
		const subclassResult = subclassFeatures
			.filter((feature) => Number((feature as Record<string, unknown>).level ?? 0) <= sheet.level)
			.map((feature, index) => {
				const item = feature as Record<string, unknown>;
				return {
					id: `subclass-${String(item.id ?? index)}`,
					level: Number(item.level ?? 0),
					name: String(item.name ?? ''),
					description: String(item.description ?? '')
				};
			})
			.filter((feature) => feature.name);
		return classResult.length || subclassResult.length || customFeatures.length
			? [...classResult, ...subclassResult, ...customFeatures].sort(
					(a, b) => a.level - b.level || a.name.localeCompare(b.name)
				)
			: classFeatures(sheet.class, sheet.level, sheet.subclass).map((feature, index) => ({
					...feature,
					id: `fallback-${index}`,
					description: ''
				}));
	};
	const featList = () =>
		sheet.feats
			.split(/\n|,/)
			.map((feat) => feat.trim())
			.filter(Boolean);
	const featDescription = (feat: string) =>
		optionsFor('feat').find(
			(entry) =>
				optionLabel(entry).toLowerCase() === feat.toLowerCase() ||
				entry.name.toLowerCase() === feat.toLowerCase()
		)?.summary ||
		String(
			(
				optionsFor('feat').find((entry) => optionLabel(entry).toLowerCase() === feat.toLowerCase())
					?.rules as Record<string, unknown> | undefined
			)?.description ?? ''
		) ||
		'Talento privado ou sem descrição cadastrada no compêndio.';
	function addFeat() {
		const feat = newFeat.trim();
		if (!feat || featList().some((item) => item.toLowerCase() === feat.toLowerCase())) return;
		sheet.feats = [...featList(), feat].join('\n');
		selectedFeat = feat;
		newFeat = '';
	}
	function removeFeat(feat: string) {
		sheet.feats = featList()
			.filter((item) => item !== feat)
			.join('\n');
		if (selectedFeat === feat) selectedFeat = '';
	}
	function syncProgression() {
		// Proficiência é determinada exclusivamente pelo nível (SRD 5.2.1).
		// Mantê-la derivada evita bônus antigos quando uma ficha é atualizada.
		sheet.proficiencyBonus = Math.ceil(Math.max(1, sheet.level) / 4) + 1;
		sheet.speed = speciesSpeed();
		if (!sheet.savingThrows.length)
			sheet.savingThrows = [...(classSavingThrows[progressionClass(sheet.class)] ?? [])];
		const desiredHPBonus = speciesHPBonusPerLevel() * Math.max(1, sheet.level);
		const previousHPBonus = sheet.speciesHPBonusApplied ?? 0;
		if (desiredHPBonus !== previousHPBonus) {
			const delta = desiredHPBonus - previousHPBonus;
			sheet.hitPointsMax = Math.max(1, sheet.hitPointsMax + delta);
			sheet.hitPointsCurrent = Math.max(
				0,
				Math.min(sheet.hitPointsMax, sheet.hitPointsCurrent + delta)
			);
			sheet.speciesHPBonusApplied = desiredHPBonus;
		}
		sheet.resistances = activeSpeciesTraits()
			.filter((trait) => /resistência a /i.test(trait))
			.map((trait) => trait.replace(/^.*resistência a /i, '').split(' e ')[0]);
		sheet.automaticTraits = activeSpeciesTraits();
		const hitDie = classHitDice[canonicalClass(sheet.class)];
		if (hitDie) sheet.hitDice = hitDie;
		if (!Number.isFinite(sheet.initiative))
			sheet.initiative = modifier(sheet.abilityScores.dexterity);
		if (sheet.level === 1 && sheet.hitPointsMax === 10) {
			const die = Number(sheet.hitDice.match(/d(\d+)/i)?.[1] ?? 8);
			const hp = Math.max(1, die + modifier(sheet.abilityScores.constitution));
			sheet.hitPointsMax = hp;
			sheet.hitPointsCurrent = hp;
		}
		const defaults = defaultResources(sheet.class, sheet.level, sheet.abilityScores);
		sheet.resources = defaults.map((resource) => ({
			...resource,
			current: sheet.resources.find((old) => old.id === resource.id)?.current ?? resource.max
		}));
		const slots = spellSlots(sheet.class, sheet.level);
		sheet.spellSlots = slots.map((slot) => ({
			...slot,
			current: sheet.spellSlots.find((old) => old.level === slot.level)?.current ?? slot.max
		}));
		sheet.passivePerception = passivePerception();
	}
	const skillBonus = (name: string, ability: keyof Sheet['abilityScores']) =>
		modifier(sheet.abilityScores[ability]) +
		(sheet.skillProficiencies.includes(name) ? sheet.proficiencyBonus : 0) +
		(sheet.skillExpertise.includes(name) ? sheet.proficiencyBonus : 0);
	const passivePerception = () => 10 + skillBonus('Percepção', 'wisdom');
	function toggleSkill(name: string) {
		sheet.skillProficiencies = sheet.skillProficiencies.includes(name)
			? sheet.skillProficiencies.filter((item) => item !== name)
			: [...sheet.skillProficiencies, name];
		if (!sheet.skillProficiencies.includes(name))
			sheet.skillExpertise = sheet.skillExpertise.filter((item) => item !== name);
		syncTokenSoon();
	}
	const expertiseChoices = () => {
		const key = canonicalClass(sheet.class);
		if (key === 'bard') return sheet.level >= 9 ? 4 : sheet.level >= 2 ? 2 : 0;
		if (key === 'rogue') return sheet.level >= 6 ? 4 : sheet.level >= 1 ? 2 : 0;
		return 0;
	};
	function setExpertiseChoice(index: number, value: string) {
		const next = [...sheet.skillExpertise];
		if (value && next.some((skill, itemIndex) => itemIndex !== index && skill === value)) return;
		next[index] = value;
		sheet.skillExpertise = next.filter(Boolean);
		if (value && !sheet.skillProficiencies.includes(value))
			sheet.skillProficiencies = [...sheet.skillProficiencies, value];
		syncTokenSoon();
	}
	async function rollAuthorized(
		kind: 'skill' | 'save' | 'spell',
		key: string,
		fallbackLabel: string
	) {
		try {
			const mode = selectedAttackMode();
			const result = await rollMyCharacter(session, campaignId, kind, key, mode);
			$diceOverlay = {
				expression: `${fallbackLabel} · ${mode === 'advantage' ? 'Vantagem' : mode === 'disadvantage' ? 'Desvantagem' : 'Normal'}`,
				total: result.total,
				dice: result.dados,
				nonce: crypto.randomUUID()
			};
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(result.eventId),
					autor: sheet.name || ($appLocale === 'en' ? 'Character' : 'Personagem'),
					texto: `${fallbackLabel} · ${mode === 'advantage' ? 'Vantagem' : mode === 'disadvantage' ? 'Desvantagem' : 'Normal'} · dados [${result.dados.join(', ')}] · modificador ${modifierText(result.modificador)} · resultado ${result.total}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						expressao: '1d20',
						dados: result.dados,
						modificador: result.modificador,
						total: result.total,
						mode: result.modo,
						label: fallbackLabel
					}
				}
			];
		} catch (error) {
			message = error instanceof Error ? error.message : `Não foi possível rolar ${fallbackLabel}.`;
		}
	}
	const rollSkill = (name: string, _ability: keyof Sheet['abilityScores']) =>
		rollAuthorized(
			'skill',
			name,
			`${$appLocale === 'en' ? `${skillLabel(name)} check` : `Teste de ${skillLabel(name)}`}`
		);
	function toggleVisibleRoll(key: string) {
		const current = sheet.visibleRolls ?? [];
		sheet.visibleRolls = current.includes(key)
			? current.filter((item) => item !== key)
			: [...current, key];
		syncTokenSoon();
	}
	function onLevelChanged() {
		if (sheet.level > previousLevel) levelChoiceOpen = true;
		else {
			previousLevel = sheet.level;
			syncProgression();
		}
	}
	async function resolveLevelHP(choice: 'keep' | 'max' | 'roll') {
		const gained = Math.max(0, sheet.level - previousLevel);
		const hitDie = Number(sheet.hitDice.match(/d(\d+)/i)?.[1] ?? 8);
		let gainedHP = 0;
		if (choice === 'max')
			gainedHP = gained * Math.max(1, hitDie + modifier(sheet.abilityScores.constitution));
		if (choice === 'roll') {
			for (let i = 0; i < gained; i++) {
				const event = await rollDice(
					session,
					campaignId,
					`1d${hitDie}${modifier(sheet.abilityScores.constitution) >= 0 ? '+' : ''}${modifier(sheet.abilityScores.constitution)}`
				);
				gainedHP += (event.payload as { total: number }).total;
			}
		}
		if (choice !== 'keep') {
			sheet.hitPointsMax += gainedHP;
			sheet.hitPointsCurrent += gainedHP;
		}
		previousLevel = sheet.level;
		levelChoiceOpen = false;
		syncProgression();
		await save();
	}
	function spendResource(index: number) {
		sheet.resources[index].current = Math.max(0, sheet.resources[index].current - 1);
		syncTokenSoon();
	}
	async function rest(kind: 'short' | 'long') {
		if (kind === 'short') {
			const hitDie = sheet.hitDice.match(/^1d(\d+)$/i);
			if (!hitDie || sheet.hitDiceSpent >= sheet.level) {
				message =
					$appLocale === 'en'
						? 'No hit dice available to recover HP during this rest.'
						: 'Não há dados de vida disponíveis para recuperar PV neste descanso.';
				return;
			}
			try {
				const event = await rollDice(
					session,
					campaignId,
					`1d${hitDie[1]}${modifier(sheet.abilityScores.constitution) >= 0 ? '+' : ''}${modifier(sheet.abilityScores.constitution)}`
				);
				const result = event.payload as { dados: number[]; total: number };
				sheet.hitDiceSpent += 1;
				sheet.hitPointsCurrent = Math.min(
					sheet.hitPointsMax,
					sheet.hitPointsCurrent + result.total
				);
				$diceOverlay = {
					expression: $appLocale === 'en' ? 'Hit die' : 'Dado de vida',
					total: result.total,
					dice: result.dados
				};
			} catch {
				message =
					$appLocale === 'en'
						? 'Could not roll the hit die.'
						: 'Não foi possível rolar o dado de vida.';
				return;
			}
		}
		sheet.resources = sheet.resources.map((resource) =>
			resource.restoreOn === kind || kind === 'long'
				? { ...resource, current: resource.max }
				: resource
		);
		if (kind === 'short')
			sheet.spellSlots = sheet.spellSlots.map((slot) =>
				canonicalClass(sheet.class) === 'warlock' ? { ...slot, current: slot.max } : slot
			);
		if (kind === 'long') {
			sheet.hitPointsCurrent = sheet.hitPointsMax;
			sheet.temporaryHP = 0;
			sheet.hitDiceSpent = 0;
			sheet.spellSlots = sheet.spellSlots.map((slot) => ({ ...slot, current: slot.max }));
		}
		message =
			kind === 'long'
				? 'Descanso longo aplicado: PV, recursos e espaços restaurados.'
				: 'Descanso curto aplicado: recursos de descanso curto restaurados.';
		await save();
	}
	const spellEntries = () =>
		compendiumEntries.filter((entry) => {
			if (entry.entryType !== 'spell') return false;
			const rules = entryRules(entry);
			const level = Number(rules.level ?? 0);
			const classes = Array.isArray(rules.classes) ? rules.classes.map(String) : [];
			return (
				(spellCircle === 'all' || level === Number(spellCircle)) &&
				(!canonicalClass(sheet.class) ||
					classes.length === 0 ||
					classes.includes(canonicalClass(sheet.class)))
			);
		});
	const availableSpellCircles = () => [
		0,
		...sheet.spellSlots.filter((slot) => slot.max > 0).map((slot) => slot.level)
	];
	const spellSlotForCircle = (circle: number) =>
		sheet.spellSlots.find((slot) => slot.level === circle);
	const spellsForCircle = (circle: number) =>
		sheet.spells
			.map((spell, index) => ({ spell, index }))
			.filter((item) => item.spell.level === circle);
	const circleLabel = (circle: number) =>
		circle === 0
			? $appLocale === 'en'
				? 'Cantrips'
				: 'Truques'
			: $appLocale === 'en'
				? `Level ${circle}`
				: `Círculo ${circle}`;
	function addInventoryItem() {
		const entry = itemEntries().find((item) => item.id === selectedItemId);
		if (!entry) return;
		sheet.inventory = [
			...sheet.inventory,
			{
				entryId: entry.id,
				name: optionLabel(entry),
				quantity: 1,
				equipped: false,
				rules: entry.rules
			}
		];
		selectedItemId = '';
	}
	async function addCustomInventoryItem() {
		const name = customItemName.trim();
		if (!name) return;
		if (customItemCategory === 'weapon') {
			const damage = customItemDamage.trim();
			if (!/^\d+d\d+(?:\s*[+-]\s*\d+)?$/i.test(damage)) {
				message =
					$appLocale === 'en'
						? 'Enter weapon damage as NdN (e.g. 1d8).'
						: 'Informe o dano da arma como NdN (ex.: 1d8).';
				return;
			}
		}
		const rules: Record<string, unknown> = { category: customItemCategory, custom: true };
		if (customItemCategory === 'weapon') {
			if (customItemDamage.trim()) rules.damage = customItemDamage.trim();
		} else if (customItemCategory === 'armor') {
			rules.ac = String(Math.max(0, Math.round(customItemDefense)));
		} else if (customItemCategory === 'consumable') {
			rules.quantity = Math.max(1, Math.round(customItemQuantity));
		}
		const privateSource = compendiumSources.find((source) => source.slug === 'campaign-private');
		const alreadyInCompendium = compendiumEntries.some(
			(entry) =>
				entry.entryType === 'item' &&
				entry.name.toLowerCase() === name.toLowerCase() &&
				entry.rules.custom === true
		);
		if (privateSource && !alreadyInCompendium) {
			try {
				const entry = await createCompendiumEntry(session, campaignId, {
					sourceId: privateSource.id,
					entryType: 'item',
					name,
					summary: 'Item personalizado da ficha.',
					rules,
					translations: { 'pt-BR': name },
					isPublished: true
				});
				compendiumEntries = [...compendiumEntries, entry];
			} catch (error) {
				message =
					error instanceof Error
						? error.message
						: 'Não foi possível adicionar o item ao compêndio.';
				return;
			}
		}
		sheet.inventory = [
			...sheet.inventory,
			{
				entryId: `custom-${crypto.randomUUID()}`,
				name,
				quantity:
					customItemCategory === 'consumable' ? Math.max(1, Math.round(customItemQuantity)) : 1,
				equipped: false,
				rules
			}
		];
		customItemName = '';
		customItemDamage = '';
		customItemDefense = 10;
		customItemQuantity = 1;
	}
	function removeInventoryItem(index: number) {
		sheet.inventory = sheet.inventory.filter((_, itemIndex) => itemIndex !== index);
	}
	function addWeaponAttack(item: InventoryItem) {
		const rules = item.rules;
		if (rules.category !== 'weapon') return;
		const ability =
			rules.attackAbility === 'dexterity'
				? sheet.abilityScores.dexterity
				: sheet.abilityScores.strength;
		const abilityModifier = modifier(ability);
		const damage =
			`${String(rules.damage ?? '')}${abilityModifier ? ` ${modifierText(abilityModifier)}` : ''} ${String(rules.damageType ?? '')}`.trim();
		sheet.attacks = [
			...sheet.attacks,
			{
				name: item.name,
				attackBonus: abilityModifier + sheet.proficiencyBonus,
				damage,
				notes: `Item do compêndio · ${Array.isArray(rules.properties) ? rules.properties.join(', ') : ''}`
			}
		];
	}
	async function rollWeapon(item: InventoryItem) {
		const rules = item.rules;
		const damageMatch = String(rules.damage ?? '').match(/^(\d+)d(\d+)/i);
		if (rules.category !== 'weapon' || !damageMatch || rollingWeapon) return;
		if (
			activeConditions.some((condition) =>
				['Incapacitado', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(
					condition
				)
			)
		) {
			message = 'Esta condição impede ações e reações; o ataque não pode ser rolado.';
			return;
		}
		const ability =
			rules.attackAbility === 'dexterity'
				? sheet.abilityScores.dexterity
				: sheet.abilityScores.strength;
		const attackBonus = modifier(ability) + sheet.proficiencyBonus;
		rollingWeapon = item.entryId;
		message = '';
		beginDiceBatch();
		try {
			const attackMode = selectedAttackMode();
			const attackEvent = await rollDice(
				session,
				campaignId,
				`1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`,
				attackMode === 'normal' ? undefined : attackMode,
				'combat'
			);
			const attack = attackEvent.payload as { expressao: string; dados: number[]; total: number };
			const critical = attack.dados[0] === 20;
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(attackEvent.id),
					autor: attackEvent.author,
					texto: `${item.name} · ataque${critical ? ' · CRÍTICO!' : ''}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...attack,
						modificador: attack.total - attack.dados.reduce((sum, die) => sum + die, 0),
						label: `${item.name} · ataque`
					}
				}
			];
			$diceOverlay = {
				expression: `${item.name} · ataque`,
				total: attack.total,
				dice: attack.dados
			};
			const diceCount = Number(damageMatch[1]) * (critical ? 2 : 1);
			const damageModifier = modifier(ability);
			const damageEvent = await rollDice(
				session,
				campaignId,
				`${diceCount}d${damageMatch[2]}${damageModifier >= 0 ? '+' : ''}${damageModifier}`,
				undefined,
				'combat'
			);
			const damage = damageEvent.payload as { expressao: string; dados: number[]; total: number };
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(damageEvent.id),
					autor: damageEvent.author,
					texto: `${item.name} · dano${critical ? ' crítico' : ''} (${String(rules.damageType ?? '')})`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...damage,
						modificador: damage.total - damage.dados.reduce((sum, die) => sum + die, 0),
						label: `${item.name} · dano${critical ? ' crítico' : ''}`
					}
				}
			];
			$diceOverlay = {
				expression: `${item.name} · dano${critical ? ' crítico' : ''}`,
				total: damage.total,
				dice: damage.dados
			};
			message = critical
				? 'Crítico! Ataque e dano foram registrados no chat.'
				: 'Ataque e dano foram registrados no chat.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not roll the weapon.'
						: 'Não foi possível rolar a arma.';
		} finally {
			finishDiceBatch();
			rollingWeapon = null;
		}
	}
	function addCompendiumSpell() {
		const entry = spellEntries().find((spell) => spell.id === selectedSpellId);
		if (!entry || sheet.spells.some((spell) => spell.name === optionLabel(entry))) return;
		const rules = entryRules(entry);
		sheet.spells = [
			...sheet.spells,
			{
				entryId: entry.id,
				name: optionLabel(entry),
				level: Number(rules.level ?? 0),
				notes: `SRD · ${String(rules.school ?? '')}${rules.range ? ` · ${String(rules.range)}` : ''}`
			}
		];
		selectedSpellId = '';
	}
	const calculatedArmorClass = () =>
		calculateArmorClass(sheet.abilityScores, sheet.class, sheet.inventory);
	const equippedDefense = () =>
		calculatedArmorClass() - (10 + modifier(sheet.abilityScores.dexterity));
	$effect(() => {
		const armorClass = calculatedArmorClass();
		if (sheet.armorClass !== armorClass) sheet.armorClass = armorClass;
	});
	function updateScore(key: keyof Sheet['abilityScores'], value: string) {
		sheet.abilityScores[key] = Math.max(1, Math.min(30, Number(value) || 1));
	}
	const saveBonus = (key: keyof Sheet['abilityScores']) =>
		modifier(sheet.abilityScores[key]) +
		(sheet.savingThrows.includes(key) ? sheet.proficiencyBonus : 0);
	function toggleSavingThrow(key: keyof Sheet['abilityScores']) {
		sheet.savingThrows = sheet.savingThrows.includes(key)
			? sheet.savingThrows.filter((item) => item !== key)
			: [...sheet.savingThrows, key];
	}
	async function rollSheet(label: string, bonus: number, damage = '') {
		const attackMode = selectedAttackMode();
		const attackEvent = await rollDice(
			session,
			campaignId,
			`1d20${bonus >= 0 ? '+' : ''}${bonus}`,
			attackMode === 'normal' ? undefined : attackMode,
			'combat'
		);
		const attack = attackEvent.payload as { dados: number[]; total: number; expressao: string };
		const critical = attack.dados[0] === 20;
		$chatMensagens = [
			...$chatMensagens,
			{
				id: String(attackEvent.id),
				autor: sheet.name || 'Personagem',
				texto: `${label}${critical ? ' · CRÍTICO!' : ''}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: { ...attack, modificador: bonus, label }
			}
		];
		$diceOverlay = {
			expression: label,
			total: attack.total,
			dice: attack.dados,
			nonce: crypto.randomUUID()
		};
		const match = damage.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
		if (!match) return;
		const count = Number(match[1]) * (critical ? 2 : 1),
			mod = match[3] === '-' ? -Number(match[4] ?? 0) : Number(match[4] ?? 0);
		const damageEvent = await rollDice(
			session,
			campaignId,
			`${count}d${match[2]}${mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''}`,
			undefined,
			'combat'
		);
		const result = damageEvent.payload as { dados: number[]; total: number; expressao: string };
		$chatMensagens = [
			...$chatMensagens,
			{
				id: String(damageEvent.id),
				autor: sheet.name || 'Personagem',
				texto: `${label} · dano${critical ? ' crítico' : ''}`,
				tipo: 'rolagem',
				canal: 'combat',
				detalhesRolagem: { ...result, modificador: mod, label: `${label} · dano` }
			}
		];
		$diceOverlay = {
			expression: `${label} · dano`,
			total: result.total,
			dice: result.dados,
			nonce: crypto.randomUUID()
		};
	}
	async function rollCustomAttack(attack: Sheet['attacks'][number], index: number) {
		if (rollingAttack !== null) return;
		rollingAttack = index;
		beginDiceBatch();
		try {
			await rollSheet(
				attack.name || ($appLocale === 'en' ? 'Attack' : 'Ataque'),
				attack.attackBonus,
				attack.damage
			);
		} catch {
			message =
				$appLocale === 'en' ? 'Could not roll the attack.' : 'Não foi possível rolar o ataque.';
		} finally {
			finishDiceBatch();
			rollingAttack = null;
		}
	}
	function spellcastingAbility() {
		const ability = (
			{
				bard: 'charisma',
				cleric: 'wisdom',
				druid: 'wisdom',
				paladin: 'charisma',
				ranger: 'wisdom',
				sorcerer: 'charisma',
				warlock: 'charisma',
				wizard: 'intelligence'
			} as Record<string, keyof Sheet['abilityScores']>
		)[canonicalClass(sheet.class)];
		return ability ?? 'intelligence';
	}
	async function rollSpell(spell: Sheet['spells'][number]) {
		await rollAuthorized('spell', '', `${spell.name || 'Magia'} · ataque`);
	}
	const compatibleSlots = (spell: Sheet['spells'][number]) =>
		sheet.spellSlots.filter((slot) => slot.level >= spell.level && slot.current > 0);
	function selectedSlot(spell: Sheet['spells'][number], index: number) {
		return spellSlotChoice[index] ?? compatibleSlots(spell)[0]?.level ?? spell.level;
	}
	async function castSpell(spell: Sheet['spells'][number], index: number) {
		if (castingSpell !== null || (spell.level > 0 && !compatibleSlots(spell).length)) return;
		castingSpell = index;
		try {
			const result = await castMySpell(
				session,
				campaignId,
				index,
				spell.level === 0 ? 0 : selectedSlot(spell, index)
			);
			sheet = result.sheet;
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(result.eventId),
					autor: sheet.name || 'Personagem',
					texto: `✨ ${result.spellName} · nível base ${result.baseLevel} · espaço usado ${result.slotLevel} · custo: ${result.slotLevel ? `1 espaço de nível ${result.slotLevel}` : 'nenhum'}${result.expression ? ` · rolagem: ${result.expression} = ${result.total ?? 0}` : ''} · efeito: ${result.effect}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						expressao: result.expression || 'magia',
						dados: result.dados ?? [],
						modificador: result.modificador ?? 0,
						total: result.total ?? 0,
						label: result.spellName
					}
				}
			];
			if (result.dados?.length) {
				$diceOverlay = {
					expression: `${result.spellName} · ${result.expression ?? 'rolagem'}`,
					total: result.total ?? 0,
					dice: result.dados,
					nonce: crypto.randomUUID()
				};
			}
			message = 'Magia lançada e espaço consumido.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível lançar a magia.';
		} finally {
			castingSpell = null;
		}
	}
	function addAttack() {
		sheet.attacks = [
			...sheet.attacks,
			{ name: 'Novo ataque', attackBonus: 0, damage: '', notes: '' }
		];
	}
	function addSpell() {
		sheet.spells = [...sheet.spells, { name: 'Nova magia', level: 0, notes: '' }];
	}
	function removeAttack(index: number) {
		sheet.attacks = sheet.attacks.filter((_, i) => i !== index);
	}
	function removeSpell(index: number) {
		sheet.spells = sheet.spells.filter((_, i) => i !== index);
	}
	async function save() {
		saving = true;
		message = '';
		try {
			// CA is derived from the authoritative sheet data; never persist a manual override.
			sheet.armorClass = calculatedArmorClass();
			sheet = (
				characterId
					? await saveCharacterForGM(session, campaignId, characterId, sheet)
					: await saveMyCharacter(session, campaignId, sheet)
			).sheet;
			isNewCharacter = false;
			message = 'Ficha salva.';
			onTokenCreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
		} finally {
			saving = false;
		}
	}
	function syncTokenSoon() {
		if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
		tokenSyncTimer = setTimeout(() => {
			if (!saving) void save();
		}, 450);
	}
	async function createBoardToken() {
		if (!isGM) return;
		if (!sceneId) {
			message = 'O narrador ainda não criou uma cena para vincular o personagem.';
			return;
		}
		saving = true;
		message = '';
		try {
			sheet.armorClass = calculatedArmorClass();
			const character = characterId
				? await saveCharacterForGM(session, campaignId, characterId, sheet)
				: await saveMyCharacter(session, campaignId, sheet);
			sheet = character.sheet;
			await createTokenFromCharacter(session, sceneId, character.id);
			message = 'Token criado e vinculado à ficha.';
			onTokenCreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível criar o token.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="sheet-backdrop"
	class:docked
	role="presentation"
	onclick={(event) => {
		if (event.currentTarget === event.target) onclose();
	}}
>
	<section class="sheet" class:minimized aria-label="Ficha de personagem D&D 2024">
		<header>
			<div class="sheet-heading">
				<h2>{sheet.name || ($appLocale === 'en' ? 'New character' : 'Nova ficha')}</h2>
				<div>
					<p>D&D 2024 · MVP</p>
					{#if characterOwnerName}<small
							>{$appLocale === 'en'
								? `Character of ${characterOwnerName}`
								: `Personagem de ${characterOwnerName}`}</small
						>{/if}
				</div>
			</div>
			<div class="sheet-actions">
				{#if docked}<button
						onclick={() => (minimized = !minimized)}
						aria-label={$appLocale === 'en' ? 'Minimize character sheet' : 'Minimizar ficha'}
						>{minimized ? '▸' : '▾'}</button
					>{/if}<button
					onclick={onclose}
					aria-label={$appLocale === 'en' ? 'Close character sheet' : 'Fechar ficha'}>×</button
				>
			</div>
		</header>
		{#if !loading && !minimized}<nav
				class="sheet-tabs"
				aria-label={$appLocale === 'en' ? 'Character sheet sections' : 'Seções da ficha'}
			>
				{#each sheetTabs() as [tab, label]}
					<button
						class:active={activeTab === tab}
						onclick={() => (activeTab = tab as typeof activeTab)}>{label}</button
					>
				{/each}
			</nav>{/if}
		{#if loading}<p class="status">
				{$appLocale === 'en' ? 'Loading character sheet…' : 'Carregando ficha…'}
			</p>{:else if !minimized}
			<div class="sheet-body">
				{#if isNewCharacter}
					<aside class="onboarding">
						<strong
							>{$appLocale === 'en'
								? 'Your character starts here.'
								: 'Seu personagem começa aqui.'}</strong
						>
						<span
							>{$appLocale === 'en'
								? 'Fill in the details, save the sheet, and the GM can link it to a token on the table.'
								: 'Preencha os dados, salve a ficha e o narrador poderá vinculá-la a um token na mesa.'}</span
						>
					</aside>
				{/if}
				{#if activeTab === 'profile'}
					<section
						class="portrait-editor"
						aria-label={$appLocale === 'en' ? 'Character portrait' : 'Retrato do personagem'}
					>
						<div class="portrait-preview">
							{#if portraitPreview}<img
									src={portraitPreview}
									alt={`Retrato de ${sheet.name || 'personagem'}`}
								/>{:else}<span>◈</span>{/if}
						</div>
						<div>
							<h3>{$appLocale === 'en' ? 'Portrait and token' : 'Retrato e token'}</h3>
							<p>
								{$appLocale === 'en'
									? 'Use your own image or create an AI portrait. Saving the sheet updates the linked token image.'
									: 'Use uma imagem própria ou crie um retrato por IA. Ao salvar a ficha, o token vinculado recebe a nova imagem.'}
							</p>
							<label class="portrait-upload"
								>{portraitBusy
									? $appLocale === 'en'
										? 'Processing…'
										: 'Processando…'
									: $appLocale === 'en'
										? 'Upload image'
										: 'Enviar imagem'}<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									onchange={uploadPortrait}
									disabled={portraitBusy}
								/></label
							>
							<div class="portrait-ai">
								<input
									bind:value={portraitPrompt}
									maxlength="600"
									placeholder={$appLocale === 'en'
										? 'E.g. drow sorceress, white hair, violet eyes'
										: 'Ex.: elfa drow feiticeira, cabelos brancos, olhos violeta'}
								/><button
									onclick={() => void generatePortrait()}
									disabled={portraitBusy || portraitPrompt.trim().length < 3}
									>{portraitBusy
										? $appLocale === 'en'
											? 'Generating…'
											: 'Gerando…'
										: $appLocale === 'en'
											? 'Generate with AI'
											: 'Gerar com IA'}</button
								>
							</div>
							<small
								>{$appLocale === 'en'
									? 'JPG, PNG, or WebP up to 5 MB. The portrait is private in storage and visible only to campaign members.'
									: 'JPG, PNG ou WebP de até 5 MB. O retrato é privado no armazenamento e exibido somente para membros da campanha.'}</small
							>
						</div>
					</section>
					<section class="identity">
						<label
							>{$appLocale === 'en' ? 'Name' : 'Nome'}<input
								bind:value={sheet.name}
								maxlength="120"
								placeholder={$appLocale === 'en' ? 'Character name' : 'Nome do personagem'}
							/></label
						>
						<label
							>{$appLocale === 'en' ? 'Class' : 'Classe'}<input
								bind:value={sheet.class}
								onchange={onClassChanged}
								list="class-options"
								placeholder={$appLocale === 'en' ? 'E.g. Fighter' : 'Ex.: Guerreiro'}
							/></label
						>
						<label
							>{$appLocale === 'en' ? 'Level' : 'Nível'}<input
								type="number"
								min="1"
								max="20"
								bind:value={sheet.level}
								onchange={onLevelChanged}
							/></label
						>
						{#if subclassOptions().length}<label
								>{$appLocale === 'en' ? 'Subclass' : 'Subclasse'}<select
									bind:value={sheet.subclass}
									onchange={syncProgression}
									><option value=""
										>{$appLocale === 'en' ? 'Choose at level 3…' : 'Escolha no nível 3…'}</option
									>{#each subclassOptions() as subclass}<option value={subclass}>{subclass}</option
										>{/each}</select
								></label
							>{/if}
						<label
							>{$appLocale === 'en' ? 'Species' : 'Espécie'}<input
								bind:value={sheet.species}
								onchange={onSpeciesChanged}
								list="species-options"
								placeholder={$appLocale === 'en' ? 'E.g. Human' : 'Ex.: Humano'}
							/></label
						>
						{#if lineageOptions().length}
							<label
								>{$appLocale === 'en' ? 'Lineage / legacy' : 'Linhagem / legado'}<select
									bind:value={sheet.speciesLineage}
									onchange={onLineageChanged}
									><option value=""
										>{$appLocale === 'en' ? 'Choose an option…' : 'Escolha uma opção…'}</option
									>{#each lineageOptions() as lineage}<option value={lineage}>{lineage}</option
										>{/each}</select
								></label
							>
						{/if}
						<label
							>{$appLocale === 'en' ? 'Background' : 'Antecedente'}<input
								bind:value={sheet.background}
								list="background-options"
							/></label
						>
						<label
							>{$appLocale === 'en' ? 'Alignment' : 'Alinhamento'}<input
								bind:value={sheet.alignment}
							/></label
						>
						<datalist id="class-options"
							>{#each optionsFor('class') as entry (entry.id)}<option value={optionLabel(entry)}
									>{entry.summary}</option
								>{/each}</datalist
						>
						<datalist id="species-options"
							>{#each optionsFor('species') as entry (entry.id)}<option value={optionLabel(entry)}
									>{entry.summary}</option
								>{/each}</datalist
						>
						<datalist id="background-options"
							>{#each optionsFor('background') as entry (entry.id)}<option
									value={optionLabel(entry)}>{entry.summary}</option
								>{/each}</datalist
						>
					</section>
					{#if speciesProfile()}
						<section
							class="species-traits"
							aria-label={$appLocale === 'en'
								? 'Applied species traits'
								: 'Traços de espécie aplicados'}
						>
							<div>
								<h3>
									{speciesProfile().label}{sheet.speciesLineage ? ` · ${sheet.speciesLineage}` : ''}
								</h3>
								<span
									>{$appLocale === 'en' ? 'Applied base speed' : 'Deslocamento base aplicado'}: {distance(
										speciesSpeed(),
										$appLocale
									)}</span
								>
							</div>
							<ul>
								{#each activeSpeciesTraits() as trait}<li>
										{distanceText(trait, $appLocale)}
									</li>{/each}
							</ul>
							<small
								>{$appLocale === 'en'
									? 'These traits are calculated from the selected species and lineage. HP, spells, and uses appear here for the table; complete current combat values and add the desired spells to the sheet.'
									: 'Estes traços são calculados pela espécie e linhagem selecionadas. Ajustes de PV, magias e usos são exibidos aqui para a mesa; preencha os valores atuais de combate e inclua as magias desejadas na ficha.'}</small
							>
						</section>
					{/if}
					<section>
						<h3>{$appLocale === 'en' ? 'Ability scores' : 'Atributos'}</h3>
						<div class="abilities">
							{#each attributes as attribute}<label
									><span>{abilityLabel(attribute.key)}</span><input
										type="number"
										min="1"
										max="30"
										value={sheet.abilityScores[attribute.key]}
										onchange={(event) => updateScore(attribute.key, event.currentTarget.value)}
									/><small
										>{modifier(sheet.abilityScores[attribute.key]) >= 0 ? '+' : ''}{modifier(
											sheet.abilityScores[attribute.key]
										)}</small
									></label
								>{/each}
						</div>
					</section>
					<section class="saving-throws">
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Saving throws' : 'Testes de resistência'}</h3>
							<label class="roll-mode"
								>d20 <select bind:value={rollMode} aria-label="Modo de rolagem"
									><option value="advantage" disabled={hasAttackDisadvantage()}
										>{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}</option
									><option value="normal">Normal</option><option value="disadvantage"
										>{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option
									></select
								></label
							>
						</div>
						<div>
							{#each attributes as attribute}<article>
									<label
										title={$appLocale === 'en'
											? `${abilityLabel(attribute.key)} saving throw proficiency`
											: `Proficiência em resistência de ${abilityLabel(attribute.key)}`}
										><span>{abilityLabel(attribute.key)}</span><input
											type="checkbox"
											checked={sheet.savingThrows.includes(attribute.key)}
											onchange={() => toggleSavingThrow(attribute.key)}
										/></label
									><strong
										>{saveBonus(attribute.key) >= 0 ? '+' : ''}{saveBonus(attribute.key)}</strong
									><button
										onclick={() =>
											void rollAuthorized(
												'save',
												attribute.key,
												$appLocale === 'en'
													? `${abilityLabel(attribute.key)} saving throw`
													: `Resistência de ${abilityLabel(attribute.key)}`
											)}
										aria-label={$appLocale === 'en'
											? `Roll ${abilityLabel(attribute.key)} saving throw`
											: `Rolar resistência de ${abilityLabel(attribute.key)}`}>🎲</button
									>
								</article>{/each}
						</div>
					</section>
					<div class="passive-perception">
						<span>{$appLocale === 'en' ? 'Passive Perception' : 'Percepção passiva'}</span><strong
							class="derived-value">{passivePerception()}</strong
						><small
							>{$appLocale === 'en'
								? '10 + Wisdom + Perception proficiency'
								: '10 + Sabedoria + proficiência em Percepção'}</small
						>
					</div>
					{#if derivedFeatures().length}<section class="progression">
							<h3>{$appLocale === 'en' ? 'Class progression' : 'Progressão de classe'}</h3>
							<ul>
								{#each derivedFeatures() as feature (feature.id)}<li>
										<button
											class="feature-toggle"
											type="button"
											aria-expanded={expandedFeature === feature.id}
											onclick={() =>
												(expandedFeature = expandedFeature === feature.id ? null : feature.id)}
											><span>{$appLocale === 'en' ? 'Level' : 'Nível'} {feature.level}</span><strong
												>{feature.name}</strong
											><small>{expandedFeature === feature.id ? '⌃' : '⌄'}</small></button
										>{#if expandedFeature === feature.id && feature.description}<p
												class="feature-description"
											>
												{feature.description}
											</p>{/if}
									</li>{/each}
							</ul>
							{#if expertiseChoices() > 0}<div class="expertise-choices">
									<strong
										>{$appLocale === 'en' ? 'Class expertise' : 'Especialização de classe'}</strong
									>
									<p>
										{$appLocale === 'en'
											? `Choose ${expertiseChoices()} skill${expertiseChoices() > 1 ? 's' : ''}; they automatically gain double proficiency bonus.`
											: `Escolha ${expertiseChoices()} perícia${expertiseChoices() > 1 ? 's' : ''}; elas recebem o dobro do bônus de proficiência automaticamente.`}
									</p>
									<div>
										{#each Array(expertiseChoices()) as _, index}<label
												>{$appLocale === 'en'
													? `Expertise ${index + 1}`
													: `Especialização ${index + 1}`}<select
													value={sheet.skillExpertise[index] ?? ''}
													onchange={(event) => setExpertiseChoice(index, event.currentTarget.value)}
													><option value=""
														>{$appLocale === 'en'
															? 'Choose a skill…'
															: 'Escolha uma perícia…'}</option
													>{#each skills as [name]}<option value={name}>{name}</option
														>{/each}</select
												></label
											>{/each}
									</div>
								</div>{/if}
						</section>{/if}
				{/if}
				{#if activeTab === 'combat'}
					<section class="combat">
						<h3>{$appLocale === 'en' ? 'Combat' : 'Combate'}</h3>
						<div class="rest-actions">
							<button onclick={() => rest('short')}
								>{$appLocale === 'en' ? 'Short rest' : 'Descanso curto'}</button
							><button onclick={() => rest('long')}
								>{$appLocale === 'en' ? 'Long rest' : 'Descanso longo'}</button
							>
						</div>
						<label
							>{$appLocale === 'en' ? 'AC' : 'CA'}<input
								type="number"
								min="0"
								max="99"
								value={calculatedArmorClass()}
								readonly
								aria-describedby="armor-class-help"
							/></label
						><small id="armor-class-help" class="field-hint"
							>{$appLocale === 'en'
								? 'Calculated from ability scores and equipped armor/shield.'
								: 'Calculada pelos atributos e armaduras/escudos equipados.'}</small
						><label
							>{$appLocale === 'en' ? 'Initiative bonus' : 'Bônus de iniciativa'}<input
								type="number"
								min="-20"
								max="20"
								bind:value={sheet.initiative}
								oninput={syncTokenSoon}
							/></label
						><label
							>{$appLocale === 'en' ? 'Speed (ft)' : 'Deslocamento (m)'}<input
								type="number"
								min="0"
								value={displayedSpeed()}
								onchange={(event) => updateDisplayedSpeed(event.currentTarget.value)}
							/></label
						><label
							>{$appLocale === 'en' ? 'Proficiency' : 'Proficiência'}<input
								type="number"
								bind:value={sheet.proficiencyBonus}
							/></label
						><label
							>{$appLocale === 'en' ? 'Current HP' : 'PV atuais'}<input
								type="number"
								min="0"
								max={sheet.hitPointsMax}
								bind:value={sheet.hitPointsCurrent}
								oninput={syncTokenSoon}
							/></label
						><label
							>{$appLocale === 'en' ? 'Maximum HP' : 'PV máximos'}<input
								type="number"
								min="1"
								bind:value={sheet.hitPointsMax}
								oninput={syncTokenSoon}
							/></label
						><label
							>{$appLocale === 'en' ? 'Temporary HP' : 'PV temporários'}<input
								type="number"
								min="0"
								bind:value={sheet.temporaryHP}
							/></label
						><label
							>{$appLocale === 'en' ? 'Hit dice' : 'Dados de vida'}<input
								bind:value={sheet.hitDice}
							/><small
								>{sheet.level - sheet.hitDiceSpent}/{sheet.level}
								{$appLocale === 'en' ? 'available' : 'disponíveis'}</small
							></label
						>
					</section>
					{#if sheet.resources.length}<section class="resources">
							<h3>{$appLocale === 'en' ? 'Resources' : 'Recursos'}</h3>
							{#each sheet.resources as resource, index}<div>
									<strong>{resource.name}</strong><span
										>{resource.current}/{resource.max} · {resource.restoreOn === 'short'
											? $appLocale === 'en'
												? 'short rest'
												: 'descanso curto'
											: $appLocale === 'en'
												? 'long rest'
												: 'descanso longo'}</span
									><button onclick={() => spendResource(index)} disabled={resource.current === 0}
										>{$appLocale === 'en' ? 'Use' : 'Usar'}</button
									>
								</div>{/each}
						</section>{/if}
					<section class="combat-attacks">
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Attacks' : 'Ataques'}</h3>
							<button onclick={addAttack}>+ {$appLocale === 'en' ? 'Attack' : 'Ataque'}</button>
						</div>
						{#each sheet.attacks as attack, index}<div class="line-item">
								<label
									class="token-roll-toggle"
									title={$appLocale === 'en' ? 'Show on token' : 'Exibir no token'}
									><input
										type="checkbox"
										checked={(sheet.visibleRolls ?? []).includes(`attack:${index}`)}
										onchange={() => toggleVisibleRoll(`attack:${index}`)}
									/>⌁</label
								><input bind:value={attack.name} placeholder="Nome" /><input
									type="number"
									bind:value={attack.attackBonus}
									aria-label="Bônus de ataque"
								/><input bind:value={attack.damage} placeholder="Dano" /><button
									class="roll-custom"
									onclick={() => void rollCustomAttack(attack, index)}
									disabled={rollingAttack === index}>{rollingAttack === index ? '…' : '🎲'}</button
								><button onclick={() => removeAttack(index)}>×</button>
							</div>{/each}
					</section>
				{/if}
				{#if activeTab === 'skills'}
					<section class="skills">
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Skills' : 'Perícias'}</h3>
							<label class="roll-mode"
								>d20 <select bind:value={rollMode} aria-label="Modo de rolagem"
									><option value="advantage" disabled={hasAttackDisadvantage()}
										>{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}</option
									><option value="normal">Normal</option><option value="disadvantage"
										>{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option
									></select
								></label
							>
							<span
								>{$appLocale === 'en'
									? 'Mark proficient skills. Expertise is granted by class progression.'
									: 'Marque as perícias proficientes. Especializações vêm da Progressão de classe.'}</span
							>
						</div>
						<div class="skills-grid">
							{#each skills as [name, ability]}<div class="skill-row">
									<label
										title={$appLocale === 'en'
											? `${skillLabel(name)} proficiency`
											: `Proficiência em ${name}`}
										><input
											type="checkbox"
											checked={sheet.skillProficiencies.includes(name)}
											onchange={() => toggleSkill(name)}
										/></label
									><span
										>{skillLabel(name)}{#if sheet.skillExpertise.includes(name)}<small
												>{$appLocale === 'en' ? 'expertise' : 'especialização'}</small
											>{/if}</span
									><strong
										>{skillBonus(name, ability) >= 0 ? '+' : ''}{skillBonus(name, ability)}</strong
									><button
										class="skill-roll"
										onclick={() => void rollSkill(name, ability)}
										aria-label={$appLocale === 'en' ? `Roll ${skillLabel(name)}` : `Rolar ${name}`}
										>🎲</button
									>
								</div>{/each}
						</div>
					</section>
				{/if}
				{#if activeTab === 'inventory'}
					<section class="inventory-section">
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Equipment' : 'Equipamento'}</h3>
							<span class="defense-hint"
								>{$appLocale === 'en' ? 'Equipped defense' : 'Defesa equipada'}: +{equippedDefense()}
								{$appLocale === 'en' ? 'AC' : 'CA'}</span
							>
						</div>
						<div
							class="inventory-filters"
							aria-label={$appLocale === 'en'
								? 'Equipment categories'
								: 'Categorias de equipamento'}
						>
							{#each [['all', $appLocale === 'en' ? 'All' : 'Tudo'], ['weapon', $appLocale === 'en' ? 'Weapons' : 'Armas'], ['armor', $appLocale === 'en' ? 'Armor' : 'Armaduras'], ['consumable', $appLocale === 'en' ? 'Consumables' : 'Consumíveis'], ['tool', $appLocale === 'en' ? 'Tools' : 'Ferramentas'], ['gear', $appLocale === 'en' ? 'Other' : 'Outros']] as [filter, label]}<button
									class:active={inventoryFilter === filter}
									onclick={() => {
										inventoryFilter = filter as typeof inventoryFilter;
										selectedItemId = '';
									}}>{label}</button
								>{/each}
						</div>
						<div class="compendium-picker">
							<select bind:value={selectedItemId}
								><option value=""
									>{$appLocale === 'en'
										? 'Add item from compendium…'
										: 'Adicionar item do compêndio…'}</option
								>{#each itemEntries() as entry (entry.id)}<option value={entry.id}
										>{optionLabel(entry)}</option
									>{/each}</select
							><button onclick={addInventoryItem} disabled={!selectedItemId}
								>{$appLocale === 'en' ? 'Add' : 'Adicionar'}</button
							>
						</div>
						<div class="custom-item-form">
							<strong>{$appLocale === 'en' ? 'Custom item' : 'Item personalizado'}</strong>
							<input
								bind:value={customItemName}
								placeholder={$appLocale === 'en' ? 'Item name' : 'Nome do item'}
								maxlength="120"
							/>
							<select bind:value={customItemCategory} aria-label="Categoria do item">
								<option value="gear">{$appLocale === 'en' ? 'Other' : 'Outro'}</option>
								<option value="weapon">{$appLocale === 'en' ? 'Weapon' : 'Arma'}</option>
								<option value="armor">{$appLocale === 'en' ? 'Armor' : 'Armadura'}</option>
								<option value="consumable"
									>{$appLocale === 'en' ? 'Consumable' : 'Consumível'}</option
								>
							</select>
							{#if customItemCategory === 'weapon'}<input
									bind:value={customItemDamage}
									placeholder={$appLocale === 'en' ? 'Damage (e.g. 1d8)' : 'Dano (ex.: 1d8)'}
									maxlength="40"
								/>{:else if customItemCategory === 'armor'}<label
									>{$appLocale === 'en' ? 'Base AC' : 'Defesa base'}<input
										type="number"
										min="0"
										max="99"
										bind:value={customItemDefense}
									/></label
								>
							{:else if customItemCategory === 'consumable'}<label
									>{$appLocale === 'en' ? 'Quantity' : 'Quantidade'}<input
										type="number"
										min="1"
										max="9999"
										bind:value={customItemQuantity}
									/></label
								>
							{/if}<button
								type="button"
								onclick={addCustomInventoryItem}
								disabled={!customItemName.trim()}
								>{$appLocale === 'en' ? 'Add custom item' : 'Adicionar item personalizado'}</button
							>
						</div>
						{#if visibleInventory().length}<div class="inventory-list">
								{#each visibleInventory() as item}<div class="inventory-item">
										<label
											><input type="checkbox" bind:checked={item.equipped} />
											{$appLocale === 'en' ? 'equipped' : 'equipado'}</label
										><strong>{itemLabel(item)}</strong>{#if itemDetail(item)}<small
												class="item-detail">{itemDetail(item)}</small
											>{/if}<input
											type="number"
											min="0"
											max="9999"
											bind:value={item.quantity}
											aria-label={$appLocale === 'en'
												? `Quantity of ${item.name}`
												: `Quantidade de ${item.name}`}
										/>{#if equipmentCategory(item) === 'weapon'}<button
												onclick={() => addWeaponAttack(item)}
												>+ {$appLocale === 'en' ? 'attack' : 'ataque'}</button
											><button
												class="roll-weapon"
												onclick={() => rollWeapon(item)}
												disabled={rollingWeapon === item.entryId}
												>{rollingWeapon === item.entryId
													? $appLocale === 'en'
														? 'Rolling…'
														: 'Rolando…'
													: $appLocale === 'en'
														? '🎲 attack'
														: '🎲 atacar'}</button
											>{/if}<button
											onclick={() => removeInventoryItem(sheet.inventory.indexOf(item))}>×</button
										>
									</div>{/each}
							</div>{:else}<p class="empty-inline">
								{$appLocale === 'en'
									? 'No items in this category. Choose a category and add items from the compendium.'
									: 'Nenhum item nesta categoria. Escolha uma categoria e adicione itens pelo compêndio.'}
							</p>{/if}
					</section>
				{/if}
				{#if activeTab === 'spells'}
					<section>
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Spells' : 'Magias'}</h3>
							<button onclick={addSpell}
								>+ {$appLocale === 'en' ? 'Manual spell' : 'Magia manual'}</button
							>
						</div>
						<div class="compendium-picker spell-picker">
							<select bind:value={spellCircle}
								>{#each availableSpellCircles() as circle}<option value={String(circle)}
										>{circleLabel(circle)}</option
									>{/each}</select
							><select bind:value={selectedSpellId}
								><option value=""
									>{sheet.class
										? $appLocale === 'en'
											? 'Spell available to this class…'
											: 'Magia disponível para a classe…'
										: $appLocale === 'en'
											? 'Set a class to filter spells…'
											: 'Defina a classe para filtrar magias…'}</option
								>{#each spellEntries() as entry (entry.id)}<option value={entry.id}
										>{optionLabel(entry)}</option
									>{/each}</select
							><button onclick={addCompendiumSpell} disabled={!selectedSpellId}
								>{$appLocale === 'en' ? 'Add' : 'Adicionar'}</button
							>
						</div>
						{#each availableSpellCircles() as circle}<section class="spell-circle">
								<header>
									<div>
										<h4>{circleLabel(circle)}</h4>
										<small
											>{#if circle > 0}<strong>{spellSlotForCircle(circle)?.current ?? 0}</strong>
												/ {spellSlotForCircle(circle)?.max ?? 0}
												{$appLocale === 'en' ? 'slots' : 'espaços'}{:else}{$appLocale === 'en'
													? 'Always available'
													: 'Sempre disponíveis'}{/if}</small
										>
									</div>
								</header>
								{#if spellsForCircle(circle).length}{#each spellsForCircle(circle) as { spell, index } (index)}<div
											class="line-item"
										>
											<input
												bind:value={spell.name}
												placeholder={$appLocale === 'en' ? 'Name' : 'Nome'}
											/><input
												bind:value={spell.notes}
												placeholder={$appLocale === 'en' ? 'Notes' : 'Notas'}
											/><button
												class="roll-spell"
												onclick={() => void rollSpell(spell)}
												aria-label={$appLocale === 'en'
													? `Roll ${spell.name}`
													: `Rolar ${spell.name}`}>🎲</button
											>{#if spell.level > 0}<select
													value={selectedSlot(spell, index)}
													onchange={(event) =>
														(spellSlotChoice[index] = Number(event.currentTarget.value))}
													aria-label="Espaço de magia"
													>{#each compatibleSlots(spell) as slot}<option value={slot.level}
															>{circleLabel(slot.level)} · {slot.current}/{slot.max}</option
														>{/each}</select
												>{/if}<button
												class="cast-spell"
												disabled={castingSpell === index ||
													!spell.entryId ||
													(spell.level > 0 && !compatibleSlots(spell).length)}
												title={!spell.entryId
													? 'Adicione a magia pelo compêndio para conjurá-la com regras.'
													: ''}
												onclick={() => void castSpell(spell, index)}
												>{castingSpell === index
													? '…'
													: $appLocale === 'en'
														? 'Cast'
														: 'Lançar'}</button
											><button onclick={() => removeSpell(index)}>×</button>
										</div>{/each}{:else}<p>
										{$appLocale === 'en'
											? `No ${circle === 0 ? 'cantrips' : `level ${circle} spells`} added.`
											: `Nenhuma ${circle === 0 ? 'magia' : 'magia deste círculo'} adicionada.`}
									</p>{/if}
							</section>{/each}
					</section>
				{/if}
				{#if activeTab === 'details'}
					<section class="notes">
						<div class="feat-manager">
							<div>
								<h3>{$appLocale === 'en' ? 'Feats' : 'Talentos'}</h3>
								<div class="feat-add">
									<input
										bind:value={newFeat}
										list="feat-options"
										placeholder={$appLocale === 'en' ? 'Add feat' : 'Adicionar talento'}
									/><button onclick={addFeat}>{$appLocale === 'en' ? 'Add' : 'Adicionar'}</button>
								</div>
								<datalist id="feat-options"
									>{#each optionsFor('feat') as feat (feat.id)}<option value={optionLabel(feat)}
											>{feat.summary}</option
										>{/each}</datalist
								>
								<div class="feat-list">
									{#each featList() as feat}<div class="feat-row">
											<button
												class:active={selectedFeat === feat}
												onclick={() => (selectedFeat = feat)}>{feat}</button
											><button
												class="remove-feat"
												aria-label={$appLocale === 'en' ? `Remove ${feat}` : `Remover ${feat}`}
												onclick={() => removeFeat(feat)}>×</button
											>
										</div>{/each}{#if !featList().length}<small
											>{$appLocale === 'en'
												? 'No feats added.'
												: 'Nenhum talento cadastrado.'}</small
										>{/if}
								</div>
							</div>
							<aside>
								<strong
									>{selectedFeat ||
										($appLocale === 'en' ? 'Select a feat' : 'Selecione um talento')}</strong
								>
								<p>
									{selectedFeat
										? featDescription(selectedFeat)
										: $appLocale === 'en'
											? 'The feat description appears here without taking over the entire sheet.'
											: 'A descrição do talento aparece aqui sem ocupar a ficha inteira.'}
								</p>
							</aside>
						</div>
						<label
							>{$appLocale === 'en' ? 'Features' : 'Características'}<textarea
								bind:value={sheet.features}
								placeholder={$appLocale === 'en'
									? 'Species, class features, and notes.'
									: 'Habilidades raciais, de classe e observações.'}></textarea></label
						>
						<label class="legacy-equipment"
							>{$appLocale === 'en' ? 'Equipment notes' : 'Anotações de equipamento'}<textarea
								bind:value={sheet.equipment}
								placeholder={$appLocale === 'en'
									? 'Coins, charges, pack contents, and notes.'
									: 'Moedas, cargas, conteúdo de mochilas e observações.'}></textarea></label
						>
					</section>
				{/if}
			</div>
			<footer>
				{#if message}<span class:success={message === 'Ficha salva.'}>{message}</span>{/if}
				<button class="save" onclick={save} disabled={saving}
					>{saving
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: $appLocale === 'en'
							? 'Save character sheet'
							: 'Salvar ficha'}</button
				>
				{#if isGM}
					<button class="save token-button" onclick={createBoardToken} disabled={saving}
						>{saving
							? $appLocale === 'en'
								? 'Saving…'
								: 'Salvando…'
							: $appLocale === 'en'
								? 'Create token in scene'
								: 'Criar token na cena'}</button
					>
				{/if}
			</footer>
		{/if}
	</section>
</div>
{#if levelChoiceOpen}<div class="level-modal" role="presentation">
		<section>
			<h3>{$appLocale === 'en' ? `Level ${sheet.level}` : `Subida para o nível ${sheet.level}`}</h3>
			<p>
				{$appLocale === 'en'
					? 'How should HP gained at these levels be adjusted?'
					: 'Como deseja ajustar os PV dos níveis ganhos?'}
			</p>
			<div>
				<button onclick={() => void resolveLevelHP('max')}
					>{$appLocale === 'en' ? 'Use maximum value' : 'Usar valor máximo'}</button
				><button onclick={() => void resolveLevelHP('roll')}
					>{$appLocale === 'en' ? 'Roll hit dice' : 'Rolar dados de vida'}</button
				><button onclick={() => void resolveLevelHP('keep')}
					>{$appLocale === 'en' ? 'Keep current HP' : 'Manter PV atuais'}</button
				>
			</div>
		</section>
	</div>{/if}

<style>
	.portrait-editor {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.85rem;
		align-items: start;
		border: 1px solid #493c39;
		border-radius: 10px;
		padding: 0.8rem;
		background: #211b1e;
	}
	.portrait-preview {
		display: grid;
		place-items: center;
		width: 92px;
		height: 92px;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 50%;
		color: #e0b86f;
		background: #171216;
		font-size: 2rem;
	}
	.portrait-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.portrait-editor h3 {
		margin: 0 0 0.3rem;
		color: #f0d29d;
		font:
			600 1rem Georgia,
			serif;
	}
	.portrait-editor p,
	.portrait-editor small {
		margin: 0;
		color: #aa9d91;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.portrait-upload {
		display: inline-flex;
		margin: 0.55rem 0.4rem 0.55rem 0;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-upload input {
		display: none;
	}
	.portrait-ai {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
	}
	.portrait-ai input {
		min-width: 0;
		flex: 1;
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.42rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
		font-size: 0.68rem;
	}
	.portrait-ai button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #291b10;
		background: #e0b86f;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-ai button:disabled,
	.portrait-upload:has(input:disabled) {
		opacity: 0.6;
		cursor: wait;
	}
	.skills-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.skill-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.55rem;
		color: #cbbbab;
	}
	.skill-row label,
	.saving-throws label {
		display: grid;
		place-items: center;
	}
	.skill-row input,
	.saving-throws input {
		appearance: none;
		width: 1rem;
		height: 1rem;
		margin: 0;
		border: 1px solid #806444;
		border-radius: 50%;
		padding: 0;
		background: #171216;
	}
	.skill-row input:checked,
	.saving-throws input:checked {
		border-color: #e0b86f;
		background: #e0b86f;
		box-shadow: inset 0 0 0 3px #211914;
	}
	.skill-row > span {
		overflow: hidden;
		color: #eee4d6;
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.skill-row > span small {
		display: block;
		color: #d8ad67;
		font-size: 0.58rem;
	}
	.skill-row strong {
		min-width: 2.1rem;
		color: #f0d29d;
		font-size: 1rem;
		text-align: center;
	}
	.skill-roll {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.32rem 0.4rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	.derived-value {
		display: block;
		color: #f0d29d;
		font-size: 1.1rem;
	}
	.level-modal {
		position: fixed;
		z-index: 40;
		inset: 0;
		display: grid;
		place-items: center;
		background: #080608c9;
	}
	.level-modal section {
		width: min(92vw, 380px);
		border: 1px solid #765d3d;
		border-radius: 12px;
		padding: 1.2rem;
		color: #eee4d6;
		background: #1b171a;
	}
	.level-modal h3 {
		margin: 0;
	}
	.level-modal p {
		color: #b9aa9d;
	}
	.level-modal div {
		display: grid;
		gap: 0.5rem;
	}
	.level-modal button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.6rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	.saving-throws > div {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.45rem;
	}
	.saving-throws article {
		display: grid;
		grid-template-rows: auto 1fr auto;
		place-items: center;
		gap: 0.3rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.5rem;
		color: #cbbbab;
	}
	.saving-throws label {
		display: flex;
		align-items: center;
		gap: 0.28rem;
		color: #d8c5aa;
		font-size: 0.68rem;
		font-weight: 800;
	}
	.saving-throws strong {
		display: grid;
		place-items: center;
		min-height: 1.8rem;
		color: #f0d29d;
		font-size: 1.05rem;
	}
	.saving-throws button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.28rem 0.4rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	.passive-perception {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgba(116, 151, 179, 0.48);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
		color: #c9dced;
		background: rgba(33, 54, 74, 0.28);
		font-size: 0.74rem;
	}
	.passive-perception small {
		color: #9eb3c6;
		font-size: 0.65rem;
	}
	.expertise-choices {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.65rem;
		border-top: 1px solid #493c39;
		padding-top: 0.65rem;
	}
	.expertise-choices > strong {
		color: #f0cb85;
		font-size: 0.8rem;
	}
	.expertise-choices p {
		margin: 0;
		color: #a99c91;
		font-size: 0.7rem;
		line-height: 1.4;
	}
	.expertise-choices > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.expertise-choices label {
		font-size: 0.63rem;
	}
	.roll-custom {
		border: 1px solid #765d3d !important;
		border-radius: 5px !important;
		color: #f0d29d !important;
		background: #2b211c !important;
	}
	.token-roll-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		color: #d8ad67;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.token-roll-toggle input {
		accent-color: #d8ad67;
	}
	.sheet-backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 6, 8, 0.72);
		backdrop-filter: blur(5px);
	}
	.sheet-backdrop.docked {
		z-index: 9;
		display: block;
		padding: 0;
		background: transparent;
		backdrop-filter: none;
		pointer-events: none;
	}
	.sheet-backdrop.docked .sheet {
		position: fixed;
		top: 5.8rem;
		left: 1rem;
		width: min(390px, calc(100vw - 2rem));
		min-width: min(320px, calc(100vw - 2rem));
		max-width: calc(100vw - 1rem);
		min-height: 320px;
		max-height: calc(100vh - 7rem);
		resize: both;
		overflow: auto;
		pointer-events: auto;
		box-shadow: 0 18px 48px #000a;
	}
	.sheet.minimized {
		width: auto !important;
		min-width: 190px;
		max-height: none !important;
	}
	.sheet-actions {
		display: flex;
		gap: 0.45rem;
	}
	.sheet-actions button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font-size: 1.35rem;
	}
	.sheet {
		width: min(100%, 940px);
		max-height: min(92vh, 900px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 14px;
		color: #eee4d6;
		background: #1b171a;
		box-shadow: 0 30px 90px #000;
	}
	.sheet > header,
	.sheet > footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	.sheet-heading {
		display: grid;
		gap: 0.42rem;
		min-width: 0;
	}
	.sheet-heading h2 {
		overflow: hidden;
		color: #f2e6d7;
		font:
			600 1.42rem Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sheet-heading > div {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem 0.7rem;
	}
	.sheet-heading p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	.sheet-heading small {
		color: #a99c91;
		font-size: 0.75rem;
	}
	h2,
	h3 {
		margin: 0;
		font-family: Georgia, serif;
	}
	.sheet > header button,
	.line-item button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font-size: 1.35rem;
	}
	.sheet-body {
		display: grid;
		gap: 1rem;
		overflow: auto;
		padding: 1.25rem;
	}
	.onboarding {
		display: grid;
		gap: 0.28rem;
		border: 1px solid rgba(216, 173, 103, 0.42);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		color: #d8c5a6;
		background: rgba(92, 57, 31, 0.24);
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.onboarding strong {
		color: #f0cb85;
		font-family: Georgia, serif;
	}
	.sheet-tabs {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		flex: 0 0 auto;
		padding: 0.7rem 1.25rem;
		border-bottom: 1px solid #403536;
		background: #1b171a;
	}
	.sheet-tabs button,
	.inventory-filters button {
		flex: 0 0 auto;
		border: 1px solid #4f433d;
		border-radius: 999px;
		padding: 0.42rem 0.65rem;
		color: #bcae9f;
		background: #171316;
		font-size: 0.72rem;
	}
	.sheet-tabs button.active,
	.inventory-filters button.active {
		border-color: #c89655;
		color: #f2d49a;
		background: #38281f;
	}
	.identity,
	.combat {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
		gap: 0.7rem;
	}
	.combat h3 {
		grid-column: 1 / -1;
	}
	.rest-actions {
		grid-column: 1 / -1;
		display: flex;
		gap: 0.45rem;
	}
	.rest-actions button,
	.resources button {
		border: 1px solid #80603b;
		border-radius: 6px;
		padding: 0.42rem 0.6rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.72rem;
	}
	.combat-attacks {
		display: grid;
		gap: 0.45rem;
	}
	.progression,
	.resources {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #494045;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.progression ul {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.progression li {
		color: #d7c9ba;
		font-size: 0.78rem;
	}
	.progression li span {
		display: inline-block;
		width: 4.1rem;
		color: #d8ad67;
		font-size: 0.68rem;
	}
	.feature-toggle {
		display: grid;
		grid-template-columns: 4.1rem 1fr auto;
		align-items: center;
		width: 100%;
		gap: 0.35rem;
		border: 0;
		padding: 0.25rem 0;
		color: inherit;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.feature-toggle strong {
		font-weight: 600;
	}
	.feature-toggle small {
		color: #d8ad67;
	}
	.feature-description {
		margin: 0.15rem 0 0.45rem 4.1rem;
		color: #bcae9e;
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.resources > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.5rem;
		border-top: 1px solid #393034;
		padding-top: 0.45rem;
	}
	.resources span {
		color: #a99c91;
		font-size: 0.7rem;
	}
	.spell-circle {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.spell-circle header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.spell-circle h4 {
		margin: 0;
		color: #f0cb85;
		font:
			600 0.9rem Georgia,
			serif;
	}
	.spell-circle small {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: #a99c91;
		font-size: 0.68rem;
	}
	.spell-circle p {
		margin: 0;
		color: #8f8378;
		font-size: 0.72rem;
		font-style: italic;
	}
	.identity label:first-child {
		grid-column: span 2;
	}
	label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	textarea {
		min-height: 74px;
		resize: vertical;
	}
	.species-traits {
		display: grid;
		gap: 0.55rem;
		border: 1px solid rgba(101, 130, 158, 0.5);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		background: rgba(33, 54, 74, 0.32);
	}
	.species-traits > div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.species-traits h3 {
		margin: 0;
		color: #b9d7ee;
	}
	.species-traits span,
	.species-traits small {
		color: #a7bac9;
		font-size: 0.72rem;
		line-height: 1.4;
	}
	.species-traits ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.species-traits li {
		border: 1px solid rgba(124, 161, 189, 0.35);
		border-radius: 999px;
		padding: 0.25rem 0.45rem;
		color: #d5e4ed;
		font-size: 0.7rem;
	}
	h3 {
		margin-bottom: 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.55rem;
	}
	.abilities label {
		place-items: center;
		border: 1px solid #4b3d3c;
		border-radius: 7px;
		padding: 0.4rem;
	}
	.abilities input {
		text-align: center;
	}
	.abilities small {
		color: #d8ad67;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-title button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.defense-hint {
		color: #b9d8ad;
		font-size: 0.72rem;
	}
	.inventory-filters {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		margin-bottom: 0.55rem;
	}
	.compendium-picker {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
		margin-bottom: 0.55rem;
	}
	.spell-picker {
		grid-template-columns: 130px minmax(0, 1fr) auto;
	}
	.compendium-picker select,
	.inventory-item input {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.compendium-picker button,
	.inventory-item button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.custom-item-form {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(120px, 0.8fr) minmax(100px, 0.7fr) auto;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.7rem;
		padding: 0.55rem;
		border: 1px dashed #554841;
		border-radius: 6px;
		background: #151214;
	}
	.custom-item-form strong {
		color: #d8ad67;
		font-size: 0.72rem;
	}
	.custom-item-form input,
	.custom-item-form select {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.custom-item-form label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #b9aa9b;
		font-size: 0.72rem;
	}
	.custom-item-form label input {
		width: 4.5rem;
	}
	.custom-item-form button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.item-detail {
		color: #b9aa9b;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	@media (max-width: 640px) {
		.custom-item-form {
			grid-template-columns: 1fr 1fr;
		}
		.custom-item-form strong {
			grid-column: 1 / -1;
		}
		.custom-item-form button {
			grid-column: 1 / -1;
		}
	}
	.inventory-list {
		display: grid;
		gap: 0.4rem;
	}
	.inventory-item {
		display: grid;
		grid-template-columns: auto minmax(90px, 1fr) 60px auto auto auto;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem;
		border: 1px solid #453a38;
		border-radius: 6px;
		background: #181416;
		font-size: 0.78rem;
	}
	.roll-weapon {
		border-color: #9d7744 !important;
		color: #ffe1a4 !important;
		background: #3b291e !important;
	}
	.feat-manager {
		display: grid;
		grid-template-columns: minmax(180px, 0.9fr) 1.1fr;
		gap: 0.8rem;
		border: 1px solid #494045;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.feat-manager h3 {
		margin: 0 0 0.5rem;
		font-size: 0.92rem;
	}
	.feat-add {
		display: flex;
		gap: 0.4rem;
	}
	.feat-add input {
		min-width: 0;
		flex: 1;
	}
	.feat-add button,
	.feat-list button {
		border: 1px solid #5b493b;
		border-radius: 6px;
		color: #dfceb7;
		background: #241d1e;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.feat-add button {
		padding: 0.4rem 0.5rem;
	}
	.feat-list {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}
	.feat-row {
		display: flex;
		gap: 0.3rem;
	}
	.feat-row > button:first-child {
		flex: 1;
		text-align: left;
		padding: 0.42rem 0.5rem;
	}
	.feat-row .remove-feat {
		width: 2rem;
		color: #cda692;
		font-size: 1rem;
	}
	.feat-list button.active {
		border-color: #c89655;
		background: #38281f;
	}
	.feat-manager aside {
		min-height: 90px;
		border-left: 1px solid #493c39;
		padding-left: 0.8rem;
	}
	.feat-manager aside strong {
		color: #f0cb85;
		font:
			600 0.9rem Georgia,
			serif;
	}
	.feat-manager aside p {
		color: #b9aa9d;
		font-size: 0.78rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}
	.inventory-item label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.62rem;
	}
	.inventory-item label input {
		width: auto;
	}
	.empty-inline {
		margin: 0;
		color: #96897e;
		font-size: 0.76rem;
	}
	.line-item {
		display: grid;
		grid-template-columns: 1fr 80px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.45rem;
	}
	.notes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.legacy-equipment {
		grid-column: 1 / -1;
	}
	footer {
		border-top: 1px solid #403536;
		border-bottom: 0;
		min-height: 64px;
	}
	footer span {
		color: #ffb2aa;
		font-size: 0.8rem;
	}
	footer span.success {
		color: #a9d8a3;
	}
	.save {
		border: 0;
		border-radius: 7px;
		padding: 0.65rem 1rem;
		color: #24170e;
		background: #ecd09a;
		font-weight: 800;
	}
	.save:disabled {
		opacity: 0.6;
	}
	.token-button {
		margin-left: 0.5rem;
		border: 1px solid #9c7141;
		color: #f0dcae;
		background: #3c2b22;
	}
	.status {
		padding: 2rem;
		color: #bbaea1;
	}
	@media (max-width: 700px) {
		.sheet-backdrop {
			padding: 0;
		}
		.sheet {
			width: 100%;
			max-height: 100dvh;
			height: 100dvh;
			border: 0;
			border-radius: 0;
		}
		header,
		footer {
			padding: 0.8rem 1rem;
		}
		footer {
			position: sticky;
			bottom: 0;
			background: #1b171a;
		}
		.feat-manager {
			grid-template-columns: 1fr;
		}
		.feat-manager aside {
			border-left: 0;
			border-top: 1px solid #493c39;
			padding: 0.7rem 0 0;
		}
		.identity,
		.combat {
			grid-template-columns: repeat(2, 1fr);
		}
		.identity label:first-child {
			grid-column: span 2;
		}
		.abilities {
			grid-template-columns: repeat(3, 1fr);
		}
		.saving-throws > div {
			grid-template-columns: repeat(3, 1fr);
		}
		.expertise-choices > div {
			grid-template-columns: 1fr;
		}
		.notes {
			grid-template-columns: 1fr;
		}
		.species-traits > div {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
		.spell-picker,
		.inventory-item {
			grid-template-columns: 1fr;
		}
	}
</style>
