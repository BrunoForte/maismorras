import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import { supabase } from './supabase';

let sessionRefresh: Promise<Session | null> | null = null;

async function refreshSessionOnce(): Promise<Session | null> {
	if (!supabase) return null;
	if (!sessionRefresh) {
		sessionRefresh = supabase.auth
			.refreshSession()
			.then(({ data, error }) => (error ? null : data.session))
			.catch(() => null)
			.finally(() => {
				sessionRefresh = null;
			});
	}
	return sessionRefresh;
}

/** Retries an unauthorized request once after refreshing the same user's session. */
export async function fetchAuthenticated(
	session: Session,
	input: RequestInfo | URL,
	init: RequestInit = {}
): Promise<Response> {
	const send = (accessToken: string) => {
		const headers = new Headers(init.headers);
		headers.set('Authorization', `Bearer ${accessToken}`);
		return fetch(input, { ...init, headers });
	};
	const response = await send(session.access_token);
	if (response.status !== 401) return response;
	const refreshed = await refreshSessionOnce();
	if (
		!refreshed ||
		refreshed.user.id !== session.user.id ||
		refreshed.access_token === session.access_token
	)
		return response;
	return send(refreshed.access_token);
}

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly body: unknown = null
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function readBody(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text.trim()) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

export async function request<T>(
	session: Session,
	path: string,
	init: RequestInit = {},
	fallback = 'Não foi possível concluir a operação.',
	timeoutMs = 15_000
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	try {
		response = await fetchAuthenticated(session, `${apiBase}${path}`, {
			...init,
			signal: init.signal ?? controller.signal,
			headers: {
				Authorization: `Bearer ${session.access_token}`,
				'Content-Type': 'application/json',
				...init.headers
			}
		});
	} catch (error) {
		if (controller.signal.aborted && !init.signal?.aborted) {
			throw new ApiError(408, 'A operação demorou mais que o esperado. Tente novamente.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
	const body = await readBody(response);
	if (!response.ok) {
		const message =
			typeof body === 'object' &&
			body !== null &&
			'error' in body &&
			typeof body.error === 'object' &&
			body.error !== null &&
			'message' in body.error
				? String(body.error.message)
				: typeof body === 'string' && body.trim()
					? body
					: fallback;
		throw new ApiError(response.status, message, body);
	}
	return (body === null ? undefined : body) as T;
}
