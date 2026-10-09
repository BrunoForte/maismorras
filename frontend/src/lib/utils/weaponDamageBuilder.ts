export type DamageComponent = { count: number | ''; sides: number | '' };

export const MAX_DAMAGE_DICE = 100;
export const DAMAGE_DIE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;

export function parseDamageExpression(value: unknown): DamageComponent[] | null {
	const text = String(value ?? '').replace(/\s+/g, '');
	if (!text) return [];
	const components: DamageComponent[] = [];
	let rest = text;
	while (rest) {
		const match = rest.match(/^(\d+)d(\d+)/i);
		if (!match) return null;
		components.push({ count: Number(match[1]), sides: Number(match[2]) });
		rest = rest.slice(match[0].length);
		if (rest.startsWith('+') && rest.length > 1) rest = rest.slice(1);
		else if (rest) return null;
	}
	return components;
}

export function parseLegacyDamage(value: unknown): { damage: string; damageBonus: number } | null {
	const text = String(value ?? '').replace(/\s+/g, '');
	const match = text.match(/^(\d+d\d+(?:\+\d+d\d+)*)(?:([+-])(\d+))?$/i);
	if (!match) return null;
	const components = parseDamageExpression(match[1]);
	const modifier = (match[2] === '-' ? -1 : 1) * Number(match[3] ?? 0);
	if (
		!components ||
		validateDamageComponents(components) ||
		!Number.isSafeInteger(modifier) ||
		Math.abs(modifier) > 10000
	)
		return null;
	return {
		damage: match[1],
		damageBonus: modifier
	};
}

export function validateDamageComponents(components: readonly DamageComponent[]) {
	let total = 0;
	for (let index = 0; index < components.length; index += 1) {
		const { count, sides } = components[index];
		if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > MAX_DAMAGE_DICE)
			return { index, message: 'Informe uma quantidade inteira entre 1 e 100.' };
		if (!Number.isInteger(sides) || Number(sides) < 2 || Number(sides) > 1000)
			return { index, message: 'Escolha um tipo de dado válido.' };
		total += Number(count);
		if (total > MAX_DAMAGE_DICE)
			return { index, message: 'O total de dados de dano não pode passar de 100.' };
	}
	return null;
}

export function validateDamageBonus(value: unknown) {
	const bonus = Number(value ?? 0);
	return Number.isSafeInteger(bonus) && Math.abs(bonus) <= 10000
		? null
		: 'O bônus de dano deve ser um inteiro entre -10000 e 10000.';
}

export function serializeDamageComponents(components: readonly DamageComponent[]) {
	return components.map(({ count, sides }) => `${count}d${sides}`).join('+');
}

export function addDamageComponent(components: readonly DamageComponent[]): DamageComponent[] {
	return [...components, { count: 1, sides: 6 }];
}

export function removeDamageComponent(
	components: readonly DamageComponent[],
	index: number
): DamageComponent[] {
	return components.filter((_, componentIndex) => componentIndex !== index);
}
