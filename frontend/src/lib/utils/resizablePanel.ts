export type ResizablePanelOptions = {
	collapsed: boolean;
	headerSelector: string;
	minWidth?: number;
};

type PanelSize = { width: number; height: number };

function viewportSize(size: PanelSize): PanelSize {
	return {
		width: Math.max(1, Math.min(size.width, window.innerWidth - 16)),
		height: Math.max(1, Math.min(size.height, window.innerHeight - 16))
	};
}

/** Preserves native-resize dimensions while making a minimized panel physically compact. */
export function resizablePanel(node: HTMLElement, initial: ResizablePanelOptions) {
	let options = initial;
	let collapsed = false;
	let lastExpandedSize: PanelSize | null = null;
	const observer =
		typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(() => {
					if (collapsed) return;
					const { width, height } = node.getBoundingClientRect();
					if (width > 0 && height > 0) lastExpandedSize = { width, height };
				});
	observer?.observe(node);

	function currentSize(): PanelSize {
		const { width, height } = node.getBoundingClientRect();
		return {
			width: width || node.offsetWidth || 1,
			height: height || node.offsetHeight || 1
		};
	}

	function setCollapsed(next: boolean) {
		if (collapsed === next) return;
		if (next) {
			lastExpandedSize = currentSize();
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
			collapsed = true;
			return;
		}
		collapsed = false;
		const restored = viewportSize(lastExpandedSize ?? currentSize());
		node.style.removeProperty('resize');
		node.style.removeProperty('min-width');
		node.style.removeProperty('min-height');
		node.style.removeProperty('max-width');
		node.style.removeProperty('max-height');
		node.style.removeProperty('overflow');
		node.style.width = `${restored.width}px`;
		node.style.height = `${restored.height}px`;
	}

	setCollapsed(options.collapsed);
	return {
		update(next: ResizablePanelOptions) {
			options = next;
			setCollapsed(next.collapsed);
		},
		destroy() {
			observer?.disconnect();
		}
	};
}
