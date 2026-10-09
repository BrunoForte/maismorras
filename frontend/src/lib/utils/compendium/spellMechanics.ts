export type SpellDamageComponent = {
	formula: string;
	type: string;
	types?: string[];
	trigger?: string;
	instances?: number;
	additional?: Array<{ formula: string; type: string; trigger?: string }>;
	explodingDice?: {
		die: string;
		triggersOn: number;
		maxAdditionalDice: string;
	};
};

export type CharacterLevelSpellEffect = {
	level: number;
	effects: Array<{
		kind: 'damage-formula' | 'beam-count' | 'weapon-damage-die' | 'range-feet' | 'extra-damage';
		formula?: string;
		type?: string;
		count?: number;
		die?: string;
		feet?: number;
	}>;
};

export type SpellSlotSpellEffect = {
	kind:
		| 'damage-increase'
		| 'damage-increase-all-components'
		| 'additional-instances'
		| 'maximum-leaps-equals-slot-level'
		| 'additional-targets'
		| 'water-volume-or-cube-size'
		| 'healing-increase'
		| 'temporary-hit-points-increase'
		| 'radius-increase'
		| 'duration-tier';
	fromSlotLevel: number;
	everySlotLevels?: number;
	formula?: string;
	type?: string;
	count?: number;
	targetType?: string;
	componentFormula?: string;
	additionalGallons?: number;
	cubeSideFeet?: number;
	choice?: string;
	feet?: number;
	amount?: number;
	duration?: string;
	componentTrigger?: string;
};

export type SpellMechanicsRules = {
	mechanicsAudit?: { status?: string; source?: string };
	damage?: { components?: SpellDamageComponent[] } | null;
	scaling?: {
		characterLevel?: CharacterLevelSpellEffect[];
		spellSlot?: { baseLevel: number; effects: SpellSlotSpellEffect[] };
	} | null;
};

export type SpellMechanicsPresentation = {
	reviewed: boolean;
	damage: string[];
	characterLevel: string[];
	spellSlot: string[];
};

const DAMAGE_PT: Record<string, string> = {
	acid: 'ácido',
	bludgeoning: 'contundente',
	cold: 'frio',
	fire: 'fogo',
	force: 'energia',
	lightning: 'elétrico',
	necrotic: 'necrótico',
	piercing: 'perfurante',
	poison: 'venenoso',
	psychic: 'psíquico',
	radiant: 'radiante',
	slashing: 'cortante',
	thunder: 'trovejante',
	'weapon-normal': 'tipo normal da arma',
	varies: 'à escolha indicada pela magia'
};

const DAMAGE_EN: Record<string, string> = {
	acid: 'Acid',
	bludgeoning: 'Bludgeoning',
	cold: 'Cold',
	fire: 'Fire',
	force: 'Force',
	lightning: 'Lightning',
	necrotic: 'Necrotic',
	piercing: 'Piercing',
	poison: 'Poison',
	psychic: 'Psychic',
	radiant: 'Radiant',
	slashing: 'Slashing',
	thunder: 'Thunder',
	'weapon-normal': 'the weapon’s normal type',
	varies: 'the type allowed by the spell'
};

function records(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
		: [];
}

function damageLabel(component: SpellDamageComponent, locale: string): string {
	const names = locale === 'en' ? DAMAGE_EN : DAMAGE_PT;
	const type = Array.isArray(component.types)
		? component.types.map((item) => names[item] ?? item).join(locale === 'en' ? ', ' : ', ')
		: names[component.type] ?? component.type;
	const trigger = component.trigger
		? ` · ${triggerLabel(component.trigger, locale)}`
		: '';
	let label = `${component.formula} ${type}${trigger}`;
	if (component.instances && component.instances > 1) {
		label += locale === 'en' ? ` × ${component.instances}` : ` × ${component.instances}`;
	}
	if (component.explodingDice) {
		const maximum = component.explodingDice.maxAdditionalDice === 'spellcasting-ability-modifier'
			? locale === 'en'
				? 'spellcasting ability modifier'
				: 'modificador da habilidade de conjuração'
			: component.explodingDice.maxAdditionalDice;
		label += locale === 'en'
			? `; on ${component.explodingDice.triggersOn}, roll another ${component.explodingDice.die}, up to ${maximum}`
			: `; ao obter ${component.explodingDice.triggersOn}, role outro ${component.explodingDice.die}, até ${maximum}`;
	}
	for (const extra of component.additional ?? []) {
		label += locale === 'en'
			? `; plus ${extra.formula} ${names[extra.type] ?? extra.type}${extra.trigger ? ` (${triggerLabel(extra.trigger, locale)})` : ''}`
			: `; mais ${extra.formula} ${names[extra.type] ?? extra.type}${extra.trigger ? ` (${triggerLabel(extra.trigger, locale)})` : ''}`;
	}
	return label;
}

function triggerLabel(trigger: string, locale: string): string {
	const labels: Record<string, [string, string]> = {
		'per-beam': ['por feixe', 'per beam'],
		'weapon-hit': ['ao acertar com arma', 'when a weapon hits'],
		'attack-hit': ['ao acertar com um ataque', 'when an attack hits'],
		'restrained-start-of-turn': ['no início do turno enquanto Impedido', 'at the start of a turn while Restrained'],
		'burst-save-fail': ['na explosão, se falhar na salvaguarda', 'on the burst, on a failed save'],
		'automatic-hit': ['acerta automaticamente', 'hits automatically'],
		'fiend-or-undead': ['contra Corruptores ou Mortos-vivos', 'against Fiends or Undead']
	};
	return labels[trigger]?.[locale === 'en' ? 1 : 0] ?? trigger;
}

