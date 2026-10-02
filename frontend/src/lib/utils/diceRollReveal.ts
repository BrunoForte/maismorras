export const ROLL_RESULT_REVEAL_FALLBACK_MS = 1_500;

/** Reveals a persisted result when its optional local dice animation is done. */
export function createDiceRollRevealer(
	onReveal: (messageId: string) => void,
	fallbackMs = ROLL_RESULT_REVEAL_FALLBACK_MS
) {
	const revealed = new Set<string>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	function reveal(messageId: string) {
		if (revealed.has(messageId)) return;
		const timer = timers.get(messageId);
		if (timer !== undefined) clearTimeout(timer);
		timers.delete(messageId);
		revealed.add(messageId);
		onReveal(messageId);
	}

	return {
		isRevealed: (messageId: string) => revealed.has(messageId),
		schedule(messageId: string) {
			if (revealed.has(messageId) || timers.has(messageId)) return;
			timers.set(
				messageId,
				setTimeout(() => reveal(messageId), fallbackMs)
			);
		},
		reveal,
		complete(messageIds: readonly string[]) {
			for (const messageId of messageIds) reveal(messageId);
		},
		cleanup() {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		},
		pendingCount: () => timers.size
	};
}
