export type SafeDiagnosticRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type SafeDiagnosticElement = {
	selector: string;
	count: number;
	visibleCount: number;
	boxes: SafeDiagnosticRect[];
	styles: Array<{
		display: string;
		visibility: string;
		opacity: string;
		position: string;
		zIndex: string;
	}>;
	states: Array<{
		expanded: string | null;
		pressed: string | null;
		disabled: boolean;
		ariaDisabled: string | null;
	}>;
};

export type SafeDiagnosticInput = {
	test: string;
	step: string;
	attempt: number;
	startedAt: string;
	failedAt: string;
	durationMs: number;
	failureType: 'TimeoutError' | 'Error';
	httpStatus: number | null;
	url: string;
	viewport: { width: number; height: number } | null;
	activeTabIndex: number | null;
	scroll: {
		x: number;
		y: number;
		viewportWidth: number;
		viewportHeight: number;
		documentWidth: number;
		documentHeight: number;
	};
	pointer: {
		x: number | null;
		y: number | null;
		action: string | null;
		startX: number | null;
		startY: number | null;
		targetX: number | null;
		targetY: number | null;
	};
	elements: SafeDiagnosticElement[];
};

export type SafeDiagnosticRecord = {
	schemaVersion: 1;
	test: string;
	step: string;
	attempt: number;
	startedAt: string;
	failedAt: string;
	durationMs: number;
	failureType: 'TimeoutError' | 'Error';
	httpStatus: number | null;
	pathname: string;
	viewport: { width: number; height: number } | null;
	activeTabIndex: number | null;
	scroll: SafeDiagnosticInput['scroll'];
	pointer: SafeDiagnosticInput['pointer'];
	elements: SafeDiagnosticElement[];
};

const safeText = (value: string, limit = 180) =>
	value
		.replace(/https?:\/\/\S+/gi, '[url]')
		.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email]')
		.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
		.replace(
			/((?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\s*[:=]\s*)\S+/gi,
			'$1[redacted]'
		)
		.replace(/[^\p{L}\p{N} .,:;()_/#.[\]-]/gu, '')
		.slice(0, limit);

const safeNumber = (value: number, minimum = 0) =>
	Number.isFinite(value) ? Math.round(Math.max(minimum, value) * 100) / 100 : minimum;

const safeNullableNumber = (value: number | null) =>
	value === null || !Number.isFinite(value) ? null : safeNumber(value, -1_000_000);

function safeRect(rect: SafeDiagnosticRect): SafeDiagnosticRect {
	return {
		left: safeNumber(rect.left, -1_000_000),
		top: safeNumber(rect.top, -1_000_000),
		width: safeNumber(rect.width),
		height: safeNumber(rect.height)
	};
}

/** Builds a strict allow-listed record; DOM text, form values, headers and arbitrary fields are discarded. */
export function sanitizeSafeE2EDiagnostic(input: SafeDiagnosticInput): SafeDiagnosticRecord {
	let pathname = '[unavailable]';
	try {
		pathname = new URL(input.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[id]');
	} catch {
		/* Never retain an unparseable URL. */
	}

	return {
		schemaVersion: 1,
		test: safeText(input.test),
		step: safeText(input.step),
		attempt: Math.round(safeNumber(input.attempt)),
		startedAt: safeText(input.startedAt, 40),
		failedAt: safeText(input.failedAt, 40),
		durationMs: safeNumber(input.durationMs),
		failureType: input.failureType === 'TimeoutError' ? 'TimeoutError' : 'Error',
		httpStatus:
			input.httpStatus !== null &&
			Number.isInteger(input.httpStatus) &&
			input.httpStatus >= 100 &&
			input.httpStatus <= 599
				? input.httpStatus
				: null,
		pathname: safeText(pathname, 240),
		viewport: input.viewport
			? { width: safeNumber(input.viewport.width), height: safeNumber(input.viewport.height) }
			: null,
		activeTabIndex:
			input.activeTabIndex === null ? null : Math.round(safeNumber(input.activeTabIndex)),
		scroll: {
			x: safeNumber(input.scroll.x, -1_000_000),
			y: safeNumber(input.scroll.y, -1_000_000),
			viewportWidth: safeNumber(input.scroll.viewportWidth),
			viewportHeight: safeNumber(input.scroll.viewportHeight),
			documentWidth: safeNumber(input.scroll.documentWidth),
			documentHeight: safeNumber(input.scroll.documentHeight)
		},
		pointer: {
			x: safeNullableNumber(input.pointer.x),
			y: safeNullableNumber(input.pointer.y),
			action: input.pointer.action === null ? null : safeText(input.pointer.action, 48),
			startX: safeNullableNumber(input.pointer.startX),
			startY: safeNullableNumber(input.pointer.startY),
			targetX: safeNullableNumber(input.pointer.targetX),
			targetY: safeNullableNumber(input.pointer.targetY)
		},
		elements: input.elements.slice(0, 12).map((element) => ({
			selector: safeText(element.selector, 120),
			count: Math.round(safeNumber(element.count)),
			visibleCount: Math.round(safeNumber(element.visibleCount)),
			boxes: element.boxes.slice(0, 4).map(safeRect),
			styles: element.styles.slice(0, 4).map((style) => ({
				display: safeText(style.display, 24),
				visibility: safeText(style.visibility, 24),
				opacity: safeText(style.opacity, 24),
				position: safeText(style.position, 24),
				zIndex: safeText(style.zIndex, 24)
			})),
			states: element.states.slice(0, 4).map((state) => ({
				expanded: state.expanded === null ? null : safeText(state.expanded, 12),
				pressed: state.pressed === null ? null : safeText(state.pressed, 12),
				disabled: state.disabled === true,
				ariaDisabled: state.ariaDisabled === null ? null : safeText(state.ariaDisabled, 12)
			}))
		}))
	};
}
