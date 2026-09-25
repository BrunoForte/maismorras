import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

vi.mock('./supabase', () => ({ supabase: { auth: { refreshSession: vi.fn() } } }));

import { fetchAuthenticated, request } from './httpClient';
import { supabase } from './supabase';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('fetchAuthenticated', () => {
	it('refreshes an expired session and retries with the new access token', async () => {
		const refreshed = {
			access_token: 'fresh-token',
			user: { id: 'user-1' }
		} as Session;
		vi.mocked(supabase!.auth.refreshSession).mockResolvedValue({
			data: { session: refreshed },
			error: null
		} as never);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const session = {
			access_token: 'expired-token',
			user: { id: 'user-1' }
		} as Session;

		const response = await fetchAuthenticated(session, 'https://api.example.test/resource');

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
			'Bearer expired-token'
		);
		expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
			'Bearer fresh-token'
		);
	});

	it('does not retry with a refreshed session belonging to another user', async () => {
		vi.mocked(supabase!.auth.refreshSession).mockResolvedValue({
			data: {
				session: { access_token: 'other-token', user: { id: 'user-2' } } as Session
			},
			error: null
		} as never);
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
		vi.stubGlobal('fetch', fetchMock);

		const response = await fetchAuthenticated(
			{ access_token: 'expired-token', user: { id: 'user-1' } } as Session,
			'https://api.example.test/resource'
		);

		expect(response.status).toBe(401);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('request timeout', () => {
	it('reports a useful timeout error instead of exposing the raw abort message', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
						once: true
					});
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const pending = request(
			{ access_token: 'token', user: { id: 'user-1' } } as Session,
			'/slow',
			{},
			'fallback',
			25
		);
		const assertion = expect(pending).rejects.toMatchObject({
			status: 408,
			message: 'A operação demorou mais que o esperado. Tente novamente.'
		});

		await vi.advanceTimersByTimeAsync(25);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('shows only one concise sentence for server failures', async () => {
		const onError = vi.fn();
		const browserWindow = new EventTarget();
		vi.stubGlobal('window', browserWindow);
		browserWindow.addEventListener('maismorras:request-error', onError);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({ error: { message: 'panic at internal/db.go:42\nsecret stack' } }),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			)
		);

		await expect(
			request({ access_token: 'token', user: { id: 'user-1' } } as Session, '/broken')
		).rejects.toMatchObject({ status: 500 });

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0].detail.message).toBe(
			'O serviço encontrou um erro. Tente novamente; se persistir, informe o horário da tentativa.'
		);
		expect(onError.mock.calls[0][0].detail.message).not.toContain('db.go');
		browserWindow.removeEventListener('maismorras:request-error', onError);
	});

	it('explains translation provider outages without exposing internal details', async () => {
		const onError = vi.fn();
		const browserWindow = new EventTarget();
		vi.stubGlobal('window', browserWindow);
		browserWindow.addEventListener('maismorras:request-error', onError);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						error: {
							code: 'TRANSLATION_PROVIDER_ERROR',
							message: 'provider request failed: secret stack at provider.go:42'
						}
					}),
					{ status: 502, headers: { 'Content-Type': 'application/json' } }
				)
			)
		);

		await expect(
			request({ access_token: 'token', user: { id: 'user-1' } } as Session, '/translate')
		).rejects.toMatchObject({
			status: 502,
			message:
				'O serviço externo de tradução falhou temporariamente. As traduções já salvas foram preservadas; tente novamente para continuar pelas pendentes.'
		});

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0].detail.message).toContain(
			'traduções já salvas foram preservadas'
		);
		expect(onError.mock.calls[0][0].detail.message).not.toContain('provider.go');
		browserWindow.removeEventListener('maismorras:request-error', onError);
	});
});
