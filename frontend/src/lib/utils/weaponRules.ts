import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';
import { hasWeaponProficiency, hasWeaponProficiencyInText } from './weaponProficiency';
import {
	modifierText,
	weaponAbility,
	weaponAttackSpecificBonus,
	weaponDamageSpecificBonus,
	weaponItemBonus,
	weaponRange,
	weaponRangeFromText
} from './characterEquipment';
import type { DamageComponent } from './weaponDamageBuilder';

export type WeaponEffect = { key: string; name: string; attackBonus: number; damageBonus: number };
export type WeaponAttackProfile = {
	id: string;
	name: string;
	description: string;
	attackAbility: keyof AbilityScores;
	damage: string;
	attackBonus: number;
	damageBonus: number;
	damageNeedsRepair?: boolean;
	greatWeaponFighting: boolean;
};
export type WeaponFeature = { id: string; name: string; description: string };
export type WeaponFeat = { id: string; name: string; rules: Record<string, unknown> };

/** UI boundary for weapon operations; pure rules stay independent of the callbacks' effects. */
export type WeaponCombatActions = {
	weaponKey: (item: InventoryItem) => string;
	weaponAbility: (item: InventoryItem) => keyof AbilityScores;
	abilityLabel: (key: keyof AbilityScores) => string;
	abilityModifier: (key: keyof AbilityScores) => number;
	modifierText: (value: number) => string;
	proficiencyStatus: (item: InventoryItem) => boolean;
	proficiencyBonus: (item: InventoryItem) => number;
	attackBonusTotal: (item: InventoryItem) => number;
	damageBonusTotal: (item: InventoryItem) => number;
	weaponEffects: (item: InventoryItem) => WeaponEffect[];
	weaponProfiles: (item: InventoryItem) => WeaponAttackProfile[];
	hasGreatWeaponFighting: () => boolean;
	weaponSupportsGreatWeaponFighting: (item: InventoryItem) => boolean;
	updateWeaponRules: (
		item: InventoryItem,
		changes: Record<string, unknown>,
		autosave?: boolean
	) => void;
	damageComponents: (item: InventoryItem, profile?: WeaponAttackProfile) => DamageComponent[];
	setDamageComponents: (
		item: InventoryItem,
		components: DamageComponent[],
		profile?: WeaponAttackProfile
	) => void;
	invalidWeaponKey: () => string | null;
	invalidDamageIndex: () => number;
	invalidWeaponField: () => 'damage' | 'bonus';
	invalidDamageProfileId: () => string | null;
	toggleWeaponEffect: (item: InventoryItem, key: string) => void;
	addWeaponAttackProfile: (item: InventoryItem) => void;
	removeWeaponAttackProfile: (item: InventoryItem, id: string) => void;
	updateWeaponProfile: (
		item: InventoryItem,
		id: string,
		changes: Partial<WeaponAttackProfile>
	) => void;
	rollWeapon: (
		item: InventoryItem,
		action: 'attack' | 'damage',
		profile?: WeaponAttackProfile
	) => void;
};

export function weaponProficiencyStatus(
	item: InventoryItem,
	baseProficiencies: readonly string[],
	subclassProficiencies: readonly string[],
	subclassRules: Record<string, unknown> = {}
): boolean {
	if (typeof item.rules.proficient === 'boolean') return item.rules.proficient;
	const category = String(item.rules.category ?? '');
	const allProficiencies = [...baseProficiencies, ...subclassProficiencies];
	return (
		hasWeaponProficiency(allProficiencies, item.name, category) ||
		hasWeaponProficiencyInText(JSON.stringify(subclassRules), item.name, category)
	);
}

export function parseWeaponEffect(
	key: string,
	name: string,
	text: string,
	itemRange: 'melee' | 'ranged'
): WeaponEffect | null {
	const range = weaponRangeFromText(text);
	if (range && range !== itemRange) return null;
	const attackBonus = Number(text.match(/\+(\d+)\s+bonus to attack rolls?/i)?.[1] ?? 0);
	const damageBonus = Number(text.match(/\+(\d+)\s+bonus to damage rolls?/i)?.[1] ?? 0);
	return attackBonus || damageBonus ? { key, name, attackBonus, damageBonus } : null;
}

function normalizeText(value: string) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

