export interface DiceBoxPort {
	roll: (notation: string) => Promise<unknown> | unknown;
	clearDice?: () => void;
	clear?: () => void;
}

export type DiceBoxRoll = {
	notation: string;
	dice: number[];
};

/** Filters reactive re-renders so a roll is animated at most once per event nonce. */
export function unseenDiceRolls<T extends { nonce?: string; expression: string; total: number }>(
	rolls: T[],
	seen: Set<string>
): T[] {
	return rolls.filter((roll) => {
		const id = roll.nonce ?? `${roll.expression}-${roll.total}`;
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

/** Animates temporary dice using results already calculated by the server. */
export class DiceBoxRuntime {
	constructor(private readonly box: DiceBoxPort) {}

	async playBatch(rolls: DiceBoxRoll[]) {
		if (rolls.length > 0) await this.box.roll(forcedDiceNotation(rolls));
	}

	clearTemporary() {
		if (this.box.clearDice) this.box.clearDice();
		else this.box.clear?.();
	}
}

export function diceNotation(result: {
	notation?: string;
	expression: string;
	dice: number[];
}): string {
	const candidate =
		result.notation?.trim() || result.expression.match(/[+-]?\d*d\d+(?:[+-]\d+)*/i)?.[0];
	const normalized = normalizeDiceNotation(candidate ?? '');
	if (normalized) return normalized;
	const dieCount = Math.max(1, result.dice.length);
	return `${dieCount}d20`;
}

function normalizeDiceNotation(value: string): string | null {
	const compact = value.replace(/\s+/g, '').replace(/^d/i, '1d');
	if (!/^(?:\d*d(?:4|6|8|10|12|20|100))(?:[+-](?:\d*d(?:4|6|8|10|12|20|100)|\d+))*$/i.test(compact))
		return null;
	return compact.replace(/(^|[+-])d/gi, (_match, prefix: string) => `${prefix}1d`);
}

function forcedDiceNotation(rolls: DiceBoxRoll[]): string {
	const formulas: string[] = [];
	const values: number[] = [];
	for (const roll of rolls) {
		const terms = [...roll.notation.matchAll(/([+-]?)(\d*)d(4|6|8|10|12|20|100)/gi)].map(
			(match) => ({
				quantity: Math.max(1, Number(match[2] || 1)),
				sides: Number(match[3])
			})
		);
		const expected = terms.reduce((sum, term) => sum + term.quantity, 0);
		if (expected !== roll.dice.length) {
			throw new Error(
				`A rolagem ${roll.notation} não corresponde aos valores recebidos do servidor.`
			);
		}
		let index = 0;
		for (const term of terms) {
			for (let die = 0; die < term.quantity; die++) {
				const value = roll.dice[index++];
				if (!Number.isInteger(value) || value < 1 || value > term.sides) {
					throw new Error(`O resultado recebido não cabe em um d${term.sides}.`);
				}
				values.push(value);
			}
			formulas.push(`${term.quantity}d${term.sides}`);
		}
	}
	return `${formulas.join('+')}@${values.join(',')}`;
}
