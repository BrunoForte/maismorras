import { afterEach, describe, expect, it, vi } from 'vitest';
import { movablePanel } from './movablePanel';

const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

function installGlobal(name: string, value: unknown) {
	if (!savedGlobals.has(name))
		savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	Object.defineProperty(globalThis, name, { configurable: true, value });
}

function makeHarness(
	size = { width: 320, height: 260 },
	obstacleRects: Record<
		string,
		{ left: number; top: number; right: number; bottom: number; width: number; height: number }
	> = {}
) {
	const storage = new Map<string, string>();
	const windowListeners = new Map<string, () => void>();
	const documentListeners = new Map<string, (event: PointerEvent) => void>();
	const windowMock = {
		innerWidth: 1200,
		innerHeight: 900,
		addEventListener: vi.fn((name: string, handler: () => void) =>
			windowListeners.set(name, handler)
		),
		removeEventListener: vi.fn((name: string) => windowListeners.delete(name))
	};
	const documentMock = {
		documentElement: {},
		body: {},
		querySelector: vi.fn((selector: string) => {
			const rect = obstacleRects[selector];
			return rect ? { getBoundingClientRect: () => rect } : null;
		}),
		addEventListener: vi.fn((name: string, handler: (event: PointerEvent) => void) =>
			documentListeners.set(name, handler)
		),
		removeEventListener: vi.fn((name: string) => documentListeners.delete(name))
	};
	class FakeElement {
		className = '';
		matches(selector: string) {
			return selector === `.${this.className}`;
		}
		querySelector() {
			return null;
		}
		closest(selector: string) {
			return selector === '.titlebar' ? this : null;
		}
	}
	const nodeListeners = new Map<string, (event: PointerEvent) => void>();
	const nodeStyle: Record<string, string> = {};
	let resizeObserverCallback: ResizeObserverCallback | undefined;
	let mutationObserverCallback: MutationCallback | undefined;
	class FakeResizeObserver {
		constructor(callback: ResizeObserverCallback) {
			resizeObserverCallback = callback;
		}
		observe = vi.fn();
		disconnect = vi.fn();
	}
	class FakeMutationObserver {
		constructor(callback: MutationCallback) {
			mutationObserverCallback = callback;
		}
		observe = vi.fn();
		disconnect = vi.fn();
	}
	const styleApi = Object.assign(nodeStyle, {
		setProperty: (name: string, value: string) => {
			nodeStyle[name] = value;
		},
		removeProperty: (name: string) => {
			delete nodeStyle[name];
		}
	}) as unknown as CSSStyleDeclaration;
	const node = {
		style: styleApi,
		offsetWidth: size.width,
		offsetHeight: size.height,
		contains: () => true,
		addEventListener: vi.fn((name: string, handler: (event: PointerEvent) => void) =>
			nodeListeners.set(name, handler)
		),
		removeEventListener: vi.fn((name: string) => nodeListeners.delete(name)),
		getBoundingClientRect() {
			const left = Number.parseFloat(nodeStyle.left ?? '') || 100;
			const top = Number.parseFloat(nodeStyle.top ?? '') || 100;
			const width = Number.parseFloat(nodeStyle.width ?? '') || size.width;
			const height = Number.parseFloat(nodeStyle.height ?? '') || size.height;
			return { left, top, right: left + width, bottom: top + height, width, height };
		}
	} as unknown as HTMLElement;
	installGlobal('window', windowMock);
	installGlobal('document', documentMock);
	installGlobal('Element', FakeElement);
	installGlobal('ResizeObserver', FakeResizeObserver);
	installGlobal('MutationObserver', FakeMutationObserver);
	installGlobal('getComputedStyle', () => ({ getPropertyValue: () => '68px' }));
	installGlobal('localStorage', {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => storage.set(key, value))
	});
	return {
		node,
		nodeListeners,
		documentListeners,
		windowListeners,
		storage,
		windowMock,
		documentMock,
		obstacleRects,
		triggerResize() {
			resizeObserverCallback?.([], {} as ResizeObserver);
		},
		triggerDOMChange() {
			const insertedObstacle = new FakeElement();
			insertedObstacle.className = 'token-inspector';
			mutationObserverCallback?.(
				[{ addedNodes: [insertedObstacle], removedNodes: [] } as unknown as MutationRecord],
				{} as MutationObserver
			);
		}
	};
}