export function deriveWeaponEffects(
	item: InventoryItem,
	features: readonly WeaponFeature[],
	feats: readonly WeaponFeat[],
	inventory: readonly InventoryItem[]
): WeaponEffect[] {
	const range = weaponRange(item);
	const effects: { key: string; name: string; text: string }[] = features.map((feature) => ({
		key: feature.id,
		name: feature.name,
		text: feature.description
	}));
	for (const feat of feats) {
		const benefits = Array.isArray(feat.rules.benefits)
			? feat.rules.benefits.map(String).join(' ')
			: '';
		effects.push({
			key: `feat-${feat.id}`,
			name: feat.name,
			text: `${String(feat.rules.description ?? '')} ${benefits}`
		});
	}
	return effects.flatMap((effect) => {
		const name = normalizeText(effect.name);
		if (/archery|arquearia|estilo de luta.*arco/.test(name) && range === 'ranged')
			return [{ key: effect.key, name: effect.name, attackBonus: 2, damageBonus: 0 }];
		if (/dueling|duelo/.test(name) && range === 'melee') {
			const rules = JSON.stringify(item.rules);
			const twoHanded = /two.?handed|duas m[aã]os/i.test(rules);
			const anotherEquippedWeapon = inventory.some(
				(other) =>
					other !== item &&
					other.equipped &&
					String(other.rules.category ?? '').toLowerCase() === 'weapon'
			);
			return !twoHanded && !anotherEquippedWeapon
				? [{ key: effect.key, name: effect.name, attackBonus: 0, damageBonus: 2 }]
				: [];
		}
		const parsed = parseWeaponEffect(effect.key, effect.name, effect.text, range);
		return parsed ? [parsed] : [];
	});
}

export function selectedWeaponEffects(item: InventoryItem, effects: readonly WeaponEffect[]) {
	const enabled = Array.isArray(item.rules.enabledCombatModifiers)
		? item.rules.enabledCombatModifiers.map(String)
		: [];
	return effects.filter((effect) => enabled.includes(effect.key));
}

export function toggleWeaponEffect(item: InventoryItem, key: string): InventoryItem {
	const enabled = Array.isArray(item.rules.enabledCombatModifiers)
		? item.rules.enabledCombatModifiers.map(String)
		: [];
	const next = enabled.includes(key)
		? enabled.filter((itemKey) => itemKey !== key)
		: [...enabled, key];
	return { ...item, rules: { ...item.rules, enabledCombatModifiers: next } };
}

export function weaponAttackProfiles(item: InventoryItem): WeaponAttackProfile[] {
	return (Array.isArray(item.rules.attackProfiles) ? item.rules.attackProfiles : []).filter(
		(profile): profile is WeaponAttackProfile =>
			typeof profile === 'object' &&
			profile !== null &&
			typeof (profile as WeaponAttackProfile).id === 'string'
	);
}

export function updateWeaponProfile(
	item: InventoryItem,
	profileId: string,
	changes: Partial<WeaponAttackProfile>
): InventoryItem {
	const profiles = weaponAttackProfiles(item).map((profile) =>
		profile.id === profileId ? { ...profile, ...changes } : profile
	);
	return { ...item, rules: { ...item.rules, attackProfiles: profiles } };
}

export function addWeaponProfile(item: InventoryItem, profile: WeaponAttackProfile): InventoryItem {
	return {
		...item,
		rules: { ...item.rules, attackProfiles: [...weaponAttackProfiles(item), profile] }
	};
}

export function removeWeaponProfile(item: InventoryItem, profileId: string): InventoryItem {
	return {
		...item,
		rules: {
			...item.rules,
			attackProfiles: weaponAttackProfiles(item).filter((profile) => profile.id !== profileId)
		}
	};
}

export function updateInventoryItemRules(
	inventory: readonly InventoryItem[],
	item: InventoryItem,
	changes: Record<string, unknown>
): InventoryItem[] {
	const index = inventory.indexOf(item);
	if (index < 0) return [...inventory];
	return inventory.map((current, currentIndex) =>
		currentIndex === index ? { ...current, rules: { ...current.rules, ...changes } } : current
	);
}

export function weaponSupportsGreatWeaponFighting(item: InventoryItem): boolean {
	const rules = JSON.stringify(item.rules);
	return (
		/two.?handed|versatile|duas m[aã]os|vers[aá]til/i.test(rules) &&
		!/ammunition|ranged|range/i.test(rules)
	);
}

export function weaponBonusTotals(effects: readonly WeaponEffect[]) {
	return {
		attack: effects.reduce((total, effect) => total + effect.attackBonus, 0),
		damage: effects.reduce((total, effect) => total + effect.damageBonus, 0)
	};
}

export function weaponAttackBonusTotal(
	item: InventoryItem,
	abilityScores: AbilityScores,
	proficiencyBonus: number,
	effects: readonly WeaponEffect[]
): number {
	const ability = weaponAbility(item);
	return (
		Math.floor((abilityScores[ability] - 10) / 2) +
		(proficiencyBonus || 0) +
		weaponAttackSpecificBonus(item) +
		weaponItemBonus(item) +
		weaponBonusTotals(effects).attack
	);
}

export function weaponDamageBonusTotal(
	item: InventoryItem,
	abilityScores: AbilityScores,
	effects: readonly WeaponEffect[],
	includeWeaponDamageBonus = true
): number {
	const ability = weaponAbility(item);
	return (
		Math.floor((abilityScores[ability] - 10) / 2) +
		(includeWeaponDamageBonus ? weaponDamageSpecificBonus(item) : 0) +
		weaponItemBonus(item) +
		weaponBonusTotals(effects).damage
	);
}

export { modifierText };
