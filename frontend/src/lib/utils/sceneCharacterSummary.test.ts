import { describe, expect, it } from 'vitest';
import { parseHitPointInput } from './sceneCharacterSummary';

describe('parseHitPointInput', () => {
	it('treats signed values as relative damage or healing', () => {
		expect(parseHitPointInput('-10')).toEqual({ delta: -10 });
		expect(parseHitPointInput('+4')).toEqual({ delta: 4 });
	});

	it('treats unsigned values as the absolute current total', () => {
		expect(parseHitPointInput('12')).toEqual({ hpCurrent: 12 });
		expect(parseHitPointInput(' 8.9 ')).toEqual({ hpCurrent: 8 });
	});

	it('ignores empty and invalid input safely', () => {
		expect(parseHitPointInput('')).toBeNull();
		expect(parseHitPointInput('damage')).toBeNull();
	});
});
