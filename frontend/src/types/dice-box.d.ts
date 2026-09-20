declare module '@3d-dice/dice-box' {
	const DiceBox: new (config: Record<string, unknown>) => {
		init(): Promise<unknown>;
		roll(notation: string, options?: Record<string, unknown>): unknown;
		add(notation: string, options?: Record<string, unknown>): unknown;
		reroll?(die: Record<string, unknown>, options?: Record<string, unknown>): unknown;
		getRollResults?(): Array<{ rolls?: Array<Record<string, unknown>> }>;
		clear?(): void;
	};
	export default DiceBox;
}
