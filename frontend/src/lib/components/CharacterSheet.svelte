<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resizablePanel, resizablePanelPreference } from '$lib/utils/resizablePanel';
	import { movablePanel } from '$lib/utils/movablePanel';
	import { nextFloatingPanelLayer } from '$lib/utils/floatingPanelStack';
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
	import {
		beginDiceBatch,
		diceOverlay,
		finishDiceBatch,
		setDiceColor
	} from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { mergeCampaignMessages } from '$lib/utils/campaignChatState';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { savePresentation } from '$lib/services/presentationApi';
	import { connectSceneSocket } from '$lib/services/sceneRealtime';
	import { publishSpellToChat, rollDice } from '$lib/services/eventApi';
	import { appLocale } from '$lib/stores/locale';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import { calculateArmorClass } from '$lib/utils/armorClass';
	import { presentSpellMechanics } from '$lib/utils/compendium/spellMechanics';
	import {
		availableSpellCircles as projectAvailableSpellCircles,
		addSpellToSheet,
		addableSpellCircles as projectAddableSpellCircles,
		deriveGrantedSpells,
		eligibleSpellEntries,
		groupCharacterSpellsByCircle,
		hasActiveFeatGrantedSpells,
		hasAISpellTranslation,
		localizedSpellField,
		normalizeSpellName,
		projectCharacterSpells,
		removeSpellFromSheet,
		resolveSpellOrigin,
		updateSpellOnSheet
	} from '$lib/utils/character/characterSpellRules';
	import {
		deriveCharacterFeatures,
		expertiseChoicesForLevel,
		hitDieForClass,
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
		updateInventoryItemRules,
		resolveWeaponAttackMode,
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
	import {
		synchronizeCampaignFeatSpellGrants,
		synchronizeDndFeatGrantActivation
	} from '$lib/data/dnd2024FeatSpells';
	import { createCharacterSheetLifecycle } from '$lib/components/character/characterSheetLifecycle.svelte.js';
	import {
		parseDamageExpression,
		serializeDamageComponents,
		validateDamageBonus,
		validateDamageComponents,
		type DamageComponent
	} from '$lib/utils/weaponDamageBuilder';
	import { createCharacterPortraitWorkflow } from '$lib/components/character/characterPortraitWorkflow.svelte.js';
	import { createCharacterCombatActions } from '$lib/components/character/characterCombatActions.svelte.js';
	import { gerarImagemToken } from '$lib/services/tokenImageApi';
	import {
		equipmentCategory,
		modifierText,
		weaponAbility,
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
		hidden = false,
		embedded = false,
		standalone = false,
		focusRequest = 0,
		actorPanelVisible = false,
		onCharacterResolved = () => {},
		onDockChange = () => {},
		onOpenPanel = () => {},
		onOpenNewWindow = () => {},
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
		hidden?: boolean;
		embedded?: boolean;
		standalone?: boolean;
		focusRequest?: number;
		actorPanelVisible?: boolean;
		onCharacterResolved?: (characterId: string) => void;
		onDockChange?: (docked: boolean) => void;
		onOpenPanel?: (characterId: string) => void;
		onOpenNewWindow?: (characterId: string) => boolean | void;
		onclose: () => void;
		onTokenCreated: () => void;
	} = $props();
	const sheetPanelKey = $derived(`character-sheet:${campaignId}:${characterId ?? 'mine'}`);
	let sheet = $state<Sheet>(createEmptySheet());
	let damageDrafts = $state<Record<string, DamageComponent[]>>({});
	let invalidWeaponKey = $state<string | null>(null);
	let invalidDamageIndex = $state(0);
	let invalidWeaponField = $state<'damage' | 'bonus'>('damage');
	let invalidDamageProfileId = $state<string | null>(null);
	let sheetOwnerId = $state('');
	let compendiumEntries = $state<CompendiumEntry[]>([]);
	let compendiumSources = $state<CompendiumSource[]>([]);
	let activeTab = $state<'profile' | 'skills' | 'combat' | 'inventory' | 'spells' | 'details'>(
		'profile'
	);
	let inventoryFilter = $state<InventoryCategory>('all');
	let rollMode = $state<'normal' | 'advantage' | 'disadvantage'>('normal');
	let weaponAttackMode = $state<'normal' | 'advantage' | 'disadvantage'>('normal');
	let expandedSpell = $state<number | null>(null);
	let newSpellName = $state('');
	let newSpellLevel = $state(0);
	let minimized = $state(false);
	let sheetPanelElement = $state<HTMLElement>();
	let raisedPanelLayer = $state(0);
	let panelZIndex = $derived(Math.max(raisedPanelLayer, docked ? 9 : 20));
	let reportedResolvedCharacterId = $state('');
	$effect(() => {
		if (!standalone && !embedded)
			minimized = Boolean(resizablePanelPreference(sheetPanelKey)?.collapsed);
	});
	$effect(() => {
		if (standalone || embedded || focusRequest === 0) return;
		minimized = false;
		raisedPanelLayer = nextFloatingPanelLayer();
		void tick().then(() => sheetPanelElement?.focus());
	});
	function bringToFront() {
		raisedPanelLayer = nextFloatingPanelLayer();
	}
	let previousLevel = $state(1);
	let levelChoiceOpen = $state(false);
	let portraitPrompt = $state('');
	let expandedFeature = $state<string | null>(null);
	const hasAttackDisadvantage = () =>
		lifecycle.state.activeConditions.some((condition) =>
			['Cego', 'Envenenado', 'Impedido'].includes(condition)
		);
	const selectedAttackMode = () =>
		resolveWeaponAttackMode(weaponAttackMode, lifecycle.state.activeConditions);
	$effect(() => {
		if (hasAttackDisadvantage() && weaponAttackMode === 'advantage') weaponAttackMode = 'normal';
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
	const sheetTabIcon = (tab: string) =>
		(
			({
				profile: 'character',
				skills: 'skill',
				combat: 'initiative',
				inventory: 'inventory',
				spells: 'spell',
				details: 'notes'
			}) as Record<string, string>
		)[tab] ?? 'character';
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
		getContext: () => ({ campaignId, sceneId, characterId, isGM, session, onTokenCreated }),
		onContextChanged: () => {
			sheet = createEmptySheet();
			sheetOwnerId = '';
			compendiumEntries = [];
			compendiumSources = [];
			activeTab = 'profile';
			previousLevel = 1;
			levelChoiceOpen = false;
		},
		getSheet: () => sheet,
		setSheet: (next) => (sheet = next),
		validateBeforeSave: () => {
			for (const item of sheet.inventory) {
				if (equipmentCategory(item) !== 'weapon') continue;
				const targets = [null, ...weaponAttackProfiles(item)];
				for (const profile of targets) {
					const issue = validateWeaponDamage(item, profile ?? undefined);
					if (issue) {
						invalidWeaponKey = weaponKey(item);
						invalidDamageProfileId = profile?.id ?? null;
						invalidWeaponField = issue.field;
						invalidDamageIndex = issue.index;
						return `${item.name}${profile ? ` · ${profile.name}` : ''}: ${issue.message} Configure o dano com quantidade + tipo de dado, até 10 dados no total; valores sem dados vão em “Bônus de dano”.`;
					}
				}
			}
			invalidWeaponKey = null;
			invalidDamageProfileId = null;
			invalidWeaponField = 'damage';
			invalidDamageIndex = 0;
			return null;
		},
		onValidationFailure: () => (activeTab = 'combat'),
		calculateArmorClass: () => calculatedArmorClass(),
		getCompendium,
		onCompendiumLoaded: (sources, entries) => {
			compendiumSources = sources;
			compendiumEntries = entries;
			sheet.campaignFeatSpellGrants = synchronizeCampaignFeatSpellGrants(
				sheet.feats,
				sheet.campaignFeatSpellGrants ?? [],
				entries.filter((entry) => entry.entryType === 'feat')
			);
			syncProgression();
		},
		getCharacterForGM,
		getMyCharacter,
		onCharacterLoaded: (loadedCharacter) => {
			sheetOwnerId = loadedCharacter.ownerId;
			sheet = loadedCharacter.sheet;
			damageDrafts = {};
			invalidWeaponKey = null;
			invalidDamageProfileId = null;
			invalidDamageIndex = 0;
			invalidWeaponField = 'damage';
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
			sheet.campaignFeatSpellGrants = synchronizeCampaignFeatSpellGrants(
				sheet.feats,
				sheet.campaignFeatSpellGrants ?? [],
				compendiumEntries.filter((entry) => entry.entryType === 'feat')
			);
			sheet.spellSlots ??= [];
			sheet.skillExpertise ??= [];
			previousLevel = sheet.level;
			syncProgression();
			if (sheet.portraitPath) void refreshPortraitPreview();
		},
		loadScene,
		listSceneEffects,
		setDiceColor,
		connectPresentationSocket: (socketSession, socketSceneId, onAdvantageUpdated) =>
			connectSceneSocket(
				socketSession,
				socketSceneId,
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
		onInitiativeAdvantageUpdated: (enabled) => (sheet.initiativeAdvantage = enabled)
	});
	$effect(() => {
		const resolvedId = lifecycle.state.resolvedCharacterId;
		if (!resolvedId) {
			reportedResolvedCharacterId = '';
			return;
		}
		if (resolvedId === reportedResolvedCharacterId) return;
		reportedResolvedCharacterId = resolvedId;
		onCharacterResolved(resolvedId);
	});
	const portraitWorkflow = createCharacterPortraitWorkflow({
		getContext: () => ({ campaignId, session }),
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
	const initiativeTokenId = $derived(lifecycle.state.initiativeTokenId);
	const combatActions = createCharacterCombatActions({
		getContext: () => ({
			campaignId,
			sceneId,
			characterId,
			isGM,
			session,
			locale: $appLocale === 'en' ? 'en' : 'pt-BR',
			onTokenCreated
		}),
		getSheet: () => sheet,
		getCanCastSelectedCharacter: () => !isGM || sheetOwnerId === session.user.id,
		getCanDisplaySelectedCharacter: () => isGM || !characterId || sheetOwnerId === session.user.id,
		setSheet: (next) => (sheet = next),
		getResolvedCharacterId: () => lifecycle.state.resolvedCharacterId,
		getInitiativeTokenId: () => lifecycle.state.initiativeTokenId,
		getActiveConditions: () => lifecycle.state.activeConditions,
		getAttackMode: selectedAttackMode,
		isWeapon: (item) => equipmentCategory(item) === 'weapon',
		getWeaponRollDetails: (item, profile) => {
			const defaultAbility = weaponAbility(item);
			const attackAbility = profile?.attackAbility ?? defaultAbility;
			const abilityAdjustment =
				modifier(sheet.abilityScores[attackAbility]) -
				modifier(sheet.abilityScores[defaultAbility]);
			const draft = damageDrafts[damageDraftKey(item, profile)];
			const formula = profile?.damage ?? item.rules.damage;
			const damageFormula = draft
				? validateDamageComponents(draft)
					? ''
					: serializeDamageComponents(draft)
				: String(formula ?? '');
			return {
				attackBonus: weaponAttackBonusTotal(item) + abilityAdjustment + (profile?.attackBonus ?? 0),
				damageBonus:
					calculateWeaponDamageBonus(
						item,
						sheet.abilityScores,
						selectedEffectsForWeapon(item),
						!profile
					) +
					abilityAdjustment +
					(profile?.damageBonus ?? 0),
				damageFormula,
				stableWeaponKey: weaponKey(item),
				profileKey: profile?.id ?? 'default',
				damageType: String(item.rules.damageType ?? ''),
				minimumDamageDie: profile?.greatWeaponFighting ? 3 : undefined
			};
		},
		getAbilityModifier: (ability) => modifier(sheet.abilityScores[ability]),
		getPreviousLevel: () => previousLevel,
		setPreviousLevel: (level) => (previousLevel = level),
		setLevelChoiceOpen: (open) => (levelChoiceOpen = open),
		getSpellPresentation: (spell) => ({
			title: spellDisplayName(spell),
			description: spellDescription(spell)
		}),
		setMessage: (next) => (lifecycle.state.message = next),
		getSaving: () => lifecycle.state.saving,
		syncTokenSoon,
		syncProgression,
		save,
		beginExternalSaving: () => lifecycle.beginExternalSaving(),
		isRevisionCurrent: (operation) => lifecycle.isRevisionCurrent(operation),
		finishExternalSaving: (operation) => lifecycle.finishExternalSaving(operation),
		rollMyCharacter,
		rollDice,
		rollTokenInitiative,
		setInitiativeAdvantage: setCharacterInitiativeAdvantage,
		restCharacter,
		castMySpell,
		saveSpellDisplay: publishSpellToChat,
		savePresentation: (activeSession, activeSceneId, presentation) =>
			savePresentation(activeSession, activeSceneId, presentation),
		appendChat: (message) => ($chatMensagens = mergeCampaignMessages($chatMensagens, [message])),
		setDiceOverlay: (result) => diceOverlay.set(result),
		beginDiceBatch,
		finishDiceBatch,
		publishChatUpdated: sceneSocketPublishChat,
		publishCombatUpdated: () => lifecycle.publishCombatUpdated(),
		publishPresentationUpdated: (data) => lifecycle.publishPresentationUpdated(data)
	});
	$effect(() => {
		lifecycle.updateContext();
		portraitWorkflow.updateContext();
		combatActions.updateContext();
	});
	onMount(() => {
		lifecycle.start();
		return () => {
			combatActions.cleanup();
			lifecycle.cleanup();
		};
	});
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
	const damageDraftKey = (item: InventoryItem, profile?: WeaponAttackProfile) =>
		`${weaponKey(item)}:${profile?.id ?? 'base'}`;
	const damageComponents = (
		item: InventoryItem,
		profile?: WeaponAttackProfile
	): DamageComponent[] => {
		const key = damageDraftKey(item, profile);
		if (damageDrafts[key]) return damageDrafts[key];
		return parseDamageExpression(profile?.damage ?? item.rules.damage) ?? [];
	};
	function validateWeaponDamage(item: InventoryItem, profile?: WeaponAttackProfile) {
		const formula = profile?.damage ?? item.rules.damage;
		const bonus = profile ? profile.damageBonus : (item.rules.damageBonus ?? item.rules.bonus ?? 0);
		const bonusIssue = validateDamageBonus(bonus);
		if (bonusIssue) return { field: 'bonus' as const, index: 0, message: bonusIssue };
		const components =
			damageDrafts[damageDraftKey(item, profile)] ?? parseDamageExpression(formula);
		if ((profile?.damageNeedsRepair ?? item.rules.damageNeedsRepair) || components === null)
			return {
				field: 'damage' as const,
				index: 0,
				message:
					'A fórmula de dano anterior não pode ser convertida; refaça seus componentes explicitamente.'
			};
		const issue = validateDamageComponents(components);
		return issue ? { field: 'damage' as const, index: issue.index, message: issue.message } : null;
	}
	function setDamageComponents(
		item: InventoryItem,
		components: DamageComponent[],
		profile?: WeaponAttackProfile
	) {
		const key = damageDraftKey(item, profile);
		damageDrafts[key] = components;
		invalidWeaponKey = weaponKey(item);
		invalidDamageProfileId = profile?.id ?? null;
		invalidWeaponField = 'damage';
		const issue = validateDamageComponents(components);
		invalidDamageIndex = issue?.index ?? 0;
		if (issue) return;
		const damage = components.map(({ count, sides }) => `${count}d${sides}`).join('+');
		if (profile) updateWeaponProfile(item, profile.id, { damage, damageNeedsRepair: false });
		else updateWeaponRules(item, { damage, damageNeedsRepair: false }, true);
		invalidWeaponKey = null;
		invalidDamageProfileId = null;
	}
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
		return (
			spellcastingEnabled(
				sheet.class,
				sheet.level,
				compendiumClass()?.rules.spellcasting,
				sheet.spellcastingOverride
			) ||
			hasActiveFeatGrantedSpells(sheet.featSpellGrants ?? [], sheet.campaignFeatSpellGrants ?? [])
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
			sheet.subclass,
			$appLocale
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
	const spellMechanics = (spell: Sheet['spells'][number]) =>
		presentSpellMechanics(spellCompendiumEntry(spell)?.rules, $appLocale);
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
	const rollSkill = (name: string) =>
		combatActions.rollAuthorized(
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
	const spellEntries = (circle?: number) =>
		eligibleSpellEntries(compendiumEntries, sheet.spells, optionLabel, sheet.class, circle);
	const projectedCharacterSpells = () =>
		projectCharacterSpells(
			sheet.spells,
			sheet.featSpellGrants ?? [],
			optionsFor('spell'),
			optionLabel,
			sheet.campaignFeatSpellGrants ?? [],
			optionsFor('feat')
		);
	const availableSpellCircles = () =>
		projectAvailableSpellCircles(
			sheet.spellSlots,
			projectedCharacterSpells().map(({ spell }) => spell)
		);
	const addableSpellCircles = () => projectAddableSpellCircles(sheet.spellSlots);
	const spellSlotForCircle = (circle: number) =>
		sheet.spellSlots.find((slot) => slot.level === circle);
	const spellsForCircle = (circle: number) =>
		groupCharacterSpellsByCircle(projectedCharacterSpells(), circle);
	const spellOrigin = (spell: Sheet['spells'][number]) => {
		return resolveSpellOrigin(spell, spellCompendiumEntry(spell)?.rules);
	};
	const grantedSpells = () => {
		const speciesGrants = deriveGrantedSpells(
			sheet.spells,
			compendiumEntries,
			[
				{
					origin: 'species',
					text: getActiveSpeciesTraits(sheet.species, sheet.speciesLineage).join(' ')
				}
			],
			optionLabel
		);
		const curatedFeatGrants = projectedCharacterSpells()
			.filter(({ origins }) => origins?.includes('feat'))
			.map(({ spell }) => spell);
		const seen: string[] = [];
		return [...speciesGrants, ...curatedFeatGrants].filter((spell) => {
			const key = spell.entryId ?? normalizeSpellName(spell.name);
			if (seen.includes(key)) return false;
			seen.push(key);
			return true;
		});
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
	function addAttack() {
		sheet.attacks = [
			...sheet.attacks,
			{
				name: 'Novo ataque',
				attackType: 'melee',
				ability: 'strength',
				attackBonus: 0,
				damageBonus: 0,
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
	class:floating={!embedded && !docked && !standalone}
	class:embedded
	class:standalone
	class:hidden
	style:z-index={embedded ? undefined : panelZIndex}
	onpointerdown={() => !embedded && bringToFront()}
	onfocusin={() => !embedded && bringToFront()}
	role="presentation"
	onclick={(event) => {
		if (!embedded && event.currentTarget === event.target) onclose();
	}}
>
	<section
		bind:this={sheetPanelElement}
		use:movablePanel={{
			storageKey: sheetPanelKey,
			skipLayout: embedded,
			layoutKey: actorPanelVisible ? 'map-panels' : 'campaign-panels',
			handleSelector: 'header',
			minTop: 56,
			maxWidth: 1280,
			avoidSelectors: ['.app-header', '.game-header', '.workspace-tabs', '.sheet-picker'],
			avoidLeftSelectors: ['.floating-chat.sheet-open:not(.closed)'],
			avoidRightSelectors: [
				...(actorPanelVisible ? ['.actor-drawer.sheet-open'] : []),
				'.token-inspector'
			],
			avoidBottomSelectors: actorPanelVisible ? ['.actor-drawer.sheet-open'] : [],
			constrainToViewport: true,
			enabled: !docked && !standalone
		}}
		use:resizablePanel={{
			collapsed: !standalone && !embedded && minimized,
			headerSelector: 'header',
			fillViewport: standalone,
			minWidth: 300,
			storageKey: standalone || embedded ? undefined : sheetPanelKey,
			skipLayout: embedded
		}}
		class="sheet"
		class:minimized
		class:embedded
		tabindex="-1"
		aria-label="Ficha de personagem D&D 2024"
	>
		<header
			role="toolbar"
			tabindex={embedded ? -1 : 0}
			aria-label={embedded
				? $appLocale === 'en'
					? 'Character sheet actions'
					: 'Ações da ficha'
				: $appLocale === 'en'
					? 'Move character sheet with pointer or arrow keys'
					: 'Mova a ficha pelo cabeçalho ou pelas setas do teclado'}
		>
			<div class="sheet-header-content">
				<div class="sheet-title-row">
					<div class="sheet-heading">
						<h2>{sheet.name || ($appLocale === 'en' ? 'New character' : 'Nova ficha')}</h2>
						{#if embedded}
							<div class="sheet-primary-actions">
								<button
									type="button"
									onclick={() =>
										onOpenPanel(characterId ?? lifecycle.state.resolvedCharacterId ?? '')}
									disabled={!(characterId ?? lifecycle.state.resolvedCharacterId)}
									>{$appLocale === 'en' ? 'Open as panel' : 'Abrir como painel'}</button
								><button
									type="button"
									onclick={() => {
										const id = characterId ?? lifecycle.state.resolvedCharacterId ?? '';
										if (id && onOpenNewWindow(id) === false)
											lifecycle.state.message =
												$appLocale === 'en'
													? 'The browser blocked the auxiliary window. The sheet remains available here.'
													: 'O navegador bloqueou a janela auxiliar. A ficha continua acessível aqui.';
									}}
									disabled={!(characterId ?? lifecycle.state.resolvedCharacterId)}
									>{$appLocale === 'en'
										? 'Open auxiliary window'
										: 'Abrir em janela auxiliar'}</button
								>
							</div>
						{:else if !standalone}
							<div class="sheet-primary-actions">
								<button
									type="button"
									onclick={() => onDockChange(!docked)}
									aria-label={docked
										? $appLocale === 'en'
											? 'Float character sheet'
											: 'Flutuar ficha'
										: $appLocale === 'en'
											? 'Dock character sheet'
											: 'Fixar ficha'}
									>{docked
										? $appLocale === 'en'
											? 'Float'
											: 'Flutuar'
										: $appLocale === 'en'
											? 'Dock'
											: 'Fixar'}</button
								><button
									type="button"
									onclick={() =>
										onOpenNewWindow(characterId ?? lifecycle.state.resolvedCharacterId ?? '')}
									disabled={!(characterId ?? lifecycle.state.resolvedCharacterId)}
									aria-label={$appLocale === 'en'
										? 'Pop out character sheet to an auxiliary window'
										: 'Destacar ficha em janela auxiliar'}
									>{$appLocale === 'en' ? 'Pop out' : 'Destacar'}</button
								>
							</div>
						{/if}
					</div>
					<div class="sheet-actions">
						{#if !standalone && !embedded}<span class="sheet-mode-status" aria-live="polite">
								{docked
									? $appLocale === 'en'
										? 'Docked'
										: 'Acoplada'
									: $appLocale === 'en'
										? 'Floating'
										: 'Flutuante'}
							</span><button
								type="button"
								onclick={() => (minimized = !minimized)}
								aria-label={minimized
									? $appLocale === 'en'
										? 'Restore character sheet'
										: 'Restaurar ficha'
									: $appLocale === 'en'
										? 'Minimize character sheet'
										: 'Minimizar ficha'}>{minimized ? '▸' : '−'}</button
							>{/if}{#if !embedded}<button
								type="button"
								onclick={onclose}
								aria-label={$appLocale === 'en' ? 'Close character sheet' : 'Fechar ficha'}
								>×</button
							>{/if}
					</div>
				</div>
			</div>
			{#if characterOwnerName}<small class="sheet-owner"
					>{$appLocale === 'en'
						? `Character of ${characterOwnerName}`
						: `Personagem de ${characterOwnerName}`}</small
				>{/if}
		</header>
		{#if !loading && !minimized}<nav
				class="sheet-tabs"
				aria-label={$appLocale === 'en' ? 'Character sheet sections' : 'Seções da ficha'}
			>
				{#each sheetTabs() as [tab, label] (tab)}
					<button
						class:active={activeTab === tab}
						onclick={() => (activeTab = tab as typeof activeTab)}
						><RpgIcon name={sheetTabIcon(tab)} size={17} />{label}</button
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
						onRollInitiative={() => combatActions.rollInitiative()}
						onSetInitiativeAdvantage={(enabled) => combatActions.setInitiativeAdvantage(enabled)}
						onSyncToken={syncTokenSoon}
						{attributes}
						{abilityLabel}
						{modifier}
						onScoreChange={updateScore}
						{saveBonus}
						onToggleSavingThrow={toggleSavingThrow}
						onRollSave={(key, label) => combatActions.rollAuthorized('save', key, label)}
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
						rollingWeaponAction={combatActions.state.rollingWeaponAction}
						rollingAttack={combatActions.state.rollingAttack}
						rollingAttackAction={combatActions.state.rollingAttackAction}
						bind:rollMode={weaponAttackMode}
						attackDisadvantage={hasAttackDisadvantage()}
						spells={grantedSpells()}
						actions={{
							rest: (kind) => void combatActions.rest(kind),
							syncTokenSoon,
							spendResource: (index) => combatActions.spendResource(index),
							setResourceMax: (index, value) => combatActions.setResourceMax(index, value),
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
								damageComponents,
								setDamageComponents,
								invalidWeaponKey: () => invalidWeaponKey,
								invalidDamageIndex: () => invalidDamageIndex,
								invalidWeaponField: () => invalidWeaponField,
								invalidDamageProfileId: () => invalidDamageProfileId,
								toggleWeaponEffect,
								addWeaponAttackProfile,
								removeWeaponAttackProfile,
								updateWeaponProfile,
								rollWeapon: (item, action, profile) =>
									void combatActions.rollWeapon(item, action, profile)
							},
							addAttack,
							toggleVisibleRoll,
							setAttackType,
							rollCustomAttack: (attack, index) =>
								void combatActions.rollCustomAttack(attack, index),
							rollCustomDamage: (attack, index) =>
								void combatActions.rollCustomDamage(attack, index),
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
						money={sheet.money ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }}
						onMoneyChange={(money) => (sheet.money = money)}
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
						canCastSpells={sheetOwnerId === session.user.id}
						castingSpell={combatActions.state.castingSpell}
						spellbook={{
							addableCircles: addableSpellCircles,
							availableCircles: availableSpellCircles,
							slotForCircle: spellSlotForCircle,
							spellsForCircle,
							entriesForCircle: spellEntries,
							compatibleSlots: combatActions.compatibleSlots,
							selectedSlot: combatActions.selectedSlot
						}}
						presentation={{
							optionLabel,
							circleLabel,
							displayName: spellDisplayName,
							description: spellDescription,
							higherLevels: spellHigherLevels,
							mechanics: (spell) => spellMechanics(spell),
							hasAITranslation: spellHasAITranslation
						}}
						actions={{
							setNewSpellName: (value) => (newSpellName = value),
							setNewSpellLevel: (value) => (newSpellLevel = value),
							setExpandedSpell: (value) => (expandedSpell = value),
							chooseSlot: (index, value) => combatActions.chooseSpellSlot(index, value),
							add: addSpell,
							remove: removeSpell,
							change: updateSpell,
							present: (spell) => void combatActions.presentSpell(spell),
							rollEffect: (spell) => void combatActions.rollSpellDamage(spell),
							cast: (spell, index, grant) => void combatActions.castSpell(spell, index, grant)
						}}
					/>
				{/if}
				{#if activeTab === 'details'}
					<CharacterDetailsTab
						{sheet}
						feats={featList()}
						featEntries={optionsFor('feat')}
						spellEntries={optionsFor('spell')}
						featSpellGrants={sheet.featSpellGrants ?? []}
						campaignFeatSpellGrants={sheet.campaignFeatSpellGrants ?? []}
						{optionLabel}
						onFeatsChange={(feats) => {
							sheet.feats = feats;
							sheet.featSpellGrants = synchronizeDndFeatGrantActivation(
								feats,
								sheet.featSpellGrants ?? [],
								optionsFor('feat')
							);
							sheet.campaignFeatSpellGrants = synchronizeCampaignFeatSpellGrants(
								feats,
								sheet.campaignFeatSpellGrants ?? [],
								optionsFor('feat')
							);
						}}
						onFeatSpellGrantsChange={(grants) => (sheet.featSpellGrants = grants)}
						onCampaignFeatSpellGrantsChange={(grants) => (sheet.campaignFeatSpellGrants = grants)}
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
		onChoose={(choice) => void combatActions.resolveLevelHP(choice)}
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
	.sheet-backdrop.floating {
		z-index: 20;
		inset: 0 0 var(--mm-audio-footer-offset, 4.25rem);
		display: block;
		padding: 0;
		background: transparent;
		backdrop-filter: none;
		pointer-events: none;
	}
	.sheet-backdrop.hidden {
		visibility: hidden;
		pointer-events: none;
	}
	.sheet-backdrop.docked .sheet {
		position: fixed;
		top: auto;
		bottom: var(--mm-panel-bottom-offset, calc(var(--mm-audio-footer-offset, 4.25rem) + 0.55rem));
		left: 1rem;
		right: var(--mm-panel-right-inset, 1rem);
		width: min(1280px, calc(100vw - var(--mm-panel-right-inset, 1rem) - 2rem));
		min-width: min(640px, calc(100vw - var(--mm-panel-right-inset, 1rem) - 2rem));
		max-width: calc(100vw - var(--mm-panel-right-inset, 1rem) - 1rem);
		min-height: min(320px, var(--mm-panel-available-height, 320px));
		max-height: var(
			--mm-panel-available-height,
			calc(100dvh - 6.35rem - var(--mm-audio-footer-offset, 4.25rem))
		);
		resize: none;
		overflow: hidden;
		pointer-events: auto;
		box-shadow: 0 18px 48px #000a;
	}
	.sheet-backdrop.floating .sheet {
		position: fixed;
		top: var(--mm-panel-navigation-bottom, 6rem);
		bottom: auto;
		right: var(--mm-panel-right-inset, 1rem);
		left: var(--mm-panel-left-inset, 1rem);
		width: var(--mm-panel-width, min(1280px, calc(100vw - 450px)));
		height: min(900px, var(--mm-panel-available-height, calc(100dvh - 10rem)));
		min-width: min(
			var(--mm-panel-min-width, min(440px, calc(100vw - 2rem))),
			var(--mm-panel-safe-min-width, 440px)
		);
		max-width: min(calc(100vw - 1rem), var(--mm-panel-safe-max-width, calc(100vw - 1rem)));
		min-height: min(400px, var(--mm-panel-available-height, 400px));
		max-height: var(--mm-panel-available-height, calc(100dvh - 10rem));
		resize: both;
		overflow: hidden;
		pointer-events: auto;
	}
	@media (max-width: 880px) {
		.sheet-backdrop.floating .sheet {
			--sheet-stacked-chat-height: min(40vh, 360px);
			--sheet-stacked-top: calc(
				var(--mm-panel-navigation-bottom, 6rem) + 3.7rem + var(--sheet-stacked-chat-height) +
					0.75rem
			);
			top: var(--sheet-stacked-top);
			left: 0.5rem;
			right: 0.5rem;
			width: calc(100vw - 1rem);
			min-width: min(320px, calc(100vw - 2rem), var(--mm-panel-safe-min-width, 320px));
			max-width: min(calc(100vw - 1rem), var(--mm-panel-safe-max-width, calc(100vw - 1rem)));
			min-height: min(
				320px,
				max(
					120px,
					calc(100dvh - var(--sheet-stacked-top) - var(--mm-audio-footer-offset, 4.25rem) - 1rem)
				)
			);
			max-height: min(
				var(--mm-panel-available-height, calc(100dvh - 10rem)),
				max(
					120px,
					calc(100dvh - var(--sheet-stacked-top) - var(--mm-audio-footer-offset, 4.25rem) - 1rem)
				)
			);
		}
	}
	@media (max-width: 1050px) {
		.sheet-backdrop.docked .sheet {
			left: 0;
			right: 0;
			width: 100vw;
			min-width: min(320px, 100vw);
			max-width: 100vw;
		}
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
		max-width: 100vw;
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
		align-items: center;
		gap: 0.45rem;
	}
	.sheet-actions button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e7d1ae;
		background: #2b211e;
		font: inherit;
		font-size: 0.72rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.sheet-actions button:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #3a2920;
	}
	.sheet-actions button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.sheet-mode-status {
		color: #bbaea1;
		font-size: 0.65rem;
		white-space: nowrap;
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
		padding: 0.55rem 0.85rem;
		border-bottom: 1px solid #403536;
	}
	.sheet > header {
		display: grid;
		gap: 0.28rem;
		flex: 0 0 auto;
		cursor: move;
		touch-action: none;
	}
	.sheet > header button {
		cursor: pointer;
		touch-action: manipulation;
	}
	.sheet > header .sheet-primary-actions button {
		border: 1px solid #765d3d;
		font-size: 0.7rem;
	}
	.sheet > header:focus-visible {
		outline: 2px solid #e0b86f;
		outline-offset: -2px;
	}
	.sheet > footer {
		position: relative;
		flex: 0 0 auto;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		border-top: 1px solid #403536;
		border-bottom: 0;
	}
	.sheet-header-content,
	.sheet-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
		width: 100%;
	}
	.sheet-heading {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}
	.sheet-heading h2 {
		min-width: 0;
		overflow: hidden;
		color: #f2e6d7;
		font:
			600 clamp(1rem, 2.2vw, 1.28rem) Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sheet-primary-actions {
		display: flex;
		align-items: center;
		flex: 0 0 auto;
		gap: 0.35rem;
	}
	.sheet-primary-actions button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.28rem 0.5rem;
		color: #e7d1ae;
		background: #2b211e;
		font: inherit;
		font-size: 0.7rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.sheet-owner {
		color: #a99c91;
		font-size: 0.68rem;
		line-height: 1.2;
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
		flex: 1 1 auto;
		gap: 1rem;
		align-content: start;
		min-width: 0;
		min-height: 0;
		width: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
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
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: 0 0 auto;
		border: 1px solid #4f433d;
		border-radius: 999px;
		padding: 0.42rem 0.65rem;
		color: #bcae9f;
		background: #171316;
		font-size: 0.72rem;
	}
	.sheet-tabs button :global(svg) {
		flex: 0 0 auto;
	}
	.sheet-tabs button.active {
		border-color: #c89655;
		color: #f2d49a;
		background: #38281f;
	}
	.sheet > footer {
		min-height: 48px;
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
		.sheet > header,
		.sheet > footer {
			padding: 0.5rem 0.65rem;
		}
		.sheet-title-row {
			align-items: flex-start;
		}
		.sheet-heading {
			flex-wrap: wrap;
			gap: 0.25rem 0.5rem;
		}
		.sheet-heading h2 {
			max-width: 100%;
		}
		.sheet-primary-actions button {
			padding: 0.24rem 0.35rem;
			font-size: 0.64rem;
		}
		.sheet-actions {
			gap: 0.2rem;
		}
		.sheet-tabs {
			padding: 0.45rem 0.65rem;
		}
		.sheet-body {
			padding: 0.75rem;
		}
		.sheet > footer {
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
			bottom: var(--mm-panel-bottom-offset, calc(var(--mm-audio-footer-offset, 6.5rem) + 0.55rem));
			top: auto;
			height: auto;
			max-height: var(
				--mm-panel-available-height,
				calc(100dvh - 6.35rem - var(--mm-audio-footer-offset, 6.5rem))
			);
			min-height: min(320px, var(--mm-panel-available-height, 320px));
			left: 0;
			right: 0;
			max-width: 100vw;
		}
		.sheet-backdrop.floating .sheet {
			--sheet-stacked-chat-height: min(20dvh, 170px);
			--sheet-stacked-top: calc(
				var(--mm-panel-navigation-bottom, 5.8rem) + 3.7rem + var(--sheet-stacked-chat-height) +
					0.75rem
			);
			top: var(--sheet-stacked-top);
			bottom: auto;
			left: 0.5rem;
			right: 0.5rem;
			width: calc(100vw - 1rem);
			height: min(
				72dvh,
				calc(
					100dvh - var(--sheet-stacked-top) -
						var(--mm-panel-bottom-offset, var(--mm-audio-footer-offset, 6.5rem)) - 1rem
				)
			);
			max-width: calc(100vw - 1rem);
			max-height: min(
				var(--mm-panel-available-height, calc(100dvh - 10rem)),
				calc(
					100dvh - var(--sheet-stacked-top) -
						var(--mm-panel-bottom-offset, var(--mm-audio-footer-offset, 6.5rem)) - 1rem
				)
			);
			min-height: min(
				190px,
				max(
					120px,
					calc(
						100dvh - var(--sheet-stacked-top) -
							var(--mm-panel-bottom-offset, var(--mm-audio-footer-offset, 6.5rem)) - 1rem
					)
				)
			);
			resize: both;
		}
		.sheet-actions {
			gap: 0.25rem;
		}
		.sheet-actions button {
			padding: 0.3rem;
			font-size: 0.62rem;
		}
	}
	.sheet-backdrop.embedded {
		position: relative;
		z-index: auto;
		inset: auto;
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		width: 100%;
		height: auto;
		padding: 0;
		background: transparent;
		backdrop-filter: none;
		pointer-events: auto;
	}
	.sheet-backdrop.embedded .sheet {
		position: relative;
		inset: auto;
		flex: 1 1 auto;
		width: 100%;
		max-width: none;
		min-width: 0;
		height: 100%;
		min-height: 0;
		max-height: none;
		resize: none;
		border-radius: 10px;
		box-shadow: none;
	}
	.sheet-backdrop.embedded .sheet > header {
		cursor: default;
		touch-action: auto;
	}
	.sheet-backdrop.embedded .sheet-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}
	.sheet-backdrop.embedded .sheet > footer {
		flex-wrap: wrap;
	}
</style>
