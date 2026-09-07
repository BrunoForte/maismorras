import type { AbilityScores, CharacterResource, SpellSlot } from '$lib/services/characterApi';

type ClassData = { hitDice: string; subclasses: string[]; features: Record<number, string[]> };
const levels = (one: string, two = '', three = ''): Record<number, string[]> => {
	const result: Record<number, string[]> = { 1: [one], 4: ['Melhoria de Atributo / Talento'], 5: ['Ataque Extra ou melhoria de classe'], 8: ['Melhoria de Atributo / Talento'], 12: ['Melhoria de Atributo / Talento'], 16: ['Melhoria de Atributo / Talento'], 19: ['Benção Épica'] };
	if (two) result[2] = [two];
	if (three) result[3] = [three, 'Subclasse'];
	return result;
};

export const classData: Record<string, ClassData> = {
	barbarian: { hitDice: '1d12', subclasses: ['Path of the Berserker'], features: levels('Fúria, Defesa sem Armadura e Maestria em Armas', 'Ataque Imprudente e Sentido de Perigo', 'Conhecimento Primitivo') },
	bard: { hitDice: '1d8', subclasses: ['College of Lore'], features: levels('Conjuração e Inspiração Bárdica', 'Especialização e Pau para Toda Obra', 'Subclasse Bárdica') },
	cleric: { hitDice: '1d8', subclasses: ['Life Domain'], features: levels('Conjuração e Ordem Divina', 'Canalizar Divindade', 'Subclasse Clerical') },
	druid: { hitDice: '1d8', subclasses: ['Circle of the Land'], features: levels('Conjuração, Idioma Druídico e Forma Selvagem', 'Companheiro Selvagem', 'Subclasse Druídica') },
	fighter: { hitDice: '1d10', subclasses: ['Champion'], features: levels('Estilo de Luta, Segundo Fôlego e Maestria em Armas', 'Surto de Ação', 'Subclasse Marcial') },
	monk: { hitDice: '1d8', subclasses: ['Warrior of the Open Hand'], features: levels('Defesa sem Armadura e Foco do Monge', 'Movimento sem Armadura e Ataque Desarmado', 'Subclasse Monástica') },
	paladin: { hitDice: '1d10', subclasses: ['Oath of Devotion'], features: levels('Imposição das Mãos e Maestria em Armas', 'Conjuração e Estilo de Luta', 'Subclasse Paladina') },
	ranger: { hitDice: '1d10', subclasses: ['Hunter'], features: levels('Inimigo Favorecido e Maestria em Armas', 'Conjuração e Estilo de Luta', 'Subclasse de Patrulheiro') },
	rogue: { hitDice: '1d8', subclasses: ['Thief'], features: levels('Ataque Furtivo, Especialização e Linguagem de Ladrões', 'Ação Ardilosa', 'Subclasse Ladina') },
	sorcerer: { hitDice: '1d6', subclasses: ['Draconic Sorcery'], features: levels('Conjuração e Feitiçaria Inata', 'Fonte de Magia e Pontos de Feitiçaria', 'Metamágica e Subclasse') },
	warlock: { hitDice: '1d8', subclasses: ['Fiend Patron'], features: levels('Magia de Pacto e Invocações Místicas', 'Magia de Pacto melhorada', 'Subclasse de Bruxo') },
	wizard: { hitDice: '1d6', subclasses: ['Evoker'], features: levels('Conjuração, Recuperação Arcana e Ritualista', 'Erudito', 'Subclasse de Mago') }
};

export const canonicalClass = (value: string) => ({ bárbaro: 'barbarian', barbaro: 'barbarian', bardo: 'bard', clérigo: 'cleric', clerigo: 'cleric', druida: 'druid', guerreiro: 'fighter', monge: 'monk', paladino: 'paladin', patrulheiro: 'ranger', ladino: 'rogue', feiticeiro: 'sorcerer', bruxo: 'warlock', mago: 'wizard' } as Record<string, string>)[value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()] ?? value.toLowerCase().trim();

export function classFeatures(className: string, level: number, subclass: string) {
	const data = classData[canonicalClass(className)]; if (!data) return [];
	const result = Object.entries(data.features).filter(([at]) => Number(at) <= level).flatMap(([at, features]) => features.map((name) => ({ level: Number(at), name })));
	if (subclass && level >= 3) result.push({ level: 3, name: subclass });
	return result;
}
export function defaultResources(className: string, level: number, scores: AbilityScores): CharacterResource[] {
	const key = canonicalClass(className); const pb = Math.ceil(level / 4) + 1; const cha = Math.max(1, Math.floor((scores.charisma - 10) / 2));
	const item = (id: string, name: string, max: number, rest: 'short' | 'long') => ({ id, name, current: max, max, restoreOn: rest });
	if (key === 'barbarian') return [item('rage', 'Fúria', pb, 'long')];
	if (key === 'bard') return [item('bardic-inspiration', 'Inspiração Bárdica', cha, level >= 5 ? 'short' : 'long')];
	if (key === 'cleric' && level >= 2) return [item('channel-divinity', 'Canalizar Divindade', 2, 'short')];
	if (key === 'druid') return [item('wild-shape', 'Forma Selvagem', 2, 'long')];
	if (key === 'fighter') return [item('second-wind', 'Segundo Fôlego', 2, 'short'), ...(level >= 2 ? [item('action-surge', 'Surto de Ação', 1, 'short')] : [])];
	if (key === 'monk') return [item('focus-points', 'Pontos de Foco', level, 'short')];
	if (key === 'paladin') return [item('lay-on-hands', 'Imposição das Mãos', level * 5, 'long')];
	if (key === 'sorcerer' && level >= 2) return [item('sorcery-points', 'Pontos de Feitiçaria', level, 'long')];
	if (key === 'warlock') return [item('pact-slots', 'Espaços de Magia de Pacto', level < 2 ? 1 : level < 11 ? 2 : level < 17 ? 3 : 4, 'short')];
	if (key === 'wizard') return [item('arcane-recovery', 'Recuperação Arcana', 1, 'long')];
	return [];
}
export function spellSlots(className: string, level: number): SpellSlot[] {
	const full = ['bard','cleric','druid','sorcerer','wizard'].includes(canonicalClass(className)); const half = ['paladin','ranger'].includes(canonicalClass(className));
	const casterLevel = full ? level : half ? Math.ceil(level / 2) : 0;
	const table = [[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]][casterLevel - 1] ?? [];
	return table.map((max, index) => ({ level: index + 1, current: max, max }));
}
