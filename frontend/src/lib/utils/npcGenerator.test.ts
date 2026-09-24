import { describe, expect, it } from 'vitest';
import { generateNPC, type NPCClass } from './npcGenerator';

describe('generateNPC', () => {
	it('preserva nome, PV e CA informados e não sorteia o nível', () => {
		const npc = generateNPC({
			className: 'guerreiro',
			level: 7,
			name: '  Guarda da ponte  ',
			hitPoints: 42,
			armorClass: 19,
			gender: 'feminino',
			random: () => 0
		});

		expect(npc).toMatchObject({
			className: 'guerreiro',
			level: 7,
			name: 'Guarda da ponte',
			hitPoints: 42,
			armorClass: 19,
			gender: 'feminino'
		});
		expect(npc.attack.name).toBe('Espada longa');
	});

	it('gera campos vazios conforme classe e nível', () => {
		const npc = generateNPC({ className: 'mago', level: 5, gender: 'masculino', random: () => 0 });

		expect(npc.level).toBe(5);
		expect(npc.name).toBe('Aldren');
		expect(npc.hitPoints).toBe(32);
		expect(npc.armorClass).toBe(13);
		expect(npc.attack).toMatchObject({
			name: 'Raio de fogo',
			toHit: 5,
			damage: '2d10+2 fogo'
		});
		expect(npc.abilities.constitution).toBe(14);
	});

	it('resolve unissex aleatoriamente entre nomes masculinos e femininos', () => {
		const masculine = generateNPC({
			className: 'ladino',
			level: 1,
			gender: 'unissex',
			random: () => 0
		});
		const feminine = generateNPC({
			className: 'ladino',
			level: 1,
			gender: 'unissex',
			random: () => 0.99
		});

		expect(masculine.gender).toBe('masculino');
		expect(masculine.name).toBe('Aldren');
		expect(feminine.gender).toBe('feminino');
		expect(feminine.name).toBe('Farya');
	});

	it('oferece ataque apropriado para as classes marciais e conjuradoras', () => {
		const samples: [NPCClass, string][] = [
			['guerreiro', 'Espada longa'],
			['ladino', 'Adaga'],
			['patrulheiro', 'Arco longo'],
			['bruxo', 'Rajada mística']
		];

		for (const [className, attack] of samples) {
			expect(generateNPC({ className, level: 1, random: () => 0 }).attack.name).toBe(attack);
		}
	});

	it('limita o nível ao intervalo explícito de 1 a 20', () => {
		expect(generateNPC({ className: 'guerreiro', level: 99, random: () => 0 }).level).toBe(20);
		expect(generateNPC({ className: 'guerreiro', level: 0, random: () => 0 }).level).toBe(1);
	});
});
