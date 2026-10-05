import { describe, expect, it } from 'vitest';
import { sanitizeSafeE2EDiagnostic, type SafeDiagnosticInput } from './safeE2EDiagnostics';

describe('sanitizeSafeE2EDiagnostic', () => {
	it('keeps only safe geometry and timing, removing URL credentials and arbitrary page content', () => {
		const input: SafeDiagnosticInput & Record<string, unknown> = {
			test: 'floating panels can be tested',
			step: 'resize panel',
			attempt: 1,
			startedAt: '2026-10-05T12:00:00.000Z',
			failedAt: '2026-10-05T12:00:02.000Z',
			durationMs: 2000,
			failureType: 'TimeoutError',
			httpStatus: 403,
			url: 'https://example.test/campaign/12345678-abcd-1234-abcd-123456789012?access_token=topsecret#private',
			viewport: { width: 390, height: 844 },
			activeTabIndex: 2,
			scroll: {
				x: 0,
				y: 10,
				viewportWidth: 390,
				viewportHeight: 844,
				documentWidth: 390,
				documentHeight: 1200
			},
			pointer: {
				x: 12,
				y: 25,
				action: 'resize',
				startX: 10,
				startY: 22,
				targetX: 20,
				targetY: 32
			},
			elements: [
				{
					selector: '.floating-chat',
					count: 1,
					visibleCount: 1,
					boxes: [{ left: 10, top: 20, width: 300, height: 200 }],
					styles: [
						{
							display: 'block',
							visibility: 'visible',
							opacity: '1',
							position: 'fixed',
							zIndex: '20'
						}
					],
					states: [{ expanded: 'true', pressed: null, disabled: false, ariaDisabled: null }]
				}
			],
			inputValue: 'private character name',
			chatText: 'private message',
			header: 'Bearer secret-header',
			cookie: 'session-cookie'
		};

		const serialized = JSON.stringify(sanitizeSafeE2EDiagnostic(input));
		expect(serialized).toContain('"pathname":"/campaign/[id]"');
		expect(serialized).toContain('"zIndex":"20"');
		expect(serialized).toContain('"failureType":"TimeoutError"');
		expect(serialized).toContain('"httpStatus":403');
		expect(serialized).not.toContain('access_token');
		expect(serialized).not.toContain('topsecret');
		expect(serialized).not.toContain('private');
		expect(serialized).not.toContain('secret-header');
		expect(serialized).not.toContain('session-cookie');
		expect(serialized).not.toContain('inputValue');
		expect(serialized).not.toContain('chatText');
	});
});
