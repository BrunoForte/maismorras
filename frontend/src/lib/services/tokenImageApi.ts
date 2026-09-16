import { apiBase } from './apiBase';

const apiBaseUrl = apiBase;

type TokenImageResponse = { fotoUrl: string };

/** Requests the server-side proxy; the browser never contacts Pollinations directly. */
export async function gerarImagemToken(prompt: string, signal?: AbortSignal): Promise<string> {
	const response = await fetch(
		`${apiBaseUrl}/api/v1/tokens/gerar?prompt=${encodeURIComponent(prompt)}`,
		{
			headers: { Accept: 'application/json' },
			signal
		}
	);

	if (!response.ok) {
		const body = await response.json().catch(() => null);
		const error = new Error(
			body?.error?.message ?? `Não foi possível gerar o token (HTTP ${response.status}).`
		) as Error & { code?: string; status?: number };
		error.code = body?.error?.code;
		error.status = response.status;
		throw error;
	}

	const body: TokenImageResponse = await response.json();
	if (!body.fotoUrl.startsWith('data:image/'))
		throw new Error('O servidor retornou uma imagem inválida.');
	return body.fotoUrl;
}
