import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';

const normalized = (value: unknown) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

const modifier = (score: number) => Math.floor((Number(score || 10) - 10) / 2);

function armorExpression(rules: Record<string, unknown>) {
	return String(rules.ac ?? rules.armorClass ?? '').trim();
}

function numericBonus(rules: Record<string, unknown>, keys: string[]) {
	return keys.reduce((sum, key) => {
		const value = Number(rules[key]);
		return Number.isFinite(value) ? sum + value : sum;
	}, 0);
}

/** Calculates D&D 5e AC from equipped inventory without allowing stacked armor. */
export function calculateArmorClass(
	abilityScores: AbilityScores,
	className: string,
	inventory: InventoryItem[]
) {
	const dexterityModifier = modifier(abilityScores.dexterity);
	const equipped = inventory.filter((item) => item.equipped);
	const armors = equipped
		.map((item) => {
			const rawCategory = normalized(item.rules.category);
			const category =
				(
					{
						leve: 'light',
						light: 'light',
						media: 'medium',
						medio: 'medium',
						medium: 'medium',
						pesada: 'heavy',
						pesado: 'heavy',
						heavy: 'heavy'
					} as Record<string, string>
				)[rawCategory] ?? rawCategory;
			return { item, category, expression: armorExpression(item.rules) };
		})
		.filter(
			({ category, expression, item }) =>
				category === 'light' ||
				category === 'medium' ||
				category === 'heavy' ||
				(category === 'armor' && expression && !normalized(item.name).includes('shield'))
		);

	// If malformed/custom armor is equipped, use the strongest one instead of stacking suits.
	const armor = armors.sort((a, b) => {
		const base = (value: string) => Number(value.match(/^(\d+)/)?.[1] ?? 0);
		return base(b.expression) - base(a.expression);
	})[0];
	let total: number;
	if (armor) {
		const category = armor.category;
		const expression = armor.expression;
		const base = Number(expression.match(/^(\d+)/)?.[1] ?? armor.item.rules.armorClassBonus ?? 10);
		const capMatch = expression.match(/max\s*(?:dex(?:terity)?\s*)?(\d+)/i);
		const dexBonus =
			/dex/i.test(expression) || category === 'light' || category === 'medium'
				? category === 'medium' || capMatch
					? Math.min(dexterityModifier, Number(capMatch?.[1] ?? 2))
					: dexterityModifier
				: 0;
		total = base + dexBonus;
	} else {
		const classKey = normalized(className);
		const unarmoredBonus =
			classKey === 'barbarian' || classKey === 'barbaro'
				? modifier(abilityScores.constitution)
				: classKey === 'monk' || classKey === 'monge'
					? modifier(abilityScores.wisdom)
					: 0;
		total = 10 + dexterityModifier + unarmoredBonus;
	}

	const shield = equipped.find((item) => {
		const category = normalized(item.rules.category);
		return (
			category === 'shield' ||
			normalized(item.name).includes('shield') ||
			normalized(item.name).includes('escudo')
		);
	});
	if (shield) {
		const expression = armorExpression(shield.rules);
		total += Number(expression.match(/[+-]?\d+/)?.[0] ?? shield.rules.armorClassBonus ?? 2);
	}

	// Only explicit AC bonuses from equipped items are additive (e.g. +1 armor, cloak).
	total += equipped.reduce(
		(sum, item) =>
			sum + numericBonus(item.rules, ['acBonus', 'armorBonus', 'enhancementBonus', 'magicBonus']),
		0
	);
	return Math.max(0, Math.round(total));
}
