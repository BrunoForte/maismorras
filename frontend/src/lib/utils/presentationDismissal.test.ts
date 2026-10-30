import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createPresentationAutoDismiss,
	createPresentationDismissalHandlers,
	presentationDismissalTarget
} from './presentationDismissal';

afterEach(() => vi.useRealTimers());

describe('presentation dismissal', () => {
	it('expires the app modal locally without closing the overlay presentation', () => {
		vi.useFakeTimers();
		let appModalVisible = true;
		let overlayVisible = true;
		const dismissals = createPresentationDismissalHandlers(
			true,
			() => {
				appModalVisible = false;
			},
			() => {
				overlayVisible = false;
			}
		);
		const timer = createPresentationAutoDismiss(dismissals.automatic);

		timer.schedule('presentation-1', true);
		vi.advanceTimersByTime(9_999);
		expect(appModalVisible).toBe(true);
		vi.advanceTimersByTime(1);

		expect(appModalVisible).toBe(false);
		expect(presentationDismissalTarget(true, 'automatic')).toBe('local');
		expect(overlayVisible).toBe(true);
	});

	it('keeps manual narrator close shared and player close local', () => {
		let appModalVisible = true;
		let overlayVisible = true;
		const local = () => {
			appModalVisible = false;
		};
		const shared = () => {
			appModalVisible = false;
			overlayVisible = false;
		};
		const narrator = createPresentationDismissalHandlers(true, local, shared);
		narrator.manual();
		expect(appModalVisible).toBe(false);
		expect(overlayVisible).toBe(false);

		appModalVisible = true;
		overlayVisible = true;
		const player = createPresentationDismissalHandlers(false, local, shared);
		player.manual();
		expect(appModalVisible).toBe(false);
		expect(overlayVisible).toBe(true);
	});

	it('does not let a superseded timer expire a newer presentation', () => {
		vi.useFakeTimers();
		const onExpire = vi.fn();
		const timer = createPresentationAutoDismiss(onExpire);

		timer.schedule('older', true);
		vi.advanceTimersByTime(6_000);
		timer.schedule('newer', true);
		vi.advanceTimersByTime(4_000);
		expect(onExpire).not.toHaveBeenCalled();
		vi.advanceTimersByTime(6_000);
		expect(onExpire).toHaveBeenCalledTimes(1);
		expect(onExpire).toHaveBeenCalledWith('newer');
	});
});
