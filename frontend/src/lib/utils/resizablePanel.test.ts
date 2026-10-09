import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizablePanel, resizablePanelPreference } from './resizablePanel';

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
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

afterEach(() => {
	if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
	else Reflect.deleteProperty(globalThis, 'window');
	if (originalObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalObserver);
	else Reflect.deleteProperty(globalThis, 'ResizeObserver');
	if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
	else Reflect.deleteProperty(globalThis, 'localStorage');
	vi.restoreAllMocks();
});

describe('resizablePanel', () => {
	it('skips saved sizing preferences for embedded content', () => {
		const storage = { getItem: vi.fn(), setItem: vi.fn() };
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
		const style = fakeStyle();
		const node = { style } as unknown as HTMLElement;
		const action = resizablePanel(node, {
			collapsed: false,
			headerSelector: 'header',
			storageKey: 'embedded-sheet',
			skipLayout: true
		});

		expect(storage.getItem).not.toHaveBeenCalled();
		expect(style).toEqual({ removeProperty: expect.any(Function) });
		action.destroy();
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it('fills and tracks the auxiliary window viewport without reading or saving page preferences', () => {
		let width = 1180;
		let height = 820;
		let onResize: (() => void) | undefined;
		const storage = {
			getItem: vi.fn(() => JSON.stringify({ collapsed: true, size: { width: 520, height: 460 } })),
			setItem: vi.fn()
		};
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				get innerWidth() {
					return width;
				},
				get innerHeight() {
					return height;
				},
				addEventListener: vi.fn((name: string, handler: () => void) => {
					if (name === 'resize') onResize = handler;
				}),
				removeEventListener: vi.fn()
			}
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
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
		const node = {
			style: fakeStyle(),
			getBoundingClientRect: () => ({ width: 520, height: 460 }),
			querySelector: () => null
		} as unknown as HTMLElement;
		const action = resizablePanel(node, {
			collapsed: false,
			headerSelector: 'header',
			fillViewport: true,
			storageKey: 'main-page-sheet-size'
		});

		expect(node.style.width).toBe('1180px');
		expect(node.style.height).toBe('820px');
		expect(storage.getItem).not.toHaveBeenCalled();
		width = 390;
		height = 720;
		onResize?.();
		expect(node.style.width).toBe('390px');
		expect(node.style.height).toBe('720px');
		action.destroy();
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it('collapses physically after resize and restores the last expanded dimensions', () => {
		let size = { width: 340, height: 420 };
		let onResize: (() => void) | undefined;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				innerWidth: 1200,
				innerHeight: 900,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			}
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
			value: {
				innerWidth: 800,
				innerHeight: 800,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			}
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
			value: {
				innerWidth: 400,
				innerHeight: 450,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			}
		});
		action.update({ collapsed: false, headerSelector: 'header' });
		expect(node.style.width).toBe('384px');
		expect(node.style.height).toBe('434px');
		action.destroy();
	});

	it('restores collapse state and the expanded size after the component remounts', () => {
		let size = { width: 360, height: 440 };
		let onResize: (() => void) | undefined;
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				innerWidth: 1200,
				innerHeight: 900,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn()
			}
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
		const makeNode = () =>
			({
				style: fakeStyle(),
				offsetWidth: 0,
				offsetHeight: 0,
				querySelector: () => ({ scrollWidth: 120, getBoundingClientRect: () => ({ height: 46 }) }),
				getBoundingClientRect: () => size
			}) as unknown as HTMLElement;
		const options = {
			collapsed: false,
			headerSelector: 'header',
			minWidth: 190,
			storageKey: 'remount-chat-test'
		};
		const first = makeNode();
		const firstAction = resizablePanel(first, options);
		size = { width: 530, height: 620 };
		onResize?.();
		firstAction.update({ ...options, collapsed: true });
		expect(resizablePanelPreference(options.storageKey)?.collapsed).toBe(true);
		firstAction.destroy();

		const preference = resizablePanelPreference(options.storageKey);
		const restoredNode = makeNode();
		const restoredAction = resizablePanel(restoredNode, {
			...options,
			collapsed: preference?.collapsed ?? false
		});
		expect(restoredNode.style.height).toBe('46px');
		expect(restoredNode.style.resize).toBe('none');
		size = { width: 190, height: 46 };
		restoredAction.update({ ...options, collapsed: false });
		expect(restoredNode.style.width).toBe('530px');
		expect(restoredNode.style.height).toBe('620px');
		expect(restoredNode.style.resize).toBeUndefined();
		restoredAction.destroy();
	});
});
