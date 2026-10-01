import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizablePanel } from './resizablePanel';

type FakeStyle = Record<string, string> & { removeProperty: (name: string) => void };

function fakeStyle(): FakeStyle {
	const style = {
		removeProperty(name: string) {
			delete style[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())];
		}
	} as FakeStyle;
	return style;
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');

afterEach(() => {
	if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
	else Reflect.deleteProperty(globalThis, 'window');
	if (originalObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalObserver);
	else Reflect.deleteProperty(globalThis, 'ResizeObserver');
	vi.restoreAllMocks();
});

describe('resizablePanel', () => {
	it('collapses physically after resize and restores the last expanded dimensions', () => {
		let size = { width: 340, height: 420 };
		let onResize: (() => void) | undefined;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { innerWidth: 1200, innerHeight: 900 }
		});
		Object.defineProperty(globalThis, 'ResizeObserver', {
			configurable: true,
			value: class {
				constructor(callback: () => void) {
					onResize = callback;
				}
				observe() {}
				disconnect() {}
			}
		});
		const header = { scrollWidth: 120, getBoundingClientRect: () => ({ height: 46 }) };
		const node = {
			style: fakeStyle(),
			offsetWidth: 0,
			offsetHeight: 0,
			querySelector: () => header,
			getBoundingClientRect: () => size
		} as unknown as HTMLElement;
		const action = resizablePanel(node, { collapsed: false, headerSelector: 'header' });

		size = { width: 520, height: 610 };
		onResize?.();
		action.update({ collapsed: true, headerSelector: 'header' });
		expect(node.style.width).toBe('190px');
		expect(node.style.height).toBe('46px');
		expect(node.style.resize).toBe('none');

		size = { width: 190, height: 46 };
		onResize?.();
		action.update({ collapsed: false, headerSelector: 'header' });
		expect(node.style.width).toBe('520px');
		expect(node.style.height).toBe('610px');
		expect(node.style.resize).toBeUndefined();
		expect(node.style.minHeight).toBeUndefined();
		action.destroy();
	});

	it('clamps restored dimensions to the current viewport', () => {
		let size = { width: 700, height: 700 };
		let onResize: (() => void) | undefined;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { innerWidth: 800, innerHeight: 800 }
		});
		Object.defineProperty(globalThis, 'ResizeObserver', {
			configurable: true,
			value: class {
				constructor(callback: () => void) {
					onResize = callback;
				}
				observe() {}
				disconnect() {}
			}
		});
		const node = {
			style: fakeStyle(),
			querySelector: () => ({ scrollWidth: 100, getBoundingClientRect: () => ({ height: 42 }) }),
			getBoundingClientRect: () => size
		} as unknown as HTMLElement;
		const action = resizablePanel(node, { collapsed: false, headerSelector: 'header' });
		onResize?.();
		action.update({ collapsed: true, headerSelector: 'header' });
		size = { width: 190, height: 42 };
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { innerWidth: 400, innerHeight: 450 }
		});
		action.update({ collapsed: false, headerSelector: 'header' });
		expect(node.style.width).toBe('384px');
		expect(node.style.height).toBe('434px');
		action.destroy();
	});
});
