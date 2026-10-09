export type InventoryCategory = 'all' | 'weapon' | 'armor' | 'consumable' | 'tool' | 'gear';
export type InventoryOptionGroup = 'weapon' | 'armor' | 'shield' | 'equipment' | 'tool' | 'other';
export type AbilityKey =
	'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export type EquipmentLike = {
	name: string;
	rules: Record<string, unknown>;
};

const abilityKeys = new Set<AbilityKey>([
	'strength',
	'dexterity',
	'constitution',
	'intelligence',
	'wisdom',
	'charisma'
]);

/** UI catalog classification only; mechanical values remain server-authoritative. */
export function equipmentCategory(item: EquipmentLike): InventoryCategory {
	const category = String(item.rules.category ?? '');
	if (['weapon', 'armor', 'consumable', 'tool', 'gear'].includes(category))
		return category as InventoryCategory;
	const catalog = String(item.rules.catalog ?? '').toLowerCase();
	if (catalog === 'weapons' || item.rules.damage) return 'weapon';
	if (catalog === 'armor' || item.rules.ac || item.rules.armorClass) return 'armor';
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

/** Visual compendium picker grouping built from the same item metadata as inventory rules. */
export function inventoryOptionGroup(item: EquipmentLike): InventoryOptionGroup {
	const rawCategory = String(item.rules.category ?? '')
		.trim()
		.toLowerCase();
	const catalog = String(item.rules.catalog ?? '')
		.trim()
		.toLowerCase();
	const name = item.name.toLowerCase();
	if (rawCategory === 'shield' || catalog === 'shields' || /\b(shield|escudo)s?\b/.test(name))
		return 'shield';
	if (equipmentCategory(item) === 'weapon') return 'weapon';
	if (equipmentCategory(item) === 'armor') return 'armor';
	if (equipmentCategory(item) === 'tool') return 'tool';
	if (
		['consumable', 'gear'].includes(rawCategory) ||
		['equipment', 'equipamento', 'gear', 'consumables'].includes(catalog) ||
		equipmentCategory(item) === 'consumable'
	)
		return 'equipment';
	return 'other';
}

export function weaponRange(item: EquipmentLike): 'melee' | 'ranged' {
	const type = `${String(item.rules.attackType ?? '')} ${String(item.rules.category ?? '')} ${String(item.rules.range ?? '')}`;
	return /ranged|à distância|distancia|arco|besta|zarabatana/i.test(`${type} ${item.name}`)
		? 'ranged'
		: 'melee';
}

export function weaponAbility(item: EquipmentLike): AbilityKey {
	const configured = String(item.rules.attackAbility ?? '') as AbilityKey;
	if (abilityKeys.has(configured)) return configured;
	return weaponRange(item) === 'ranged' ? 'dexterity' : 'strength';
}

export function weaponItemBonus(item: EquipmentLike): number {
	const enchantment = Number(item.rules.enchantmentBonus) || 0;
	if (item.rules.attackBonus !== undefined || item.rules.damageBonus !== undefined)
		return enchantment;
	const legacyBonus = Number(item.rules.bonus) || 0;
	if (item.rules.bonus !== undefined || item.rules.enchantmentBonus !== undefined)
		return legacyBonus + enchantment;
	const description = `${String(item.rules.description ?? '')} ${String(item.rules.summary ?? '')}`;
	const match = description.match(/\+(\d+)\s+bonus to attack rolls? and damage rolls?/i);
	return match ? Number(match[1]) : 0;
}

export function weaponAttackSpecificBonus(item: EquipmentLike): number {
	return Number(item.rules.attackBonus) || 0;
}

export function weaponDamageSpecificBonus(item: EquipmentLike): number {
	return Number(item.rules.damageBonus) || 0;
}

export function itemWeight(item: EquipmentLike & { quantity: number }): number {
	const weight = Number.parseFloat(String(item.rules.weight ?? 0));
	return Number.isFinite(weight)
		? Math.max(0, weight) * Math.max(0, Number(item.quantity) || 0)
		: 0;
}

export function weaponRangeFromText(text: string): 'melee' | 'ranged' | null {
	if (/ranged weapons?|à distância/i.test(text)) return 'ranged';
	if (/melee weapons?|corpo a corpo/i.test(text)) return 'melee';
	return null;
}

export function modifierText(value: number): string {
	return `${value >= 0 ? '+' : ''}${value}`;
}
