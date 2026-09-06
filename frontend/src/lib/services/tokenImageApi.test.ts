import { afterEach, describe, expect, it, vi } from 'vitest';
import { gerarImagemToken } from './tokenImageApi';

afterEach(() => vi.unstubAllGlobals());

describe('gerarImagemToken', () => {
	it('codifica o prompt e retorna a data URL enviada pelo backend', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ fotoUrl: 'data:image/png;base64,abc' }), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(gerarImagemToken('mago anão')).resolves.toBe('data:image/png;base64,abc');
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('prompt=mago%20an%C3%A3o'),
			expect.objectContaining({ headers: { Accept: 'application/json' } })
		);
	});

	it('rejeita respostas de erro ou payloads inválidos', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
		await expect(gerarImagemToken('mago')).rejects.toThrow('HTTP 502');
	});
});
