import { describe, expect, it } from 'vitest';
import { nextFloatingPanelLayer } from './floatingPanelStack';

describe('floating panel stacking', () => {
	it('places focused panels above map inspectors and raises each interaction', () => {
		const first = nextFloatingPanelLayer();
		const second = nextFloatingPanelLayer();

		expect(first).toBeGreaterThan(100);
		expect(second).toBeGreaterThan(first);
	});
});
