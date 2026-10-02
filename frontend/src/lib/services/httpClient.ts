import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';
import { getSupabaseClient } from './supabase';

let sessionRefresh: Promise<Session | null> | null = null;

async function refreshSessionOnce(): Promise<Session | null> {
	const supabase = await getSupabaseClient().catch(() => null);
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
		return fetch(input, { ...init, cache: init.cache ?? 'no-store', headers });
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
		public readonly body: unknown = null,
		public readonly retryAfterMs?: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export function parseRetryAfterHeader(value: string | null, now = Date.now()): number | undefined {
	if (!value?.trim()) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function userFacingMessage(status: number, body: unknown, fallback: string): string {
	if (status === 401) return 'Sua sessão expirou. Entre novamente e repita a ação.';
	if (status === 403) return 'Você não tem permissão para fazer isso nesta mesa.';
	if (status === 404) return 'O item solicitado não foi encontrado ou não está mais disponível.';
	if (status === 408) return 'A operação demorou mais que o esperado. Tente novamente.';
	const errorCode =
		typeof body === 'object' &&
		body !== null &&
		'error' in body &&
		typeof body.error === 'object' &&
		body.error !== null &&
		'code' in body.error
			? String(body.error.code)
			: '';
	if (errorCode === 'TRANSLATION_NOT_CONFIGURED')
		return 'A tradução por IA não está configurada no servidor. Peça ao administrador para conferir as credenciais do provedor.';
	if (errorCode === 'TRANSLATION_RATE_LIMITED')
		return 'O serviço de tradução recebeu muitas solicitações. Aguarde um instante antes de tentar novamente.';
	if (errorCode === 'TRANSLATION_TIMEOUT')
		return 'A tradução demorou mais que o esperado. As traduções já salvas foram preservadas; tente novamente.';
	if (errorCode === 'TRANSLATION_UNAVAILABLE')
		return 'O serviço de tradução está temporariamente indisponível. As traduções já salvas foram preservadas; tente novamente mais tarde.';
	if (status === 502 && errorCode === 'TRANSLATION_PROVIDER_ERROR')
		return 'O serviço externo de tradução falhou temporariamente. As traduções já salvas foram preservadas; tente novamente para continuar pelas pendentes.';
	if (status === 503 && errorCode === 'TRANSLATION_QUOTA_EXCEEDED')
		return 'A cota mensal gratuita de tradução terminou. As traduções salvas foram preservadas; tente novamente quando a cota renovar.';
	if (status === 429)
		return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
	if (status >= 500)
		return 'O serviço encontrou um erro. Tente novamente; se persistir, informe o horário da tentativa.';
	const candidate =
		typeof body === 'object' &&
		body !== null &&
		'error' in body &&
		typeof body.error === 'object' &&
		body.error !== null &&
		'message' in body.error
			? String(body.error.message)
			: typeof body === 'string'
				? body
				: fallback;
	const clean = candidate
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (!clean || clean.length > 180 || /https?:\/\/|\bat\s+\w+\s*\(/i.test(clean))
		return 'Não foi possível concluir a ação. Revise os dados e tente novamente.';
	return clean;
}

function reportRequestError(message: string) {
	if (typeof window !== 'undefined')
		window.dispatchEvent(new CustomEvent('maismorras:request-error', { detail: { message } }));
}

export function notifyUserRequestError(message: string) {
	const clean = message
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.replace(/https?:\/\/\S+/gi, '')
		.trim();
	const safe =
		!clean || clean.length > 180 || /\bat\s+\w+\s*\(/i.test(clean)
			? 'Não foi possível concluir a ação. Tente novamente.'
			: clean;
	reportRequestError(safe);
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
	timeoutMs = 15_000,
	notifyErrors = true
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
			const message = userFacingMessage(408, null, fallback);
			if (notifyErrors) reportRequestError(message);
			throw new ApiError(408, message);
		}
		if (!init.signal?.aborted) {
			const message =
				'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
			if (notifyErrors) reportRequestError(message);
			throw new ApiError(0, message);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
	const body = await readBody(response);
	if (!response.ok) {
		const message = userFacingMessage(response.status, body, fallback);
		if (notifyErrors) reportRequestError(message);
		throw new ApiError(
			response.status,
			message,
			body,
			parseRetryAfterHeader(response.headers.get('Retry-After'))
		);
	}
	return (body === null ? undefined : body) as T;
}
