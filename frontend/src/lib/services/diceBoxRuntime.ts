export type DiceBoxDie = Record<string, unknown>;

export interface DiceBoxPort {
	roll: (notation: string) => Promise<unknown> | unknown;
	add: (notation: string) => Promise<unknown> | unknown;
	reroll: (diceIds: number[]) => Promise<unknown> | unknown;
	clear: () => void;
	diceList: DiceBoxDie[];
	swapDiceFace: (die: DiceBoxDie, result: number) => void;
	renderer?: { render: (scene: unknown, camera: unknown) => void };
	scene?: unknown;
	camera?: unknown;
}

export type DiceBoxRoll = {
	notation: string;
	dice: number[];
	color?: string;
	slot: string;
};

/** Animates server-authoritative results by remapping the visible face labels. */
export class DiceBoxRuntime {
	private persistentDice = new Map<string, DiceBoxDie[]>();

	constructor(private readonly box: DiceBoxPort) {}

	async playBatch(rolls: DiceBoxRoll[], mode: '3d-overlay' | '3d-table') {
		if (rolls.length === 0) return;
		if (mode === '3d-table') {
			await this.playPersistentBatch(rolls);
			return;
		}
		await this.box.roll(forcedDiceNotation(rolls));
	}

	clearTemporary() {
		this.box.clear();
	}

	private async playPersistentBatch(rolls: DiceBoxRoll[]) {
		const existing: Array<{ dice: DiceBoxDie[]; values: number[] }> = [];
		const additions: DiceBoxRoll[] = [];
		for (const roll of rolls) {
			const dice = this.persistentDice.get(roll.slot);
			if (dice?.length === roll.dice.length) existing.push({ dice, values: roll.dice });
			else additions.push(roll);
		}

		if (existing.length) {
			const dice = existing.flatMap((entry) => entry.dice);
			const values = existing.flatMap((entry) => entry.values);
			const ids = dice.map((die) => this.box.diceList.indexOf(die));
			if (ids.some((id) => id < 0)) throw new Error('Dado persistente não encontrado na mesa.');
			await this.box.reroll(ids);
			dice.forEach((die, index) => {
				this.box.swapDiceFace(die, values[index]);
				const storeResult = die['storeRolledValue'];
				if (typeof storeResult === 'function') storeResult.call(die, 'forced');
			});
			this.render();
		}

		if (additions.length) {
			const start = this.box.diceList.length;
			await this.box.add(forcedDiceNotation(additions));
			let cursor = start;
			for (const roll of additions) {
				const count = parseDiceTerms(roll.notation).reduce((sum, term) => sum + term.quantity, 0);
				const dice = this.box.diceList.slice(cursor, cursor + count);
				if (dice.length !== count)
					throw new Error('A animação não criou todos os dados esperados.');
				this.persistentDice.set(roll.slot, dice);
				cursor += count;
			}
		}
	}

	private render() {
		if (this.box.renderer && this.box.scene && this.box.camera) {
			this.box.renderer.render(this.box.scene, this.box.camera);
		}
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

type DiceTerm = { quantity: number; sides: number };

function normalizeDiceNotation(value: string): string | null {
	const compact = value.replace(/\s+/g, '').replace(/^d/i, '1d');
	if (!/^(?:\d*d(?:4|6|8|10|12|20|100))(?:[+-](?:\d*d(?:4|6|8|10|12|20|100)|\d+))*$/i.test(compact))
		return null;
	return compact.replace(/(^|[+-])d/gi, (_match, prefix: string) => `${prefix}1d`);
}

function parseDiceTerms(notation: string): DiceTerm[] {
	const normalized = normalizeDiceNotation(notation);
	if (!normalized) throw new Error(`Notação de dados 3D inválida: ${notation}`);
	return [...normalized.matchAll(/([+-]?)(\d*)d(4|6|8|10|12|20|100)/gi)].map((match) => ({
		quantity: Math.max(1, Number(match[2] || 1)),
		sides: Number(match[3])
	}));
}

function forcedDiceNotation(rolls: DiceBoxRoll[]): string {
	const formulas: string[] = [];
	const values: number[] = [];
	for (const roll of rolls) {
		const terms = parseDiceTerms(roll.notation);
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
