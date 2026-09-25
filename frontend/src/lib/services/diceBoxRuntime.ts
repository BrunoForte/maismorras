export type DiceBoxDie = Record<string, unknown>;

export interface DiceBoxPort {
	roll: (notation: string) => Promise<unknown> | unknown;
	add: (notation: string) => Promise<unknown> | unknown;
	reroll: (diceIds: number[]) => Promise<unknown> | unknown;
	clearDice?: () => void;
	clear?: () => void;
	diceList: DiceBoxDie[];
	swapDiceFace: (die: DiceBoxDie, result: number) => void;
	renderer?: { render: (scene: unknown, camera: unknown) => void };
	scene?: unknown;
	camera?: unknown;
}

type Vector3Port = {
	x: number;
	y: number;
	z: number;
	set: (x: number, y: number, z: number) => void;
};
type PhysicsBodyPort = {
	position: Vector3Port;
	velocity: Vector3Port;
	angularVelocity: Vector3Port;
	type: number;
	sleepState?: number;
	wakeUp?: () => void;
	updateMassProperties?: () => void;
};
type PersistentDiePort = DiceBoxDie & {
	position?: Vector3Port;
	shape?: string;
	notation?: { type?: string };
	body?: PhysicsBodyPort;
	geometry?: {
		boundingSphere?: { radius: number };
		computeBoundingSphere?: () => void;
	};
	result?: Array<{ value?: number }>;
	storeRolledValue?: (reason: string) => void;
};

export type DiceBoxRoll = {
	notation: string;
	dice: number[];
	color?: string;
	slot: string;
};

export function randomDiceThrow(random: () => number = Math.random) {
	return {
		velocity: {
			x: (random() - 0.5) * 1200,
			y: (random() - 0.5) * 1200,
			z: 650 + random() * 500
		},
		spin: {
			x: (random() - 0.5) * 90,
			y: (random() - 0.5) * 90,
			z: (random() - 0.5) * 90
		}
	};
}

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

/** Animates server-authoritative results by remapping the visible face labels. */
export class DiceBoxRuntime {
	private persistentDice = new Map<string, DiceBoxDie[]>();

	constructor(private readonly box: DiceBoxPort) {}

	getPersistentDice() {
		return [...this.persistentDice.entries()].flatMap(([slot, dice]) =>
			dice.map((die) => ({ die, slot }))
		);
	}

	getDieDetails(die: DiceBoxDie) {
		const item = die as PersistentDiePort;
		item.geometry?.computeBoundingSphere?.();
		const radius = item.geometry?.boundingSphere?.radius ?? 32;
		const notation = item.notation?.type ?? item.shape ?? 'd20';
		const sides = Number(notation.match(/\d+/)?.[0] ?? 20);
		return {
			position: item.body?.position ?? item.position,
			radius,
			sides,
			value: item.result?.at(-1)?.value ?? null
		};
	}

	movePersistentDie(die: DiceBoxDie, x: number, y: number) {
		const item = die as PersistentDiePort;
		const body = item.body;
		if (!body || !item.position) return false;
		body.type = 4; // Cannon ES Body.KINEMATIC
		body.velocity.set(0, 0, 0);
		body.angularVelocity.set(0, 0, 0);
		body.position.set(x, y, body.position.z);
		item.position.x = x;
		item.position.y = y;
		return true;
	}

	releasePersistentDie(die: DiceBoxDie) {
		const item = die as PersistentDiePort;
		const body = item.body;
		if (!body) return;
		const Body = body.constructor as { DYNAMIC?: number };
		body.type = Body.DYNAMIC ?? 1; // Cannon ES Body.DYNAMIC
		body.updateMassProperties?.();
		body.velocity.set(0, 0, 0);
		body.angularVelocity.set(0, 0, 0);
		body.wakeUp?.();
	}

	async throwPersistentDie(die: DiceBoxDie, velocity: { x: number; y: number }) {
		const item = die as PersistentDiePort;
		const body = item.body;
		const id = this.box.diceList.indexOf(die);
		if (!body || id < 0) throw new Error('Não foi possível pegar este dado.');

		// reroll starts its animation synchronously; replace its default impulse
		// before the next animation frame with the direction of the pointer flick.
		const animation = this.box.reroll([id]);
		const Body = body.constructor as { DYNAMIC?: number };
		body.type = Body.DYNAMIC ?? 1; // Cannon ES Body.DYNAMIC
		body.updateMassProperties?.();
		body.sleepState = 0;
		body.wakeUp?.();
		body.velocity.set(velocity.x, velocity.y, 1200);
		const speed = Math.hypot(velocity.x, velocity.y);
		const spin = Math.min(75, Math.max(25, speed / 18));
		const direction = speed > 0 ? { x: velocity.x / speed, y: velocity.y / speed } : { x: 1, y: 0 };
		body.angularVelocity.set(-direction.y * spin, direction.x * spin, (Math.random() - 0.5) * spin);
		await animation;
	}

	private applyRandomThrow(die: DiceBoxDie) {
		const body = (die as PersistentDiePort).body;
		if (!body) return;
		body.type = (body.constructor as { DYNAMIC?: number }).DYNAMIC ?? 1;
		body.updateMassProperties?.();
		body.wakeUp?.();
		const impulse = randomDiceThrow();
		body.velocity.set(impulse.velocity.x, impulse.velocity.y, impulse.velocity.z);
		body.angularVelocity.set(impulse.spin.x, impulse.spin.y, impulse.spin.z);
	}

	setAuthoritativeDieFace(die: DiceBoxDie, value: number) {
		this.box.swapDiceFace(die, value);
		const item = die as PersistentDiePort;
		item.storeRolledValue?.('forced');
		this.render();
	}

	async playBatch(rolls: DiceBoxRoll[], mode: '3d-overlay' | '3d-table') {
		if (rolls.length === 0) return;
		if (mode === '3d-table') {
			await this.playPersistentBatch(rolls);
			return;
		}
		await this.box.roll(forcedDiceNotation(rolls));
	}

	clearTemporary() {
		if (this.box.clearDice) this.box.clearDice();
		else this.box.clear?.();
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
			const animation = this.box.reroll(ids);
			dice.forEach((die) => this.applyRandomThrow(die));
			await animation;
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