function durationLabel(duration: string, locale: string): string {
	if (locale === 'en') return duration;
	return duration.replace(/\bhours?\b/g, 'horas').replace(/\bminutes?\b/g, 'minutos');
}

function scalingLabel(effect: Record<string, unknown>, locale: string): string {
	const en = locale === 'en';
	const level = Number(effect.level ?? effect.fromSlotLevel);
	const levelText = en ? `Level ${level}` : `Nível ${level}`;
	const kind = String(effect.kind ?? '');
	const names = en ? DAMAGE_EN : DAMAGE_PT;
	switch (kind) {
		case 'damage-formula':
			return `${levelText}: ${effect.formula} ${names[String(effect.type)] ?? effect.type ?? ''}`.trim();
		case 'extra-damage':
			return en
				? `${levelText}: extra ${effect.formula} ${names[String(effect.type)] ?? effect.type}`
				: `${levelText}: ${effect.formula} adicional ${names[String(effect.type)] ?? effect.type}`;
		case 'beam-count':
			return en ? `${levelText}: ${effect.count} beams` : `${levelText}: ${effect.count} feixes`;
		case 'weapon-damage-die':
			return en ? `${levelText}: weapon damage die ${effect.die}` : `${levelText}: dado de dano da arma ${effect.die}`;
		case 'range-feet':
			return en ? `${levelText}: range ${effect.feet} ft.` : `${levelText}: alcance ${effect.feet} pés`;
		case 'damage-increase':
			return `${en
				? `Slot ${effect.fromSlotLevel}+: +${effect.formula} ${names[String(effect.type)] ?? effect.type} per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.formula} ${names[String(effect.type)] ?? effect.type} por nível do espaço`}${effect.componentTrigger ? ` (${triggerLabel(String(effect.componentTrigger), locale)})` : ''}`;
		case 'damage-increase-all-components':
			return en
				? `Slot ${effect.fromSlotLevel}+: all damage increases by ${effect.formula} per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: todo o dano aumenta em ${effect.formula} por nível do espaço`;
		case 'additional-instances':
			return en
				? `Slot ${effect.fromSlotLevel}+: ${effect.count} additional instance per slot level (${effect.componentFormula} ${names[String(effect.type)] ?? effect.type})`
				: `Espaço de nível ${effect.fromSlotLevel}+: ${effect.count} instância adicional por nível do espaço (${effect.componentFormula} ${names[String(effect.type)] ?? effect.type})`;
		case 'maximum-leaps-equals-slot-level':
			return en ? 'At slot level 2+: maximum leaps equal the expended slot level' : 'Com espaço de nível 2+: o máximo de saltos é igual ao nível do espaço gasto';
		case 'additional-targets':
			return en
				? `Slot ${effect.fromSlotLevel}+: +${effect.count} target per slot level${effect.targetType ? ` (${effect.targetType})` : ''}`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.count} alvo por nível do espaço${effect.targetType ? ` (${effect.targetType === 'Beast' ? 'Besta' : effect.targetType})` : ''}`;
		case 'water-volume-or-cube-size':
			return en
				? `Slot ${effect.fromSlotLevel}+: +${effect.additionalGallons} gallons or +${effect.cubeSideFeet} ft. to Cube size per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.additionalGallons} galões ou +${effect.cubeSideFeet} pés no lado do Cubo por nível do espaço`;
		case 'healing-increase':
			return en ? `Slot ${effect.fromSlotLevel}+: healing +${effect.formula} per slot level` : `Espaço de nível ${effect.fromSlotLevel}+: cura +${effect.formula} por nível do espaço`;
		case 'temporary-hit-points-increase':
			return en ? `Slot ${effect.fromSlotLevel}+: +${effect.amount} Temporary Hit Points per slot level` : `Espaço de nível ${effect.fromSlotLevel}+: +${effect.amount} Pontos de Vida Temporários por nível do espaço`;
		case 'radius-increase':
			return en ? `Slot ${effect.fromSlotLevel}+: radius +${effect.feet} ft. per slot level` : `Espaço de nível ${effect.fromSlotLevel}+: raio +${effect.feet} pés por nível do espaço`;
		case 'duration-tier':
			return en ? `Slot ${effect.fromSlotLevel}+: duration up to ${effect.duration}` : `Espaço de nível ${effect.fromSlotLevel}+: duração de até ${durationLabel(String(effect.duration ?? ''), locale)}`;
		default:
			return '';
	}
}

export function presentSpellMechanics(
	rules: Record<string, unknown> | undefined,
	locale: string
): SpellMechanicsPresentation {
	const mechanics = (rules ?? {}) as SpellMechanicsRules;
	const reviewed = mechanics.mechanicsAudit?.status === 'reviewed';
	if (!reviewed) return { reviewed: false, damage: [], characterLevel: [], spellSlot: [] };
	const damage = (mechanics.damage?.components ?? []).map((component) => damageLabel(component, locale));
	const characterLevel = records(mechanics.scaling?.characterLevel)
		.flatMap((milestone) => records(milestone.effects).map((effect) => ({ level: milestone.level, ...effect })))
		.map((effect) => scalingLabel(effect, locale))
		.filter(Boolean);
	const spellSlot = records(mechanics.scaling?.spellSlot?.effects)
		.map((effect) => scalingLabel(effect, locale))
		.filter(Boolean);
	return { reviewed, damage, characterLevel, spellSlot };
}
