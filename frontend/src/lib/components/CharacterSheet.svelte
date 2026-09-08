<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
import {
		createEmptySheet,
		getCharacterForGM,
		getMyCharacter,
		saveCharacterForGM,
		saveMyCharacter,
		type CharacterSheet as Sheet,
		type InventoryItem
	} from '$lib/services/characterApi';
	import { createTokenFromCharacter, listSceneEffects, loadScene } from '$lib/services/sceneApi';
	import { getCompendium, type CompendiumEntry } from '$lib/services/compendiumApi';
	import { rollDice } from '$lib/services/eventApi';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { classData, classFeatures, canonicalClass as progressionClass, defaultResources, spellSlots } from '$lib/data/classProgression';

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
	let rulesLocale = $state<'pt-BR' | 'en'>('pt-BR');
	let selectedItemId = $state('');
	let selectedSpellId = $state('');
	let spellCircle = $state('all');
	let activeTab = $state<'profile' | 'combat' | 'inventory' | 'spells' | 'details'>('profile');
	let inventoryFilter = $state<'all' | 'weapon' | 'armor' | 'consumable' | 'tool' | 'gear'>('all');
	let rollingWeapon = $state<string | null>(null);
	let newFeat = $state('');
	let selectedFeat = $state('');
	let tokenSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let minimized = $state(false);
	let activeConditions = $state<string[]>([]);
	const attributes: { key: keyof Sheet['abilityScores']; label: string }[] = [
		{ key: 'strength', label: 'FOR' },
		{ key: 'dexterity', label: 'DES' },
		{ key: 'constitution', label: 'CON' },
		{ key: 'intelligence', label: 'INT' },
		{ key: 'wisdom', label: 'SAB' },
		{ key: 'charisma', label: 'CAR' }
	];
	const modifier = (score: number) => Math.floor((score - 10) / 2);
	const classHitDice: Record<string, string> = Object.fromEntries(Object.entries(classData).map(([name, data]) => [name, data.hitDice]));
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
			label: 'Draconato', speed: 9,
			traits: ['Visão no escuro 18 m', 'Arma de sopro (CON; usos = bônus de proficiência)', 'Voo dracônico a partir do nível 5'],
			lineages: {
				'Negro (ácido)': ['Resistência a ácido', 'Sopro: ácido'], 'Azul (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
				'Latão (fogo)': ['Resistência a fogo', 'Sopro: fogo'], 'Bronze (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
				'Cobre (ácido)': ['Resistência a ácido', 'Sopro: ácido'], 'Ouro (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
				'Verde (veneno)': ['Resistência a veneno', 'Sopro: veneno'], 'Vermelho (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
				'Prata (frio)': ['Resistência a frio', 'Sopro: frio'], 'Branco (frio)': ['Resistência a frio', 'Sopro: frio']
			}
		},
		dwarf: { label: 'Anão', speed: 9, traits: ['Visão no escuro 36 m', 'Resistência a veneno e vantagem contra Envenenado', 'PV máximo +1 por nível (Robustez Anã)', 'Conhecimento da Pedra'] },
		elf: {
			label: 'Elfo', speed: 9, traits: ['Visão no escuro 18 m', 'Ancestralidade feérica: vantagem contra Enfeitiçado', 'Sentidos aguçados; Transe (Descanso Longo em 4 h)'],
			lineages: {
				Drow: ['Visão no escuro 36 m', 'Luzes Dançantes; nível 3: Fogo das Fadas; nível 5: Escuridão'],
				'Alto Elfo': ['Prestidigitação (pode trocar por truque de mago após Descanso Longo)', 'nível 3: Detectar Magia; nível 5: Passo Nebuloso'],
				'Elfo da Floresta': ['Deslocamento 10,5 m', 'Arte Druídica; nível 3: Passo Longo; nível 5: Passos sem Pegadas']
			}
		},
		gnome: {
			label: 'Gnomo', speed: 9, traits: ['Visão no escuro 18 m', 'Astúcia Gnômica: vantagem em testes de resistência de INT, SAB e CAR'],
			lineages: { 'Gnomo da Floresta': ['Ilusão Menor; Falar com Animais preparado'], 'Gnomo da Rocha': ['Consertar e Prestidigitação; engenhoca mecânica'] }
		},
		goliath: {
			label: 'Golias', speed: 10.5, traits: ['Forma Grande a partir do nível 5', 'Porte Poderoso', 'Escolha uma Ancestralidade Gigante (usos = bônus de proficiência)'],
			lineages: {
				'Nuvem': ['Passo da Nuvem: teleporte 9 m como ação bônus'], 'Fogo': ['Queimadura do Fogo: +1d10 fogo ao acertar'],
				'Gelo': ['Frio do Gelo: +1d6 frio e -3 m de deslocamento'], 'Colina': ['Tombamento da Colina: derruba alvo Grande ou menor'],
				'Pedra': ['Resistência da Pedra: reação reduz dano em 1d12 + CON'], 'Tempestade': ['Trovão da Tempestade: reação, 1d8 trovão']
			}
		},
		halfling: { label: 'Halfling', speed: 9, traits: ['Corajoso: vantagem contra Amedrontado', 'Sorte: rerrola 1 em d20', 'Nimbleza Halfling', 'Furtividade Natural'] },
		human: { label: 'Humano', speed: 9, traits: ['Versátil: um talento de origem', 'Habilidoso: proficiência em uma perícia', 'Recursivo: Inspiração Heroica após Descanso Longo'] },
		orc: { label: 'Orc', speed: 9, traits: ['Visão no escuro 36 m', 'Investida de Adrenalina', 'Resistência Incansável: fica com 1 PV em vez de 0 (1/Descanso Longo)'] },
		tiefling: {
			label: 'Tiefling', speed: 9, traits: ['Visão no escuro 18 m', 'Presença Sobrenatural: Taumaturgia'],
			lineages: {
				Abissal: ['Resistência a veneno', 'Rajada Venenosa; nível 3: Raio de Enjoo; nível 5: Imobilizar Pessoa'],
				Ctônico: ['Resistência a necrótico', 'Toque Gélido; nível 3: Vida Falsa; nível 5: Raio Enfraquecedor'],
				Infernal: ['Resistência a fogo', 'Raio de Fogo; nível 3: Repreensão Infernal; nível 5: Escuridão']
			}
		}
	};
	function normalizedSpecies(value: string) {
		const species = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
		return ({ draconato: 'dragonborn', anao: 'dwarf', elfo: 'elf', gnomo: 'gnome', golias: 'goliath', halfling: 'halfling', humano: 'human', orc: 'orc', tiefling: 'tiefling' } as Record<string, string>)[species] ?? species;
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
			: speciesProfile()?.speed ?? sheet.speed;
	function onSpeciesChanged() {
		const profile = speciesProfile();
		if (!profile?.lineages?.[sheet.speciesLineage]) sheet.speciesLineage = '';
		if (profile) sheet.speed = speciesSpeed();
	}
	function onLineageChanged() { sheet.speed = speciesSpeed(); }

	onMount(async () => {
		// Lists come from the campaign compendium, so a GM can mix SRD choices,
		// private references and homebrew without exposing unpublished entries.
		rulesLocale = localStorage.getItem('maismorras.rulesLocale') === 'en' ? 'en' : 'pt-BR';
		void getCompendium(session, campaignId)
			.then((data) => (compendiumEntries = data.entries))
			.catch(() => undefined);
		try {
			sheet = characterId
				? (await getCharacterForGM(session, campaignId, characterId)).sheet
				: (await getMyCharacter(session, campaignId)).sheet;
			sheet.inventory ??= [];
			sheet.resources ??= [];
			sheet.spellSlots ??= [];
			const scene = await loadScene(session, sceneId);
			const token = characterId
				? scene.tokens.find((item) => item.actorId === characterId)
				: scene.tokens.find((item) => item.isOwner);
			if (token) {
				const effects = await listSceneEffects(session, sceneId);
				activeConditions = effects.effects.filter((effect) => effect.tokenId === token.id).map((effect) => effect.name);
			}
		} catch (error) {
			if (!characterId && (error as Error & { status?: number }).status === 404)
				isNewCharacter = true;
			else message = error instanceof Error ? error.message : 'Não foi possível carregar a ficha.';
		} finally {
			loading = false;
		}
	});
	const optionsFor = (entryType: string) =>
		compendiumEntries.filter((entry) => entry.entryType === entryType);
	const optionLabel = (entry: CompendiumEntry) =>
		rulesLocale === 'pt-BR' ? (entry.translations?.['pt-BR'] || entry.name) : entry.name;
	const entryRules = (entry: CompendiumEntry) => entry.rules as Record<string, unknown>;
	function equipmentCategory(item: { name: string; rules: Record<string, unknown> }) {
		const category = String(item.rules.category ?? '');
		if (['weapon', 'armor', 'consumable', 'tool', 'gear'].includes(category)) return category as typeof inventoryFilter;
		const name = item.name.toLowerCase();
		if (/armor|mail|plate|shield|couro|armadura|escudo/.test(name)) return 'armor';
		if (/potion|acid|fire|ration|po[cç][aã]o|ra[cç][oõ]es/.test(name)) return 'consumable';
		if (/tools|supplies|kit|instrument|ferramentas|suprimentos/.test(name)) return 'tool';
		if (/sword|axe|bow|crossbow|dagger|club|mace|spear|hammer|rapier|weapon|espada|arco|besta|adaga|ma[cç]a|lan[cç]a|martelo/.test(name)) return 'weapon';
		return 'gear';
	}
	const itemEntries = () => compendiumEntries.filter((entry) => entry.entryType === 'item' && (inventoryFilter === 'all' || equipmentCategory({ name: entry.name, rules: entryRules(entry) }) === inventoryFilter));
	const visibleInventory = () => sheet.inventory.filter((item) => inventoryFilter === 'all' || equipmentCategory(item) === inventoryFilter);
	const itemLabel = (item: InventoryItem) => item.name;
	const modifierText = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
	function canonicalClass(value: string) {
		const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
		return ({ barbaro: 'barbarian', bardo: 'bard', clerigo: 'cleric', druida: 'druid', guerreiro: 'fighter', monge: 'monk', paladino: 'paladin', patrulheiro: 'ranger', ladino: 'rogue', feiticeiro: 'sorcerer', bruxo: 'warlock', mago: 'wizard' } as Record<string, string>)[normalized] ?? normalized;
	}
	function onClassChanged() {
		const hitDice = classHitDice[canonicalClass(sheet.class)];
		if (hitDice) sheet.hitDice = hitDice;
		if (!classData[progressionClass(sheet.class)]?.subclasses.includes(sheet.subclass)) sheet.subclass = '';
		syncProgression();
	}
	const subclassOptions = () => classData[progressionClass(sheet.class)]?.subclasses ?? [];
	const derivedFeatures = () => classFeatures(sheet.class, sheet.level, sheet.subclass);
	const featList = () => sheet.feats.split(/\n|,/).map((feat) => feat.trim()).filter(Boolean);
	const featDescription = (feat: string) => optionsFor('feat').find((entry) => optionLabel(entry).toLowerCase() === feat.toLowerCase() || entry.name.toLowerCase() === feat.toLowerCase())?.summary || 'Talento privado ou sem resumo cadastrado no compêndio.';
	function addFeat() { const feat = newFeat.trim(); if (!feat || featList().some((item) => item.toLowerCase() === feat.toLowerCase())) return; sheet.feats = [...featList(), feat].join('\n'); selectedFeat = feat; newFeat = ''; }
	function removeFeat(feat: string) { sheet.feats = featList().filter((item) => item !== feat).join('\n'); if (selectedFeat === feat) selectedFeat = ''; }
	function syncProgression() {
		const defaults = defaultResources(sheet.class, sheet.level, sheet.abilityScores);
		sheet.resources = defaults.map((resource) => ({ ...resource, current: sheet.resources.find((old) => old.id === resource.id)?.current ?? resource.max }));
		const slots = spellSlots(sheet.class, sheet.level);
		sheet.spellSlots = slots.map((slot) => ({ ...slot, current: sheet.spellSlots.find((old) => old.level === slot.level)?.current ?? slot.max }));
	}
	function onLevelChanged() { syncProgression(); }
	function spendResource(index: number) { sheet.resources[index].current = Math.max(0, sheet.resources[index].current - 1); }
	async function rest(kind: 'short' | 'long') {
		if (kind === 'short') {
			const hitDie = sheet.hitDice.match(/^1d(\d+)$/i);
			if (!hitDie || sheet.hitDiceSpent >= sheet.level) { message = 'Não há dados de vida disponíveis para recuperar PV neste descanso.'; return; }
			try {
				const event = await rollDice(session, campaignId, `1d${hitDie[1]}${modifier(sheet.abilityScores.constitution) >= 0 ? '+' : ''}${modifier(sheet.abilityScores.constitution)}`);
				const result = event.payload as { dados: number[]; total: number };
				sheet.hitDiceSpent += 1;
				sheet.hitPointsCurrent = Math.min(sheet.hitPointsMax, sheet.hitPointsCurrent + result.total);
				$diceOverlay = { expression: 'Dado de vida', total: result.total, dice: result.dados };
			} catch { message = 'Não foi possível rolar o dado de vida.'; return; }
		}
		sheet.resources = sheet.resources.map((resource) => resource.restoreOn === kind || kind === 'long' ? { ...resource, current: resource.max } : resource);
		if (kind === 'short') sheet.spellSlots = sheet.spellSlots.map((slot) => canonicalClass(sheet.class) === 'warlock' ? { ...slot, current: slot.max } : slot);
		if (kind === 'long') { sheet.hitPointsCurrent = sheet.hitPointsMax; sheet.temporaryHP = 0; sheet.hitDiceSpent = 0; sheet.spellSlots = sheet.spellSlots.map((slot) => ({ ...slot, current: slot.max })); }
		message = kind === 'long' ? 'Descanso longo aplicado: PV, recursos e espaços restaurados.' : 'Descanso curto aplicado: recursos de descanso curto restaurados.';
	}
	const spellEntries = () => compendiumEntries.filter((entry) => {
		if (entry.entryType !== 'spell') return false;
		const rules = entryRules(entry);
		const level = Number(rules.level ?? 0);
		const classes = Array.isArray(rules.classes) ? rules.classes.map(String) : [];
		return (spellCircle === 'all' || level === Number(spellCircle)) && (!canonicalClass(sheet.class) || classes.length === 0 || classes.includes(canonicalClass(sheet.class)));
	});
	function addInventoryItem() {
		const entry = itemEntries().find((item) => item.id === selectedItemId);
		if (!entry) return;
		sheet.inventory = [...sheet.inventory, { entryId: entry.id, name: optionLabel(entry), quantity: 1, equipped: false, rules: entry.rules }];
		selectedItemId = '';
	}
	function removeInventoryItem(index: number) { sheet.inventory = sheet.inventory.filter((_, itemIndex) => itemIndex !== index); }
	function addWeaponAttack(item: InventoryItem) {
		const rules = item.rules;
		if (rules.category !== 'weapon') return;
		const ability = rules.attackAbility === 'dexterity' ? sheet.abilityScores.dexterity : sheet.abilityScores.strength;
		const abilityModifier = modifier(ability);
		const damage = `${String(rules.damage ?? '')}${abilityModifier ? ` ${modifierText(abilityModifier)}` : ''} ${String(rules.damageType ?? '')}`.trim();
		sheet.attacks = [...sheet.attacks, { name: item.name, attackBonus: abilityModifier + sheet.proficiencyBonus, damage, notes: `Item do compêndio · ${Array.isArray(rules.properties) ? rules.properties.join(', ') : ''}` }];
	}
	async function rollWeapon(item: InventoryItem) {
		const rules = item.rules;
		const damageMatch = String(rules.damage ?? '').match(/^(\d+)d(\d+)/i);
		if (rules.category !== 'weapon' || !damageMatch || rollingWeapon) return;
		if (activeConditions.some((condition) => ['Incapacitado', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(condition))) {
			message = 'Esta condição impede ações e reações; o ataque não pode ser rolado.';
			return;
		}
		const ability = rules.attackAbility === 'dexterity' ? sheet.abilityScores.dexterity : sheet.abilityScores.strength;
		const attackBonus = modifier(ability) + sheet.proficiencyBonus;
		rollingWeapon = item.entryId;
		message = '';
		try {
			const disadvantage = activeConditions.some((condition) => ['Cego', 'Envenenado', 'Impedido'].includes(condition));
			const attackEvent = await rollDice(session, campaignId, `1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`, disadvantage ? 'disadvantage' : undefined, 'combat');
			const attack = attackEvent.payload as { expressao: string; dados: number[]; total: number };
			const critical = attack.dados[0] === 20;
			$chatMensagens = [...$chatMensagens, { id: String(attackEvent.id), autor: attackEvent.author, texto: `${item.name} · ataque${critical ? ' · CRÍTICO!' : ''}`, tipo: 'rolagem', canal: 'combat', detalhesRolagem: { ...attack, modificador: attack.total - attack.dados.reduce((sum, die) => sum + die, 0) } }];
			$diceOverlay = { expression: `${item.name} · ataque`, total: attack.total, dice: attack.dados };
			const diceCount = Number(damageMatch[1]) * (critical ? 2 : 1);
			const damageModifier = modifier(ability);
			const damageEvent = await rollDice(session, campaignId, `${diceCount}d${damageMatch[2]}${damageModifier >= 0 ? '+' : ''}${damageModifier}`, undefined, 'combat');
			const damage = damageEvent.payload as { expressao: string; dados: number[]; total: number };
			$chatMensagens = [...$chatMensagens, { id: String(damageEvent.id), autor: damageEvent.author, texto: `${item.name} · dano${critical ? ' crítico' : ''} (${String(rules.damageType ?? '')})`, tipo: 'rolagem', canal: 'combat', detalhesRolagem: { ...damage, modificador: damage.total - damage.dados.reduce((sum, die) => sum + die, 0) } }];
			$diceOverlay = { expression: `${item.name} · dano${critical ? ' crítico' : ''}`, total: damage.total, dice: damage.dados };
			message = critical ? 'Crítico! Ataque e dano foram registrados no chat.' : 'Ataque e dano foram registrados no chat.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível rolar a arma.';
		} finally {
			rollingWeapon = null;
		}
	}
	function addCompendiumSpell() {
		const entry = spellEntries().find((spell) => spell.id === selectedSpellId);
		if (!entry || sheet.spells.some((spell) => spell.name === optionLabel(entry))) return;
		const rules = entryRules(entry);
		sheet.spells = [...sheet.spells, { name: optionLabel(entry), level: Number(rules.level ?? 0), notes: `SRD · ${String(rules.school ?? '')}${rules.range ? ` · ${String(rules.range)}` : ''}` }];
		selectedSpellId = '';
	}
	const equippedDefense = () => sheet.inventory.filter((item) => item.equipped).reduce((total, item) => total + Number(item.rules.armorClassBonus ?? 0), 0);
	function updateScore(key: keyof Sheet['abilityScores'], value: string) {
		sheet.abilityScores[key] = Math.max(1, Math.min(30, Number(value) || 1));
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
	function syncTokenSoon() { if (tokenSyncTimer) clearTimeout(tokenSyncTimer); tokenSyncTimer = setTimeout(() => { if (!saving) void save(); }, 450); }
	async function createBoardToken() {
		if (!isGM) return;
		saving = true;
		message = '';
		try {
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
			<div>
				<p>FICHA D&D 2024 · MVP</p>
				<h2>{sheet.name || 'Nova ficha'}</h2>
				{#if characterOwnerName}<small>Personagem de {characterOwnerName}</small>{/if}
			</div>
			<div class="sheet-actions">{#if docked}<button onclick={() => minimized = !minimized} aria-label="Minimizar ficha">{minimized ? '▸' : '▾'}</button>{/if}<button onclick={onclose} aria-label="Fechar ficha">×</button></div>
		</header>
		{#if !loading && !minimized}<nav class="sheet-tabs" aria-label="Seções da ficha">
			{#each [['profile', 'Perfil'], ['combat', 'Combate'], ['inventory', 'Inventário'], ['spells', 'Magias'], ['details', 'Detalhes']] as [tab, label]}
				<button class:active={activeTab === tab} onclick={() => (activeTab = tab as typeof activeTab)}>{label}</button>
			{/each}
		</nav>{/if}
		{#if loading}<p class="status">Carregando ficha…</p>{:else if !minimized}
			<div class="sheet-body">
				{#if isNewCharacter}
					<aside class="onboarding">
						<strong>Seu personagem começa aqui.</strong>
						<span
							>Preencha os dados, salve a ficha e o narrador poderá vinculá-la a um token na mesa.</span
						>
					</aside>
				{/if}
				{#if activeTab === 'profile'}
				<section class="identity">
					<label>Nome<input bind:value={sheet.name} maxlength="120" placeholder="Nome do personagem" /></label>
					<label>Classe<input bind:value={sheet.class} onchange={onClassChanged} list="class-options" placeholder="Ex.: Guerreiro" /></label>
					<label>Nível<input type="number" min="1" max="20" bind:value={sheet.level} onchange={onLevelChanged} /></label>
					{#if subclassOptions().length}<label>Subclasse<select bind:value={sheet.subclass} onchange={syncProgression}><option value="">Escolha no nível 3…</option>{#each subclassOptions() as subclass}<option value={subclass}>{subclass}</option>{/each}</select></label>{/if}
					<label>Espécie<input bind:value={sheet.species} onchange={onSpeciesChanged} list="species-options" placeholder="Ex.: Humano" /></label>
					{#if lineageOptions().length}
						<label>Linhagem / legado<select bind:value={sheet.speciesLineage} onchange={onLineageChanged}><option value="">Escolha uma opção…</option>{#each lineageOptions() as lineage}<option value={lineage}>{lineage}</option>{/each}</select></label>
					{/if}
					<label>Antecedente<input bind:value={sheet.background} list="background-options" /></label>
					<label>Alinhamento<input bind:value={sheet.alignment} /></label>
					<datalist id="class-options">{#each optionsFor('class') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
					<datalist id="species-options">{#each optionsFor('species') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
					<datalist id="background-options">{#each optionsFor('background') as entry (entry.id)}<option value={optionLabel(entry)}>{entry.summary}</option>{/each}</datalist>
				</section>
				{#if speciesProfile()}
					<section class="species-traits" aria-label="Traços de espécie aplicados">
						<div><h3>{speciesProfile().label}{sheet.speciesLineage ? ` · ${sheet.speciesLineage}` : ''}</h3><span>Deslocamento base aplicado: {speciesSpeed()} m</span></div>
						<ul>{#each activeSpeciesTraits() as trait}<li>{trait}</li>{/each}</ul>
						<small>Estes traços são calculados pela espécie e linhagem selecionadas. Ajustes de PV, magias e usos são exibidos aqui para a mesa; preencha os valores atuais de combate e inclua as magias desejadas na ficha.</small>
					</section>
				{/if}
				<section>
					<h3>Atributos</h3>
					<div class="abilities">
						{#each attributes as attribute}<label
								><span>{attribute.label}</span><input
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
				{#if derivedFeatures().length}<section class="progression"><h3>Progressão de classe</h3><ul>{#each derivedFeatures() as feature}<li><span>Nível {feature.level}</span>{feature.name}</li>{/each}</ul></section>{/if}
				{/if}
				{#if activeTab === 'combat'}
				<section class="combat">
					<h3>Combate</h3>
					<div class="rest-actions"><button onclick={() => rest('short')}>Descanso curto</button><button onclick={() => rest('long')}>Descanso longo</button></div>
					<label>CA<input type="number" min="0" max="99" bind:value={sheet.armorClass} oninput={syncTokenSoon} /></label
					><label>Deslocamento (m)<input type="number" min="0" bind:value={sheet.speed} /></label
					><label>Proficiência<input type="number" bind:value={sheet.proficiencyBonus} /></label
					><label
						>PV atuais<input
							type="number"
							min="0"
							max={sheet.hitPointsMax}
							bind:value={sheet.hitPointsCurrent}
							oninput={syncTokenSoon}
						/></label
					><label>PV máximos<input type="number" min="1" bind:value={sheet.hitPointsMax} oninput={syncTokenSoon} /></label
					><label
						>PV temporários<input type="number" min="0" bind:value={sheet.temporaryHP} /></label
					><label>Dados de vida<input bind:value={sheet.hitDice} /><small>{sheet.level - sheet.hitDiceSpent}/{sheet.level} disponíveis</small></label><label
						>Percepção passiva<input
							type="number"
							min="0"
							bind:value={sheet.passivePerception}
						/></label
					>
				</section>
				{#if sheet.resources.length}<section class="resources"><h3>Recursos</h3>{#each sheet.resources as resource, index}<div><strong>{resource.name}</strong><span>{resource.current}/{resource.max} · {resource.restoreOn === 'short' ? 'descanso curto' : 'descanso longo'}</span><button onclick={() => spendResource(index)} disabled={resource.current === 0}>Usar</button></div>{/each}</section>{/if}
				<section class="combat-attacks">
					<div class="section-title">
						<h3>Ataques</h3>
						<button onclick={addAttack}>+ Ataque</button>
					</div>
					{#each sheet.attacks as attack, index}<div class="line-item">
							<input bind:value={attack.name} placeholder="Nome" /><input type="number" bind:value={attack.attackBonus} aria-label="Bônus de ataque" /><input bind:value={attack.damage} placeholder="Dano" /><button onclick={() => removeAttack(index)}>×</button>
						</div>{/each}
				</section>
				{/if}
				{#if activeTab === 'inventory'}
				<section class="inventory-section">
					<div class="section-title"><h3>Equipamento</h3><span class="defense-hint">Defesa equipada: +{equippedDefense()} CA</span></div>
					<div class="inventory-filters" aria-label="Categorias de equipamento">{#each [['all', 'Tudo'], ['weapon', 'Armas'], ['armor', 'Armaduras'], ['consumable', 'Consumíveis'], ['tool', 'Ferramentas'], ['gear', 'Outros']] as [filter, label]}<button class:active={inventoryFilter === filter} onclick={() => { inventoryFilter = filter as typeof inventoryFilter; selectedItemId = ''; }}>{label}</button>{/each}</div>
					<div class="compendium-picker"><select bind:value={selectedItemId}><option value="">Adicionar item do compêndio…</option>{#each itemEntries() as entry (entry.id)}<option value={entry.id}>{optionLabel(entry)}</option>{/each}</select><button onclick={addInventoryItem} disabled={!selectedItemId}>Adicionar</button></div>
					{#if visibleInventory().length}<div class="inventory-list">{#each visibleInventory() as item}<div class="inventory-item"><label><input type="checkbox" bind:checked={item.equipped}/> equipado</label><strong>{itemLabel(item)}</strong><input type="number" min="0" max="9999" bind:value={item.quantity} aria-label={`Quantidade de ${item.name}`}/>{#if equipmentCategory(item) === 'weapon'}<button onclick={() => addWeaponAttack(item)}>+ ataque</button><button class="roll-weapon" onclick={() => rollWeapon(item)} disabled={rollingWeapon === item.entryId}>{rollingWeapon === item.entryId ? 'Rolando…' : '🎲 atacar'}</button>{/if}<button onclick={() => removeInventoryItem(sheet.inventory.indexOf(item))}>×</button></div>{/each}</div>{:else}<p class="empty-inline">Nenhum item nesta categoria. Escolha uma categoria e adicione itens pelo compêndio.</p>{/if}
				</section>
				{/if}
				{#if activeTab === 'spells'}
				<section>
					<div class="section-title">
						<h3>Magias</h3>
						<button onclick={addSpell}>+ Magia</button>
					</div>
					{#if sheet.spellSlots.length}<div class="spell-slots">{#each sheet.spellSlots as slot}<label>Círculo {slot.level}<input type="number" min="0" max={slot.max} bind:value={slot.current} /> <small>/ {slot.max}</small></label>{/each}</div>{/if}
					<div class="compendium-picker spell-picker"><select bind:value={spellCircle}><option value="all">Todos os círculos</option><option value="0">Truques</option>{#each [1,2,3,4,5,6,7,8,9] as circle}<option value={String(circle)}>Círculo {circle}</option>{/each}</select><select bind:value={selectedSpellId}><option value="">{sheet.class ? 'Magia disponível para a classe…' : 'Defina a classe para filtrar magias…'}</option>{#each spellEntries() as entry (entry.id)}<option value={entry.id}>{optionLabel(entry)} · círculo {Number(entryRules(entry).level ?? 0)}</option>{/each}</select><button onclick={addCompendiumSpell} disabled={!selectedSpellId}>Adicionar</button></div>
					{#each sheet.spells as spell, index}<div class="line-item">
							<input bind:value={spell.name} placeholder="Nome" /><input
								type="number"
								min="0"
								max="9"
								bind:value={spell.level}
								aria-label="Círculo"
							/><input bind:value={spell.notes} placeholder="Notas" /><button
								onclick={() => removeSpell(index)}>×</button
							>
						</div>{/each}
				</section>
				{/if}
				{#if activeTab === 'details'}
				<section class="notes">
					<label>Características<textarea bind:value={sheet.features} placeholder="Habilidades raciais, de classe e observações."></textarea></label>
					<div class="feat-manager"><div><h3>Talentos</h3><div class="feat-add"><input bind:value={newFeat} list="feat-options" placeholder="Adicionar talento"/><button onclick={addFeat}>Adicionar</button></div><datalist id="feat-options">{#each optionsFor('feat') as feat (feat.id)}<option value={optionLabel(feat)}>{feat.summary}</option>{/each}</datalist><div class="feat-list">{#each featList() as feat}<div class="feat-row"><button class:active={selectedFeat === feat} onclick={() => selectedFeat = feat}>{feat}</button><button class="remove-feat" aria-label={`Remover ${feat}`} onclick={() => removeFeat(feat)}>×</button></div>{/each}{#if !featList().length}<small>Nenhum talento cadastrado.</small>{/if}</div></div><aside><strong>{selectedFeat || 'Selecione um talento'}</strong><p>{selectedFeat ? featDescription(selectedFeat) : 'A descrição do talento aparece aqui sem ocupar a ficha inteira.'}</p></aside></div>
					<label class="legacy-equipment">Anotações de equipamento<textarea bind:value={sheet.equipment} placeholder="Moedas, cargas, conteúdo de mochilas e observações."></textarea></label>
				</section>
				{/if}
			</div>
			<footer>
				{#if message}<span class:success={message === 'Ficha salva.'}>{message}</span>{/if}
				<button class="save" onclick={save} disabled={saving}
					>{saving ? 'Salvando…' : 'Salvar ficha'}</button
				>
				{#if isGM}
					<button class="save token-button" onclick={createBoardToken} disabled={saving}
						>{saving ? 'Salvando…' : 'Criar token na cena'}</button
					>
				{/if}
			</footer>
		{/if}
	</section>
</div>

<style>
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
	.sheet-backdrop.docked { z-index: 9; display:block; padding:0; background:transparent; backdrop-filter:none; pointer-events:none; }
	.sheet-backdrop.docked .sheet { position:fixed; top:5.8rem; left:1rem; width:min(390px,calc(100vw - 2rem)); max-height:calc(100vh - 7rem); pointer-events:auto; box-shadow:0 18px 48px #000a; }
	.sheet.minimized { width:auto!important; min-width:190px; max-height:none!important; }.sheet-actions{display:flex;gap:.45rem}.sheet-actions button{border:0;color:#cbb9a7;background:transparent;font-size:1.35rem}
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
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	header p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	header small {
		display: block;
		margin-top: 0.25rem;
		color: #a99c91;
		font-size: 0.75rem;
	}
	h2,
	h3 {
		margin: 0;
		font-family: Georgia, serif;
	}
	header button,
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
	.inventory-filters button.active { border-color: #c89655; color: #f2d49a; background: #38281f; }
	.identity,
	.combat {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
		gap: 0.7rem;
	}
	.combat h3 { grid-column: 1 / -1; }
	.rest-actions { grid-column: 1 / -1; display: flex; gap: 0.45rem; }
	.rest-actions button, .resources button { border: 1px solid #80603b; border-radius: 6px; padding: 0.42rem 0.6rem; color: #f0d29d; background: #2b211c; font-size: 0.72rem; }
	.combat-attacks { display: grid; gap: 0.45rem; }
	.progression, .resources { display: grid; gap: 0.45rem; border: 1px solid #494045; border-radius: 8px; padding: 0.75rem; background: #171417; }
	.progression ul { display: grid; gap: 0.35rem; margin: 0; padding: 0; list-style: none; }
	.progression li { color: #d7c9ba; font-size: 0.78rem; }
	.progression li span { display: inline-block; width: 4.1rem; color: #d8ad67; font-size: 0.68rem; }
	.resources > div { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 0.5rem; border-top: 1px solid #393034; padding-top: 0.45rem; }
	.resources span { color: #a99c91; font-size: 0.7rem; }
	.spell-slots { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.55rem; }
	.spell-slots label { display: flex; align-items: center; gap: 0.25rem; border: 1px solid #4a3d38; border-radius: 6px; padding: 0.35rem; }
	.spell-slots input { width: 3rem; padding: 0.25rem; text-align: center; }
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
	.species-traits h3 { margin: 0; color: #b9d7ee; }
	.species-traits span,
	.species-traits small { color: #a7bac9; font-size: 0.72rem; line-height: 1.4; }
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
	.inventory-filters { display: flex; gap: 0.35rem; overflow-x: auto; margin-bottom: 0.55rem; }
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
	.roll-weapon { border-color: #9d7744 !important; color: #ffe1a4 !important; background: #3b291e !important; }
	.feat-manager { display: grid; grid-template-columns: minmax(180px, .9fr) 1.1fr; gap: .8rem; border: 1px solid #494045; border-radius: 8px; padding: .75rem; background: #171417; }
	.feat-manager h3 { margin: 0 0 .5rem; font-size: .92rem; }.feat-add { display:flex; gap:.4rem; }.feat-add input { min-width:0; flex:1; }.feat-add button,.feat-list button { border:1px solid #5b493b; border-radius:6px; color:#dfceb7; background:#241d1e; font-size:.72rem; cursor:pointer; }.feat-add button { padding:.4rem .5rem; }.feat-list { display:grid; gap:.35rem; margin-top:.55rem; }.feat-row{display:flex;gap:.3rem}.feat-row>button:first-child{flex:1;text-align:left;padding:.42rem .5rem}.feat-row .remove-feat{width:2rem;color:#cda692;font-size:1rem}.feat-list button.active { border-color:#c89655; background:#38281f; }.feat-manager aside { min-height:90px; border-left:1px solid #493c39; padding-left:.8rem; }.feat-manager aside strong { color:#f0cb85; font:600 .9rem Georgia,serif; }.feat-manager aside p { color:#b9aa9d; font-size:.78rem; line-height:1.45; white-space:pre-wrap; }
	.inventory-item label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.62rem;
	}
	.inventory-item label input { width: auto; }
	.empty-inline { margin: 0; color: #96897e; font-size: 0.76rem; }
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
	.legacy-equipment { grid-column: 1 / -1; }
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
		.sheet-backdrop { padding: 0; }
		.sheet {
			width: 100%;
			max-height: 100dvh;
			height: 100dvh;
			border: 0;
			border-radius: 0;
		}
		header,
		footer { padding: 0.8rem 1rem; }
		footer { position: sticky; bottom: 0; background: #1b171a; }
		.feat-manager { grid-template-columns: 1fr; }.feat-manager aside { border-left:0; border-top:1px solid #493c39; padding: .7rem 0 0; }
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
		.notes {
			grid-template-columns: 1fr;
		}
		.species-traits > div { align-items: flex-start; flex-direction: column; gap: 0.2rem; }
		.spell-picker,
		.inventory-item { grid-template-columns: 1fr; }
	}
</style>
