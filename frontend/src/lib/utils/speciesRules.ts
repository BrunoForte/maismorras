export type AppLocale = 'pt-BR' | 'en';

export type SpeciesProfile = {
	label: string;
	labelEn: string;
	speed: number;
	traits: readonly SpeciesTraitValue[];
	lineages?: Readonly<Record<string, readonly SpeciesTraitValue[]>>;
};

export type SpeciesTraitMetadata = {
	id: string;
	replaces?: readonly string[];
};
type SpeciesTraitValue = string | (SpeciesTraitMetadata & { name: string });

export type SpeciesDisplayTrait = {
	id?: string;
	replaces?: readonly string[];
	name: string;
	description: string;
};

export type SpeciesSelection = { species: string; speciesLineage?: string };
export type CatalogSpeciesText = {
	id?: string;
	name: string;
	description: string;
};

/** Reads user-facing species trait text from the shared SRD catalog translations. */
export function catalogSpeciesTraits(
	entry: {
		rules?: unknown;
		translations?: Record<string, string>;
	},
	locale: AppLocale
): CatalogSpeciesText[] {
	const rules = (entry.rules ?? {}) as { traits?: unknown };
	if (!Array.isArray(rules.traits)) return [];
	return rules.traits.map((raw, index) => {
		const trait = (raw ?? {}) as { id?: unknown; name?: unknown; description?: unknown };
		const sourceName = String(trait.name ?? '');
		const sourceDescription = String(trait.description ?? '');
		const name = entry.translations?.[`pt-BR.rules.traits.${index}.name`]?.trim();
		const description = entry.translations?.[`pt-BR.rules.traits.${index}.description`]?.trim();
		return {
			...(typeof trait.id === 'string' && trait.id.trim() ? { id: trait.id } : {}),
			name: locale === 'pt-BR' && name ? name : sourceName,
			description: locale === 'pt-BR' && description ? description : sourceDescription
		};
	});
}

