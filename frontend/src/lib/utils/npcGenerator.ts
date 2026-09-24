export type NPCClass =
	| 'barbaro'
	| 'bardo'
	| 'clerigo'
	| 'druida'
	| 'feiticeiro'
	| 'guerreiro'
	| 'ladino'
	| 'mago'
	| 'monge'
	| 'paladino'
	| 'patrulheiro'
	| 'bruxo';
export type NPCGender = 'masculino' | 'feminino' | 'unissex';

export type NPCGenerationInput = {
	className: NPCClass;
	level: number;
	name?: string;
	hitPoints?: number | null;
	armorClass?: number | null;
	gender?: NPCGender;
	random?: () => number;
};

export type GeneratedNPC = {
	className: NPCClass;
	level: number;
	name: string;
	hitPoints: number;
	armorClass: number;
	gender: Exclude<NPCGender, 'unissex'>;
	abilities: {
		strength: number;
		dexterity: number;
		constitution: number;
		intelligence: number;
		wisdom: number;
		charisma: number;
	};
	attack: { name: string; toHit: number; range: string; damage: string; description: string };
};

const profiles: Record<
	NPCClass,
	{
		hitDie: number;
		ability: 'strength' | 'dexterity' | 'wisdom' | 'charisma' | 'intelligence';
		ac: [number, number, number];
		attacks: {
			name: string;
			ability: 'strength' | 'dexterity' | 'wisdom' | 'charisma' | 'intelligence';
			range: string;
			die: number;
			damageType: string;
			ranged?: boolean;
		}[];
	}
> = {
	barbaro: {
		hitDie: 12,
		ability: 'strength',
		ac: [14, 15, 16],
		attacks: [
			{
				name: 'Machado grande',
				ability: 'strength',
				range: '1,5 m',
				die: 12,
				damageType: 'cortante'
			}
		]
	},
	bardo: {
		hitDie: 8,
		ability: 'dexterity',
		ac: [13, 14, 15],
		attacks: [
			{ name: 'Florete', ability: 'dexterity', range: '1,5 m', die: 8, damageType: 'perfurante' },
			{
				name: 'Arco curto',
				ability: 'dexterity',
				range: '24/96 m',
				die: 6,
				damageType: 'perfurante',
				ranged: true
			}
		]
	},
	clerigo: {
		hitDie: 8,
		ability: 'strength',
		ac: [16, 17, 18],
		attacks: [
			{ name: 'Maça', ability: 'strength', range: '1,5 m', die: 6, damageType: 'concussão' }
		]
	},
	druida: {
		hitDie: 8,
		ability: 'wisdom',
		ac: [13, 14, 15],
		attacks: [
			{ name: 'Cajado', ability: 'strength', range: '1,5 m', die: 6, damageType: 'concussão' },
			{
				name: 'Rajada de espinhos',
				ability: 'wisdom',
				range: '9 m',
				die: 6,
				damageType: 'perfurante',
				ranged: true
			}
		]
	},
	feiticeiro: {
		hitDie: 6,
		ability: 'charisma',
		ac: [12, 13, 14],
		attacks: [
			{
				name: 'Raio de fogo',
				ability: 'charisma',
				range: '36 m',
				die: 10,
				damageType: 'fogo',
				ranged: true
			}
		]
	},
	guerreiro: {
		hitDie: 10,
		ability: 'strength',
		ac: [16, 17, 18],
		attacks: [
			{ name: 'Espada longa', ability: 'strength', range: '1,5 m', die: 8, damageType: 'cortante' },
			{
				name: 'Lança',
				ability: 'strength',
				range: '1,5 m ou 6/18 m',
				die: 6,
				damageType: 'perfurante'
			}
		]
	},
	ladino: {
		hitDie: 8,
		ability: 'dexterity',
		ac: [14, 15, 16],
		attacks: [
			{
				name: 'Adaga',
				ability: 'dexterity',
				range: '1,5 m ou 6/18 m',
				die: 4,
				damageType: 'perfurante'
			},
			{
				name: 'Besta leve',
				ability: 'dexterity',
				range: '24/96 m',
				die: 8,
				damageType: 'perfurante',
				ranged: true
			}
		]
	},
	mago: {
		hitDie: 6,
		ability: 'intelligence',
		ac: [12, 13, 14],
		attacks: [
			{
				name: 'Raio de fogo',
				ability: 'intelligence',
				range: '36 m',
				die: 10,
				damageType: 'fogo',
				ranged: true
			}
		]
	},
	monge: {
		hitDie: 8,
		ability: 'dexterity',
		ac: [14, 15, 16],
		attacks: [
			{ name: 'Bastão', ability: 'dexterity', range: '1,5 m', die: 6, damageType: 'concussão' }
		]
	},
	paladino: {
		hitDie: 10,
		ability: 'strength',
		ac: [16, 17, 18],
		attacks: [
			{
				name: 'Martelo de guerra',
				ability: 'strength',
				range: '1,5 m',
				die: 8,
				damageType: 'concussão'
			},
			{ name: 'Espada longa', ability: 'strength', range: '1,5 m', die: 8, damageType: 'cortante' }
		]
	},
	patrulheiro: {
		hitDie: 10,
		ability: 'dexterity',
		ac: [14, 15, 16],
		attacks: [
			{
				name: 'Arco longo',
				ability: 'dexterity',
				range: '45/180 m',
				die: 8,
				damageType: 'perfurante',
				ranged: true
			},
			{
				name: 'Espadas curtas',
				ability: 'dexterity',
				range: '1,5 m',
				die: 6,
				damageType: 'perfurante'
			}
		]
	},
	bruxo: {
		hitDie: 8,
		ability: 'charisma',
		ac: [12, 13, 14],
		attacks: [
			{
				name: 'Rajada mística',
				ability: 'charisma',
				range: '36 m',
				die: 10,
				damageType: 'força',
				ranged: true
			}
		]
	}
};

