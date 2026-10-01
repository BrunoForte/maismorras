import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./httpClient', () => ({ request }));

import { publishSpellToChat } from './eventApi';

describe('publishSpellToChat', () => {
	beforeEach(() => request.mockReset());

	it('persists a campaign chat event with a fixed campaign audience', async () => {
		request.mockResolvedValueOnce({
			id: 91,
			type: 'chat.message',
			author: 'Jogador',
			payload: { text: '✨ Aela: Luz\nIlumina a área.' }
		});

		const message = await publishSpellToChat(
			{} as Session,
			'campaign-1',
			'Aela',
			'Luz',
			'Ilumina a área.'
		);

		expect(request).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/campaigns/campaign-1/events',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					type: 'chat.message',
					payload: { text: '✨ Aela: Luz\nIlumina a área.' }
				})
			})
		);
		expect(message).toMatchObject({
			id: '91',
			autor: 'Jogador',
			texto: '✨ Aela: Luz\nIlumina a área.',
			tipo: 'texto',
			canal: 'chat'
		});
	});
});
