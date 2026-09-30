export type OverlayBlock = {
	id: string;
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize: number;
	color: string;
	opacity: number;
	borderColor: string;
	borderWidth: number;
	shadow: boolean;
	visible: boolean;
	locked: boolean;
};

export type OverlayLayout = {
	background: string;
	blocks: OverlayBlock[];
	livekitUrl: string;
	livekitRoom: string;
	livekitToken: string;
};

export type OverlayLayoutDocument = {
	activeProfile: string;
	profiles: Record<string, OverlayLayout>;
};

export type OverlayBlockPatch = Partial<Omit<OverlayBlock, 'id'>>;
export type OverlayBlockProperty =
	| 'x'
	| 'y'
	| 'width'
	| 'height'
	| 'fontSize'
	| 'opacity'
	| 'color'
	| 'borderWidth'
	| 'borderColor'
	| 'shadow'
	| 'visible'
	| 'locked';

export function createDefaultOverlayLayout(): OverlayLayout {
	return {
		background: '',
		livekitUrl: '',
		livekitRoom: '',
		livekitToken: '',
		blocks: [
			{
				id: 'initiative',
				label: 'Barra de iniciativa',
				x: 50,
				y: 7,
				width: 94,
				height: 15,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'host-camera',
				label: 'Câmera do narrador',
				x: 11,
				y: 17,
				width: 20,
				height: 23,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'active-character',
				label: 'Ficha do turno',
				x: 87,
				y: 49,
				width: 23,
				height: 43,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'dice',
				label: 'Dados 3D',
				x: 50,
				y: 57,
				width: 36,
				height: 52,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			...Array.from({ length: 5 }, (_, index): OverlayBlock => ({
				id: `camera-${index + 1}`,
				label: `Câmera de jogador ${index + 1}`,
				x: 10 + index * 20,
				y: 88,
				width: 18,
				height: 19,
				fontSize: 0.8,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			}))
		]
	};
}

export function createDefaultOverlayDocument(): OverlayLayoutDocument {
	return { activeProfile: 'Principal', profiles: { Principal: createDefaultOverlayLayout() } };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteNumber = (value: unknown, fallback: number): number => {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : fallback;
};

function normalizeBlock(fallback: OverlayBlock, value: unknown): OverlayBlock {
	const record = isRecord(value) ? value : {};
	const block = { ...fallback, ...record } as OverlayBlock;
	block.id = fallback.id;
	block.label = typeof record.label === 'string' ? record.label : fallback.label;
	block.width = Math.max(8, Math.min(100, finiteNumber(record.width, fallback.width)));
	block.height = Math.max(6, Math.min(100, finiteNumber(record.height, fallback.height)));
	// Keep established defaults such as the initiative bar at y=7, while still
	// rejecting persisted coordinates outside the composition surface.
	block.x = Math.max(0, Math.min(100, finiteNumber(record.x, fallback.x)));
	block.y = Math.max(0, Math.min(100, finiteNumber(record.y, fallback.y)));
	block.fontSize = Math.max(0.5, Math.min(3, finiteNumber(record.fontSize, fallback.fontSize)));
	block.opacity = Math.max(0, Math.min(100, finiteNumber(record.opacity, fallback.opacity)));
	block.borderWidth = Math.max(
		0,
		Math.min(8, finiteNumber(record.borderWidth, fallback.borderWidth))
	);
	block.color =
		typeof record.color === 'string' && /^#[\da-f]{6}$/i.test(record.color)
			? record.color
			: fallback.color;
	block.borderColor =
		typeof record.borderColor === 'string' && /^#[\da-f]{6}$/i.test(record.borderColor)
			? record.borderColor
			: fallback.borderColor;
	block.shadow = typeof record.shadow === 'boolean' ? record.shadow : fallback.shadow;
	block.visible = typeof record.visible === 'boolean' ? record.visible : fallback.visible;
	block.locked = typeof record.locked === 'boolean' ? record.locked : fallback.locked;
	return block;
}

export function normalizeOverlayLayout(value: unknown): OverlayLayout {
	const base = createDefaultOverlayLayout();
	const record = isRecord(value) ? value : {};
	const suppliedBlocks = Array.isArray(record.blocks) ? record.blocks : [];
	const layout: OverlayLayout = {
		background: typeof record.background === 'string' ? record.background : base.background,
		livekitUrl: typeof record.livekitUrl === 'string' ? record.livekitUrl : base.livekitUrl,
		livekitRoom: typeof record.livekitRoom === 'string' ? record.livekitRoom : base.livekitRoom,
		livekitToken: typeof record.livekitToken === 'string' ? record.livekitToken : base.livekitToken,
		blocks: base.blocks.map((fallback) =>
			normalizeBlock(
				fallback,
				suppliedBlocks.find((item) => isRecord(item) && item.id === fallback.id)
			)
		)
	};
	return layout;
}

export function normalizeOverlayDocument(value: unknown): OverlayLayoutDocument {
	if (!isRecord(value)) return createDefaultOverlayDocument();
	if (!isRecord(value.profiles)) {
		const legacyLayout = normalizeOverlayLayout(value);
		return { activeProfile: 'Principal', profiles: { Principal: legacyLayout } };
	}
	const profiles = Object.fromEntries(
		Object.entries(value.profiles)
			.filter(([name]) => name.trim().length > 0)
			.map(([name, profile]) => [name, normalizeOverlayLayout(profile)])
	);
	if (!Object.keys(profiles).length) return createDefaultOverlayDocument();
	const requestedProfile = typeof value.activeProfile === 'string' ? value.activeProfile : '';
	const activeProfile = profiles[requestedProfile] ? requestedProfile : Object.keys(profiles)[0];
	return { activeProfile, profiles };
}

export function selectOverlayProfile(
	document: OverlayLayoutDocument,
	currentLayout: OverlayLayout,
	name: string
): { document: OverlayLayoutDocument; layout: OverlayLayout } {
	if (!document.profiles[name]) return { document, layout: currentLayout };
	const profiles = {
		...document.profiles,
		[document.activeProfile]: normalizeOverlayLayout(currentLayout)
	};
	return { document: { activeProfile: name, profiles }, layout: profiles[name] };
}

export function createOverlayProfile(
	document: OverlayLayoutDocument,
	currentLayout: OverlayLayout,
	name: string
): { document: OverlayLayoutDocument; layout: OverlayLayout } | null {
	const normalizedName = name.trim();
	if (!normalizedName || document.profiles[normalizedName]) return null;
	const profiles = {
		...document.profiles,
		[document.activeProfile]: normalizeOverlayLayout(currentLayout)
	};
	const layout = normalizeOverlayLayout(currentLayout);
	profiles[normalizedName] = layout;
	return { document: { activeProfile: normalizedName, profiles }, layout };
}

export function renameOverlayProfile(
	document: OverlayLayoutDocument,
	name: string
): OverlayLayoutDocument | null {
	const normalizedName = name.trim();
	if (
		!normalizedName ||
		normalizedName === document.activeProfile ||
		document.profiles[normalizedName]
	)
		return null;
	const profiles = {
		...document.profiles,
		[normalizedName]: document.profiles[document.activeProfile]
	};
	delete profiles[document.activeProfile];
	return { activeProfile: normalizedName, profiles };
}

export function deleteOverlayProfile(
	document: OverlayLayoutDocument
): OverlayLayoutDocument | null {
	const names = Object.keys(document.profiles);
	if (names.length <= 1) return null;
	const profiles = { ...document.profiles };
	delete profiles[document.activeProfile];
	const activeProfile = Object.keys(profiles)[0];
	return { activeProfile, profiles };
}

export function snapOverlayPosition(
	layout: OverlayLayout,
	id: string | undefined,
	x: number,
	y: number,
	snapToGrid: boolean
): { x: number; y: number } {
	const item = layout.blocks.find((block) => block.id === id);
	if (!item) return { x, y };
	if (item.locked) return { x: item.x, y: item.y };
	const gridX = snapToGrid ? Math.round(x / 2) * 2 : x;
	const gridY = snapToGrid ? Math.round(y / 2) * 2 : y;
	const others = layout.blocks.filter((block) => block.id !== id);
	const xs = [item.width / 2, 50, 100 - item.width / 2];
	const ys = [item.height / 2, 50, 100 - item.height / 2];
	for (const other of others) {
		xs.push(other.x - other.width / 2, other.x + other.width / 2, other.x);
		ys.push(other.y - other.height / 2, other.y + other.height / 2, other.y);
	}
	const nearest = (position: number, candidates: number[]) => {
		const candidate = candidates.reduce((best, current) =>
			Math.abs(current - position) < Math.abs(best - position) ? current : best
		);
		return Math.abs(candidate - position) <= 1.5 ? candidate : position;
	};
	return {
		x: Math.max(item.width / 2, Math.min(100 - item.width / 2, nearest(gridX, xs))),
		y: Math.max(item.height / 2, Math.min(100 - item.height / 2, nearest(gridY, ys)))
	};
}

export function moveOverlayBlock(
	layout: OverlayLayout,
	id: string | undefined,
	x: number,
	y: number
): OverlayLayout {
	if (!id) return layout;
	return {
		...layout,
		blocks: layout.blocks.map((block) =>
			block.id === id && !block.locked ? { ...block, x, y } : block
		)
	};
}

export function resizeOverlayBlock(
	layout: OverlayLayout,
	id: string,
	pointerXPercent: number,
	pointerYPercent: number
): OverlayLayout {
	const block = layout.blocks.find((item) => item.id === id);
	if (!block || block.locked) return layout;
	const itemLeft = block.x - block.width / 2;
	const itemTop = block.y - block.height / 2;
	const width = Math.max(8, Math.min(96, pointerXPercent - itemLeft));
	const height = Math.max(6, Math.min(96, pointerYPercent - itemTop));
	return {
		...layout,
		blocks: layout.blocks.map((item) => (item.id === id ? { ...item, width, height } : item))
	};
}

export function updateOverlayBlockProperty(
	layout: OverlayLayout,
	id: string,
	property: OverlayBlockProperty,
	value: string | boolean
): OverlayLayout {
	const block = layout.blocks.find((item) => item.id === id);
	if (!block) return layout;
	let patch: OverlayBlockPatch;
	if (property === 'shadow' || property === 'visible' || property === 'locked') {
		if (typeof value !== 'boolean') return layout;
		patch = { [property]: value };
	} else if (property === 'color' || property === 'borderColor') {
		if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return layout;
		patch = { [property]: value };
	} else {
		const number = Number(value);
		if (!Number.isFinite(number)) return layout;
		const bounds: Record<
			Extract<
				OverlayBlockProperty,
				'x' | 'y' | 'width' | 'height' | 'fontSize' | 'opacity' | 'borderWidth'
			>,
			[number: number, number: number]
		> = {
			x: [block.width / 2, 100 - block.width / 2],
			y: [block.height / 2, 100 - block.height / 2],
			width: [8, 100],
			height: [6, 100],
			fontSize: [0.5, 3],
			opacity: [0, 100],
			borderWidth: [0, 8]
		};
		const [minimum, maximum] = bounds[property];
		patch = { [property]: Math.max(minimum, Math.min(maximum, number)) };
	}
	return {
		...layout,
		blocks: layout.blocks.map((item) => (item.id === id ? { ...item, ...patch } : item))
	};
}
