export type PanelPosition = { left: number; top: number };

export type MovablePanelOptions = {
	storageKey: string;
	handleSelector: string;
	minTop?: number;
	avoidSelectors?: string[];
};

const positionPrefix = 'maismorras:moved-panel:';
const positions = new Map<string, PanelPosition>();

function readPosition(key: string): PanelPosition | null {
	const cached = positions.get(key);
	if (cached) return cached;
	if (typeof localStorage === 'undefined') return null;
	try {
		const value: unknown = JSON.parse(localStorage.getItem(`${positionPrefix}${key}`) ?? 'null');
		if (
			value &&
			typeof value === 'object' &&
			typeof (value as PanelPosition).left === 'number' &&
			typeof (value as PanelPosition).top === 'number'
		) {
			positions.set(key, value as PanelPosition);
			return value as PanelPosition;
		}
	} catch {
		// Browser storage can be disabled; the panel still works for this session.
	}
	return null;
}

function clampPosition(node: HTMLElement, position: PanelPosition, minTop: number): PanelPosition {
	const width = node.getBoundingClientRect().width || node.offsetWidth;
	const height = node.getBoundingClientRect().height || node.offsetHeight;
	const footerValue = getComputedStyle(document.documentElement)
		.getPropertyValue('--mm-audio-footer-offset')
		.trim();
	const footerOffset = Number.parseFloat(footerValue) || 68;
	return {
		left: Math.max(0, Math.min(position.left, Math.max(0, window.innerWidth - width))),
		top: Math.max(
			minTop,
			Math.min(position.top, Math.max(minTop, window.innerHeight - footerOffset - height - 8))
		)
	};
}

function savePosition(key: string, position: PanelPosition) {
	positions.set(key, position);
	try {
		localStorage.setItem(`${positionPrefix}${key}`, JSON.stringify(position));
	} catch {
		// Keep the in-memory position when persistent storage is unavailable.
	}
}

/** Adds title-bar dragging while constraining the panel to the usable viewport. */
export function movablePanel(node: HTMLElement, initial: MovablePanelOptions) {
	let options = initial;
	let drag: {
		pointerId: number;
		originX: number;
		originY: number;
		left: number;
		top: number;
	} | null = null;
	const minTop = () => {
		let result = options.minTop ?? 56;
		for (const selector of options.avoidSelectors ?? []) {
			const obstacle = document.querySelector(selector);
			if (!obstacle) continue;
			const rect = obstacle.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
				result = Math.max(result, rect.bottom + 8);
			}
		}
		return result;
	};
	const updateViewportConstraints = () => {
		const top = minTop();
		const footerValue = getComputedStyle(document.documentElement)
			.getPropertyValue('--mm-audio-footer-offset')
			.trim();
		const footerOffset = Number.parseFloat(footerValue) || 68;
		const available = Math.max(120, window.innerHeight - top - footerOffset - 16);
		node.style.setProperty('--mm-panel-navigation-bottom', `${top}px`);
		node.style.setProperty('--mm-panel-available-height', `${available}px`);
	};
	const apply = (position: PanelPosition, persist = false) => {
		updateViewportConstraints();
		const bounded = clampPosition(node, position, minTop());
		node.style.left = `${bounded.left}px`;
		node.style.top = `${bounded.top}px`;
		node.style.right = 'auto';
		node.style.bottom = 'auto';
		if (persist) savePosition(options.storageKey, bounded);
	};
	updateViewportConstraints();
	const keepBelowNavigation = () => {
		if (!node.style.left) {
			const rect = node.getBoundingClientRect();
			if (rect.top < minTop()) apply({ left: rect.left, top: minTop() });
		}
	};
	const saved = readPosition(options.storageKey);
	if (saved) apply(saved);
	else keepBelowNavigation();

	const onPointerDown = (event: PointerEvent) => {
		if (event.button !== 0 || !(event.target instanceof Element)) return;
		const handle = event.target.closest(options.handleSelector);
		if (!handle || !node.contains(handle)) return;
		if (event.target.closest('button, input, select, textarea, a, [role="button"]')) return;
		const rect = node.getBoundingClientRect();
		drag = {
			pointerId: event.pointerId,
			originX: event.clientX,
			originY: event.clientY,
			left: rect.left,
			top: rect.top
		};
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
		document.addEventListener('pointercancel', onPointerUp);
		event.preventDefault();
	};
	const onPointerMove = (event: PointerEvent) => {
		if (!drag || drag.pointerId !== event.pointerId) return;
		apply({
			left: drag.left + event.clientX - drag.originX,
			top: drag.top + event.clientY - drag.originY
		});
	};
	const onPointerUp = (event: PointerEvent) => {
		if (!drag || drag.pointerId !== event.pointerId) return;
		const rect = node.getBoundingClientRect();
		apply({ left: rect.left, top: rect.top }, true);
		drag = null;
		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
		document.removeEventListener('pointercancel', onPointerUp);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (!(event.target instanceof Element) || !event.target.closest(options.handleSelector)) return;
		if (event.target.closest('button, input, select, textarea, a, [role="button"]')) return;
		const deltas: Record<string, PanelPosition> = {
			ArrowLeft: { left: -1, top: 0 },
			ArrowRight: { left: 1, top: 0 },
			ArrowUp: { left: 0, top: -1 },
			ArrowDown: { left: 0, top: 1 }
		};
		const delta = deltas[event.key];
		if (!delta) return;
		event.preventDefault();
		const rect = node.getBoundingClientRect();
		const distance = event.shiftKey ? 40 : 10;
		apply({ left: rect.left + delta.left * distance, top: rect.top + delta.top * distance }, true);
	};
	const onResize = () => {
		updateViewportConstraints();
		const rect = node.getBoundingClientRect();
		const bounded = clampPosition(node, { left: rect.left, top: rect.top }, minTop());
		if (node.style.left) apply(bounded, true);
	};
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					if (node.style.left) onResize();
				});
	observer?.observe(node);
	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('keydown', onKeyDown);
	window.addEventListener('resize', onResize);

	return {
		update(next: MovablePanelOptions) {
			const changedKey = next.storageKey !== options.storageKey;
			options = next;
			if (changedKey) {
				const position = readPosition(options.storageKey);
				if (position) apply(position);
				else keepBelowNavigation();
			} else keepBelowNavigation();
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('keydown', onKeyDown);
			observer?.disconnect();
			window.removeEventListener('resize', onResize);
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
			document.removeEventListener('pointercancel', onPointerUp);
		}
	};
}
