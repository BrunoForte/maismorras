export type DiceBoxDie = Record<string, unknown>;

export interface DiceBoxPort {
	roll: (notation: string, options?: { themeColor?: string }) => Promise<unknown> | unknown;
	add: (notation: string, options?: { themeColor?: string }) => Promise<unknown> | unknown;
	reroll: (
		die: DiceBoxDie | DiceBoxDie[],
		options?: { remove?: boolean; newStartPoint?: boolean }
	) => Promise<unknown> | unknown;
	clear: () => void;
	getRollResults?: () => Array<{ rolls?: DiceBoxDie[] }>;
}

export type DiceBoxRoll = {
	notation: string;
	color?: string;
	slot: string;
};

/** Feeds complete multi-die results to DiceBox, preserving the table in persistent mode. */
export class DiceBoxRuntime {
	private persistentDice = new Map<string, DiceBoxDie[]>();

	constructor(private readonly box: DiceBoxPort) {}

	async playBatch(rolls: DiceBoxRoll[], mode: '3d-overlay' | '3d-table') {
		if (rolls.length === 0) return;
		if (mode === '3d-table') {
			await Promise.all(rolls.map((roll) => this.playPersistent(roll)));
			return;
		}

		const operations = rolls.map((roll, index) => {
			const options = roll.color ? { themeColor: roll.color } : undefined;
			return index === 0
				? this.box.roll(roll.notation, options)
				: this.box.add(roll.notation, options);
		});
		await Promise.all(operations);
	}

	clearTemporary() {
		this.box.clear();
	}

	private async playPersistent(roll: DiceBoxRoll) {
		const previous = this.persistentDice.get(roll.slot);
		if (previous?.length) {
			// Reuse the physical dice where they stopped; DiceBox otherwise chooses a
			// fresh launch point on every reroll.
			await this.box.reroll(previous, { remove: true, newStartPoint: false });
			const result = this.lastRollDice();
			if (result.length) this.persistentDice.set(roll.slot, result);
			return;
		}

		await this.box.add(roll.notation, roll.color ? { themeColor: roll.color } : undefined);
		const result = this.lastRollDice();
		if (result.length) this.persistentDice.set(roll.slot, result);
	}

	private lastRollDice(): DiceBoxDie[] {
		const results = this.box.getRollResults?.();
		return results?.at(-1)?.rolls ?? [];
	}
}

export function diceNotation(result: {
	notation?: string;
	expression: string;
	dice: number[];
}): string {
	const candidate =
		result.notation?.trim() ||
		result.expression.match(/\b\d*d(?:4|6|8|10|12|20|100)(?:[+-]\d+)?\b/i)?.[0];
	if (candidate && /^\d*d(?:4|6|8|10|12|20|100)(?:[+-]\d+)?$/i.test(candidate)) {
		return candidate.startsWith('d') ? `1${candidate}` : candidate;
	}
	const dieCount = Math.max(1, result.dice.length);
	return `${dieCount}d20`;
}
