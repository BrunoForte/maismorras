import type { Mensagem } from '$lib/stores/chatStore';

function compareStableIds(left: string, right: string) {
	if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
		const a = BigInt(left);
		const b = BigInt(right);
		return a < b ? -1 : a > b ? 1 : 0;
	}
	return left.localeCompare(right);
}

/** Merge history and realtime events by their persistent event IDs. */
export function mergeCampaignMessages(
	current: readonly Mensagem[],
	incoming: readonly Mensagem[],
	limit = 100
): Mensagem[] {
	const byId = new Map<string, Mensagem>();
	for (const message of current) byId.set(message.id, message);
	for (const message of incoming) byId.set(message.id, message);
	return [...byId.values()]
		.sort((left, right) => compareStableIds(left.id, right.id))
		.slice(-Math.max(0, limit));
}