// Species mechanics are shared by the profile UI and sheet progression so
// speed, traits, and hit-point adjustments always come from one catalog.
export const speciesProfiles: Readonly<Record<string, SpeciesProfile>> = {
	dragonborn: {
		label: 'Draconato',
		labelEn: 'Dragonborn',
		speed: 9,
		traits: [
			'Visão no escuro 18 m',
			'Arma de sopro (CON; usos = bônus de proficiência)',
			'Voo dracônico a partir do nível 5'
		],
		lineages: {
			'Negro (ácido)': ['Resistência a ácido', 'Sopro: ácido'],
			'Azul (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
			'Latão (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
			'Bronze (elétrico)': ['Resistência a elétrico', 'Sopro: elétrico'],
			'Cobre (ácido)': ['Resistência a ácido', 'Sopro: ácido'],
			'Ouro (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
			'Verde (veneno)': ['Resistência a veneno', 'Sopro: veneno'],
			'Vermelho (fogo)': ['Resistência a fogo', 'Sopro: fogo'],
			'Prata (frio)': ['Resistência a frio', 'Sopro: frio'],
			'Branco (frio)': ['Resistência a frio', 'Sopro: frio']
		}
	},
	dwarf: {
		label: 'Anão',
		labelEn: 'Dwarf',
		speed: 9,
		traits: [
			'Visão no escuro 36 m',
			'Resistência a veneno e vantagem contra Envenenado',
			'PV máximo +1 por nível (Robustez Anã)',
			'Conhecimento da Pedra'
		]
	},
	elf: {
		label: 'Elfo',
		labelEn: 'Elf',
		speed: 9,
		traits: [
			{ id: 'darkvision-elf', name: 'Visão no escuro 18 m' },
			'Ancestralidade feérica: vantagem contra Enfeitiçado',
			'Sentidos aguçados; Transe (Descanso Longo em 4 h)'
		],
		lineages: {
			Drow: [
				// D&D 2024 Character Origins says Drow Darkvision "increases to 120 feet".
				// This is an explicit replacement for Elf's 60-foot trait, not a name-based rule.
				// https://www.dndbeyond.com/sources/dnd/br-2024/character-origins
				{
					id: 'darkvision-drow',
					name: 'Visão no escuro 36 m',
					replaces: ['darkvision-elf']
				},
				'Luzes Dançantes; nível 3: Fogo das Fadas; nível 5: Escuridão'
			],
			'Alto Elfo': [
				'Prestidigitação (pode trocar por truque de mago após Descanso Longo)',
				'nível 3: Detectar Magia; nível 5: Passo Nebuloso'
			],
			'Elfo da Floresta': [
				'Deslocamento 10,5 m',
				'Arte Druídica; nível 3: Passo Longo; nível 5: Passos sem Pegadas'
			]
		}
	},
	gnome: {
		label: 'Gnomo',
		labelEn: 'Gnome',
		speed: 9,
		traits: [
			'Visão no escuro 18 m',
			'Astúcia Gnômica: vantagem em testes de resistência de INT, SAB e CAR'
		],
		lineages: {
			'Gnomo da Floresta': ['Ilusão Menor; Falar com Animais preparado'],
			'Gnomo da Rocha': ['Consertar e Prestidigitação; engenhoca mecânica']
		}
	},
	goliath: {
		label: 'Golias',
		labelEn: 'Goliath',
		speed: 10.5,
		traits: [
			'Forma Grande a partir do nível 5',
			'Porte Poderoso',
			'Escolha uma Ancestralidade Gigante (usos = bônus de proficiência)'
		],
		lineages: {
			Nuvem: ['Passo da Nuvem: teleporte 9 m como ação bônus'],
			Fogo: ['Queimadura do Fogo: +1d10 fogo ao acertar'],
			Gelo: ['Frio do Gelo: +1d6 frio e -3 m de deslocamento'],
			Colina: ['Tombamento da Colina: derruba alvo Grande ou menor'],
			Pedra: ['Resistência da Pedra: reação reduz dano em 1d12 + CON'],
			Tempestade: ['Trovão da Tempestade: reação, 1d8 trovão']
		}
	},
	halfling: {
		label: 'Halfling',
		labelEn: 'Halfling',
		speed: 9,
		traits: [
			'Corajoso: vantagem contra Amedrontado',
			'Sorte: rerrola 1 em d20',
			'Nimbleza Halfling',
			'Furtividade Natural'
		]
	},
	human: {
		label: 'Humano',
		labelEn: 'Human',
		speed: 9,
		traits: [
			'Versátil: um talento de origem',
			'Habilidoso: proficiência em uma perícia',
			'Recursivo: Inspiração Heroica após Descanso Longo'
		]
	},
	orc: {
		label: 'Orc',
		labelEn: 'Orc',
		speed: 9,
		traits: [
			'Visão no escuro 36 m',
			'Investida de Adrenalina',
			'Resistência Incansável: fica com 1 PV em vez de 0 (1/Descanso Longo)'
		]
	},
	tiefling: {
		label: 'Tiefling',
		labelEn: 'Tiefling',
		speed: 9,
		traits: ['Visão no escuro 18 m', 'Presença Sobrenatural: Taumaturgia'],
		lineages: {
			Abissal: [
				'Resistência a veneno',
				'Rajada Venenosa; nível 3: Raio de Enjoo; nível 5: Imobilizar Pessoa'
			],
			Ctônico: [
				'Resistência a necrótico',
				'Toque Gélido; nível 3: Vida Falsa; nível 5: Raio Enfraquecedor'
			],
			Infernal: [
				'Resistência a fogo',
				'Raio de Fogo; nível 3: Repreensão Infernal; nível 5: Escuridão'
			]
		}
	}
};

const speciesAliases: Readonly<Record<string, string>> = {
	draconato: 'dragonborn',
	anao: 'dwarf',
	elfo: 'elf',
	gnomo: 'gnome',
	golias: 'goliath',
	halfling: 'halfling',
	humano: 'human',
	orc: 'orc',
	tiefling: 'tiefling'
};

function normalizeText(value: unknown): string {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase()
		.trim();
}

export function normalizeSpecies(value: unknown): string {
	const normalized = normalizeText(value);
	return speciesAliases[normalized] ?? normalized;
}

export function getSpeciesProfile(species: unknown): SpeciesProfile | undefined {
	return speciesProfiles[normalizeSpecies(species)];
}

export function getSpeciesLineageOptions(species: unknown): string[] {
	return Object.keys(getSpeciesProfile(species)?.lineages ?? {});
}

