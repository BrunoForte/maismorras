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
		| 'duration-tier'
		| 'rule-text';
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
	text?: { en?: string; ptBR?: string };
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
		? value.filter(
				(item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
			)
		: [];
}

function damageLabel(component: SpellDamageComponent, locale: string): string {
	const names = locale === 'en' ? DAMAGE_EN : DAMAGE_PT;
	const type = Array.isArray(component.types)
		? component.types.map((item) => names[item] ?? item).join(locale === 'en' ? ', ' : ', ')
		: (names[component.type] ?? component.type);
	const trigger = component.trigger ? ` · ${triggerLabel(component.trigger, locale)}` : '';
	let label = `${component.formula} ${type}${trigger}`;
	if (component.instances && component.instances > 1) {
		label += locale === 'en' ? ` × ${component.instances}` : ` × ${component.instances}`;
	}
	if (component.explodingDice) {
		const maximum =
			component.explodingDice.maxAdditionalDice === 'spellcasting-ability-modifier'
				? locale === 'en'
					? 'spellcasting ability modifier'
					: 'modificador da habilidade de conjuração'
				: component.explodingDice.maxAdditionalDice;
		label +=
			locale === 'en'
				? `; on ${component.explodingDice.triggersOn}, roll another ${component.explodingDice.die}, up to ${maximum}`
				: `; ao obter ${component.explodingDice.triggersOn}, role outro ${component.explodingDice.die}, até ${maximum}`;
	}
	for (const extra of component.additional ?? []) {
		label +=
			locale === 'en'
				? `; plus ${extra.formula} ${names[extra.type] ?? extra.type}${extra.trigger ? ` (${triggerLabel(extra.trigger, locale)})` : ''}`
				: `; mais ${extra.formula} ${names[extra.type] ?? extra.type}${extra.trigger ? ` (${triggerLabel(extra.trigger, locale)})` : ''}`;
	}
	return label;
}

