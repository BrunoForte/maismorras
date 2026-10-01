export type HitPointUpdate = { delta: number } | { hpCurrent: number };

/** Signed values are relative damage/healing; unsigned values set the current total. */
export function parseHitPointInput(value: string): HitPointUpdate | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[+-]\d+$/.test(trimmed)) return { delta: Number(trimmed) };
	const absolute = Number(trimmed);
	return Number.isFinite(absolute) ? { hpCurrent: Math.trunc(absolute) } : null;
}
