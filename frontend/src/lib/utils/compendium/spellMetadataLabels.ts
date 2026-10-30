export type CanonicalSpellSchool =
	| 'Abjuration'
	| 'Conjuration'
	| 'Divination'
	| 'Enchantment'
	| 'Evocation'
	| 'Illusion'
	| 'Necromancy'
	| 'Transmutation';

export type CanonicalClassId =
	| 'barbarian'
	| 'bard'
	| 'cleric'
	| 'druid'
	| 'fighter'
	| 'monk'
	| 'paladin'
	| 'ranger'
	| 'rogue'
	| 'sorcerer'
	| 'warlock'
	| 'wizard';

export const SPELL_SCHOOL_LABELS_PT_BR: Record<CanonicalSpellSchool, string> = {
	Abjuration: 'Abjuração',
	Conjuration: 'Conjuração',
	Divination: 'Adivinhação',
	Enchantment: 'Encantamento',
	Evocation: 'Evocação',
	Illusion: 'Ilusão',
	Necromancy: 'Necromancia',
	Transmutation: 'Transmutação'
};

export const CLASS_LABELS_PT_BR: Record<CanonicalClassId, string> = {
	barbarian: 'Bárbaro',
	bard: 'Bardo',
	cleric: 'Clérigo',
	druid: 'Druida',
	fighter: 'Guerreiro',
	monk: 'Monge',
	paladin: 'Paladino',
	ranger: 'Patrulheiro',
	rogue: 'Ladino',
	sorcerer: 'Feiticeiro',
	warlock: 'Bruxo',
	wizard: 'Mago'
};

export function spellSchoolLabel(value: unknown, locale: string): string {
	const canonical = String(value ?? '');
	if (locale !== 'pt-BR') return canonical;
	return SPELL_SCHOOL_LABELS_PT_BR[canonical as CanonicalSpellSchool] ?? canonical;
}

export function spellClassLabel(value: unknown, locale: string): string {
	const canonical = String(value ?? '');
	const classId = canonical.toLowerCase() as CanonicalClassId;
	if (!(classId in CLASS_LABELS_PT_BR)) return canonical;
	if (locale !== 'pt-BR') return `${classId[0].toUpperCase()}${classId.slice(1)}`;
	return CLASS_LABELS_PT_BR[classId] ?? canonical;
}
