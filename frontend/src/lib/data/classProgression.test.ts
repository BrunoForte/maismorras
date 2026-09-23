import { describe, expect, it } from 'vitest';
import {
	defaultResources,
	isClassProgressionFeature,
	recoverResourcesOnRest,
	syncResourceMaxima
} from './classProgression';

const scores = {
	strength: 10,
	dexterity: 10,
	constitution: 10,
	intelligence: 10,
	wisdom: 10,
	charisma: 10
};

describe('isClassProgressionFeature', () => {
	it('excludes compendium skills from class progression', () => {
		expect(isClassProgressionFeature('feature', { catalog: 'skills' })).toBe(false);
	});

	it('keeps actual class features and ignores other compendium entry types', () => {
		expect(isClassProgressionFeature('feature', { catalog: 'class-features' })).toBe(true);
		expect(isClassProgressionFeature('skill', {})).toBe(false);
	});
});

describe('class resource progression', () => {
	it.each([
		['barbarian', 2, 2],
		['barbarian', 3, 3],
		['barbarian', 17, 6],
		['cleric', 2, 2],
		['cleric', 18, 4],
		['druid', 17, 4],
		['fighter', 1, 2],
		['fighter', 4, 3],
		['fighter', 17, 5]
	])('calculates %s resource maximum at class level %i', (className, level, expected) => {
		const resource = defaultResources(className, level, scores)[0];
		expect(resource.max).toBe(expected);
	});

	it('preserves current uses and a manual maximum override across level changes', () => {
		const resource = defaultResources('fighter', 4, scores)[0];
		const [updated] = syncResourceMaxima(defaultResources('fighter', 10, scores), [
			{ ...resource, current: 2, max: 7, maxOverride: 7 }
		]);
		expect(updated.max).toBe(7);
		expect(updated.current).toBe(2);
	});

	it('returns to the calculated maximum when the override is absent and clamps current uses', () => {
		const [updated] = syncResourceMaxima(defaultResources('fighter', 4, scores), [
			{ ...defaultResources('fighter', 17, scores)[0], current: 5 }
		]);
		expect(updated.max).toBe(3);
		expect(updated.current).toBe(3);
	});

	it('recovers only one use on short rest for resources with partial recovery', () => {
		const resources = defaultResources('druid', 6, scores).map((resource) => ({
			...resource,
			current: 0
		}));
		const [afterShortRest] = recoverResourcesOnRest(resources, 'short');
		expect(afterShortRest.current).toBe(1);
		const [afterLongRest] = recoverResourcesOnRest(resources, 'long');
		expect(afterLongRest.current).toBe(afterLongRest.max);
	});

	it('tracks Paladin Channel Divinity and its level-based maximum', () => {
		const resources = defaultResources('paladin', 11, scores);
		const channelDivinity = resources.find(
			(resource) => resource.id === 'paladin-channel-divinity'
		);
		expect(channelDivinity?.max).toBe(3);
		expect(channelDivinity?.shortRestRecovery).toBe(1);
	});
});
