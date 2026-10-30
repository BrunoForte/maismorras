export type WeaponMasteryName =
	'Cleave' | 'Graze' | 'Nick' | 'Push' | 'Sap' | 'Slow' | 'Topple' | 'Vex';

export type WeaponMasteryInfo = {
	name: WeaponMasteryName;
	description: string;
	manualResolutionNote: string;
	referenceUrl: string;
};

export const WEAPON_MASTERY_REFERENCE_URL =
	'https://www.dndbeyond.com/sources/dnd/br-2024/equipment';

const descriptions: Record<WeaponMasteryName, { pt: string; en: string }> = {
	Cleave: {
		pt: 'Ao acertar uma criatura com um ataque corpo a corpo usando esta arma, você pode fazer um ataque corpo a corpo contra uma segunda criatura a até 1,5 m da primeira e também ao seu alcance. Se acertar, a segunda criatura sofre o dano da arma, sem o modificador de atributo, a menos que ele seja negativo. Este ataque extra só pode ocorrer uma vez por turno.',
		en: 'When you hit a creature with a melee attack using this weapon, you can make a melee attack with it against a second creature within 5 feet of the first and within your reach. On a hit, the second creature takes the weapon damage without your ability modifier unless that modifier is negative. This extra attack can occur only once per turn.'
	},
	Graze: {
		pt: 'Quando seu ataque com esta arma erra uma criatura, você pode causar dano a ela igual ao modificador do atributo usado no ataque. O dano é do mesmo tipo da arma e só aumenta se esse modificador aumentar.',
		en: 'When your attack with this weapon misses a creature, you can deal damage to it equal to the ability modifier used for the attack. The damage has the weapon’s damage type and can increase only if that modifier increases.'
	},
	Nick: {
		pt: 'Ao fazer o ataque extra da propriedade Leve, você pode fazê-lo como parte da ação Atacar, em vez de uma ação bônus. Esse ataque extra só pode ocorrer uma vez por turno.',
		en: 'When you make the extra attack granted by the Light property, you can make it as part of the Attack action instead of as a Bonus Action. This extra attack can occur only once per turn.'
	},
	Push: {
		pt: 'Ao acertar uma criatura com esta arma, você pode empurrá-la até 3 m em linha reta para longe de você, se ela for Grande ou menor.',
		en: 'When you hit a creature with this weapon, you can push it up to 10 feet straight away from yourself if it is Large or smaller.'
	},
	Sap: {
		pt: 'Ao acertar uma criatura com esta arma, ela tem desvantagem na próxima jogada de ataque que fizer antes do início do seu próximo turno.',
		en: 'When you hit a creature with this weapon, it has Disadvantage on its next attack roll before the start of your next turn.'
	},
	Slow: {
		pt: 'Ao acertar e causar dano a uma criatura com esta arma, você pode reduzir o deslocamento dela em 3 m até o início do seu próximo turno. Acertos adicionais com armas que tenham esta propriedade não aumentam a redução.',
		en: 'When you hit and damage a creature with this weapon, you can reduce its Speed by 10 feet until the start of your next turn. Additional hits with weapons that have this property don’t increase the reduction.'
	},
	Topple: {
		pt: 'Ao acertar uma criatura com esta arma, você pode forçá-la a fazer uma salvaguarda de Constituição (CD 8 + o modificador do atributo usado no ataque + seu bônus de proficiência). Se falhar, ela fica Caída.',
		en: 'When you hit a creature with this weapon, you can force it to make a Constitution saving throw (DC 8 + the ability modifier used for the attack + your Proficiency Bonus). On a failure, it has the Prone condition.'
	},
	Vex: {
		pt: 'Ao acertar e causar dano a uma criatura com esta arma, você tem vantagem na próxima jogada de ataque contra essa criatura antes do fim do seu próximo turno.',
		en: 'When you hit and damage a creature with this weapon, you have Advantage on your next attack roll against that creature before the end of your next turn.'
	}
};

const validMasteries = new Set<WeaponMasteryName>([
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex'
]);

/** Resolves canonical SRD mastery names for display without changing attack or damage rolls. */
export function weaponMasteryInfo(value: unknown, locale: string): WeaponMasteryInfo | null {
	const name = String(value ?? '').trim() as WeaponMasteryName;
	if (!validMasteries.has(name)) return null;
	const english = locale === 'en';
	return {
		name,
		description: descriptions[name][english ? 'en' : 'pt'],
		manualResolutionNote: english
			? 'Use only if one of your features unlocks this mastery for the weapon. This sheet does not verify targets, hit or miss, saving throws, or turn limits; check the requirements and resolve the effect manually after the roll.'
			: 'Use somente se uma característica sua liberar esta maestria para a arma. A ficha não verifica alvos, acerto ou erro, salvaguardas ou limites por turno; confira os requisitos e resolva o efeito manualmente após a rolagem.',
		referenceUrl: WEAPON_MASTERY_REFERENCE_URL
	};
}
