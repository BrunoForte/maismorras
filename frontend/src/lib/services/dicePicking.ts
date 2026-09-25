export type MatrixElements = ArrayLike<number>;

export type ProjectedDie = {
	x: number;
	y: number;
	radius: number;
	depth: number;
	pixelsPerWorldUnit: number;
};

function transformPoint(
	point: { x: number; y: number; z: number },
	matrix: MatrixElements
): [number, number, number, number] {
	return [
		(matrix[0] ?? 1) * point.x +
			(matrix[4] ?? 0) * point.y +
			(matrix[8] ?? 0) * point.z +
			(matrix[12] ?? 0),
		(matrix[1] ?? 0) * point.x +
			(matrix[5] ?? 1) * point.y +
			(matrix[9] ?? 0) * point.z +
			(matrix[13] ?? 0),
		(matrix[2] ?? 0) * point.x +
			(matrix[6] ?? 0) * point.y +
			(matrix[10] ?? 1) * point.z +
			(matrix[14] ?? 0),
		(matrix[3] ?? 0) * point.x +
			(matrix[7] ?? 0) * point.y +
			(matrix[11] ?? 0) * point.z +
			(matrix[15] ?? 1)
	];
}

export function projectDieToViewport(
	point: { x: number; y: number; z: number },
	radius: number,
	viewMatrix: MatrixElements,
	projectionMatrix: MatrixElements,
	width: number,
	height: number
): ProjectedDie | null {
	if (width <= 0 || height <= 0) return null;
	const [viewX, viewY, viewZ, viewW] = transformPoint(point, viewMatrix);
	const [clipX, clipY, , clipW] = transformPoint(
		{ x: viewX / viewW, y: viewY / viewW, z: viewZ / viewW },
		projectionMatrix
	);
	if (!Number.isFinite(clipW) || clipW <= 0 || Math.abs(viewZ) < 0.001) return null;
	const normalizedX = clipX / clipW;
	const normalizedY = clipY / clipW;
	if (Math.abs(normalizedX) > 1.2 || Math.abs(normalizedY) > 1.2) return null;
	const pixelsPerWorldUnit = Math.abs((projectionMatrix[5] ?? 1) * height) / (2 * Math.abs(viewZ));
	return {
		x: ((normalizedX + 1) / 2) * width,
		y: ((1 - normalizedY) / 2) * height,
		radius: Math.max(16, radius * pixelsPerWorldUnit * 1.35),
		depth: Math.abs(viewZ),
		pixelsPerWorldUnit
	};
}

export function pickProjectedDie<T extends { die: unknown; projected: ProjectedDie }>(
	items: T[],
	x: number,
	y: number
) {
	return items
		.filter(({ projected }) => Math.hypot(projected.x - x, projected.y - y) <= projected.radius)
		.sort((a, b) => a.projected.depth - b.projected.depth)[0];
}

export function worldDragDelta(deltaX: number, deltaY: number, pixelsPerWorldUnit: number) {
	const scale = Math.max(0.001, pixelsPerWorldUnit);
	return { x: deltaX / scale, y: -deltaY / scale };
}
