// src/lib/utils/diceRoller.ts

export type ResultadoRolagem = {
	expressao: string;
	dados: number[];
	modificador: number;
	total: number;
	label?: string;
	channel?: 'chat' | 'combat';
	mode?: 'normal' | 'advantage' | 'disadvantage';
};

export function rolarDados(expressao: string): ResultadoRolagem | null {
	// Essa Regex procura por: (número) d (número) + ou - (número opcional)
	// Ex: 1d20+5, 2d6-1, 1d10
	const regex = /^(\d+)d(\d+)(?:([+-])(\d+))?$/i;

	// Removemos espaços em branco antes de analisar
	const match = expressao.replace(/\s/g, '').match(regex);
	if (!match) return null;

	const qtd = parseInt(match[1], 10);
	const faces = parseInt(match[2], 10);
	const sinal = match[3] || '+';
	const mod = parseInt(match[4] || '0', 10);

	// Protege a UI de expressões acidentais como 999999d999999.
	if (qtd < 1 || qtd > 100 || faces < 2 || faces > 1000) return null;

	const resultados = [];
	let somaDados = 0;

	// Rola cada dado individualmente
	for (let i = 0; i < qtd; i++) {
		const roll = Math.floor(Math.random() * faces) + 1;
		resultados.push(roll);
		somaDados += roll;
	}

	// Calcula o total com o modificador
	const total = sinal === '+' ? somaDados + mod : somaDados - mod;
	const modificadorFinal = sinal === '-' ? -mod : mod;

	return { expressao, dados: resultados, modificador: modificadorFinal, total };
}
