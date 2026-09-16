declare module '@3d-dice/dice-box' {
	type DiceBoxOptions = Record<string, unknown>;
	class DiceBox {
		constructor(target: Element | string, options: DiceBoxOptions);
		init(): Promise<unknown>;
		roll(notation: string): unknown;
		clear(): void;
	}
	export default DiceBox;
}
