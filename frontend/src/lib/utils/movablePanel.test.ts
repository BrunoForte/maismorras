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
		closest(selector: string) {
			return selector === '.titlebar' ? this : null;
		}
	}
	const nodeListeners = new Map<string, (event: PointerEvent) => void>();
	const nodeStyle: Record<string, string> = {};
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
			return {
				left: Number.parseFloat(nodeStyle.left ?? '') || 100,
				top: Number.parseFloat(nodeStyle.top ?? '') || 100,
				right: (Number.parseFloat(nodeStyle.left ?? '') || 100) + size.width,
				bottom: (Number.parseFloat(nodeStyle.top ?? '') || 100) + size.height,
				width: size.width,
				height: size.height
			};
		}
	} as unknown as HTMLElement;
	installGlobal('window', windowMock);
	installGlobal('document', documentMock);
	installGlobal('Element', FakeElement);
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
		documentMock
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
