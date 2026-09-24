/**
 * Compendium data is JSON from the API but can be wrapped in Svelte reactive
 * proxies. JSON serialization safely unwraps those proxies; structuredClone
 * rejects them with DataCloneError.
 */
export function cloneInventoryRules(rules: Record<string, unknown> | null | undefined) {
	return JSON.parse(JSON.stringify(rules ?? {})) as Record<string, unknown>;
}
