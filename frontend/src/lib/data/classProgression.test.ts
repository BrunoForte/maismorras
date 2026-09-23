import { describe, expect, it } from 'vitest';
import { isClassProgressionFeature } from './classProgression';

describe('isClassProgressionFeature', () => {
	it('excludes compendium skills from class progression', () => {
		expect(isClassProgressionFeature('feature', { catalog: 'skills' })).toBe(false);
	});

	it('keeps actual class features and ignores other compendium entry types', () => {
		expect(isClassProgressionFeature('feature', { catalog: 'class-features' })).toBe(true);
		expect(isClassProgressionFeature('skill', {})).toBe(false);
	});
});