const names = {
	masculino: ['Aldren', 'Borin', 'Cael', 'Darian', 'Eron', 'Garrik'],
	feminino: ['Althea', 'Brina', 'Celeste', 'Dagna', 'Elora', 'Farya']
};
const abilityScores = { strength: 16, dexterity: 14, wisdom: 14, charisma: 14, intelligence: 14 };
const mod = (score: number) => Math.floor((score - 10) / 2);

export function generateNPC(input: NPCGenerationInput): GeneratedNPC {
	const random = input.random ?? Math.random;
	const profile = profiles[input.className];
	const requestedLevel = Number.isFinite(input.level) ? Math.trunc(input.level) : 1;
	const level = Math.min(20, Math.max(1, requestedLevel));
	const gender =
		input.gender === 'unissex' || !input.gender
			? random() < 0.5
				? 'masculino'
				: 'feminino'
			: input.gender;
	const proficiency = 2 + Math.floor((level - 1) / 4);
	const attackOptions = profile.attacks;
	const attack = attackOptions[Math.floor(random() * attackOptions.length)] ?? attackOptions[0];
	const attackBonus = proficiency + mod(abilityScores[attack.ability]);
	const damageBonus = mod(abilityScores[attack.ability]);
	const hitPoints = profile.hitDie + 2 + (level - 1) * (Math.floor(profile.hitDie / 2) + 1 + 2);
	const acTier = level >= 11 ? 2 : level >= 5 ? 1 : 0;
	const generatedName =
		names[gender][Math.floor(random() * names[gender].length)] ?? names[gender][0];

	return {
		className: input.className,
		level,
		name: input.name?.trim() || generatedName,
		hitPoints: input.hitPoints && input.hitPoints > 0 ? Math.trunc(input.hitPoints) : hitPoints,
		armorClass:
			input.armorClass != null && input.armorClass > 0
				? Math.trunc(input.armorClass)
				: profile.ac[acTier],
		gender,
		abilities: {
			strength: abilityScores.strength,
			dexterity: abilityScores.dexterity,
			constitution: 14,
			intelligence: abilityScores.intelligence,
			wisdom: abilityScores.wisdom,
			charisma: abilityScores.charisma
		},
		attack: {
			name: attack.name,
			toHit: proficiency + mod(abilityScores[attack.ability]),
			range: attack.range,
			damage: `${level >= 17 && attack.ranged && attack.die === 10 ? 4 : level >= 11 && attack.ranged && attack.die === 10 ? 3 : level >= 5 && attack.ranged && attack.die === 10 ? 2 : 1}d${attack.die}${damageBonus >= 0 ? '+' : ''}${damageBonus} ${attack.damageType}`,
			description: `${input.className} de nível ${level}; bônus de ataque ${attackBonus}.`
		}
	};
}
