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
