/** Exact display conversions. Character rules and saved inventory weights stay canonical in lb/ft. */
export const POUNDS_TO_KILOGRAMS = 0.45359237;
export const FEET_TO_METERS = 0.3048;

export function poundsToKilograms(pounds: number): number {
	return pounds * POUNDS_TO_KILOGRAMS;
}

export function kilogramsToPounds(kilograms: number): number {
	return kilograms / POUNDS_TO_KILOGRAMS;
}

export function feetToMeters(feet: number): number {
	return feet * FEET_TO_METERS;
}

function formatMetric(value: number, locale: string): string {
	return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
		maximumFractionDigits: 2
	}).format(value);
}

/** Display-only rounding to the nearest 0.01 kg; no rounded value is persisted or used in rules. */
export function formatDnd2024Weight(pounds: number | null, locale: string): string {
	return pounds === null ? '—' : formatMetric(poundsToKilograms(pounds), locale);
}

/** Display-only rounding to the nearest centimeter; the rule continues to use its exact feet value. */
export function formatDnd2024Distance(feet: number, locale: string): string {
	return formatMetric(feetToMeters(feet), locale);
}
