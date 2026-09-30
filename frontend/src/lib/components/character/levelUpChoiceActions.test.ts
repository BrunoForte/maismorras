import { describe, expect, it, vi } from 'vitest';
import { createLevelUpChoiceActions } from './levelUpChoiceActions';

describe('createLevelUpChoiceActions', () => {
	it.each(['keep', 'max', 'roll'] as const)('dispatches the %s choice', (choice) => {
		const onChoose = vi.fn();
		const actions = createLevelUpChoiceActions(onChoose);

		actions[choice]();

		expect(onChoose).toHaveBeenCalledExactlyOnceWith(choice);
	});
});
