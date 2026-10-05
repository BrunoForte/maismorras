export type ResizablePanelOptions = {
	collapsed: boolean;
	headerSelector: string;
	/** Fill the current browser window instead of restoring page-panel preferences. */
	fillViewport?: boolean;
	minWidth?: number;
	storageKey?: string;
};

type PanelSize = { width: number; height: number };
type PanelPreference = { collapsed: boolean; size: PanelSize };

const preferences = new Map<string, PanelPreference>();
const preferencePrefix = 'maismorras:resizable-panel:';

function isPanelPreference(value: unknown): value is PanelPreference {
	if (!value || typeof value !== 'object') return false;
	const preference = value as Partial<PanelPreference>;
	return (
		typeof preference.collapsed === 'boolean' &&
		typeof preference.size?.width === 'number' &&
		preference.size.width > 0 &&
		typeof preference.size.height === 'number' &&
		preference.size.height > 0
	);
}

function readPreference(key: string): PanelPreference | null {
	const cached = preferences.get(key);
	if (cached) return cached;
	if (typeof localStorage === 'undefined') return null;
	try {
		const value: unknown = JSON.parse(localStorage.getItem(`${preferencePrefix}${key}`) ?? 'null');
		if (isPanelPreference(value)) {
			preferences.set(key, value);
			return value;
		}
	} catch {
		// Invalid/blocked browser storage only disables persistence across remounts.
	}
	return null;
}

function writePreference(key: string | undefined, preference: PanelPreference) {
	if (!key) return;
	preferences.set(key, preference);
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(`${preferencePrefix}${key}`, JSON.stringify(preference));
	} catch {
		// Keep the in-memory preference even when browser storage is unavailable.
	}
}

/** Read the last collapse state so Svelte components can restore content on remount. */
export function resizablePanelPreference(key: string): Readonly<PanelPreference> | null {
	return readPreference(key);
}

function viewportSize(size: PanelSize): PanelSize {
	return {
		width: Math.max(1, Math.min(size.width, window.innerWidth - 16)),
		height: Math.max(1, Math.min(size.height, window.innerHeight - 16))
	};
}

/** Preserves resize dimensions and collapsed state across remounts and viewport changes. */
export function resizablePanel(node: HTMLElement, initial: ResizablePanelOptions) {
	let options = initial;
	const saved =
		initial.fillViewport || !initial.storageKey ? null : readPreference(initial.storageKey);
	let lastExpandedSize: PanelSize = initial.fillViewport
		? { width: window.innerWidth, height: window.innerHeight }
		: (saved?.size ?? {
				width: node.getBoundingClientRect().width || node.offsetWidth || 1,
				height: node.getBoundingClientRect().height || node.offsetHeight || 1
			});
	let collapsed = false;
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					if (collapsed) return;
					const { width, height } = node.getBoundingClientRect();
					if (width > 0 && height > 0) {
						lastExpandedSize = { width, height };
						if (!options.fillViewport)
							writePreference(options.storageKey, { collapsed: false, size: lastExpandedSize });
					}
				});
	observer?.observe(node);

	function currentSize(): PanelSize {
		const { width, height } = node.getBoundingClientRect();
		return {
			width: width || node.offsetWidth || 1,
			height: height || node.offsetHeight || 1
		};
	}

	function applyCollapsedStyles() {
		const header = node.querySelector<HTMLElement>(options.headerSelector);
		const headerHeight = Math.ceil(header?.getBoundingClientRect().height ?? 44);
		const width = Math.min(
			Math.max(options.minWidth ?? 190, header?.scrollWidth ?? 0),
			window.innerWidth - 16
		);
		node.style.resize = 'none';
		node.style.width = `${width}px`;
		node.style.height = `${Math.min(headerHeight, window.innerHeight - 16)}px`;
		node.style.minWidth = '0';
		node.style.minHeight = '0';
		node.style.maxWidth = `${window.innerWidth - 16}px`;
		node.style.maxHeight = 'none';
		node.style.overflow = 'hidden';
	}

	function applyExpandedStyles() {
		if (options.fillViewport) {
			applyViewportStyles();
			return;
		}
		const restored = viewportSize(lastExpandedSize);
		node.style.removeProperty('resize');
		node.style.removeProperty('min-width');
		node.style.removeProperty('min-height');
		node.style.removeProperty('max-width');
		node.style.removeProperty('max-height');
		node.style.removeProperty('overflow');
		node.style.width = `${restored.width}px`;
		node.style.height = `${restored.height}px`;
		lastExpandedSize = restored;
	}

	function applyViewportStyles() {
		lastExpandedSize = { width: window.innerWidth, height: window.innerHeight };
		node.style.resize = 'none';
		node.style.width = `${lastExpandedSize.width}px`;
		node.style.height = `${lastExpandedSize.height}px`;
		node.style.minWidth = '0';
		node.style.minHeight = '0';
		node.style.maxWidth = 'none';
		node.style.maxHeight = 'none';
		node.style.overflow = 'hidden';
	}

	function setCollapsed(next: boolean, captureExpandedSize = true) {
		if (collapsed === next) return;
		if (next) {
			if (captureExpandedSize) {
				const size = currentSize();
				if (size.width > (options.minWidth ?? 190) || size.height > 80) lastExpandedSize = size;
			}
			collapsed = true;
			applyCollapsedStyles();
		} else {
			collapsed = false;
			applyExpandedStyles();
		}
		writePreference(options.storageKey, { collapsed, size: lastExpandedSize });
	}

	// The component initializes its content from the saved preference. Apply the same state
	// physically here, without capturing collapsed header dimensions as the expanded size.
	setCollapsed(initial.collapsed, false);
	if (initial.fillViewport && !initial.collapsed) applyViewportStyles();
	else if (!initial.collapsed && saved) applyExpandedStyles();

	const onResize = () => {
		if (options.fillViewport) applyViewportStyles();
		else if (collapsed) applyCollapsedStyles();
		else {
			const size = viewportSize(lastExpandedSize);
			lastExpandedSize = size;
			node.style.width = `${size.width}px`;
			node.style.height = `${size.height}px`;
			writePreference(options.storageKey, { collapsed: false, size });
		}
	};
	window.addEventListener('resize', onResize);

	return {
		update(next: ResizablePanelOptions) {
			const fillViewportChanged = next.fillViewport !== options.fillViewport;
			options = next;
			if (fillViewportChanged && options.fillViewport) applyViewportStyles();
			setCollapsed(next.collapsed);
		},
		destroy() {
			observer?.disconnect();
			window.removeEventListener('resize', onResize);
			if (!collapsed && !options.fillViewport)
				writePreference(options.storageKey, { collapsed: false, size: currentSize() });
		}
	};
}
