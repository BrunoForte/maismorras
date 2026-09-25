declare module '@3d-dice/dice-box-threejs' {
	const DiceBox: new (
		selector: string,
		config: Record<string, unknown>
	) => {
		initialize(): Promise<unknown>;
		roll(notation: string): Promise<unknown> | unknown;
		add(notation: string): Promise<unknown> | unknown;
		reroll(diceIds: number[]): Promise<unknown> | unknown;
		swapDiceFace(die: Record<string, unknown>, result: number): void;
		diceList: Array<Record<string, unknown>>;
		clear(): void;
		renderer?: { render(scene: unknown, camera: unknown): void };
		scene?: unknown;
		camera?: unknown;
	};
	export default DiceBox;
}
