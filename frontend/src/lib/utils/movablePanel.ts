export type PanelPosition = { left: number; top: number };

export type MovablePanelOptions = {
	storageKey: string;
	layoutKey?: string;
	handleSelector: string;
	minTop?: number;
	maxWidth?: number;
	avoidSelectors?: string[];
	avoidLeftSelectors?: string[];
	avoidRightSelectors?: string[];
	avoidBottomSelectors?: string[];
	enabled?: boolean;
};

const positionPrefix = 'maismorras:moved-panel:';
const positions = new Map<string, PanelPosition>();

function readCssLengthInPixels(node: HTMLElement, property: string, fallback: number): number {
	const value = getComputedStyle(node).getPropertyValue(property).trim();
	const amount = Number.parseFloat(value);
	if (!Number.isFinite(amount)) return fallback;
	if (value.endsWith('rem')) {
		const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		return amount * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
	}
	if (value.endsWith('em')) {
		const fontSize = Number.parseFloat(getComputedStyle(node).fontSize);
		return amount * (Number.isFinite(fontSize) ? fontSize : 16);
	}
	if (value.endsWith('vh') || value.endsWith('dvh')) return (amount / 100) * window.innerHeight;
	return amount;
}

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
	const footerOffset = readCssLengthInPixels(node, '--mm-audio-footer-offset', 68) || 68;
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
	let hasCustomPosition = false;
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
		const footerOffset = readCssLengthInPixels(node, '--mm-audio-footer-offset', 68) || 68;
		let bottom = footerOffset + 8;
		let left: number | null = null;
		let right = 16;
		for (const selector of options.avoidLeftSelectors ?? []) {
			const obstacle = document.querySelector(selector);
			if (!obstacle) continue;
			const rect = obstacle.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) left = Math.max(left ?? 16, rect.right + 12);
		}
		for (const selector of options.avoidRightSelectors ?? []) {
			const obstacle = document.querySelector(selector);
			if (!obstacle) continue;
			const rect = obstacle.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				right = Math.max(right, window.innerWidth - rect.left + 12);
			}
		}
		node.style.setProperty('--mm-panel-left-inset', left === null ? 'auto' : `${left}px`);
		node.style.setProperty('--mm-panel-right-inset', `${right}px`);
		node.style.setProperty(
			'--mm-panel-width',
			left === null
				? `min(${options.maxWidth ?? 920}px, calc(100vw - ${options.maxWidth ? 32 : 450}px))`
				: `min(${options.maxWidth ?? 920}px, calc(100vw - ${left}px - ${right}px - 1rem))`
		);
		node.style.setProperty(
			'--mm-panel-min-width',
			left === null
				? 'min(440px, calc(100vw - 2rem))'
				: `min(440px, calc(100vw - ${left}px - ${right}px - 1rem))`
		);
		const panel = node.getBoundingClientRect();
		for (const selector of options.avoidBottomSelectors ?? []) {
			const obstacle = document.querySelector(selector);
			if (!obstacle) continue;
			const rect = obstacle.getBoundingClientRect();
			const overlapsHorizontally = panel.left < rect.right && panel.right > rect.left;
			if (
				rect.width > 0 &&
				rect.height > 0 &&
				overlapsHorizontally &&
				rect.top < window.innerHeight
			) {
				bottom = Math.max(bottom, window.innerHeight - rect.top + 12);
			}
		}
		node.style.setProperty('--mm-panel-bottom-offset', `${bottom}px`);
		const available = Math.max(120, window.innerHeight - top - bottom - 16);
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
		if (persist) {
			hasCustomPosition = true;
			savePosition(options.storageKey, bounded);
		}
	};
	const applyDefaultPosition = () => {
		node.style.removeProperty('left');
		node.style.removeProperty('top');
		node.style.removeProperty('right');
		node.style.removeProperty('bottom');
		updateViewportConstraints();
		const rect = node.getBoundingClientRect();
		apply({ left: rect.left, top: rect.top });
	};
	updateViewportConstraints();
	const keepBelowNavigation = () => {
		const rect = node.getBoundingClientRect();
		const requiredTop = minTop();
		if (rect.top < requiredTop) apply({ left: rect.left, top: requiredTop });
	};
	const saved = options.enabled === false ? null : readPosition(options.storageKey);
	if (saved) {
		hasCustomPosition = true;
		apply(saved);
	} else if (options.enabled !== false) keepBelowNavigation();

	const onPointerDown = (event: PointerEvent) => {
		if (options.enabled === false) return;
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
		if (options.enabled === false) return;
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
		if (!hasCustomPosition && options.enabled !== false) {
			applyDefaultPosition();
			return;
		}
		updateViewportConstraints();
		const rect = node.getBoundingClientRect();
		const bounded = clampPosition(node, { left: rect.left, top: rect.top }, minTop());
		if (options.enabled !== false && node.style.left) apply(bounded, true);
	};
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					updateViewportConstraints();
					if (options.enabled !== false && node.style.left) onResize();
				});
	observer?.observe(node);
	const refreshObservedObstacles = () => {
		if (!observer) return;
		for (const selector of [
			...(options.avoidSelectors ?? []),
			...(options.avoidLeftSelectors ?? []),
			...(options.avoidRightSelectors ?? []),
			...(options.avoidBottomSelectors ?? [])
		]) {
			const obstacle = document.querySelector(selector);
			if (obstacle) observer.observe(obstacle);
		}
	};
	refreshObservedObstacles();
	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('keydown', onKeyDown);
	window.addEventListener('resize', onResize);

	return {
		update(next: MovablePanelOptions) {
			const changedKey = next.storageKey !== options.storageKey;
			const changedLayout = next.layoutKey !== options.layoutKey;
			const wasEnabled = options.enabled !== false;
			options = next;
			refreshObservedObstacles();
			updateViewportConstraints();
			if (wasEnabled && options.enabled === false) {
				node.style.removeProperty('left');
				node.style.removeProperty('top');
				node.style.removeProperty('right');
				node.style.removeProperty('bottom');
				updateViewportConstraints();
			} else if (!wasEnabled && options.enabled !== false) {
				const position = readPosition(options.storageKey);
				if (position) apply(position);
				else keepBelowNavigation();
			} else if (changedKey) {
				const position = readPosition(options.storageKey);
				hasCustomPosition = Boolean(position);
				if (position) apply(position);
				else applyDefaultPosition();
			} else if (changedLayout && !hasCustomPosition && options.enabled !== false) {
				applyDefaultPosition();
			} else if (options.enabled !== false) keepBelowNavigation();
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
