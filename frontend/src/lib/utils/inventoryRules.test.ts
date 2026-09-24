import { describe, expect, it } from 'vitest';
import { cloneInventoryRules } from './inventoryRules';

describe('cloneInventoryRules', () => {
	it('copies JSON rules wrapped in a reactive proxy', () => {
		const source = new Proxy(
			{ damage: '1d6', properties: ['acuidade'], nested: { category: 'arma' } },
			{}
		);
		const copy = cloneInventoryRules(source);

		expect(copy).toEqual({ damage: '1d6', properties: ['acuidade'], nested: { category: 'arma' } });
		expect(copy).not.toBe(source);
		expect(copy.nested).not.toBe(source.nested);
	});
});
