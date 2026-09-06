const apiBaseUrl = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

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

	if (!response.ok) throw new Error(`Não foi possível gerar o token (HTTP ${response.status}).`);

	const body: TokenImageResponse = await response.json();
	if (!body.fotoUrl.startsWith('data:image/'))
		throw new Error('O servidor retornou uma imagem inválida.');
	return body.fotoUrl;
}