export function normalizeSpeciesLineage(species: unknown, lineage: unknown): string {
	const options = getSpeciesLineageOptions(species);
	const requested = normalizeText(lineage);
	if (normalizeSpecies(species) === 'elf') {
		if (requested === 'wood elf') return 'Elfo da Floresta';
		if (requested === 'high elf') return 'Alto Elfo';
	}
	return options.find((option) => normalizeText(option) === requested) ?? '';
}

/** Returns a shallowly updated selection without dropping unrelated sheet data. */
export function updateSpeciesSelection<T extends SpeciesSelection>(
	sheet: T,
	species: string,
	lineage: string | undefined = sheet.speciesLineage
): T {
	return { ...sheet, species, speciesLineage: normalizeSpeciesLineage(species, lineage) };
}

export function getActiveSpeciesTraits(species: unknown, lineage: unknown): string[] {
	const profile = getSpeciesProfile(species);
	if (!profile) return [];
	const normalizedLineage = normalizeSpeciesLineage(species, lineage);
	return [
		...profile.traits,
		...(normalizedLineage ? (profile.lineages?.[normalizedLineage] ?? []) : [])
	].map((trait) => (typeof trait === 'string' ? trait : trait.name));
}

function profileTraitDisplayValue(
	trait: SpeciesTraitValue
): Pick<SpeciesDisplayTrait, 'id' | 'name' | 'replaces'> {
	return typeof trait === 'string' ? { name: trait } : trait;
}

/**
 * Applies only explicit, stable-ID replacement metadata to species presentation traits.
 * Traits without IDs or replacement declarations are always retained.
 */
export function resolveSpeciesTraitReplacements(
	traits: readonly SpeciesDisplayTrait[]
): SpeciesDisplayTrait[] {
	const byId = new Map<string, SpeciesDisplayTrait[]>();
	for (const trait of traits) {
		if (!trait.id) continue;
		const sameId = byId.get(trait.id) ?? [];
		sameId.push(trait);
		byId.set(trait.id, sameId);
	}

	// Stable IDs identify the same feature; choose identical-ID records deterministically.
	const selectedById = new Map<string, SpeciesDisplayTrait>();
	for (const [id, candidates] of byId) {
		selectedById.set(
			id,
			[...candidates].sort((a, b) =>
				`${a.name}\u0000${a.description}\u0000${(a.replaces ?? []).join(',')}`.localeCompare(
					`${b.name}\u0000${b.description}\u0000${(b.replaces ?? []).join(',')}`
				)
			)[0]
		);
	}
	const seenIds = new Set<string>();
	const uniqueTraits: SpeciesDisplayTrait[] = [];
	for (const trait of traits) {
		if (!trait.id) {
			uniqueTraits.push(trait);
			continue;
		}
		if (!seenIds.has(trait.id) && selectedById.get(trait.id) === trait) {
			seenIds.add(trait.id);
			uniqueTraits.push(trait);
		}
	}
	const replacedIds = new Set(
		uniqueTraits.flatMap((trait) => (trait.id ? (trait.replaces ?? []) : []))
	);
	return uniqueTraits.filter((trait) => !trait.id || !replacedIds.has(trait.id));
}

/** Builds the species panel from catalog traits plus selected lineage benefits. */
export function speciesTraitsForDisplay(
	species: unknown,
	lineage: unknown,
	catalogEntry: { rules?: unknown; translations?: Record<string, string> } | undefined,
	locale: AppLocale
): SpeciesDisplayTrait[] {
	const profile = getSpeciesProfile(species);
	const normalizedLineage = normalizeSpeciesLineage(species, lineage);
	const profileTraits = profile
		? [
				...profile.traits,
				...(normalizedLineage ? (profile.lineages?.[normalizedLineage] ?? []) : [])
			]
		: [];
	const profileDisplayTraits = profileTraits.map((value) => {
		const trait = profileTraitDisplayValue(value);
		return {
			...trait,
			description: speciesTraitDescription(trait.name, locale)
		};
	});
	const catalogTraits = catalogEntry ? catalogSpeciesTraits(catalogEntry, locale) : [];
	const lineageDisplayTraits = profileDisplayTraits.slice(profile?.traits.length ?? 0);
	const baseTraits = catalogEntry
		? [...catalogTraits, ...lineageDisplayTraits]
		: profileDisplayTraits;
	return resolveSpeciesTraitReplacements(baseTraits);
}

