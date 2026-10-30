export type PresentationDismissalMode = 'manual' | 'automatic';

/** Manual narrator dismissal is shared; automatic and player dismissal stay local. */
export function presentationDismissalTarget(
	isGM: boolean,
	mode: PresentationDismissalMode
): 'local' | 'shared' {
	return isGM && mode === 'manual' ? 'shared' : 'local';
}

export function createPresentationDismissalHandlers(
	isGM: boolean | (() => boolean),
	dismissLocally: () => void,
	dismissShared: () => void | Promise<void>
) {
	return {
		manual() {
			const isNarrator = typeof isGM === 'function' ? isGM() : isGM;
			if (presentationDismissalTarget(isNarrator, 'manual') === 'shared') return dismissShared();
			dismissLocally();
		},
		automatic() {
			dismissLocally();
		}
	};
}

/** A keyed timer that invalidates callbacks from superseded presentations. */
export function createPresentationAutoDismiss(onExpire: (key: string) => void, delayMs = 10_000) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let currentKey = '';
	let generation = 0;

	function cancel() {
		generation += 1;
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		currentKey = '';
	}

	function schedule(key: string, visible: boolean, restart = false) {
		if (!visible || !key) {
			cancel();
			return;
		}
		if (timer !== undefined && currentKey === key && !restart) return;
		cancel();
		const scheduledGeneration = generation;
		currentKey = key;
		timer = setTimeout(() => {
			if (generation !== scheduledGeneration || currentKey !== key) return;
			timer = undefined;
			currentKey = '';
			onExpire(key);
		}, delayMs);
	}

	return { schedule, cancel };
}
