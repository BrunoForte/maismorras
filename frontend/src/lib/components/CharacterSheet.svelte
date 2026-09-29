<script lang="ts">
	import { onMount } from 'svelte';
	import { createThumbnail, optimizeImage } from '$lib/services/imageProcessing';
	import type { Session } from '@supabase/supabase-js';
	import {
		createEmptySheet,
		getCharacterForGM,
		getMyCharacter,
		restCharacter,
		rollMyCharacter,
		setCharacterInitiativeAdvantage,
		castMySpell,
		saveCharacterForGM,
		saveMyCharacter,
		type CharacterSheet as Sheet,
		type InventoryItem
	} from '$lib/services/characterApi';
	import {
		createTokenFromCharacter,
		listSceneEffects,
		loadScene,
		rollTokenInitiative
	} from '$lib/services/sceneApi';
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
	import { getSupabaseClient } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { savePresentation } from '$lib/services/presentationApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import {
		classData,
		classFeatures,
		classSavingThrows,
		canonicalClass as progressionClass,
		defaultResources,
		syncResourceMaxima,
		isClassProgressionFeature,
		spellSlots
	} from '$lib/data/classProgression';
	import { appLocale, distance, distanceText } from '$lib/stores/locale';
	import { calculateArmorClass } from '$lib/utils/armorClass';
	import { spellIsOnSheet, unlockedSpellCircles } from '$lib/utils/spellbook';
	import { hasWeaponProficiency, hasWeaponProficiencyInText } from '$lib/utils/weaponProficiency';
	import { cloneInventoryRules } from '$lib/utils/inventoryRules';
	import CharacterSkillsTab from '$lib/components/character/CharacterSkillsTab.svelte';
	import CharacterDetailsTab from '$lib/components/character/CharacterDetailsTab.svelte';
	import CharacterAbilityScores from '$lib/components/character/CharacterAbilityScores.svelte';
	import CharacterInventoryTab from '$lib/components/character/CharacterInventoryTab.svelte';
	import CharacterSpellsTab from '$lib/components/character/CharacterSpellsTab.svelte';
	import CharacterWeaponAttacks from '$lib/components/character/CharacterWeaponAttacks.svelte';
	import type { CustomInventoryItemDraft } from '$lib/components/character/inventoryTypes';
	import CharacterSavingThrows from '$lib/components/character/CharacterSavingThrows.svelte';
	import {
		equipmentCategory,
		itemWeight,
		modifierText,
		weaponAbility,
		weaponItemBonus,
		weaponRange,
		weaponRangeFromText,
		type InventoryCategory
	} from '$lib/utils/characterEquipment';

	let {
		campaignId,
		sceneId,
		session,
		isGM,
		characterId = null,
		characterOwnerName = '',
		docked = false,
		standalone = false,
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
		standalone?: boolean;
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
	let activeTab = $state<'profile' | 'skills' | 'combat' | 'inventory' | 'spells' | 'details'>(
		'profile'
	);
	let inventoryFilter = $state<InventoryCategory>('all');
	let rollingWeaponAction = $state<string | null>(null);
	let lastCriticalWeapon = $state<string | null>(null);
	let rollingAttack = $state<number | null>(null);
	let rollingAttackAction = $state<'attack' | 'damage' | null>(null);
	let lastCriticalAttack = $state<number | null>(null);
	let rollMode = $state<'normal' | 'advantage' | 'disadvantage'>('normal');
	let castingSpell = $state<number | null>(null);
	let expandedSpell = $state<number | null>(null);
	let spellSlotChoice = $state<Record<number, number>>({});
	let newSpellName = $state('');
	let newSpellLevel = $state(0);
	let tokenSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let sheetEditRevision = 0;
	let saveQueued = false;
	let minimized = $state(false);
	let activeConditions = $state<string[]>([]);
	let previousLevel = $state(1);
	let levelChoiceOpen = $state(false);
	let portraitPrompt = $state('');
	let portraitPreview = $state<string | null>(null);
	let portraitBusy = $state(false);
	let expandedFeature = $state<string | null>(null);
	let presentationSocket: SceneSocket | null = null;
	const sceneSocketPublishChat = () => presentationSocket?.publishChatUpdated();
	let initiativeTokenId = $state<string | null>(null);
	let resolvedCharacterId = $state<string | null>(null);
	const hasAttackDisadvantage = () =>
		activeConditions.some((condition) => ['Cego', 'Envenenado', 'Impedido'].includes(condition));
	const selectedAttackMode = () => (hasAttackDisadvantage() ? 'disadvantage' : rollMode);
	$effect(() => {
		if (hasAttackDisadvantage() && rollMode === 'advantage') rollMode = 'normal';
	});
	$effect(() => {
		if (!shouldShowSpellcasting() && activeTab === 'spells') activeTab = 'profile';
	});
	$effect(() => {
		const circles = unlockedSpellCircles(sheet.spellSlots);
		if (!circles.includes(newSpellLevel)) newSpellLevel = circles.at(-1) ?? 0;
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
		($appLocale === 'en'
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
				]
		).filter(([tab]) => tab !== 'spells' || shouldShowSpellcasting());
	const modifier = (score: number) => Math.floor((score - 10) / 2);
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
	const speciesTraitDescription = (trait: string) => {
		const english = $appLocale === 'en';
		if (/vis[aã]o no escuro/i.test(trait))
			return english
				? 'You can see in dim light within the listed range as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.'
				: 'Você enxerga na penumbra dentro do alcance indicado como se fosse luz plena e, na escuridão, como se fosse penumbra. Na escuridão, não distingue cores, apenas tons de cinza.';
		if (/investida de adrenalina|adrenaline rush/i.test(trait))
			return english
				? 'As a bonus action, you can take the Dash action to move. You also gain temporary hit points equal to your proficiency bonus. You can use this a number of times equal to your proficiency bonus, regaining all uses after a Long Rest.'
				: 'Como uma ação bônus, você pode realizar a ação Disparada para se mover. Você também recebe pontos de vida temporários iguais ao seu bônus de proficiência. Pode usar este traço um número de vezes igual ao bônus de proficiência e recupera todos os usos após um Descanso Longo.';
		if (/resist[eê]ncia incans[aá]vel|relentless endurance/i.test(trait))
			return english
				? 'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, this trait returns after a Long Rest.'
				: 'Quando você é reduzido a 0 pontos de vida, mas não morre instantaneamente, pode ficar com 1 ponto de vida em vez disso. Após usar este traço, você só pode usá-lo novamente depois de um Descanso Longo.';
		if (/sorte|lucky/i.test(trait))
			return english
				? 'When you roll a 1 on a d20 test, you can reroll the die and must use the new roll.'
				: 'Quando obtém 1 em um teste com d20, você pode rolar o dado novamente e deve usar o novo resultado.';
		if (/arma de sopro|breath weapon/i.test(trait))
			return english
				? 'You exhale destructive energy in an area. The saving throw, damage, area, and uses are determined by your species rules and level.'
				: 'Você expele energia destrutiva em uma área. A salvaguarda, o dano, a área e a quantidade de usos seguem as regras da espécie e do nível.';
		if (/voo drac[oô]nico|draconic flight/i.test(trait))
			return english
				? 'Beginning at level 5, you can manifest spectral wings and gain a flying speed for a limited duration, according to the species feature.'
				: 'A partir do nível 5, você manifesta asas espectrais e recebe deslocamento de voo por uma duração limitada, conforme o traço da espécie.';
		if (/ancestralidade fe[eé]rica|fey ancestry/i.test(trait))
			return english
				? 'You have Advantage on saving throws you make to avoid or end the Charmed condition.'
				: 'Você tem vantagem nas salvaguardas feitas para evitar ou encerrar a condição Enfeitiçado.';
		return english
			? 'This trait is applied from the selected species or lineage. Consult its compendium entry for the complete rules text.'
			: 'Este traço é aplicado pela espécie ou linhagem selecionada. Consulte a entrada correspondente no compêndio para ver o texto completo das regras.';
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
			const loadedCharacter = characterId
				? await getCharacterForGM(session, campaignId, characterId)
				: await getMyCharacter(session, campaignId);
			resolvedCharacterId = loadedCharacter.id;
			sheet = loadedCharacter.sheet;
			sheet.attacks ??= [];
			sheet.attacks = sheet.attacks.map((attack) => {
				const attackType =
					attack.attackType ??
					(/\b(arco|besta|dist[aâ]ncia|ranged|longbow|shortbow|crossbow)\b/i.test(
						`${attack.name} ${attack.notes}`
					)
						? 'ranged'
						: 'melee');
				const ability = attack.ability ?? (attackType === 'ranged' ? 'dexterity' : 'strength');
				return attack.ability
					? { ...attack, attackType, ability }
					: {
							...attack,
							attackType,
							ability,
							attackBonus: attack.attackBonus - modifier(sheet.abilityScores[ability])
						};
			});
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
					initiativeTokenId = token.id;
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
	onMount(() => {
		if (!sceneId) return;
		presentationSocket = connectSceneSocket(
			session,
			sceneId,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => {
				if (!resolvedCharacterId) return;
				void getCharacterForGM(session, campaignId, resolvedCharacterId)
					.then(
						(character) =>
							(sheet.initiativeAdvantage = character.sheet.initiativeAdvantage ?? false)
					)
					.catch(() => undefined);
			}
		);
		return () => {
			presentationSocket?.close();
			presentationSocket = null;
		};
	});
	async function setInitiativeAdvantage(enabled: boolean) {
		if (!resolvedCharacterId) {
			message = 'Salve a ficha antes de configurar a vantagem de iniciativa.';
			return;
		}
		try {
			const result = await setCharacterInitiativeAdvantage(
				session,
				campaignId,
				resolvedCharacterId,
				enabled
			);
			sheet.initiativeAdvantage = result.enabled;
			message = enabled ? 'Vantagem preparada para a próxima iniciativa.' : 'Vantagem desativada.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: 'Não foi possível alterar a vantagem da iniciativa.';
		}
	}
	async function rollSheetInitiative() {
		if (!initiativeTokenId || !sceneId) {
			message = 'Esta ficha ainda não está vinculada a um token na cena.';
			return;
		}
		try {
			const result = await rollTokenInitiative(session, sceneId, initiativeTokenId);
			sheet.initiativeAdvantage = false;
			const dice = result.rolls ?? [result.roll];
			const label = result.advantage ? `Iniciativa · vantagem (${dice.join(' e ')})` : 'Iniciativa';
			diceOverlay.set({
				expression: `${sheet.name} · ${label}`,
				notation: `${dice.length}d20${result.bonus ? `${result.bonus >= 0 ? '+' : ''}${result.bonus}` : ''}`,
				total: result.initiative,
				dice
			});
			presentationSocket?.publishCombatUpdated();
			message = `${label}: ${result.roll} ${result.bonus >= 0 ? '+' : '−'} ${Math.abs(result.bonus)} = ${result.initiative}`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.';
		}
	}
	async function refreshPortraitPreview() {
		if (!sheet.portraitPath) {
			portraitPreview = null;
			return;
		}
		portraitPreview = (await getSignedAssetUrl(session, campaignId, sheet.portraitPath)) ?? null;
	}
	async function optimizePortrait(blob: Blob): Promise<Blob> {
		return (await optimizeImage(new File([blob], 'portrait', { type: blob.type }), 1536)).file;
	}
	async function savePortrait(blob: Blob, filename: string) {
		blob = await optimizePortrait(blob);
		const supabase = await getSupabaseClient();
		if (!supabase) throw new Error('Supabase não está configurado.');
		if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
		const { data: userData, error: userError } = await supabase.auth.getUser();
		if (userError || !userData.user) throw new Error('Sua sessão expirou. Faça login novamente.');
		if (userData.user.id !== session.user.id)
			throw new Error(
				'A sessão atual não corresponde ao usuário autenticado. Faça login novamente.'
			);
		const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
		const basePath = `campaigns/${campaignId}/portraits/${userData.user.id}/${crypto.randomUUID()}`;
		const path = `${basePath}-${safeName}`;
		const thumbnail = await createThumbnail(blob, 320);
		const tokenExtension = thumbnail.file.type === 'image/webp' ? 'webp' : 'png';
		const tokenPath = `${basePath}-token.${tokenExtension}`;
		const storage = supabase.storage.from('campaign-assets');
		const { error: thumbnailError } = await storage.upload(tokenPath, thumbnail.file, {
			contentType: thumbnail.file.type || 'image/png',
			cacheControl: '31536000',
			upsert: false
		});
		if (thumbnailError) throw thumbnailError;
		const { error } = await storage.upload(path, blob, {
			contentType: blob.type || 'image/png',
			cacheControl: '31536000',
			upsert: false
		});
		if (error) {
			await storage.remove([tokenPath]);
			throw error;
		}
		sheet.portraitPath = path;
		sheet.tokenPortraitPath = tokenPath;
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
		$appLocale === 'pt-BR' &&
		entry.translations?.['pt-BR']?.trim() &&
		entry.translations['pt-BR'].trim().toLocaleLowerCase() !== entry.name.trim().toLocaleLowerCase()
			? entry.translations['pt-BR']
			: entry.name;
	const entryRules = (entry: CompendiumEntry) => entry.rules as Record<string, unknown>;
	const itemEntries = () =>
		compendiumEntries.filter(
			(entry) =>
				entry.entryType === 'item' &&
				(inventoryFilter === 'all' ||
					equipmentCategory({ name: entry.name, rules: entryRules(entry) }) === inventoryFilter)
		);
	const weaponItems = () => sheet.inventory.filter((item) => equipmentCategory(item) === 'weapon');
	const weaponKey = (item: InventoryItem) => `${item.entryId}:${sheet.inventory.indexOf(item)}`;
	const visibleInventory = () =>
		sheet.inventory
			.map((item, index) => ({ item, index }))
			.filter(
				({ item }) => inventoryFilter === 'all' || equipmentCategory(item) === inventoryFilter
			);
	const totalInventoryWeight = () =>
		sheet.inventory.reduce((total, item) => total + itemWeight(item), 0);
	const weaponProficiencyStatus = (item: InventoryItem) => {
		if (typeof item.rules.proficient === 'boolean') return item.rules.proficient;
		const rules = compendiumClass()?.rules ?? {};
		const baseProficiencies = Array.isArray(rules.weaponProficiencies)
			? rules.weaponProficiencies.map((value) => String(value).toLowerCase())
			: [];
		const subclass = compendiumEntries.find(
			(entry) =>
				entry.entryType === 'subclass' &&
				(entry.name === sheet.subclass || optionLabel(entry) === sheet.subclass)
		);
		const subclassProficiencies = Array.isArray(subclass?.rules.weaponProficiencies)
			? subclass.rules.weaponProficiencies.map((value) => String(value).toLowerCase())
			: [];
		const category = String(item.rules.category ?? '');
		const proficiencies = [...baseProficiencies, ...subclassProficiencies];
		return (
			hasWeaponProficiency(proficiencies, item.name, category) ||
			hasWeaponProficiencyInText(JSON.stringify(subclass?.rules ?? {}), item.name, category)
		);
	};
	const weaponProficiencyBonus = (item: InventoryItem) =>
		weaponProficiencyStatus(item) ? sheet.proficiencyBonus : 0;
	const featList = () =>
		sheet.feats
			.split(/\n|,/)
			.map((feat) => feat.trim())
			.filter(Boolean);
	type WeaponEffect = { key: string; name: string; attackBonus: number; damageBonus: number };
	const parseWeaponEffect = (
		key: string,
		name: string,
		text: string,
		itemRange: 'melee' | 'ranged'
	): WeaponEffect | null => {
		const range = weaponRangeFromText(text);
		if (range && range !== itemRange) return null;
		const attack = text.match(/\+(\d+)\s+bonus to attack rolls?/i);
		const damage = text.match(/\+(\d+)\s+bonus to damage rolls?/i);
		const attackBonus = attack ? Number(attack[1]) : 0;
		const damageBonus = damage ? Number(damage[1]) : 0;
		return attackBonus || damageBonus ? { key, name, attackBonus, damageBonus } : null;
	};
	const weaponEffects = (item: InventoryItem): WeaponEffect[] => {
		const range = weaponRange(item);
		const features = derivedFeatures().map((feature) => ({
			key: feature.id,
			name: feature.name,
			text: feature.description
		}));
		const feats = featList().flatMap((feat, index) => {
			const entry = optionsFor('feat').find(
				(candidate) =>
					candidate.name.toLowerCase() === feat.toLowerCase() ||
					optionLabel(candidate).toLowerCase() === feat.toLowerCase()
			);
			if (!entry) return [];
			const rules = entry.rules ?? {};
			const benefits = Array.isArray(rules.benefits) ? rules.benefits.map(String).join(' ') : '';
			return [
				{
					key: `feat-${entry.id || index}`,
					name: optionLabel(entry),
					text: `${String(rules.description ?? '')} ${benefits}`
				}
			];
		});
		return [...features, ...feats].flatMap((effect) => {
			const normalizedName = effect.name
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.toLowerCase();
			if (/archery|arquearia|estilo de luta.*arco/.test(normalizedName) && range === 'ranged')
				return [{ key: effect.key, name: effect.name, attackBonus: 2, damageBonus: 0 }];
			if (/dueling|duelo/.test(normalizedName) && range === 'melee') {
				const itemRules = JSON.stringify(item.rules);
				const twoHanded = /two.?handed|duas m[aã]os/.test(itemRules);
				const anotherEquippedWeapon = sheet.inventory.some(
					(other) =>
						other !== item &&
						other.equipped &&
						String(other.rules.category ?? '').toLowerCase() === 'weapon'
				);
				if (!twoHanded && !anotherEquippedWeapon)
					return [{ key: effect.key, name: effect.name, attackBonus: 0, damageBonus: 2 }];
				return [];
			}
			const parsed = parseWeaponEffect(effect.key, effect.name, effect.text, range);
			return parsed ? [parsed] : [];
		});
	};
	const selectedWeaponEffects = (item: InventoryItem) => {
		const enabled = Array.isArray(item.rules.enabledCombatModifiers)
			? item.rules.enabledCombatModifiers.map(String)
			: [];
		return weaponEffects(item).filter((effect) => enabled.includes(effect.key));
	};
	function toggleWeaponEffect(item: InventoryItem, key: string) {
		const enabled = Array.isArray(item.rules.enabledCombatModifiers)
			? item.rules.enabledCombatModifiers.map(String)
			: [];
		item.rules.enabledCombatModifiers = enabled.includes(key)
			? enabled.filter((itemKey) => itemKey !== key)
			: [...enabled, key];
	}
	type WeaponAttackProfile = {
		id: string;
		name: string;
		description: string;
		attackAbility: keyof Sheet['abilityScores'];
		damage: string;
		attackBonus: number;
		damageBonus: number;
		greatWeaponFighting: boolean;
	};
	const weaponAttackProfiles = (item: InventoryItem): WeaponAttackProfile[] =>
		(Array.isArray(item.rules.attackProfiles) ? item.rules.attackProfiles : []).filter(
			(profile): profile is WeaponAttackProfile =>
				typeof profile === 'object' &&
				profile !== null &&
				typeof (profile as WeaponAttackProfile).id === 'string'
		);
	function addWeaponAttackProfile(item: InventoryItem) {
		const profiles = weaponAttackProfiles(item);
		const profile: WeaponAttackProfile = {
			id: crypto.randomUUID(),
			name: $appLocale === 'en' ? `Attack ${profiles.length + 2}` : `Golpe ${profiles.length + 2}`,
			description: '',
			attackAbility: weaponAbility(item),
			damage: String(item.rules.damage ?? ''),
			attackBonus: 0,
			damageBonus: 0,
			greatWeaponFighting: false
		};
		item.rules = { ...item.rules, attackProfiles: [...profiles, profile] };
		syncTokenSoon();
	}
	function removeWeaponAttackProfile(item: InventoryItem, profileId: string) {
		item.rules = {
			...item.rules,
			attackProfiles: weaponAttackProfiles(item).filter((profile) => profile.id !== profileId)
		};
		syncTokenSoon();
	}
	const hasGreatWeaponFighting = () =>
		/Great Weapon Fighting|Luta com Armas Grandes/i.test(`${sheet.feats}\n${sheet.features}`);
	const weaponSupportsGreatWeaponFighting = (item: InventoryItem) => {
		const rules = JSON.stringify(item.rules);
		return (
			/two.?handed|versatile|duas m[aã]os|vers[aá]til/i.test(rules) &&
			!/ammunition|ranged|range/i.test(rules)
		);
	};
	const weaponBonusTotals = (item: InventoryItem) => {
		const effects = selectedWeaponEffects(item);
		return {
			attack: effects.reduce((total, effect) => total + effect.attackBonus, 0),
			damage: effects.reduce((total, effect) => total + effect.damageBonus, 0)
		};
	};
	const weaponAttackBonusTotal = (item: InventoryItem) =>
		modifier(sheet.abilityScores[weaponAbility(item)]) +
		weaponProficiencyBonus(item) +
		weaponItemBonus(item) +
		weaponBonusTotals(item).attack;
	const weaponDamageBonusTotal = (item: InventoryItem) =>
		modifier(sheet.abilityScores[weaponAbility(item)]) +
		weaponItemBonus(item) +
		weaponBonusTotals(item).damage;
	function updateWeaponRules(
		item: InventoryItem,
		changes: Record<string, unknown>,
		autosave = false
	) {
		const index = sheet.inventory.indexOf(item);
		if (index < 0) return;
		sheet.inventory = sheet.inventory.map((current, currentIndex) =>
			currentIndex === index ? { ...current, rules: { ...current.rules, ...changes } } : current
		);
		if (autosave) syncTokenSoon();
	}
	function updateWeaponProfile(
		item: InventoryItem,
		profileId: string,
		changes: Partial<WeaponAttackProfile>
	) {
		const profiles = weaponAttackProfiles(item).map((profile) =>
			profile.id === profileId ? { ...profile, ...changes } : profile
		);
		updateWeaponRules(item, { attackProfiles: profiles }, true);
	}
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
		const hitDice = classData[canonicalClass(sheet.class)]?.hitDice;
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
	const shouldShowSpellcasting = () => {
		const rules = compendiumClass()?.rules ?? {};
		const mapped =
			(Boolean(rules.spellcasting) && typeof rules.spellcasting === 'object') ||
			spellSlots(sheet.class, sheet.level).length > 0;
		return mapped || sheet.spellcastingOverride === true;
	};
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
			.filter((entry) => isClassProgressionFeature(entry.entryType, entry.rules))
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
	const spellCompendiumEntry = (spell: Sheet['spells'][number]) =>
		spell.entryId ? compendiumEntries.find((entry) => entry.id === spell.entryId) : undefined;
	const spellDisplayName = (spell: Sheet['spells'][number]) => {
		const entry = spellCompendiumEntry(spell);
		return entry ? optionLabel(entry) : spell.name;
	};
	const localizedSpellText = (spell: Sheet['spells'][number], field: string, fallback: string) => {
		const entry = spellCompendiumEntry(spell);
		const translation = entry?.translations?.[`pt-BR.rules.${field}`]?.trim();
		return $appLocale === 'pt-BR' &&
			translation &&
			translation.toLocaleLowerCase() !== fallback.trim().toLocaleLowerCase()
			? translation
			: fallback;
	};
	const spellDescription = (spell: Sheet['spells'][number]) => {
		const entry = spellCompendiumEntry(spell);
		const rules = entry ? entryRules(entry) : {};
		const original = String(rules.description ?? spell.description ?? entry?.summary ?? '').trim();
		return localizedSpellText(spell, 'description', original);
	};
	const spellHigherLevels = (spell: Sheet['spells'][number]) => {
		const entry = spellCompendiumEntry(spell);
		const rules = entry ? entryRules(entry) : {};
		const original = String(
			rules.higherLevels ?? rules.atHigherLevels ?? spell.higherLevels ?? ''
		).trim();
		return localizedSpellText(spell, 'higherLevels', original);
	};
	const spellHasAITranslation = (spell: Sheet['spells'][number]) => {
		const entry = spellCompendiumEntry(spell);
		return Object.entries(entry?.translations ?? {}).some(
			([key, value]) => key.startsWith('pt-BR.rules.') && key.endsWith('.source') && value === 'ai'
		);
	};
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
		const hitDie = classData[canonicalClass(sheet.class)]?.hitDice;
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
		sheet.resources = syncResourceMaxima(defaults, sheet.resources);
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
			const rollCount = Math.max(1, result.dados.length);
			$diceOverlay = {
				expression: `${sheet.name || 'Personagem'} · ${fallbackLabel} · ${mode === 'advantage' ? 'Vantagem' : mode === 'disadvantage' ? 'Desvantagem' : 'Normal'}`,
				notation: `${rollCount}d20${result.modificador ? `${result.modificador >= 0 ? '+' : ''}${result.modificador}` : ''}`,
				total: result.total,
				dice: result.dados,
				nonce: String(result.eventId)
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
			sceneSocketPublishChat();
		} catch (error) {
			message = error instanceof Error ? error.message : `Não foi possível rolar ${fallbackLabel}.`;
		}
	}
	const rollSkill = (name: string) =>
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
	function setResourceMax(index: number, value: string) {
		const resource = sheet.resources[index];
		const parsed = value.trim() === '' ? undefined : Number(value);
		if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) return;
		const automatic =
			defaultResources(sheet.class, sheet.level, sheet.abilityScores).find(
				(candidate) => candidate.id === resource.id
			)?.max ?? resource.max;
		const max = parsed === undefined ? automatic : Math.min(999, Math.floor(parsed));
		sheet.resources[index] = {
			...resource,
			max,
			...(parsed === undefined ? { maxOverride: undefined } : { maxOverride: max }),
			current: Math.min(resource.current, max)
		};
		syncTokenSoon();
	}
	async function rest(kind: 'short' | 'long') {
		if (saving) return;
		saving = true;
		const savedRevision = sheetEditRevision;
		try {
			const result = await restCharacter(session, campaignId, kind, characterId);
			if (sheetEditRevision === savedRevision) {
				sheet = result.sheet;
			} else {
				sheet.hitPointsCurrent = result.sheet.hitPointsCurrent;
				sheet.temporaryHP = result.sheet.temporaryHP;
				sheet.hitDiceSpent = result.sheet.hitDiceSpent;
				sheet.resources = result.sheet.resources;
				sheet.spellSlots = result.sheet.spellSlots;
				sheet.armorClass = result.sheet.armorClass;
				sheet.proficiencyBonus = result.sheet.proficiencyBonus;
				sheet.passivePerception = result.sheet.passivePerception;
			}
			if (kind === 'short') {
				$diceOverlay = {
					expression: result.label ?? `${sheet.name || 'Personagem'} · Dado de vida`,
					notation: `${sheet.hitDice}${result.modificador ? `${result.modificador > 0 ? '+' : ''}${result.modificador}` : ''}`,
					total: result.total ?? 0,
					dice: result.dados ?? []
				};
				sceneSocketPublishChat();
			}
			message =
				kind === 'long'
					? 'Descanso longo aplicado: PV, recursos e espaços restaurados.'
					: 'Descanso curto aplicado: dado de vida e recursos recuperados.';
			onTokenCreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível aplicar o descanso.';
		} finally {
			saving = false;
			if (saveQueued || sheetEditRevision !== savedRevision) {
				saveQueued = false;
				if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
				tokenSyncTimer = setTimeout(() => void save(), 0);
			}
		}
	}
	const spellEntries = (circle?: number) =>
		compendiumEntries.filter((entry) => {
			if (entry.entryType !== 'spell') return false;
			if (spellIsOnSheet(entry.id, entry.name, optionLabel(entry), sheet.spells)) return false;
			const rules = entryRules(entry);
			const level = Number(rules.level ?? 0);
			const classes = Array.isArray(rules.classes) ? rules.classes.map(String) : [];
			return (
				(circle === undefined || level === circle) &&
				(!canonicalClass(sheet.class) ||
					classes.length === 0 ||
					classes.includes(canonicalClass(sheet.class)))
			);
		});
	const availableSpellCircles = () =>
		[
			...new Set([
				0,
				...sheet.spellSlots.filter((slot) => slot.max > 0).map((slot) => slot.level),
				...sheet.spells.map((spell) => spell.level)
			])
		].sort((a, b) => a - b);
	const addableSpellCircles = () => unlockedSpellCircles(sheet.spellSlots);
	const spellSlotForCircle = (circle: number) =>
		sheet.spellSlots.find((slot) => slot.level === circle);
	const spellsForCircle = (circle: number) =>
		sheet.spells
			.map((spell, index) => ({ spell, index }))
			.filter((item) => item.spell.level === circle);
	const spellOrigin = (spell: Sheet['spells'][number]) => {
		if (spell.origin) return spell.origin;
		const rules = spellCompendiumEntry(spell)?.rules ?? {};
		const origin = String(
			rules.origin ?? rules.originType ?? rules.sourceType ?? rules.featureSource ?? ''
		).toLowerCase();
		if (/species|race|racial|ancestr|ra[cç]a/.test(origin)) return 'species';
		if (/feat|talent|talento/.test(origin)) return 'feat';
		return 'class';
	};
	const normalizeSpellSource = (value: string) =>
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase()
			.trim();
	const grantedSpells = () => {
		const granted: Sheet['spells'] = sheet.spells.filter((spell) => spellOrigin(spell) !== 'class');
		const sourceTexts = [
			{ origin: 'species' as const, text: activeSpeciesTraits().join(' ') },
			...featList().flatMap((feat) => {
				const entry = optionsFor('feat').find(
					(candidate) =>
						optionLabel(candidate).toLowerCase() === feat.toLowerCase() ||
						candidate.name.toLowerCase() === feat.toLowerCase()
				);
				return entry ? [{ origin: 'feat' as const, text: JSON.stringify(entry.rules) }] : [];
			})
		];
		for (const entry of compendiumEntries.filter((item) => item.entryType === 'spell')) {
			const names = [entry.name, optionLabel(entry)].map(normalizeSpellSource);
			const source = sourceTexts.find(({ text }) => {
				const normalized = normalizeSpellSource(text);
				return names.some((name) => name.length > 2 && normalized.includes(name));
			});
			if (!source) continue;
			const name = optionLabel(entry);
			if (granted.some((spell) => normalizeSpellSource(spell.name) === normalizeSpellSource(name)))
				continue;
			granted.push({
				entryId: entry.id,
				name,
				level: Number(entry.rules.level ?? 0),
				notes: '',
				origin: source.origin
			});
		}
		return granted;
	};
	const circleLabel = (circle: number) =>
		circle === 0
			? $appLocale === 'en'
				? 'Cantrips'
				: 'Truques'
			: $appLocale === 'en'
				? `Level ${circle}`
				: `Círculo ${circle}`;
	function addInventoryItem(entryId: string) {
		const entry = itemEntries().find((item) => item.id === entryId);
		if (!entry) return;
		sheet.inventory = [
			...sheet.inventory,
			{
				entryId: entry.id,
				name: optionLabel(entry),
				quantity: 1,
				equipped: false,
				// Inventory keeps a private snapshot: editing an equipped item must not
				// mutate the shared compendium object (and then be overwritten on refresh).
				rules: cloneInventoryRules(entry.rules)
			}
		];
	}
	async function addCustomInventoryItem(draft: CustomInventoryItemDraft): Promise<boolean> {
		const name = draft.name.trim();
		if (!name) return false;
		if (draft.category === 'weapon') {
			const damage = draft.damage.trim();
			if (!/^\d+d\d+(?:\s*[+-]\s*\d+)?$/i.test(damage)) {
				message =
					$appLocale === 'en'
						? 'Enter weapon damage as NdN (e.g. 1d8).'
						: 'Informe o dano da arma como NdN (ex.: 1d8).';
				return false;
			}
		}
		const rules: Record<string, unknown> = { category: draft.category, custom: true };
		rules.weight = Math.max(0, Number(draft.weight) || 0);
		if (draft.category === 'weapon') {
			if (draft.damage.trim()) rules.damage = draft.damage.trim();
			rules.bonus = Math.round(draft.bonus);
			rules.attackType = /ranged|dist[aâ]ncia|arco|besta/i.test(name) ? 'ranged' : 'melee';
			rules.attackAbility = rules.attackType === 'ranged' ? 'dexterity' : 'strength';
		} else if (draft.category === 'armor') {
			rules.ac = String(Math.max(0, Math.round(draft.defense)));
			rules.bonus = Math.round(draft.bonus);
		} else if (draft.category === 'consumable') {
			rules.quantity = Math.max(1, Math.round(draft.quantity));
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
				return false;
			}
		}
		sheet.inventory = [
			...sheet.inventory,
			{
				entryId: `custom-${crypto.randomUUID()}`,
				name,
				quantity: draft.category === 'consumable' ? Math.max(1, Math.round(draft.quantity)) : 1,
				equipped: false,
				rules
			}
		];
		return true;
	}
	function removeInventoryItem(index: number) {
		sheet.inventory = sheet.inventory.filter((_, itemIndex) => itemIndex !== index);
	}
	async function rollWeapon(
		item: InventoryItem,
		action: 'attack' | 'damage',
		profile?: WeaponAttackProfile
	) {
		const rules = item.rules;
		const damageFormula = profile?.damage || String(rules.damage ?? '');
		const damageMatch = damageFormula.match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
		const profileKey = profile?.id ?? 'default';
		const stableWeaponKey = weaponKey(item);
		const actionKey = `${stableWeaponKey}:${profileKey}:${action}`;
		if (equipmentCategory(item) !== 'weapon' || rollingWeaponAction) return;
		if (action === 'damage' && !damageMatch) {
			message =
				$appLocale === 'en'
					? 'This weapon has no damage formula.'
					: 'Esta arma não tem uma fórmula de dano.';
			return;
		}
		if (
			action === 'attack' &&
			activeConditions.some((condition) =>
				['Incapacitado', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(
					condition
				)
			)
		) {
			message = 'Esta condição impede ações e reações; o ataque não pode ser rolado.';
			return;
		}
		const abilityKey = profile?.attackAbility ?? weaponAbility(item);
		const abilityModifier = modifier(sheet.abilityScores[abilityKey]);
		const itemBonus = weaponItemBonus(item);
		const proficiencyBonus = weaponProficiencyBonus(item);
		const effects = weaponBonusTotals(item);
		rollingWeaponAction = actionKey;
		message = '';
		beginDiceBatch();
		try {
			if (action === 'attack') {
				const attackBonus =
					abilityModifier +
					proficiencyBonus +
					itemBonus +
					effects.attack +
					(profile?.attackBonus ?? 0);
				const attackMode = selectedAttackMode();
				const event = await rollDice(
					session,
					campaignId,
					`1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`,
					attackMode === 'normal' ? undefined : attackMode,
					'combat'
				);
				const result = event.payload as { expressao: string; dados: number[]; total: number };
				const critical = result.dados.includes(20);
				lastCriticalWeapon = critical ? `${stableWeaponKey}:${profileKey}` : null;
				$chatMensagens = [
					...$chatMensagens,
					{
						id: String(event.id),
						autor: event.author,
						texto: `${item.name}${profile ? ` · ${profile.name}` : ''} · ataque${critical ? ' · CRÍTICO!' : ''}`,
						tipo: 'rolagem',
						canal: 'combat',
						detalhesRolagem: {
							...result,
							modificador: attackBonus,
							label: `${item.name}${profile ? ` · ${profile.name}` : ''} · ataque`
						}
					}
				];
				sceneSocketPublishChat();
				$diceOverlay = {
					expression: `${sheet.name || 'Personagem'} · ${item.name}${profile ? ` · ${profile.name}` : ''} · ataque`,
					notation: result.expressao,
					total: result.total,
					dice: result.dados,
					nonce: String(event.id)
				};
			} else {
				const baseModifier =
					damageMatch?.[3] === '-' ? -Number(damageMatch[4] ?? 0) : Number(damageMatch?.[4] ?? 0);
				const damageModifier =
					baseModifier + abilityModifier + itemBonus + effects.damage + (profile?.damageBonus ?? 0);
				const isCritical = lastCriticalWeapon === `${stableWeaponKey}:${profileKey}`;
				const diceCount = Number(damageMatch![1]) * (isCritical ? 2 : 1);
				const event = await rollDice(
					session,
					campaignId,
					`${diceCount}d${damageMatch![2]}${damageModifier ? `${damageModifier >= 0 ? '+' : ''}${damageModifier}` : ''}`,
					undefined,
					'combat',
					profile?.greatWeaponFighting ? 3 : undefined
				);
				const damage = event.payload as {
					expressao: string;
					dados: number[];
					total: number;
					regraAplicada?: string;
					dadosOriginais?: number[];
				};
				const attackName = `${item.name}${profile ? ` · ${profile.name}` : ''}`;
				$chatMensagens = [
					...$chatMensagens,
					{
						id: String(event.id),
						autor: event.author,
						texto: `${attackName} · dano${isCritical ? ' crítico' : ''}${damage.regraAplicada ? ` · ${damage.regraAplicada}` : ''} (${String(rules.damageType ?? '')})`,
						tipo: 'rolagem',
						canal: 'combat',
						detalhesRolagem: {
							...damage,
							modificador: damageModifier,
							label: `${attackName} · dano${isCritical ? ' crítico' : ''}`,
							regraAplicada: damage.regraAplicada,
							dadosOriginais: damage.dadosOriginais
						}
					}
				];
				sceneSocketPublishChat();
				$diceOverlay = {
					expression: `${sheet.name || 'Personagem'} · ${attackName} · dano${isCritical ? ' crítico' : ''}`,
					notation: damage.expressao,
					total: damage.total,
					dice: damage.dados,
					nonce: String(event.id)
				};
				if (isCritical) lastCriticalWeapon = null;
			}
			message =
				action === 'attack'
					? $appLocale === 'en'
						? 'Attack registered in chat.'
						: 'Ataque registrado no chat.'
					: $appLocale === 'en'
						? 'Damage registered in chat.'
						: 'Dano registrado no chat.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not roll the weapon.'
						: 'Não foi possível rolar a arma.';
		} finally {
			finishDiceBatch();
			rollingWeaponAction = null;
		}
	}
	const calculatedArmorClass = () =>
		calculateArmorClass(sheet.abilityScores, sheet.class, sheet.inventory);
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
	async function rollSheet(label: string, bonus: number, attackIndex: number) {
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
		lastCriticalAttack = critical ? attackIndex : null;
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
		sceneSocketPublishChat();
		$diceOverlay = {
			expression: `${sheet.name || 'Personagem'} · ${label}`,
			notation: attack.expressao,
			total: attack.total,
			dice: attack.dados,
			nonce: String(attackEvent.id)
		};
	}
	async function rollSheetDamage(label: string, damage: string, attackIndex: number) {
		const match = damage.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
		if (!match) return;
		const critical = lastCriticalAttack === attackIndex;
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
				detalhesRolagem: {
					...result,
					modificador: mod,
					label: `${label} · dano${critical ? ' crítico' : ''}`
				}
			}
		];
		sceneSocketPublishChat();
		$diceOverlay = {
			expression: `${sheet.name || 'Personagem'} · ${label} · dano${critical ? ' crítico' : ''}`,
			notation: result.expressao,
			total: result.total,
			dice: result.dados,
			nonce: String(damageEvent.id)
		};
		if (critical) lastCriticalAttack = null;
	}
	async function rollCustomAttack(attack: Sheet['attacks'][number], index: number) {
		if (rollingAttack !== null) return;
		rollingAttack = index;
		rollingAttackAction = 'attack';
		beginDiceBatch();
		try {
			const ability = attack.ability ?? 'strength';
			await rollSheet(
				attack.name || ($appLocale === 'en' ? 'Attack' : 'Ataque'),
				modifier(sheet.abilityScores[ability]) + attack.attackBonus,
				index
			);
		} catch {
			message =
				$appLocale === 'en' ? 'Could not roll the attack.' : 'Não foi possível rolar o ataque.';
		} finally {
			finishDiceBatch();
			rollingAttack = null;
			rollingAttackAction = null;
		}
	}
	async function rollCustomDamage(attack: Sheet['attacks'][number], index: number) {
		if (rollingAttack !== null || !attack.damage.trim()) return;
		rollingAttack = index;
		rollingAttackAction = 'damage';
		beginDiceBatch();
		try {
			await rollSheetDamage(
				attack.name || ($appLocale === 'en' ? 'Attack' : 'Ataque'),
				attack.damage,
				index
			);
		} catch {
			message =
				$appLocale === 'en' ? 'Could not roll the damage.' : 'Não foi possível rolar o dano.';
		} finally {
			finishDiceBatch();
			rollingAttack = null;
			rollingAttackAction = null;
		}
	}
	async function rollSpellDamage(spell: Sheet['spells'][number]) {
		const expression = spell.diceFormula?.trim();
		if (!expression) return;
		beginDiceBatch();
		try {
			const event = await rollDice(session, campaignId, expression, undefined, 'combat');
			const result = event.payload as {
				expressao: string;
				dados: number[];
				modificador?: number;
				total: number;
			};
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(event.id),
					autor: event.author,
					texto: `${spell.name} · ${result.expressao} = ${result.total}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						expressao: result.expressao,
						dados: result.dados,
						modificador: result.modificador ?? 0,
						total: result.total,
						label: `${spell.name} · efeito`
					}
				}
			];
			sceneSocketPublishChat();
			$diceOverlay = {
				expression: `${sheet.name || 'Personagem'} · ${spell.name}`,
				notation: result.expressao,
				total: result.total,
				dice: result.dados,
				nonce: String(event.id)
			};
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível rolar a magia.';
		} finally {
			finishDiceBatch();
		}
	}
	async function presentSpell(spell: Sheet['spells'][number]) {
		if (!isGM || !sceneId) return;
		try {
			const presentation = {
				assetPath: '',
				title: spellDisplayName(spell),
				description: spellDescription(spell) || spell.notes,
				visible: true,
				visibleUserIds: [],
				audienceRestricted: false,
				overlayVisible: false
			};
			await savePresentation(session, sceneId, presentation);
			presentationSocket?.publishPresentationUpdated({ presentation });
			message = 'Magia destacada para a mesa.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível destacar a magia.';
		}
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
			sceneSocketPublishChat();
			if (result.dados?.length) {
				$diceOverlay = {
					expression: `${sheet.name || 'Personagem'} · ${result.spellName} · ${result.expression ?? 'rolagem'}`,
					notation: result.expression,
					total: result.total ?? 0,
					dice: result.dados,
					nonce: String(result.eventId)
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
			{
				name: 'Novo ataque',
				attackType: 'melee',
				ability: 'strength',
				attackBonus: 0,
				damage: '',
				notes: ''
			}
		];
	}
	function setAttackType(attack: Sheet['attacks'][number], value: string) {
		attack.attackType = value === 'ranged' ? 'ranged' : 'melee';
		attack.ability = attack.attackType === 'ranged' ? 'dexterity' : 'strength';
		syncTokenSoon();
	}
	function addSpell() {
		const name = newSpellName.trim();
		if (!name || !addableSpellCircles().includes(newSpellLevel)) return;
		const normalizedName = (value: string) =>
			value
				.trim()
				.toLocaleLowerCase('pt-BR')
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '');
		if (sheet.spells.some((spell) => normalizedName(spell.name) === normalizedName(name))) return;
		const existingSpell = spellEntries(newSpellLevel).find(
			(entry) => normalizedName(optionLabel(entry)) === normalizedName(name)
		);
		if (existingSpell) {
			const rules = entryRules(existingSpell);
			const damage =
				rules.damage && typeof rules.damage === 'object'
					? (rules.damage as Record<string, unknown>)
					: {};
			sheet.spells = [
				...sheet.spells,
				{
					entryId: existingSpell.id,
					name: optionLabel(existingSpell),
					level: Number(rules.level ?? newSpellLevel),
					notes: `SRD · ${String(rules.school ?? '')}${rules.range ? ` · ${String(rules.range)}` : ''}`,
					description: String(rules.description ?? existingSpell.summary ?? ''),
					diceFormula: String(damage.dice ?? ''),
					higherLevels: String(rules.higherLevels ?? rules.atHigherLevels ?? '')
				}
			];
		} else {
			// Names not selected from the suggestions remain custom sheet spells.
			sheet.spells = [
				...sheet.spells,
				{
					name,
					level: newSpellLevel,
					notes: '',
					description: '',
					diceFormula: '',
					higherLevels: '',
					scalingDicePerLevel: 0
				}
			];
		}
		expandedSpell = sheet.spells.length - 1;
		newSpellName = '';
	}
	function removeAttack(index: number) {
		sheet.attacks = sheet.attacks.filter((_, i) => i !== index);
	}
	function removeSpell(index: number) {
		sheet.spells = sheet.spells.filter((_, i) => i !== index);
	}
	function updateSpell(index: number, changes: Partial<Sheet['spells'][number]>) {
		const spell = sheet.spells[index];
		if (!spell) return;
		sheet.spells = sheet.spells.map((item, itemIndex) =>
			itemIndex === index ? { ...item, ...changes } : item
		);
	}
	async function save() {
		if (saving) {
			saveQueued = true;
			return;
		}
		saving = true;
		message = '';
		const savedRevision = sheetEditRevision;
		try {
			// CA is derived from the authoritative sheet data; never persist a manual override.
			sheet.armorClass = calculatedArmorClass();
			const snapshot = JSON.parse(JSON.stringify(sheet)) as Sheet;
			const savedCharacter = characterId
				? await saveCharacterForGM(session, campaignId, characterId, snapshot)
				: await saveMyCharacter(session, campaignId, snapshot);
			resolvedCharacterId = savedCharacter.id;
			// A slow response must not erase edits made while that request was in flight.
			if (sheetEditRevision === savedRevision) sheet = savedCharacter.sheet;
			isNewCharacter = false;
			message = 'Ficha salva.';
			onTokenCreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível salvar a ficha.';
		} finally {
			saving = false;
			if (saveQueued || sheetEditRevision !== savedRevision) {
				saveQueued = false;
				if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
				tokenSyncTimer = setTimeout(() => void save(), 0);
			}
		}
	}
	function syncTokenSoon() {
		sheetEditRevision += 1;
		if (tokenSyncTimer) clearTimeout(tokenSyncTimer);
		tokenSyncTimer = setTimeout(() => {
			if (saving) saveQueued = true;
			else void save();
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
	class:standalone
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
				{#each sheetTabs() as [tab, label] (tab)}
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
						<label class="identity-name"
							>{$appLocale === 'en' ? 'Name' : 'Nome'}<input
								bind:value={sheet.name}
								maxlength="120"
								placeholder={$appLocale === 'en' ? 'Character name' : 'Nome do personagem'}
							/></label
						>
						<label class="identity-class"
							>{$appLocale === 'en' ? 'Class' : 'Classe'}<input
								bind:value={sheet.class}
								onchange={onClassChanged}
								list="class-options"
								placeholder={$appLocale === 'en' ? 'E.g. Fighter' : 'Ex.: Guerreiro'}
							/></label
						>
						{#if subclassOptions().length}<label class="identity-subclass"
								>{$appLocale === 'en' ? 'Subclass' : 'Subclasse'}<select
									bind:value={sheet.subclass}
									onchange={syncProgression}
									><option value=""
										>{$appLocale === 'en' ? 'Choose at level 3…' : 'Escolha no nível 3…'}</option
									>{#each subclassOptions() as subclass (subclass)}<option value={subclass}
											>{subclass}</option
										>{/each}</select
								></label
							>{/if}
						<label class="identity-level"
							>{$appLocale === 'en' ? 'Level' : 'Nível'}<input
								type="number"
								min="1"
								max="20"
								bind:value={sheet.level}
								onchange={onLevelChanged}
							/></label
						>
						<label class="identity-species"
							>{$appLocale === 'en' ? 'Species' : 'Espécie'}<input
								bind:value={sheet.species}
								onchange={onSpeciesChanged}
								list="species-options"
								placeholder={$appLocale === 'en' ? 'E.g. Human' : 'Ex.: Humano'}
							/></label
						>
						<label class="identity-background"
							>{$appLocale === 'en' ? 'Background' : 'Antecedente'}<input
								bind:value={sheet.background}
								list="background-options"
							/></label
						>
						{#if lineageOptions().length}
							<label class="identity-lineage"
								>{$appLocale === 'en' ? 'Lineage / legacy' : 'Linhagem / legado'}<select
									bind:value={sheet.speciesLineage}
									onchange={onLineageChanged}
									><option value=""
										>{$appLocale === 'en' ? 'Choose an option…' : 'Escolha uma opção…'}</option
									>{#each lineageOptions() as lineage (lineage)}<option value={lineage}
											>{lineage}</option
										>{/each}</select
								></label
							>
						{/if}
						<label class="identity-alignment"
							>{$appLocale === 'en' ? 'Alignment' : 'Alinhamento'}<input
								bind:value={sheet.alignment}
							/></label
						>
						<label class="identity-proficiency"
							>{$appLocale === 'en' ? 'Proficiency bonus' : 'Bônus de proficiência'}<input
								type="number"
								min="0"
								max="20"
								bind:value={sheet.proficiencyBonus}
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
					<section class="profile-combat-fields">
						<h3>{$appLocale === 'en' ? 'Combat profile' : 'Perfil de combate'}</h3>
						<label>
							{$appLocale === 'en' ? 'Speed' : 'Deslocamento'}<input
								type="number"
								min="0"
								value={displayedSpeed()}
								onchange={(event) => updateDisplayedSpeed(event.currentTarget.value)}
							/></label
						>
						<label class="hit-dice-label">
							<span
								>{$appLocale === 'en' ? 'Hit dice' : 'Dados de vida'}
								<small>{sheet.level - sheet.hitDiceSpent}/{sheet.level}</small></span
							><input bind:value={sheet.hitDice} />
						</label>
						<label
							>{$appLocale === 'en' ? 'Initiative bonus' : 'Bônus de iniciativa'}<input
								type="number"
								min="-20"
								max="20"
								bind:value={sheet.initiative}
								oninput={syncTokenSoon}
							/></label
						>
						<div class="initiative-actions">
							<button
								type="button"
								class="secondary-button initiative-roll"
								onclick={() => void rollSheetInitiative()}
								disabled={!initiativeTokenId}
							>
								{$appLocale === 'en' ? 'Roll initiative' : 'Rolar iniciativa'}
							</button>
							<label
								class="initiative-advantage-toggle"
								title={$appLocale === 'en'
									? 'Advantage on the next initiative roll'
									: 'Aplica vantagem à próxima rolagem de iniciativa'}
							>
								<input
									type="checkbox"
									class="switch-input"
									checked={sheet.initiativeAdvantage ?? false}
									onchange={(event) => void setInitiativeAdvantage(event.currentTarget.checked)}
								/>
								<span class="switch-track" aria-hidden="true"></span>
								{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}
							</label>
						</div>
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
							<div class="species-trait-list">
								{#each activeSpeciesTraits() as trait (trait)}<details class="species-trait">
										<summary>{distanceText(trait, $appLocale)}</summary>
										<p>{speciesTraitDescription(trait)}</p>
									</details>{/each}
							</div>
							<small
								>{$appLocale === 'en'
									? 'These traits are calculated from the selected species and lineage. HP, spells, and uses appear here for the table; complete current combat values and add the desired spells to the sheet.'
									: 'Estes traços são calculados pela espécie e linhagem selecionadas. Ajustes de PV, magias e usos são exibidos aqui para a mesa; preencha os valores atuais de combate e inclua as magias desejadas na ficha.'}</small
							>
						</section>
					{/if}
					<CharacterAbilityScores
						{sheet}
						{attributes}
						{abilityLabel}
						{modifier}
						onScoreChange={updateScore}
					/>
					<CharacterSavingThrows
						{sheet}
						{attributes}
						{abilityLabel}
						{saveBonus}
						{toggleSavingThrow}
						rollSave={(key, label) => rollAuthorized('save', key, label)}
						{hasAttackDisadvantage}
						bind:rollMode
					/>
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
										{#each [...Array(expertiseChoices()).keys()] as index (index)}<label
												>{$appLocale === 'en'
													? `Expertise ${index + 1}`
													: `Especialização ${index + 1}`}<select
													value={sheet.skillExpertise[index] ?? ''}
													onchange={(event) => setExpertiseChoice(index, event.currentTarget.value)}
													><option value=""
														>{$appLocale === 'en'
															? 'Choose a skill…'
															: 'Escolha uma perícia…'}</option
													>{#each skills as [name] (name)}<option value={name}>{name}</option
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
							<button disabled={saving} onclick={() => rest('short')}
								>{$appLocale === 'en' ? 'Short rest' : 'Descanso curto'}</button
							><button disabled={saving} onclick={() => rest('long')}
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
							/>
						</label>
					</section>
					{#if sheet.resources.length || grantedSpells().length}<section class="resources">
							<h3>{$appLocale === 'en' ? 'Resources' : 'Recursos'}</h3>
							{#each sheet.resources as resource, index (resource.id || index)}<div>
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
									><label class="resource-max"
										>{$appLocale === 'en' ? 'Max' : 'Máx.'}<input
											type="number"
											min="0"
											max="999"
											step="1"
											value={resource.max}
											onchange={(event) => setResourceMax(index, event.currentTarget.value)}
										/></label
									>
									{#if resource.maxOverride !== undefined}<button
											class="resource-auto"
											type="button"
											onclick={() => setResourceMax(index, '')}
											>{$appLocale === 'en' ? 'Auto' : 'Auto'}</button
										>{/if}
								</div>{/each}
							{#if grantedSpells().length}<div class="granted-spells">
									<h4>
										{$appLocale === 'en' ? 'Species and feat spells' : 'Magias de raça e talentos'}
									</h4>
									{#each grantedSpells() as spell, index (spell.entryId ?? `${spell.name}-${index}`)}<div
										>
											<strong>{spellDisplayName(spell)}</strong><span
												>{circleLabel(spell.level)} · {spellOrigin(spell) === 'species'
													? $appLocale === 'en'
														? 'Species'
														: 'Raça'
													: $appLocale === 'en'
														? 'Feat'
														: 'Talento'}</span
											>
										</div>{/each}
								</div>{/if}
						</section>{/if}
					<CharacterWeaponAttacks
						items={weaponItems()}
						{attributes}
						{rollingWeaponAction}
						{weaponKey}
						{weaponAbility}
						{abilityLabel}
						abilityModifier={(key) => modifier(sheet.abilityScores[key])}
						{modifierText}
						proficiencyStatus={weaponProficiencyStatus}
						proficiencyBonus={weaponProficiencyBonus}
						attackBonusTotal={weaponAttackBonusTotal}
						damageBonusTotal={weaponDamageBonusTotal}
						{weaponEffects}
						weaponProfiles={weaponAttackProfiles}
						{hasGreatWeaponFighting}
						{weaponSupportsGreatWeaponFighting}
						onWeaponChange={updateWeaponRules}
						onToggleEffect={toggleWeaponEffect}
						onAddProfile={addWeaponAttackProfile}
						onRemoveProfile={removeWeaponAttackProfile}
						onProfileChange={updateWeaponProfile}
						onRoll={(item, action, profile) => void rollWeapon(item, action, profile)}
					/>
					<section class="combat-equipment">
						{#if sheet.inventory.some((item) => equipmentCategory(item) === 'armor')}<div
								class="combat-armor-list"
							>
								<h4>{$appLocale === 'en' ? 'Armor' : 'Armaduras'}</h4>
								{#each sheet.inventory.filter((item) => equipmentCategory(item) === 'armor') as item (item.entryId)}<label
										><input type="checkbox" bind:checked={item.equipped} /><span
											>{$appLocale === 'en' ? 'Equipped' : 'Equipado'} · {item.name}</span
										></label
									>{/each}
							</div>{/if}
					</section>
					<section class="combat-attacks">
						<div class="section-title">
							<h3>{$appLocale === 'en' ? 'Other attacks' : 'Outros ataques'}</h3>
							<button onclick={addAttack}>+ {$appLocale === 'en' ? 'Attack' : 'Ataque'}</button>
						</div>
						{#each sheet.attacks as attack, index (index)}<div class="line-item attack-row">
								<label
									class="token-roll-toggle"
									title={$appLocale === 'en' ? 'Show on token' : 'Exibir no token'}
									><input
										type="checkbox"
										checked={(sheet.visibleRolls ?? []).includes(`attack:${index}`)}
										onchange={() => toggleVisibleRoll(`attack:${index}`)}
									/>⌁</label
								><input
									class="attack-name"
									bind:value={attack.name}
									placeholder="Nome do ataque"
								/><select
									class="attack-type"
									aria-label={$appLocale === 'en' ? 'Attack range' : 'Tipo de ataque'}
									value={attack.attackType ?? 'melee'}
									onchange={(event) => setAttackType(attack, event.currentTarget.value)}
									><option value="melee">{$appLocale === 'en' ? 'Melee' : 'Corpo a corpo'}</option
									><option value="ranged">{$appLocale === 'en' ? 'Ranged' : 'À distância'}</option
									></select
								><select
									class="attack-ability"
									aria-label={$appLocale === 'en' ? 'Attack ability' : 'Atributo do ataque'}
									value={attack.ability ?? 'strength'}
									onchange={(event) => {
										attack.ability = event.currentTarget.value as keyof Sheet['abilityScores'];
										syncTokenSoon();
									}}
									>{#each attributes as attribute (attribute.key)}<option value={attribute.key}
											>{abilityLabel(attribute.key)} ({modifier(
												sheet.abilityScores[attribute.key]
											) >= 0
												? '+'
												: ''}{modifier(sheet.abilityScores[attribute.key])})</option
										>{/each}</select
								><input
									class="attack-bonus"
									type="number"
									bind:value={attack.attackBonus}
									aria-label={$appLocale === 'en'
										? 'Additional attack bonus'
										: 'Bônus adicional de ataque'}
								/><input
									class="attack-damage"
									bind:value={attack.damage}
									placeholder="Dano"
								/><button
									class="roll-custom"
									onclick={() => void rollCustomAttack(attack, index)}
									disabled={rollingAttack !== null}
									>{rollingAttack === index && rollingAttackAction === 'attack'
										? '…'
										: $appLocale === 'en'
											? '🎲 Attack'
											: '🎲 Ataque'}</button
								><button
									class="roll-custom"
									onclick={() => void rollCustomDamage(attack, index)}
									disabled={rollingAttack !== null || !attack.damage.trim()}
									>{rollingAttack === index && rollingAttackAction === 'damage'
										? '…'
										: $appLocale === 'en'
											? '🎲 Damage'
											: '🎲 Dano'}</button
								><button onclick={() => removeAttack(index)}>×</button>
							</div>{/each}
					</section>
				{/if}
				{#if activeTab === 'skills'}
					<CharacterSkillsTab
						{sheet}
						{skills}
						{isNewCharacter}
						{hasAttackDisadvantage}
						{skillLabel}
						{skillBonus}
						{toggleSkill}
						{rollSkill}
						bind:rollMode
					/>
				{/if}
				{#if activeTab === 'inventory'}
					<CharacterInventoryTab
						itemEntries={itemEntries()}
						visibleItems={visibleInventory()}
						totalWeight={totalInventoryWeight()}
						bind:inventoryFilter
						{optionLabel}
						onAddCompendiumItem={addInventoryItem}
						onAddCustomItem={addCustomInventoryItem}
						onRemoveItem={removeInventoryItem}
						onChangeQuantity={(index, quantity) => {
							if (sheet.inventory[index]) sheet.inventory[index].quantity = quantity;
						}}
						onChangeDescription={(index, description) => {
							const item = sheet.inventory[index];
							if (!item) return;
							item.rules.playerDescription = description;
							syncTokenSoon();
						}}
					/>
				{/if}
				{#if activeTab === 'spells' && shouldShowSpellcasting()}
					<CharacterSpellsTab
						{newSpellName}
						{newSpellLevel}
						{expandedSpell}
						{isGM}
						{castingSpell}
						{addableSpellCircles}
						{availableSpellCircles}
						{spellSlotForCircle}
						{spellsForCircle}
						{spellEntries}
						{optionLabel}
						{circleLabel}
						{spellDisplayName}
						{spellDescription}
						{spellHigherLevels}
						{spellHasAITranslation}
						{compatibleSlots}
						{selectedSlot}
						onNewSpellNameChange={(value) => (newSpellName = value)}
						onNewSpellLevelChange={(value) => (newSpellLevel = value)}
						onExpandedSpellChange={(value) => (expandedSpell = value)}
						onSpellSlotChoiceChange={(index, value) => (spellSlotChoice[index] = value)}
						onAddSpell={addSpell}
						onRemoveSpell={removeSpell}
						onSpellChange={updateSpell}
						onPresentSpell={(spell) => void presentSpell(spell)}
						onRollSpellDamage={(spell) => void rollSpellDamage(spell)}
						onCastSpell={(spell, index) => void castSpell(spell, index)}
					/>
				{/if}
				{#if activeTab === 'details'}
					<CharacterDetailsTab
						{sheet}
						feats={featList()}
						featEntries={optionsFor('feat')}
						{optionLabel}
						onFeatsChange={(feats) => (sheet.feats = feats)}
						onSpellcastingOverride={(enabled) => (sheet.spellcastingOverride = enabled)}
						onFeaturesChange={(features) => (sheet.features = features)}
						onEquipmentChange={(equipment) => (sheet.equipment = equipment)}
					/>
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
		inset: 0 0 4.8rem;
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
		bottom: 4.8rem;
		left: 1rem;
		width: min(780px, calc(100vw - 2rem));
		min-width: min(640px, calc(100vw - 2rem));
		max-width: calc(100vw - 1rem);
		min-height: 320px;
		max-height: calc(100dvh - 10.6rem);
		resize: both;
		overflow: auto;
		pointer-events: auto;
		box-shadow: 0 18px 48px #000a;
	}
	.sheet-backdrop.standalone {
		inset: 0;
		padding: 0;
		background: #100d10;
		backdrop-filter: none;
	}
	.sheet-backdrop.standalone .sheet {
		width: 100vw;
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-radius: 0;
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
		max-height: min(calc(100dvh - 6rem), 900px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--mm-border-strong, #765d3d);
		border-radius: var(--mm-radius-dialog, 14px);
		color: #eee4d6;
		background: #1b171a;
		box-shadow: var(--mm-shadow-dialog, 0 30px 90px #000);
	}
	.sheet > header,
	.sheet > footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	.sheet > footer {
		position: relative;
		justify-content: flex-end;
		gap: 0.5rem;
		border-top: 1px solid #403536;
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
		align-content: start;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		overflow: auto;
		padding: 1.25rem;
		container-type: inline-size;
	}
	.sheet-body > section,
	.sheet-body > aside {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
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
	.sheet-tabs button {
		flex: 0 0 auto;
		border: 1px solid #4f433d;
		border-radius: 999px;
		padding: 0.42rem 0.65rem;
		color: #bcae9f;
		background: #171316;
		font-size: 0.72rem;
	}
	.sheet-tabs button.active {
		border-color: #c89655;
		color: #f2d49a;
		background: #38281f;
	}
	.identity,
	.combat,
	.profile-combat-fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.identity {
		grid-template-areas:
			'name class subclass level'
			'species background alignment proficiency'
			'lineage lineage lineage lineage';
	}
	.identity-name {
		grid-area: name;
	}
	.identity-class {
		grid-area: class;
	}
	.identity-subclass {
		grid-area: subclass;
	}
	.identity-level {
		grid-area: level;
	}
	.identity-species {
		grid-area: species;
	}
	.identity-background {
		grid-area: background;
	}
	.identity-alignment {
		grid-area: alignment;
	}
	.identity-proficiency {
		grid-area: proficiency;
	}
	.identity-lineage {
		grid-area: lineage;
	}
	.profile-combat-fields h3 {
		grid-column: 1 / -1;
		margin: 0;
	}
	.initiative-actions {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hit-dice-label > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.hit-dice-label small {
		color: #d8ad67;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.initiative-roll {
		border: 1px solid #8c6d43;
		border-radius: 7px;
		padding: 0.45rem 0.7rem;
		color: #f5e4c0;
		background: linear-gradient(180deg, #423126, #2b211c);
		font-family: inherit;
		font-size: 0.75rem;
		font-weight: 650;
		min-height: 2.35rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.initiative-roll:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #493020;
	}
	.initiative-roll:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.initiative-advantage-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.initiative-advantage-toggle .switch-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.switch-track {
		position: relative;
		flex: 0 0 auto;
		width: 2.25rem;
		height: 1.25rem;
		border: 1px solid #80603b;
		border-radius: 999px;
		background: #30282a;
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}
	.switch-track::after {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 50%;
		background: #c6b8ac;
		content: '';
		transition:
			transform 140ms ease,
			background 140ms ease;
	}
	.switch-input:checked + .switch-track {
		border-color: #c89655;
		background: #684829;
	}
	.switch-input:checked + .switch-track::after {
		transform: translateX(1rem);
		background: #ffe0a5;
	}
	.switch-input:focus-visible + .switch-track {
		outline: 2px solid #f2d49a;
		outline-offset: 2px;
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
		grid-template-columns: minmax(0, 1fr) auto auto auto auto;
		align-items: center;
		gap: 0.5rem;
		border-top: 1px solid #393034;
		padding-top: 0.45rem;
	}
	.resources span {
		color: #a99c91;
		font-size: 0.7rem;
	}
	.resource-max {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.68rem;
	}
	.resource-max input {
		width: 3.3rem;
		min-width: 0;
		border: 1px solid #594a42;
		border-radius: 5px;
		padding: 0.3rem;
		color: #f0d29d;
		background: #211b1b;
	}
	.resources .resource-auto {
		padding-inline: 0.4rem;
	}
	@media (max-width: 520px) {
		.resources > div {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}
		.resources > div > strong {
			grid-column: 1 / -1;
		}
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
	select {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
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
	.species-trait-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
		gap: 0.45rem;
	}
	.species-trait {
		border: 1px solid rgba(124, 161, 189, 0.35);
		border-radius: 7px;
		color: #d5e4ed;
		font-size: 0.7rem;
	}
	.species-trait summary {
		padding: 0.45rem 0.55rem;
		cursor: pointer;
	}
	.species-trait[open] summary {
		color: #f1d59e;
	}
	.species-trait p {
		margin: 0;
		padding: 0 0.55rem 0.55rem;
		color: #b9c8d3;
		font-size: 0.68rem;
		line-height: 1.5;
	}
	h3 {
		margin-bottom: 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
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
	.granted-spells {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		padding-top: 0.65rem;
		border-top: 1px solid #493c39;
	}
	.granted-spells h4 {
		margin: 0;
		color: #e8c786;
	}
	.granted-spells > div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.granted-spells span {
		color: #bcae9f;
		font-size: 0.76rem;
	}
	.combat-armor-list {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0.9rem;
		margin-top: 0.65rem;
		border-top: 1px solid #403536;
		padding-top: 0.65rem;
	}
	.combat-armor-list h4 {
		width: 100%;
		margin: 0;
		color: #d9c4a3;
		font-size: 0.78rem;
	}
	.combat-armor-list label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #d5c7b9;
		font-size: 0.75rem;
	}
	.line-item {
		display: grid;
		grid-template-columns: 1fr 80px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.45rem;
	}
	.line-item.attack-row {
		grid-template-columns:
			28px minmax(110px, 2fr) minmax(80px, 0.8fr) minmax(90px, 0.9fr) 60px
			minmax(80px, 1.1fr) auto auto 32px;
		align-items: center;
	}
	.attack-row > input,
	.attack-row > select {
		width: 100%;
		min-width: 0;
	}
	.attack-row .attack-bonus {
		text-align: center;
	}
	footer {
		border-top: 1px solid #403536;
		border-bottom: 0;
		min-height: 64px;
	}
	footer span {
		position: absolute;
		left: 50%;
		max-width: 42%;
		transform: translateX(-50%);
		text-align: center;
		pointer-events: none;
		color: #ffb2aa;
		font-size: 0.8rem;
	}
	footer span.success {
		color: #a9d8a3;
	}
	.save {
		flex: 0 0 auto;
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
		margin-left: 0;
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
			inset-block-end: 6.8rem;
			padding: 0;
		}
		.sheet {
			width: 100%;
			max-height: calc(100dvh - 6.8rem);
			height: calc(100dvh - 6.8rem);
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
			gap: 0.4rem;
			background: #1b171a;
		}
		footer span {
			max-width: 36%;
			font-size: 0.68rem;
		}
		.identity,
		.combat,
		.profile-combat-fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.identity {
			grid-template-areas:
				'name name'
				'class subclass'
				'level level'
				'species background'
				'alignment proficiency'
				'lineage lineage';
		}
		.expertise-choices > div {
			grid-template-columns: 1fr;
		}
		.initiative-actions {
			grid-column: 1 / -1;
			align-items: center;
		}
		.initiative-roll {
			width: auto;
		}
		.line-item.attack-row {
			grid-template-columns: 28px minmax(0, 1fr) 64px;
			gap: 0.35rem;
		}
		.attack-row .token-roll-toggle {
			grid-area: 1 / 1;
		}
		.attack-row .attack-name {
			grid-area: 1 / 2 / 2 / 3;
		}
		.attack-row > button:last-child {
			grid-area: 1 / 3;
		}
		.attack-row .attack-type {
			grid-area: 2 / 1 / 3 / 3;
		}
		.attack-row .attack-ability {
			grid-area: 3 / 1 / 4 / 3;
		}
		.attack-row .attack-bonus {
			grid-area: 3 / 3;
		}
		.attack-row .attack-damage {
			grid-area: 4 / 1 / 5 / 4;
		}
		.attack-row .roll-custom {
			grid-column: 1 / -1;
		}
		.species-traits > div {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
	}
	@media (max-width: 700px) {
		.sheet-backdrop.docked .sheet {
			bottom: 6.8rem;
			height: auto;
			max-height: calc(100dvh - 12.6rem);
		}
	}
</style>
