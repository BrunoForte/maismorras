import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiceRollRevealer, ROLL_RESULT_REVEAL_FALLBACK_MS } from './diceRollReveal';

describe('dice roll chat result reveal', () => {
	afterEach(() => vi.useRealTimers());

	it('reveals a persisted realtime result without a local animation nonce after a short deadline', () => {
		vi.useFakeTimers();
		const onReveal = vi.fn();
		const reveal = createDiceRollRevealer(onReveal);

		reveal.schedule('42');
		expect(onReveal).not.toHaveBeenCalled();
		vi.advanceTimersByTime(ROLL_RESULT_REVEAL_FALLBACK_MS - 1);
		expect(onReveal).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);

		expect(onReveal).toHaveBeenCalledExactlyOnceWith('42');
		expect(reveal.isRevealed('42')).toBe(true);
	});

	it('reveals a local roll immediately when its animation reports completion', () => {
		vi.useFakeTimers();
		const onReveal = vi.fn();
		const reveal = createDiceRollRevealer(onReveal);

		reveal.schedule('17');
		reveal.complete(['17']);

		expect(onReveal).toHaveBeenCalledExactlyOnceWith('17');
		expect(reveal.pendingCount()).toBe(0);
		vi.advanceTimersByTime(ROLL_RESULT_REVEAL_FALLBACK_MS);
		expect(onReveal).toHaveBeenCalledOnce();
	});

	it('keeps reconnection or duplicate delivery from reanimating a completed event', () => {
		vi.useFakeTimers();
		const onReveal = vi.fn();
		const reveal = createDiceRollRevealer(onReveal);

		reveal.schedule('21');
		reveal.schedule('21');
		reveal.complete(['21']);
		reveal.schedule('21');
		reveal.complete(['21', '21']);

		expect(onReveal).toHaveBeenCalledExactlyOnceWith('21');
		expect(reveal.pendingCount()).toBe(0);
	});

	it('cancels pending animations on cleanup without revealing them later', () => {
		vi.useFakeTimers();
		const onReveal = vi.fn();
		const reveal = createDiceRollRevealer(onReveal);
		reveal.schedule('33');

		reveal.cleanup();
		vi.advanceTimersByTime(ROLL_RESULT_REVEAL_FALLBACK_MS);

		expect(onReveal).not.toHaveBeenCalled();
	});
});
