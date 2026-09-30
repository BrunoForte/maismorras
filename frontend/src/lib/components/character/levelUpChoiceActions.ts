export type LevelUpHPChoice = 'keep' | 'max' | 'roll';

/** Keeps the modal's button-to-choice contract explicit and independently testable. */
export function createLevelUpChoiceActions(onChoose: (choice: LevelUpHPChoice) => void) {
	return {
		keep: () => onChoose('keep'),
		max: () => onChoose('max'),
		roll: () => onChoose('roll')
	};
}
