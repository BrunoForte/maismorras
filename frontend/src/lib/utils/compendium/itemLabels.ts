const itemCategoryLabels: Record<string, string> = {
	'Simple Melee': 'Armas Simples Corpo a Corpo',
	'Simple Ranged': 'Armas Simples à Distância',
	'Martial Melee': 'Armas Marciais Corpo a Corpo',
	'Martial Ranged': 'Armas Marciais à Distância',
	Light: 'Armadura Leve',
	Medium: 'Armadura Média',
	Heavy: 'Armadura Pesada',
	Shield: 'Escudo'
};

const weaponPropertyLabels: Record<string, string> = {
	Loading: 'Recarga',
	Light: 'Leve',
	Finesse: 'Acuidade',
	Heavy: 'Pesada',
	Reach: 'Alcance',
	'Two-Handed': 'Duas Mãos'
};

function rawLabel(value: unknown): string {
	return String(value ?? '');
}

/** Localizes SRD item category labels for display without changing their canonical values. */
export function displayItemCategory(value: unknown, locale: string): string {
	const raw = rawLabel(value);
	return locale === 'pt-BR' ? (itemCategoryLabels[raw] ?? raw) : raw;
}

/** Localizes known weapon property names while preserving mechanical parameters verbatim. */
export function displayWeaponProperty(value: unknown, locale: string): string {
	const raw = rawLabel(value);
	if (locale !== 'pt-BR') return raw;
	if (weaponPropertyLabels[raw]) return weaponPropertyLabels[raw];

	const parameterized = raw.match(/^(Ammunition|Thrown|Versatile)\s*(\(.*\))$/);
	if (parameterized) {
		const labels: Record<string, string> = {
			Ammunition: 'Munição',
			Thrown: 'Arremesso',
			Versatile: 'Versátil'
		};
		return `${labels[parameterized[1]]} ${parameterized[2]}`;
	}

	return raw;
}

/** Returns display-only property labels, leaving the source array and values untouched. */
export function displayWeaponProperties(value: unknown, locale: string): string {
	const properties = Array.isArray(value) ? value : value == null ? [] : [value];
	return properties.map((property) => displayWeaponProperty(property, locale)).join(', ');
}
