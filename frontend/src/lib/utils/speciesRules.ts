/** Converts canonical metric speed to the display unit selected by the user. */
export function displayedSpeed(speed: number, locale: string): number {
	return locale === 'en' ? Math.round(speed * 3.28084) : speed;
}

/** Converts edited display speed back to canonical metric storage. */
export function storedSpeedFromDisplay(value: string, locale: string): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return locale === 'en' ? Math.round((parsed / 3.28084) * 10) / 10 : parsed;
}
