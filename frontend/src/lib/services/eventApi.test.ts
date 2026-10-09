import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./httpClient', () => ({ request }));

import { publishSpellToChat, rollDice } from './eventApi';

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

describe('rollDice', () => {
	beforeEach(() => request.mockReset());

	it('marca a rolagem de dano de arma para validação e crítico no servidor', async () => {
		request.mockResolvedValueOnce({ id: 92, type: 'dice.roll', payload: {} });
		await rollDice(
			{} as Session,
			'campaign-1',
			'2d6+4',
			undefined,
			'combat',
			undefined,
			true,
			true
		);

		expect(request).toHaveBeenCalledWith(
			expect.anything(),
			'/api/v1/campaigns/campaign-1/events',
			expect.objectContaining({
				body: JSON.stringify({
					type: 'dice.roll',
					payload: {
						expression: '2d6+4',
						mode: undefined,
						channel: 'combat',
						weaponDamage: true,
						critical: true
					}
				})
			})
		);
	});
});
