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
	import { getSupabaseClient } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { savePresentation } from '$lib/services/presentationApi';
	import { connectSceneSocket } from '$lib/services/sceneRealtime';
	import { appLocale } from '$lib/stores/locale';
	import { calculateArmorClass } from '$lib/utils/armorClass';
	import {
		availableSpellCircles as projectAvailableSpellCircles,
		addSpellToSheet,
		addableSpellCircles as projectAddableSpellCircles,
		compatibleSpellSlots,
		defaultSpellSlot,
		deriveGrantedSpells,
		eligibleSpellEntries,
		groupSpellsByCircle,
		hasAISpellTranslation,
		localizedSpellField,
		normalizeSpellName,
		removeSpellFromSheet,
		resolveSpellOrigin,
		updateSpellOnSheet
	} from '$lib/utils/character/characterSpellRules';
	import {
		deriveCharacterFeatures,
		defaultResourceMaximumFor,
		expertiseChoicesForLevel,
		hitDieForClass,
		hitDieSidesFromNotation,
		levelHitPointGain,
		proficiencyBonusForLevel,
		resolveCharacterClass as canonicalClass,
		savingThrowsForClass,
		spellcastingEnabled,
		spellSlotsForProgression,
		subclassesForClass,
		synchronizeProgressionResources,
		synchronizeSpellSlots
	} from '$lib/utils/character/characterProgressionRules';
	import {
		cloneInventoryRules,
		filterItemEntries,
		projectInventory,
		totalInventoryWeight
	} from '$lib/utils/inventoryRules';
	import {
		addWeaponProfile,
		deriveWeaponEffects,
		removeWeaponProfile,
		selectedWeaponEffects,
		toggleWeaponEffect as toggleWeaponEffectRule,
		updateWeaponProfile as updateWeaponProfileRule,
		weaponAttackBonusTotal as calculateWeaponAttackBonus,
		weaponAttackProfiles,
		weaponDamageBonusTotal as calculateWeaponDamageBonus,
		weaponProficiencyStatus as resolveWeaponProficiency,
		weaponSupportsGreatWeaponFighting,
		weaponBonusTotals as sumWeaponBonusTotals,
		updateInventoryItemRules,
		type WeaponAttackProfile,
		type WeaponEffect,
		type WeaponFeat
	} from '$lib/utils/weaponRules';
	import {
		getActiveSpeciesTraits,
		getSpeciesHPBonus,
		getSpeciesProfile,
		getSpeciesResistances,
		getSpeciesSpeed,
		normalizeSpeciesLineage
	} from '$lib/utils/speciesRules';
	import CharacterSkillsTab from '$lib/components/character/CharacterSkillsTab.svelte';
	import CharacterDetailsTab from '$lib/components/character/CharacterDetailsTab.svelte';
	import CharacterIdentityTab from '$lib/components/character/CharacterIdentityTab.svelte';
	import CharacterInventoryTab from '$lib/components/character/CharacterInventoryTab.svelte';
	import CharacterSpellsTab from '$lib/components/character/CharacterSpellsTab.svelte';
	import type { CustomInventoryItemDraft } from '$lib/components/character/inventoryTypes';
	import CharacterCombatTab from '$lib/components/character/CharacterCombatTab.svelte';
	import CharacterLevelUpModal from '$lib/components/character/CharacterLevelUpModal.svelte';
	import { createCharacterSheetLifecycle } from '$lib/components/character/characterSheetLifecycle.svelte.js';
	import { createCharacterPortraitWorkflow } from '$lib/components/character/characterPortraitWorkflow.svelte.js';
	import type { LevelUpHPChoice } from '$lib/components/character/levelUpChoiceActions';
	import { gerarImagemToken } from '$lib/services/tokenImageApi';
	import {
		equipmentCategory,
		modifierText,
		weaponAbility,
		weaponItemBonus,
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
	let minimized = $state(false);
	let previousLevel = $state(1);
	let levelChoiceOpen = $state(false);
	let portraitPrompt = $state('');
	let expandedFeature = $state<string | null>(null);
	const hasAttackDisadvantage = () =>
		lifecycle.state.activeConditions.some((condition) =>
			['Cego', 'Envenenado', 'Impedido'].includes(condition)
		);
	const selectedAttackMode = () => (hasAttackDisadvantage() ? 'disadvantage' : rollMode);
	$effect(() => {
		if (hasAttackDisadvantage() && rollMode === 'advantage') rollMode = 'normal';
	});
	$effect(() => {
		if (!shouldShowSpellcasting() && activeTab === 'spells') activeTab = 'profile';
	});
	$effect(() => {
		const circles = projectAddableSpellCircles(sheet.spellSlots);
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
	function onSpeciesChanged() {
		const profile = getSpeciesProfile(sheet.species);
		sheet.speciesLineage = normalizeSpeciesLineage(sheet.species, sheet.speciesLineage);
		if (profile) sheet.speed = getSpeciesSpeed(sheet.species, sheet.speciesLineage, sheet.speed);
		syncProgression();
		syncTokenSoon();
	}
	function onLineageChanged() {
		sheet.speciesLineage = normalizeSpeciesLineage(sheet.species, sheet.speciesLineage);
		sheet.speed = getSpeciesSpeed(sheet.species, sheet.speciesLineage, sheet.speed);
		syncProgression();
		syncTokenSoon();
	}

	let refreshPortraitPreview = () => Promise.resolve();
	const lifecycle = createCharacterSheetLifecycle({
		campaignId,
		sceneId,
		characterId,
		isGM,
		session,
		getSheet: () => sheet,
		setSheet: (next) => (sheet = next),
		calculateArmorClass: () => calculatedArmorClass(),
		getCompendium,
		onCompendiumLoaded: (sources, entries) => {
			compendiumSources = sources;
			compendiumEntries = entries;
			syncProgression();
		},
		getCharacterForGM,
		getMyCharacter,
		onCharacterLoaded: (loadedCharacter) => {
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
		},
		loadScene,
		listSceneEffects,
		setDiceColor,
		connectPresentationSocket: (onAdvantageUpdated) =>
			connectSceneSocket(
				session,
				sceneId,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				onAdvantageUpdated
			),
		saveCharacterForGM,
		saveMyCharacter,
		createTokenFromCharacter,
		onTokenCreated,
		refreshPortraitPreview: () => refreshPortraitPreview(),
		onInitiativeAdvantageUpdated: (enabled) => (sheet.initiativeAdvantage = enabled)
	});
	const portraitWorkflow = createCharacterPortraitWorkflow({
		campaignId,
		session,
		getPortraitPath: () => sheet.portraitPath,
		setPortraitPaths: (portraitPath, tokenPortraitPath) => {
			sheet.portraitPath = portraitPath;
			sheet.tokenPortraitPath = tokenPortraitPath;
		},
		setMessage: (next) => (lifecycle.state.message = next),
		getSupabaseClient,
		optimizeImage,
		createThumbnail,
		getSignedAssetUrl,
		generateImage: gerarImagemToken,
		fetchGeneratedBlob: async (dataUrl) => (await fetch(dataUrl)).blob(),
		createId: () => crypto.randomUUID()
	});
	refreshPortraitPreview = () => portraitWorkflow.refreshPreview();
	const sceneSocketPublishChat = () => lifecycle.publishChatUpdated();
	const syncTokenSoon = () => lifecycle.syncTokenSoon();
	const save = () => lifecycle.save();
	const createBoardToken = () => lifecycle.createBoardToken();
	const uploadPortrait = (event: Event) => portraitWorkflow.uploadPortrait(event);
	const generatePortrait = () => portraitWorkflow.generatePortrait(portraitPrompt);
	const loading = $derived(lifecycle.state.loading);
	const saving = $derived(lifecycle.state.saving);
	const message = $derived(lifecycle.state.message);
	const isNewCharacter = $derived(lifecycle.state.isNewCharacter);
	const activeConditions = $derived(lifecycle.state.activeConditions);
	const initiativeTokenId = $derived(lifecycle.state.initiativeTokenId);
	onMount(() => {
		lifecycle.start();
		return lifecycle.cleanup;
	});
	async function setInitiativeAdvantage(enabled: boolean) {
		const characterId = lifecycle.state.resolvedCharacterId;
		if (!characterId) {
			lifecycle.state.message = 'Salve a ficha antes de configurar a vantagem de iniciativa.';
			return;
		}
		try {
			const result = await setCharacterInitiativeAdvantage(
				session,
				campaignId,
				characterId,
				enabled
			);
			sheet.initiativeAdvantage = result.enabled;
			lifecycle.state.message = enabled
				? 'Vantagem preparada para a próxima iniciativa.'
				: 'Vantagem desativada.';
		} catch (error) {
			lifecycle.state.message =
				error instanceof Error
					? error.message
					: 'Não foi possível alterar a vantagem da iniciativa.';
		}
	}
	async function rollSheetInitiative() {
		const initiativeTokenId = lifecycle.state.initiativeTokenId;
		if (!initiativeTokenId || !sceneId) {
			lifecycle.state.message = 'Esta ficha ainda não está vinculada a um token na cena.';
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
			lifecycle.publishCombatUpdated();
			lifecycle.state.message = `${label}: ${result.roll} ${result.bonus >= 0 ? '+' : '−'} ${Math.abs(result.bonus)} = ${result.initiative}`;
		} catch (error) {
			lifecycle.state.message =
				error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.';
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
	const itemEntries = () => filterItemEntries(compendiumEntries, inventoryFilter);
	const weaponKey = (item: InventoryItem) => `${item.entryId}:${sheet.inventory.indexOf(item)}`;
	const visibleInventory = () => projectInventory(sheet.inventory, inventoryFilter);
	const inventoryWeight = () => totalInventoryWeight(sheet.inventory);
	const weaponProficiencyStatus = (item: InventoryItem) => {
		const rules = compendiumClass()?.rules ?? {};
		const baseProficiencies = Array.isArray(rules.weaponProficiencies)
			? rules.weaponProficiencies.map(String)
			: [];
		const subclass = compendiumEntries.find(
			(entry) =>
				entry.entryType === 'subclass' &&
				(entry.name === sheet.subclass || optionLabel(entry) === sheet.subclass)
		);
		const subclassProficiencies = Array.isArray(subclass?.rules.weaponProficiencies)
			? subclass.rules.weaponProficiencies.map(String)
			: [];
		return resolveWeaponProficiency(
			item,
			baseProficiencies,
			subclassProficiencies,
			subclass?.rules
		);
	};
	const weaponProficiencyBonus = (item: InventoryItem) =>
		weaponProficiencyStatus(item) ? sheet.proficiencyBonus : 0;
	const featList = () =>
		sheet.feats
			.split(/\n|,/)
			.map((feat) => feat.trim())
			.filter(Boolean);
	const weaponEffects = (item: InventoryItem): WeaponEffect[] => {
		const features = derivedFeatures().map((feature) => ({
			id: feature.id,
			name: feature.name,
			description: feature.description
		}));
		const feats: WeaponFeat[] = featList().flatMap((feat) => {
			const entry = optionsFor('feat').find(
				(candidate) =>
					candidate.name.toLowerCase() === feat.toLowerCase() ||
					optionLabel(candidate).toLowerCase() === feat.toLowerCase()
			);
			return entry ? [{ id: entry.id, name: optionLabel(entry), rules: entry.rules ?? {} }] : [];
		});
		return deriveWeaponEffects(item, features, feats, sheet.inventory);
	};
	const selectedEffectsForWeapon = (item: InventoryItem) =>
		selectedWeaponEffects(item, weaponEffects(item));
	function toggleWeaponEffect(item: InventoryItem, key: string) {
		const updated = toggleWeaponEffectRule(item, key);
		updateWeaponRules(item, { enabledCombatModifiers: updated.rules.enabledCombatModifiers });
	}
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
		updateWeaponRules(item, {
			attackProfiles: addWeaponProfile(item, profile).rules.attackProfiles
		});
		syncTokenSoon();
	}
	function removeWeaponAttackProfile(item: InventoryItem, profileId: string) {
		const updated = removeWeaponProfile(item, profileId);
		updateWeaponRules(item, { attackProfiles: updated.rules.attackProfiles });
		syncTokenSoon();
	}
	const hasGreatWeaponFighting = () =>
		/Great Weapon Fighting|Luta com Armas Grandes/i.test(`${sheet.feats}\n${sheet.features}`);
	const weaponBonusTotals = (item: InventoryItem) => {
		return sumWeaponBonusTotals(selectedEffectsForWeapon(item));
	};
	const weaponAttackBonusTotal = (item: InventoryItem) =>
		calculateWeaponAttackBonus(
			item,
			sheet.abilityScores,
			weaponProficiencyBonus(item),
			selectedEffectsForWeapon(item)
		);
	const weaponDamageBonusTotal = (item: InventoryItem) =>
		calculateWeaponDamageBonus(item, sheet.abilityScores, selectedEffectsForWeapon(item));
	function updateWeaponRules(
		item: InventoryItem,
		changes: Record<string, unknown>,
		autosave = false
	) {
		const index = sheet.inventory.indexOf(item);
		if (index < 0) return;
		sheet.inventory = updateInventoryItemRules(sheet.inventory, item, changes);
		if (autosave) syncTokenSoon();
	}
	function updateWeaponProfile(
		item: InventoryItem,
		profileId: string,
		changes: Partial<WeaponAttackProfile>
	) {
		const updated = updateWeaponProfileRule(item, profileId, changes);
		updateWeaponRules(item, { attackProfiles: updated.rules.attackProfiles }, true);
	}
	const normalizedClassName = (value: string) =>
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim();
	function onClassChanged() {
		sheet.hitDice = hitDieForClass(sheet.class, sheet.hitDice);
		if (!subclassOptions().includes(sheet.subclass)) sheet.subclass = '';
		syncProgression();
	}
	const compendiumClass = () =>
		compendiumEntries.find(
			(entry) =>
				entry.entryType === 'class' &&
				(String(entry.rules.id ?? '') === canonicalClass(sheet.class) ||
					entry.name.toLowerCase() === sheet.class.toLowerCase())
		);
	const shouldShowSpellcasting = () => {
		return spellcastingEnabled(
			sheet.class,
			sheet.level,
			compendiumClass()?.rules.spellcasting,
			sheet.spellcastingOverride
		);
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
									canonicalClass(String(value)) === canonicalClass(sheet.class) ||
									normalizedClassName(String(value)) === normalizedClassName(sheet.class)
							))
			)
			.map((entry) => entry.name);
	const subclassOptions = () =>
		compendiumSubclassOptions().length
			? compendiumSubclassOptions()
			: subclassesForClass(sheet.class);
	const derivedFeatures = () => {
		const subclassEntry = compendiumEntries.find(
			(entry) =>
				entry.entryType === 'subclass' &&
				(entry.name === sheet.subclass || optionLabel(entry) === sheet.subclass)
		);
		return deriveCharacterFeatures(
			compendiumClass(),
			subclassEntry,
			compendiumEntries,
			sheet.class,
			sheet.level,
			sheet.subclass
		);
	};
	const spellCompendiumEntry = (spell: Sheet['spells'][number]) =>
		spell.entryId ? compendiumEntries.find((entry) => entry.id === spell.entryId) : undefined;
	const spellDisplayName = (spell: Sheet['spells'][number]) => {
		const entry = spellCompendiumEntry(spell);
		return entry ? optionLabel(entry) : spell.name;
	};
	const localizedSpellText = (spell: Sheet['spells'][number], field: string, fallback: string) => {
		return localizedSpellField(spell, spellCompendiumEntry(spell), field, fallback, $appLocale);
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
		return hasAISpellTranslation(spellCompendiumEntry(spell));
	};
	function syncProgression() {
		// Proficiência é determinada exclusivamente pelo nível (SRD 5.2.1).
		// Mantê-la derivada evita bônus antigos quando uma ficha é atualizada.
		sheet.proficiencyBonus = proficiencyBonusForLevel(sheet.level);
		sheet.speed = getSpeciesSpeed(sheet.species, sheet.speciesLineage, sheet.speed);
		if (!sheet.savingThrows.length) sheet.savingThrows = savingThrowsForClass(sheet.class);
		const desiredHPBonus = getSpeciesHPBonus(sheet.species, sheet.level);
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
		sheet.resistances = getSpeciesResistances(sheet.species, sheet.speciesLineage);
		sheet.automaticTraits = getActiveSpeciesTraits(sheet.species, sheet.speciesLineage);
		sheet.hitDice = hitDieForClass(sheet.class, sheet.hitDice);
		if (!Number.isFinite(sheet.initiative))
			sheet.initiative = modifier(sheet.abilityScores.dexterity);
		if (sheet.level === 1 && sheet.hitPointsMax === 10) {
			const die = Number(sheet.hitDice.match(/d(\d+)/i)?.[1] ?? 8);
			const hp = Math.max(1, die + modifier(sheet.abilityScores.constitution));
			sheet.hitPointsMax = hp;
			sheet.hitPointsCurrent = hp;
		}
		sheet.resources = synchronizeProgressionResources(
			sheet.class,
			sheet.level,
			sheet.abilityScores,
			sheet.resources
		);
		sheet.spellSlots = synchronizeSpellSlots(
			spellSlotsForProgression(sheet.class, sheet.level),
			sheet.spellSlots
		);
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
		return expertiseChoicesForLevel(sheet.class, sheet.level);
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
			lifecycle.state.message =
				error instanceof Error ? error.message : `Não foi possível rolar ${fallbackLabel}.`;
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
	async function resolveLevelHP(choice: LevelUpHPChoice) {
		const gained = Math.max(0, sheet.level - previousLevel);
		const hitDie = hitDieSidesFromNotation(sheet.hitDice);
		const rolledTotals: number[] = [];
		if (choice === 'roll') {
			for (let i = 0; i < gained; i++) {
				const event = await rollDice(
					session,
					campaignId,
					`1d${hitDie}${modifier(sheet.abilityScores.constitution) >= 0 ? '+' : ''}${modifier(sheet.abilityScores.constitution)}`
				);
				rolledTotals.push((event.payload as { total: number }).total);
			}
		}
		const gainedHP = levelHitPointGain(
			choice,
			gained,
			hitDie,
			modifier(sheet.abilityScores.constitution),
			rolledTotals
		);
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
			defaultResourceMaximumFor(sheet.class, sheet.level, sheet.abilityScores, resource.id) ??
			resource.max;
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
		const savedRevision = lifecycle.beginExternalSaving();
		if (savedRevision === null) return;
		try {
			const result = await restCharacter(session, campaignId, kind, characterId);
			if (lifecycle.isRevisionCurrent(savedRevision)) {
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
			lifecycle.state.message =
				kind === 'long'
					? 'Descanso longo aplicado: PV, recursos e espaços restaurados.'
					: 'Descanso curto aplicado: dado de vida e recursos recuperados.';
			onTokenCreated();
		} catch (error) {
			lifecycle.state.message =
				error instanceof Error ? error.message : 'Não foi possível aplicar o descanso.';
		} finally {
			lifecycle.finishExternalSaving(savedRevision);
		}
	}
	const spellEntries = (circle?: number) =>
		eligibleSpellEntries(compendiumEntries, sheet.spells, optionLabel, sheet.class, circle);
	const availableSpellCircles = () => projectAvailableSpellCircles(sheet.spellSlots, sheet.spells);
	const addableSpellCircles = () => projectAddableSpellCircles(sheet.spellSlots);
	const spellSlotForCircle = (circle: number) =>
		sheet.spellSlots.find((slot) => slot.level === circle);
	const spellsForCircle = (circle: number) => groupSpellsByCircle(sheet.spells, circle);
	const spellOrigin = (spell: Sheet['spells'][number]) => {
		return resolveSpellOrigin(spell, spellCompendiumEntry(spell)?.rules);
	};
	const grantedSpells = () => {
		const sourceTexts = [
			{
				origin: 'species' as const,
				text: getActiveSpeciesTraits(sheet.species, sheet.speciesLineage).join(' ')
			},
			...featList().flatMap((feat) => {
				const entry = optionsFor('feat').find(
					(candidate) =>
						optionLabel(candidate).toLowerCase() === feat.toLowerCase() ||
						candidate.name.toLowerCase() === feat.toLowerCase()
				);
				return entry ? [{ origin: 'feat' as const, text: JSON.stringify(entry.rules) }] : [];
			})
		];
		return deriveGrantedSpells(sheet.spells, compendiumEntries, sourceTexts, optionLabel);
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
				lifecycle.state.message =
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
				lifecycle.state.message =
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
			lifecycle.state.message =
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
			lifecycle.state.message =
				'Esta condição impede ações e reações; o ataque não pode ser rolado.';
			return;
		}
		const abilityKey = profile?.attackAbility ?? weaponAbility(item);
		const abilityModifier = modifier(sheet.abilityScores[abilityKey]);
		const itemBonus = weaponItemBonus(item);
		const proficiencyBonus = weaponProficiencyBonus(item);
		const effects = weaponBonusTotals(item);
		rollingWeaponAction = actionKey;
		lifecycle.state.message = '';
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
			lifecycle.state.message =
				action === 'attack'
					? $appLocale === 'en'
						? 'Attack registered in chat.'
						: 'Ataque registrado no chat.'
					: $appLocale === 'en'
						? 'Damage registered in chat.'
						: 'Dano registrado no chat.';
		} catch (error) {
			lifecycle.state.message =
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
			lifecycle.state.message =
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
			lifecycle.state.message =
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
			lifecycle.state.message =
				error instanceof Error ? error.message : 'Não foi possível rolar a magia.';
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
			lifecycle.publishPresentationUpdated({ presentation });
			lifecycle.state.message = 'Magia destacada para a mesa.';
		} catch (error) {
			lifecycle.state.message =
				error instanceof Error ? error.message : 'Não foi possível destacar a magia.';
		}
	}
	const compatibleSlots = (spell: Sheet['spells'][number]) =>
		compatibleSpellSlots(spell, sheet.spellSlots);
	const selectedSlot = (spell: Sheet['spells'][number], index: number) =>
		defaultSpellSlot(spell, index, spellSlotChoice, sheet.spellSlots);
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
			lifecycle.state.message = 'Magia lançada e espaço consumido.';
		} catch (error) {
			lifecycle.state.message =
				error instanceof Error ? error.message : 'Não foi possível lançar a magia.';
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
		const existingSpell = spellEntries(newSpellLevel).find(
			(entry) => normalizeSpellName(optionLabel(entry)) === normalizeSpellName(name)
		);
		const updated = addSpellToSheet(
			sheet.spells,
			name,
			newSpellLevel,
			addableSpellCircles(),
			existingSpell,
			existingSpell ? optionLabel(existingSpell) : ''
		);
		if (updated.length === sheet.spells.length) return;
		sheet.spells = updated;
		expandedSpell = sheet.spells.length - 1;
		newSpellName = '';
	}
	function removeAttack(index: number) {
		sheet.attacks = sheet.attacks.filter((_, i) => i !== index);
	}
	function removeSpell(index: number) {
		sheet.spells = removeSpellFromSheet(sheet.spells, index);
	}
	function updateSpell(index: number, changes: Partial<Sheet['spells'][number]>) {
		if (!sheet.spells[index]) return;
		sheet.spells = updateSpellOnSheet(sheet.spells, index, changes);
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
					<CharacterIdentityTab
						bind:sheet
						bind:portraitPrompt
						bind:rollMode
						bind:expandedFeature
						portraitPreview={portraitWorkflow.state.preview}
						portraitBusy={portraitWorkflow.state.busy}
						{uploadPortrait}
						{generatePortrait}
						{optionsFor}
						{optionLabel}
						subclassOptions={subclassOptions()}
						{onClassChanged}
						onSubclassChanged={syncProgression}
						{onLevelChanged}
						{onSpeciesChanged}
						{onLineageChanged}
						{initiativeTokenId}
						onRollInitiative={rollSheetInitiative}
						onSetInitiativeAdvantage={setInitiativeAdvantage}
						onSyncToken={syncTokenSoon}
						{attributes}
						{abilityLabel}
						{modifier}
						onScoreChange={updateScore}
						{saveBonus}
						onToggleSavingThrow={toggleSavingThrow}
						onRollSave={(key, label) => rollAuthorized('save', key, label)}
						{hasAttackDisadvantage}
						passivePerception={passivePerception()}
						derivedFeatures={derivedFeatures()}
						expertiseChoices={expertiseChoices()}
						{skills}
						onExpertiseChoice={setExpertiseChoice}
					/>
				{/if}
				{#if activeTab === 'combat'}
					<CharacterCombatTab
						bind:sheet
						{saving}
						armorClass={calculatedArmorClass()}
						{attributes}
						{rollingWeaponAction}
						{rollingAttack}
						{rollingAttackAction}
						spells={grantedSpells()}
						actions={{
							rest,
							syncTokenSoon,
							spendResource,
							setResourceMax,
							spellDisplayName,
							circleLabel,
							spellOrigin,
							equipmentCategory,
							weapons: {
								weaponKey,
								weaponAbility,
								abilityLabel,
								abilityModifier: (key) => Math.floor((sheet.abilityScores[key] - 10) / 2),
								modifierText,
								proficiencyStatus: weaponProficiencyStatus,
								proficiencyBonus: weaponProficiencyBonus,
								attackBonusTotal: weaponAttackBonusTotal,
								damageBonusTotal: weaponDamageBonusTotal,
								weaponEffects,
								weaponProfiles: weaponAttackProfiles,
								hasGreatWeaponFighting,
								weaponSupportsGreatWeaponFighting,
								updateWeaponRules,
								toggleWeaponEffect,
								addWeaponAttackProfile,
								removeWeaponAttackProfile,
								updateWeaponProfile,
								rollWeapon: (item, action, profile) => void rollWeapon(item, action, profile)
							},
							addAttack,
							toggleVisibleRoll,
							setAttackType,
							rollCustomAttack: (attack, index) => void rollCustomAttack(attack, index),
							rollCustomDamage: (attack, index) => void rollCustomDamage(attack, index),
							removeAttack
						}}
					/>
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
						totalWeight={inventoryWeight()}
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
						spellbook={{
							addableCircles: addableSpellCircles,
							availableCircles: availableSpellCircles,
							slotForCircle: spellSlotForCircle,
							spellsForCircle,
							entriesForCircle: spellEntries,
							compatibleSlots,
							selectedSlot
						}}
						presentation={{
							optionLabel,
							circleLabel,
							displayName: spellDisplayName,
							description: spellDescription,
							higherLevels: spellHigherLevels,
							hasAITranslation: spellHasAITranslation
						}}
						actions={{
							setNewSpellName: (value) => (newSpellName = value),
							setNewSpellLevel: (value) => (newSpellLevel = value),
							setExpandedSpell: (value) => (expandedSpell = value),
							chooseSlot: (index, value) => (spellSlotChoice[index] = value),
							add: addSpell,
							remove: removeSpell,
							change: updateSpell,
							present: (spell) => void presentSpell(spell),
							rollEffect: (spell) => void rollSpellDamage(spell),
							cast: (spell, index) => void castSpell(spell, index)
						}}
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
{#if levelChoiceOpen}
	<CharacterLevelUpModal
		locale={$appLocale}
		level={sheet.level}
		onChoose={(choice) => void resolveLevelHP(choice)}
	/>
{/if}

<style>
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
	h2 {
		margin: 0;
		font-family: Georgia, serif;
	}
	.sheet > header button {
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
	}
	@media (max-width: 700px) {
		.sheet-backdrop.docked .sheet {
			bottom: 6.8rem;
			height: auto;
			max-height: calc(100dvh - 12.6rem);
		}
	}
</style>
