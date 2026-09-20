import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

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
	fallback = 'Não foi possível concluir a operação.'
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15_000);
	let response: Response;
	try {
		response = await fetch(`${apiBase}${path}`, {
			...init,
			signal: init.signal ?? controller.signal,
			headers: {
				Authorization: `Bearer ${session.access_token}`,
				'Content-Type': 'application/json',
				...init.headers
			}
		});
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
