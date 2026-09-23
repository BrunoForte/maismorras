import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

vi.mock('./supabase', () => ({ supabase: { auth: { refreshSession: vi.fn() } } }));

import { fetchAuthenticated } from './httpClient';
import { supabase } from './supabase';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
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
