import { afterEach, describe, expect, it, vi } from 'vitest';
import { rolarDados } from './diceRoller';

afterEach(() => vi.restoreAllMocks());

describe('rolarDados', () => {
	it('calcula resultados determinísticos e modificador positivo', () => {
		vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);

		expect(rolarDados('2d6+3')).toEqual({
			expressao: '2d6+3',
			dados: [1, 6],
			modificador: 3,
			total: 10
		});
	});

	it('aceita modificador negativo e rejeita expressões perigosas ou inválidas', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		expect(rolarDados('1d20-2')).toMatchObject({ dados: [11], modificador: -2, total: 9 });
		expect(rolarDados('101d6')).toBeNull();
		expect(rolarDados('1d1001')).toBeNull();
		expect(rolarDados('texto')).toBeNull();
	});
});