function triggerLabel(trigger: string, locale: string): string {
	const labels: Record<string, [string, string]> = {
		'initial-failed-save': ['na conjuração, em salvaguarda falha', 'on the initial failed save'],
		initial: ['na conjuração', 'initial effect'],
		'round-2': ['no 2º turno da tempestade', 'on storm turn 2'],
		'round-3': ['no 3º turno da tempestade', 'on storm turn 3'],
		'round-3-failed-save': ['no 3º turno, em salvaguarda falha', 'on turn 3, on a failed save'],
		'round-4': ['no 4º turno da tempestade', 'on storm turn 4'],
		'round-5-to-10': ['nos turnos 5 a 10', 'on turns 5–10'],
		'wave-round-1': ['na 1ª rodada após a onda surgir', 'on wave round 1'],
		'wave-round-2': ['na 2ª rodada após a onda surgir', 'on wave round 2'],
		'wave-round-3': ['na 3ª rodada após a onda surgir', 'on wave round 3'],
		'wave-round-4': ['na 4ª rodada após a onda surgir', 'on wave round 4'],
		'wave-round-5': ['na 5ª rodada após a onda surgir', 'on wave round 5'],
		'each-turn-before-detonation': [
			'a cada turno antes da detonação',
			'at each turn end before detonation'
		],
		'structure-collapse-failed-save': [
			'ao desabar estrutura, em salvaguarda falha',
			'on structure collapse, failed save'
		],
		'structure-per-turn': ['a estruturas, a cada turno', 'to structures, each turn'],
		'shunted-on-return': ['ao ser deslocado no retorno', 'when shunted on return'],
		'searing-light': ['ao falhar contra Luz Calcinante', 'on a failed save against Searing Light'],
		explosion: ['na explosão', 'on the explosion'],
		'random-ray': ['conforme o raio aleatório', 'according to the random ray'],
		layer: ['ao atravessar uma camada', 'when crossing a layer'],
		'death-effect': ['no efeito Morte do glifo', 'on the glyph’s Death effect'],
		'teleportation-mishap': ['em acidente de teletransporte', 'on a teleportation mishap'],
		'wave-rounds': ['nas rodadas da onda', 'on wave rounds'],
		'failed-repeat-save': ['em salvaguarda repetida falha', 'on a failed repeated save'],
		'target-over-100-hp': ['se o alvo tiver mais de 100 PV', 'if the target has more than 100 HP'],
		'per-5-feet-solid-matter': [
			'por 1,5 m atravessado em matéria sólida',
			'per 5 feet through solid matter'
		],
		'per-beam': ['por feixe', 'per beam'],
		'weapon-hit': ['ao acertar com arma', 'when a weapon hits'],
		'attack-hit': ['ao acertar com um ataque', 'when an attack hits'],
		'restrained-start-of-turn': [
			'no início do turno enquanto Impedido',
			'at the start of a turn while Restrained'
		],
		'burst-save-fail': ['na explosão, se falhar na salvaguarda', 'on the burst, on a failed save'],
		'automatic-hit': ['acerta automaticamente', 'hits automatically'],
		'fiend-or-undead': ['contra Corruptores ou Mortos-vivos', 'against Fiends or Undead'],
		'natural-weapon-hit': ['ao acertar com arma natural', 'when a natural weapon hits'],
		'melee-hit': ['quando atingido por ataque corpo a corpo', 'when hit by a melee attack'],
		'turn-or-entry': [
			'no início do turno ou ao entrar na área',
			'at the start of a turn or on entering the area'
		],
		'sting-hit': ['ao acertar com a ferroada', 'when the sting hits'],
		'web-bolt-hit': ['ao acertar com o disparo de teia', 'when the web bolt hits'],
		'rend-hit': ['ao acertar com Dilacerar', 'when Rend hits'],
		'breath-failed-save': [
			'ao falhar na salvaguarda contra o Sopro',
			'on a failed save against Breath'
		],
		'tiny-or-small-object-slam': [
			'impacto de objeto Minúsculo ou Pequeno',
			'Tiny or Small object Slam'
		],
		'large-object-slam': ['impacto de objeto Grande', 'Large object Slam'],
		'huge-object-slam': ['impacto de objeto Enorme', 'Huge object Slam'],
		'explosive-rune-failed-save': [
			'runa explosiva, em salvaguarda falha',
			'explosive rune, on a failed save'
		],
		'entered-area-save-fail': [
			'ao entrar na área e falhar na salvaguarda',
			'on entering the area and failing the save'
		],
		'start-of-turn': ['no início do turno', 'at the start of a turn'],
		'failed-save': ['em salvaguarda falha', 'on a failed save'],
		'failed-save-or-contact': [
			'em salvaguarda falha ou ao tocar a esfera',
			'on a failed save or touching the sphere'
		],
		'ray-hit': ['ao acertar com o raio', 'when a ray hits'],
		'melee-spell-attack-hit': [
			'ao acertar com ataque mágico corpo a corpo',
			'when a melee spell attack hits'
		],
		'fey-spirit-hit': ['ao acertar com o espírito feérico', 'when the Fey spirit hits'],
		'wall-appears-or-start-turn': [
			'quando a muralha surge ou no início do turno',
			'when the wall appears or at the start of a turn'
		],
		'moving-through-wall': ['ao atravessar a muralha', 'when moving through the wall'],
		'steed-slam-hit': ['ao acertar com o Impacto Sobrenatural', 'when Otherworldly Slam hits'],
		'animated-object-slam-medium-or-smaller': [
			'Pancada de objeto Médio ou menor',
			'Medium or smaller object Slam'
		],
		'animated-object-slam-large': ['Pancada de objeto Grande', 'Large object Slam'],
		'animated-object-slam-huge': ['Pancada de objeto Enorme', 'Huge object Slam']
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
			return en
				? `${levelText}: weapon damage die ${effect.die}`
				: `${levelText}: dado de dano da arma ${effect.die}`;
		case 'range-feet':
			return en
				? `${levelText}: range ${effect.feet} ft.`
				: `${levelText}: alcance ${effect.feet} pés`;
		case 'damage-increase':
			return `${
				en
					? `Slot ${effect.fromSlotLevel}+: +${effect.formula} ${names[String(effect.type)] ?? effect.type} per slot level`
					: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.formula} ${names[String(effect.type)] ?? effect.type} por nível do espaço`
			}${effect.componentTrigger ? ` (${triggerLabel(String(effect.componentTrigger), locale)})` : ''}`;
		case 'damage-increase-all-components':
			return en
				? `Slot ${effect.fromSlotLevel}+: all damage increases by ${effect.formula} per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: todo o dano aumenta em ${effect.formula} por nível do espaço`;
		case 'additional-instances':
			return en
				? `Slot ${effect.fromSlotLevel}+: ${effect.count} additional instance per slot level (${effect.componentFormula} ${names[String(effect.type)] ?? effect.type})`
				: `Espaço de nível ${effect.fromSlotLevel}+: ${effect.count} instância adicional por nível do espaço (${effect.componentFormula} ${names[String(effect.type)] ?? effect.type})`;
		case 'maximum-leaps-equals-slot-level':
			return en
				? 'At slot level 2+: maximum leaps equal the expended slot level'
				: 'Com espaço de nível 2+: o máximo de saltos é igual ao nível do espaço gasto';
		case 'additional-targets':
			return en
				? `Slot ${effect.fromSlotLevel}+: +${effect.count} target per slot level${effect.targetType ? ` (${effect.targetType})` : ''}`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.count} alvo por nível do espaço${effect.targetType ? ` (${effect.targetType === 'Beast' ? 'Besta' : effect.targetType})` : ''}`;
		case 'water-volume-or-cube-size':
			return en
				? `Slot ${effect.fromSlotLevel}+: +${effect.additionalGallons} gallons or +${effect.cubeSideFeet} ft. to Cube size per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.additionalGallons} galões ou +${effect.cubeSideFeet} pés no lado do Cubo por nível do espaço`;
		case 'healing-increase':
			return en
				? `Slot ${effect.fromSlotLevel}+: healing +${effect.formula} per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: cura +${effect.formula} por nível do espaço`;
		case 'temporary-hit-points-increase':
			return en
				? `Slot ${effect.fromSlotLevel}+: +${effect.amount} Temporary Hit Points per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: +${effect.amount} Pontos de Vida Temporários por nível do espaço`;
		case 'radius-increase':
			return en
				? `Slot ${effect.fromSlotLevel}+: radius +${effect.feet} ft. per slot level`
				: `Espaço de nível ${effect.fromSlotLevel}+: raio +${effect.feet} pés por nível do espaço`;
		case 'duration-tier':
			return en
				? `Slot ${effect.fromSlotLevel}+: duration up to ${effect.duration}`
				: `Espaço de nível ${effect.fromSlotLevel}+: duração de até ${durationLabel(String(effect.duration ?? ''), locale)}`;
		case 'rule-text': {
			const localizedText = effect.text as { en?: string; ptBR?: string } | undefined;
			const text = localizedText?.[en ? 'en' : 'ptBR'] ?? '';
			const slotText = en ? `Slot ${level}+:` : `Espaço de nível ${level}+:`;
			return text ? `${slotText} ${text}` : '';
		}
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
	const damage = (mechanics.damage?.components ?? []).map((component) =>
		damageLabel(component, locale)
	);
	const characterLevel = records(mechanics.scaling?.characterLevel)
		.flatMap((milestone) =>
			records(milestone.effects).map((effect) => ({ level: milestone.level, ...effect }))
		)
		.map((effect) => scalingLabel(effect, locale))
		.filter(Boolean);
	const spellSlot = records(mechanics.scaling?.spellSlot?.effects)
		.map((effect) => scalingLabel(effect, locale))
		.filter(Boolean);
	return { reviewed, damage, characterLevel, spellSlot };
}