afterEach(() => {
	for (const [name, descriptor] of savedGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	savedGlobals.clear();
	vi.restoreAllMocks();
});

describe('movablePanel', () => {
	it('skips persisted position and viewport calculations for embedded content', () => {
		const h = makeHarness();
		const getItem = vi.mocked(localStorage.getItem);
		const action = movablePanel(h.node, {
			storageKey: 'embedded-sheet',
			handleSelector: '.titlebar',
			skipLayout: true
		});
		expect(getItem).not.toHaveBeenCalled();
		expect(h.nodeListeners.size).toBe(0);
		expect((h.node as unknown as { style: Record<string, string> }).style.left).toBeUndefined();
		action.destroy();
	});

	it('allows a larger panel to use available viewport width when requested', () => {
		const h = makeHarness();
		const action = movablePanel(h.node, {
			storageKey: 'large-sheet-panel',
			handleSelector: '.titlebar',
			maxWidth: 1280
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(style['--mm-panel-width']).toBe('min(1280px, calc(100vw - 32px))');
		action.destroy();
	});

	it('keeps a resized sheet inside the right viewport edge', () => {
		const h = makeHarness({ width: 832, height: 526 });
		h.windowMock.innerWidth = 1280;
		h.storage.set('maismorras:moved-panel:sheet-edge', JSON.stringify({ left: 452, top: 104 }));
		const action = movablePanel(h.node, {
			storageKey: 'sheet-edge',
			handleSelector: '.titlebar',
			constrainToViewport: true
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		style.width = '832px';
		h.triggerResize();
		const rect = h.node.getBoundingClientRect();
		expect(rect.right).toBeLessThanOrEqual(1264);
		expect(Number.parseFloat(style.left)).toBeLessThan(452);
		action.destroy();
	});

	it('moves by the title bar, persists per key, and restores the position', () => {
		const h = makeHarness();
		const action = movablePanel(h.node, {
			storageKey: 'campaign-character:test',
			handleSelector: '.titlebar'
		});
		const target = new (globalThis.Element as unknown as { new (): Element })();
		h.nodeListeners.get('pointerdown')?.({
			button: 0,
			pointerId: 4,
			clientX: 110,
			clientY: 110,
			target,
			preventDefault: vi.fn()
		} as unknown as PointerEvent);
		h.documentListeners.get('pointermove')?.({
			pointerId: 4,
			clientX: 180,
			clientY: 160
		} as PointerEvent);
		h.documentListeners.get('pointerup')?.({ pointerId: 4 } as PointerEvent);
		expect((h.node as unknown as { style: Record<string, string> }).style.left).toBe('170px');
		expect((h.node as unknown as { style: Record<string, string> }).style.top).toBe('150px');
		expect([...h.storage.values()].some((value) => value.includes('170'))).toBe(true);
		action.destroy();

		const remount = makeHarness();
		remount.storage.set([...h.storage.keys()][0], [...h.storage.values()][0]);
		const restored = movablePanel(remount.node, {
			storageKey: 'campaign-character:test',
			handleSelector: '.titlebar'
		});
		expect((remount.node as unknown as { style: Record<string, string> }).style.left).toBe('170px');
		expect((remount.node as unknown as { style: Record<string, string> }).style.top).toBe('150px');
		restored.destroy();
	});

	it('keeps the panel below navigation and above the audio footer', () => {
		const h = makeHarness({ width: 320, height: 260 });
		const action = movablePanel(h.node, {
			storageKey: 'clamped',
			handleSelector: '.titlebar',
			minTop: 64
		});
		const target = new (globalThis.Element as unknown as { new (): Element })();
		h.nodeListeners.get('pointerdown')?.({
			button: 0,
			pointerId: 2,
			clientX: 110,
			clientY: 110,
			target,
			preventDefault: vi.fn()
		} as unknown as PointerEvent);
		h.documentListeners.get('pointermove')?.({
			pointerId: 2,
			clientX: 10_000,
			clientY: 10_000
		} as PointerEvent);
		h.documentListeners.get('pointerup')?.({ pointerId: 2 } as PointerEvent);
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(Number.parseFloat(style.top)).toBeGreaterThanOrEqual(64);
		expect(Number.parseFloat(style.top)).toBeLessThanOrEqual(900 - 68 - 260 - 8);
		action.destroy();
	});

	it('uses the live navigation geometry when clamping a restored or moved panel', () => {
		const h = makeHarness(
			{ width: 320, height: 900 },
			{
				'.workspace-tabs': { left: 0, top: 130, right: 1200, bottom: 190, width: 1200, height: 60 }
			}
		);
		const action = movablePanel(h.node, {
			storageKey: 'navigation-aware',
			handleSelector: '.titlebar',
			avoidSelectors: ['.workspace-tabs']
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(style.top).toBe('198px');
		expect(style['--mm-panel-navigation-bottom']).toBe('198px');
		expect(style['--mm-panel-available-height']).toBe('610px');
		action.destroy();
	});

	it('moves a restored panel below a workspace control that becomes visible later', () => {
		const h = makeHarness({ width: 320, height: 900 });
		h.storage.set('maismorras:moved-panel:campaign-sheet', JSON.stringify({ left: 820, top: 100 }));
		const options = {
			storageKey: 'campaign-sheet',
			handleSelector: '.titlebar'
		};
		const action = movablePanel(h.node, options);
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(Number.parseFloat(style.top)).toBeLessThan(318);
		h.obstacleRects['.sheet-picker'] = {
			left: 0,
			top: 220,
			right: 1200,
			bottom: 310,
			width: 1200,
			height: 90
		};
		action.update({ ...options, avoidSelectors: ['.sheet-picker'] });
		expect(style.left).toBe('820px');
		expect(style.top).toBe('318px');
		expect(style['--mm-panel-navigation-bottom']).toBe('318px');
		action.destroy();
	});

	it('recalculates the default layout when a persistent panel changes workspace mode', () => {
		const h = makeHarness();
		const action = movablePanel(h.node, {
			storageKey: 'chat-layout',
			layoutKey: 'normal',
			handleSelector: '.titlebar'
		});
		action.update({
			storageKey: 'chat-layout',
			layoutKey: 'sheet-open',
			handleSelector: '.titlebar'
		});
		expect((h.node as unknown as { style: Record<string, string> }).style.left).toBe('100px');
		expect((h.node as unknown as { style: Record<string, string> }).style.top).toBe('100px');
		action.destroy();
	});

	it('converts inherited rem audio offsets before constraining panels above the footer', () => {
		const h = makeHarness();
		installGlobal('getComputedStyle', (element: HTMLElement) =>
			element ===
			(globalThis.document as unknown as { documentElement: HTMLElement }).documentElement
				? { fontSize: '16px' }
				: { getPropertyValue: () => '4.1rem', fontSize: '16px' }
		);
		const action = movablePanel(h.node, {
			storageKey: 'rem-footer-offset',
			handleSelector: '.titlebar',
			enabled: false
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(style['--mm-panel-bottom-offset']).toBe('73.6px');
		action.destroy();
	});

	it('reserves the actor panel only when the docked sheet would overlap it and can be enabled for floating mode', () => {
		const h = makeHarness(
			{ width: 320, height: 260 },
			{
				'.actor-drawer': { left: 800, top: 450, right: 1180, bottom: 850, width: 380, height: 400 }
			}
		);
		const options = {
			storageKey: 'docked-sheet',
			handleSelector: '.titlebar',
			avoidRightSelectors: ['.actor-drawer'],
			avoidBottomSelectors: ['.actor-drawer'],
			enabled: false
		};
		const action = movablePanel(h.node, options);
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(style['--mm-panel-right-inset']).toBe('412px');
		expect(style['--mm-panel-bottom-offset']).toBe('76px');
		const target = new (globalThis.Element as unknown as { new (): Element })();
		h.nodeListeners.get('pointerdown')?.({
			button: 0,
			pointerId: 8,
			target,
			preventDefault: vi.fn()
		} as unknown as PointerEvent);
		expect(h.documentListeners.has('pointermove')).toBe(false);

		action.update({ ...options, enabled: true, avoidRightSelectors: [], avoidBottomSelectors: [] });
		h.nodeListeners.get('pointerdown')?.({
			button: 0,
			pointerId: 9,
			clientX: 100,
			clientY: 100,
			target,
			preventDefault: vi.fn()
		} as unknown as PointerEvent);
		expect(h.documentListeners.has('pointermove')).toBe(true);
		action.destroy();
	});

	it('leaves room between an open chat and actor drawer for a floating sheet', () => {
		const h = makeHarness(
			{ width: 320, height: 260 },
			{
				'.floating-chat': { left: 16, top: 180, right: 376, bottom: 620, width: 360, height: 440 },
				'.actor-drawer': { left: 934, top: 400, right: 1264, bottom: 850, width: 330, height: 450 }
			}
		);
		const action = movablePanel(h.node, {
			storageKey: 'three-panel-layout',
			handleSelector: '.titlebar',
			avoidLeftSelectors: ['.floating-chat'],
			avoidRightSelectors: ['.actor-drawer']
		});
		expect(
			(h.node as unknown as { style: Record<string, string> }).style['--mm-panel-left-inset']
		).toBe('388px');
		expect(
			(h.node as unknown as { style: Record<string, string> }).style['--mm-panel-right-inset']
		).toBe('278px');
		action.destroy();
	});

	it('does not reserve the chat horizontally when a sheet stacks below it on a narrow viewport', () => {
		const h = makeHarness(
			{ width: 320, height: 260 },
			{
				'.floating-chat': { left: 16, top: 180, right: 376, bottom: 620, width: 360, height: 440 }
			}
		);
		h.windowMock.innerWidth = 390;
		h.windowMock.innerHeight = 844;
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		style.left = '8px';
		style.top = '338px';
		const action = movablePanel(h.node, {
			storageKey: 'narrow-stacked-sheet',
			handleSelector: '.titlebar',
			avoidLeftSelectors: ['.floating-chat']
		});
		expect(style['--mm-panel-left-inset']).toBe('auto');
		expect(style['--mm-panel-safe-max-width']).toBe('350px');
		action.destroy();
	});

	it('caps a resized sheet before a right-side map inspector', () => {
		const h = makeHarness(
			{ width: 1000, height: 520 },
			{
				'.token-inspector': {
					left: 900,
					top: 120,
					right: 1180,
					bottom: 540,
					width: 280,
					height: 420
				}
			}
		);
		const action = movablePanel(h.node, {
			storageKey: 'sheet-with-token-inspector',
			handleSelector: '.titlebar',
			avoidRightSelectors: ['.token-inspector']
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		expect(style['--mm-panel-safe-max-width']).toBe('780px');
		expect(style['--mm-panel-safe-min-width']).toBe('440px');
		action.destroy();
	});

	it('moves a saved panel left when a map inspector appears over it', () => {
		const h = makeHarness(
			{ width: 600, height: 420 },
			{
				'.token-inspector': {
					left: 900,
					top: 120,
					right: 1180,
					bottom: 540,
					width: 280,
					height: 420
				}
			}
		);
		const action = movablePanel(h.node, {
			storageKey: 'sheet-with-inspector',
			handleSelector: '.titlebar',
			avoidRightSelectors: ['.token-inspector']
		});
		const style = (h.node as unknown as { style: Record<string, string> }).style;
		style.left = '500px';
		h.triggerDOMChange();
		expect(style.left).toBe('288px');
		action.destroy();
	});

	it('supports keyboard positioning without taking focus away from panel controls', () => {
		const h = makeHarness();
		const action = movablePanel(h.node, {
			storageKey: 'keyboard-movable',
			handleSelector: '.titlebar'
		});
		const target = new (globalThis.Element as unknown as { new (): Element })();
		const handler = h.nodeListeners.get('keydown') as unknown as (event: KeyboardEvent) => void;
		const preventDefault = vi.fn();
		handler({
			target,
			key: 'ArrowRight',
			shiftKey: true,
			preventDefault
		} as unknown as KeyboardEvent);
		expect((h.node as unknown as { style: Record<string, string> }).style.left).toBe('140px');
		expect(preventDefault).toHaveBeenCalledOnce();
		action.destroy();
	});
});
