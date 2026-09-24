export function hasWeaponProficiency(
	proficiencies: readonly string[],
	weaponName: string,
	weaponCategory: string
): boolean {
	const category = weaponCategory.trim().toLowerCase();
	const name = weaponName.trim().toLowerCase();
	return proficiencies.some((entry) => {
		const proficiency = entry.trim().toLowerCase();
		if (proficiency.includes('simple') && category.includes('simple')) return true;
		if (proficiency.includes('martial') && category.includes('martial')) return true;
		return proficiency === name;
	});
}

const weaponAliases: Record<string, string[]> = {
	shortsword: ['shortsword', 'espada curta'],
	longsword: ['longsword', 'espada longa'],
	shortbow: ['shortbow', 'arco curto'],
	longbow: ['longbow', 'arco longo'],
	dagger: ['dagger', 'adaga'],
	rapier: ['rapier', 'rapieira'],
	spear: ['spear', 'lança'],
	quarterstaff: ['quarterstaff', 'bordão'],
	warhammer: ['warhammer', 'martelo de guerra'],
	battleaxe: ['battleaxe', 'machado de batalha'],
	handaxe: ['handaxe', 'machadinha'],
	maul: ['maul', 'malho'],
	flail: ['flail', 'mangual'],
	trident: ['trident', 'tridente'],
	greatsword: ['greatsword', 'espadão'],
	greataxe: ['greataxe', 'machado grande'],
	mace: ['mace', 'maça'],
	club: ['club', 'clava'],
	'light crossbow': ['light crossbow', 'besta leve'],
	'heavy crossbow': ['heavy crossbow', 'besta pesada'],
	'hand crossbow': ['hand crossbow', 'besta de mão']
};

function normalize(value: string) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase()
		.trim();
}

/** Checks prose-backed subclass grants, including English SRD names on localized sheets. */
export function hasWeaponProficiencyInText(
	text: string,
	weaponName: string,
	weaponCategory: string
): boolean {
	const description = normalize(text);
	const name = normalize(weaponName);
	const category = normalize(weaponCategory);
	if (
		(category.includes('martial') || category.includes('marcial')) &&
		/\bmartial weapons?\b|\barmas marciais\b/.test(description)
	)
		return true;
	if (
		(category.includes('simple') || category.includes('simples')) &&
		/\bsimple weapons?\b|\barmas simples\b/.test(description)
	)
		return true;
	const aliases = Object.values(weaponAliases).find((values) =>
		values.some((value) => normalize(value) === name)
	);
	return (aliases ?? [weaponName]).some((alias) => description.includes(normalize(alias)));
}
