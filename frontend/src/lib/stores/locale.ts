import { writable } from 'svelte/store';

export type AppLocale = 'pt-BR' | 'en';
export type UnitSystem = 'metric' | 'imperial';

const storageKey = 'maismorras.locale';

export const appLocale = writable<AppLocale>('pt-BR');
export const units = writable<UnitSystem>('metric');

export function setAppLocale(next: AppLocale) {
	appLocale.set(next);
	units.set(next === 'pt-BR' ? 'metric' : 'imperial');
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(storageKey, next);
		// Keep the sheet and the compendium in the same language during the
		// transition away from their former independent preferences.
		localStorage.setItem('maismorras.rulesLocale', next);
	}
}

export function restoreAppLocale() {
	if (typeof localStorage === 'undefined') return;
	setAppLocale(localStorage.getItem(storageKey) === 'en' ? 'en' : 'pt-BR');
}

export function distance(valueInMeters: number, locale: AppLocale): string {
	if (!Number.isFinite(valueInMeters)) return '—';
	if (locale === 'pt-BR') return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(valueInMeters)} m`;
	const feet = valueInMeters * 3.28084;
	return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(feet)} ft`;
}

// Converts the compact distance strings present in SRD cards (for example
// "30 ft., fly 60 ft.") only at render time. The canonical rule data remains
// untouched, which prevents round-trip precision loss.
export function distanceText(value: string, locale: AppLocale): string {
	if (locale === 'en') return value;
	return value.replace(/(\d+(?:\.\d+)?)\s*\b(?:ft|feet)\b\.?/gi, (_, raw: string) =>
		distance(Number(raw) * 0.3048, 'pt-BR')
	);
}