export function getSpeciesSpeed(species: unknown, lineage: unknown, fallback: number): number {
	const profile = getSpeciesProfile(species);
	if (!profile) return fallback;
	if (
		normalizeSpecies(species) === 'elf' &&
		normalizeSpeciesLineage(species, lineage) === 'Elfo da Floresta'
	) {
		return 10.5;
	}
	return profile.speed;
}

export function getSpeciesHPBonusPerLevel(species: unknown): number {
	return normalizeSpecies(species) === 'dwarf' ? 1 : 0;
}

export function getSpeciesHPBonus(species: unknown, level: number): number {
	return (
		getSpeciesHPBonusPerLevel(species) * Math.max(1, Number.isFinite(level) ? Math.floor(level) : 1)
	);
}

export function getSpeciesResistances(species: unknown, lineage: unknown): string[] {
	return getActiveSpeciesTraits(species, lineage)
		.filter((trait) => /resistência a /i.test(trait))
		.map((trait) => trait.replace(/^.*resistência a /i, '').split(' e ')[0]);
}

export function speciesProfileLabel(profile: SpeciesProfile, locale: AppLocale): string {
	return locale === 'en' ? profile.labelEn : profile.label;
}

export function speciesTraitDescription(trait: string, locale: AppLocale): string {
	const english = locale === 'en';
	if (/vis[aã]o no escuro|darkvision/i.test(trait))
		return english
			? 'You can see in dim light within the listed range as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.'
			: 'Você enxerga na penumbra dentro do alcance indicado como se fosse luz plena e, na escuridão, como se fosse penumbra. Na escuridão, não distingue cores, apenas tons de cinza.';
	if (/investida de adrenalina|adrenaline rush/i.test(trait))
		return english
			? 'As a bonus action, you can take the Dash action to move. You also gain temporary hit points equal to your proficiency bonus. You can use this a number of times equal to your proficiency bonus, regaining all uses after a Long Rest.'
			: 'Como uma ação bônus, você pode realizar a ação Disparada para se mover. Você também recebe pontos de vida temporários iguais ao seu bônus de proficiência. Pode usar este traço um número de vezes igual ao bônus de proficiência e recupera todos os usos após um Descanso Longo.';
	if (/resist[eê]ncia incans[aá]vel|relentless endurance/i.test(trait))
		return english
			? 'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. Once used, this trait returns after a Long Rest.'
			: 'Quando você é reduzido a 0 pontos de vida, mas não morre instantaneamente, pode ficar com 1 ponto de vida em vez disso. Após usar este traço, você só pode usá-lo novamente depois de um Descanso Longo.';
	if (/sorte|lucky/i.test(trait))
		return english
			? 'When you roll a 1 on a d20 test, you can reroll the die and must use the new roll.'
			: 'Quando obtém 1 em um teste com d20, você pode rolar o dado novamente e deve usar o novo resultado.';
	if (/arma de sopro|breath weapon/i.test(trait))
		return english
			? 'You exhale destructive energy in an area. The saving throw, damage, area, and uses are determined by your species rules and level.'
			: 'Você expele energia destrutiva em uma área. A salvaguarda, o dano, a área e a quantidade de usos seguem as regras da espécie e do nível.';
	if (/voo drac[oô]nico|draconic flight/i.test(trait))
		return english
			? 'Beginning at level 5, you can manifest spectral wings and gain a flying speed for a limited duration, according to the species feature.'
			: 'A partir do nível 5, você manifesta asas espectrais e recebe deslocamento de voo por uma duração limitada, conforme o traço da espécie.';
	if (/ancestralidade fe[eé]rica|fey ancestry/i.test(trait))
		return english
			? 'You have Advantage on saving throws you make to avoid or end the Charmed condition.'
			: 'Você tem vantagem nas salvaguardas feitas para evitar ou encerrar a condição Enfeitiçado.';
	return english
		? 'This trait is applied from the selected species or lineage. Consult its compendium entry for the complete rules text.'
		: 'Este traço é aplicado pela espécie ou linhagem selecionada. Consulte a entrada correspondente no compêndio para ver o texto completo das regras.';
}

/** Converts canonical metric speed to the display unit selected by the user. */
export function displayedSpeed(speed: number, locale: string): number {
	return locale === 'en' ? Math.round(speed * 3.28084) : speed;
}

/** Converts edited display speed back to canonical metric storage. */
export function storedSpeedFromDisplay(value: string, locale: string): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return locale === 'en' ? Math.round((parsed / 3.28084) * 10) / 10 : parsed;
}
