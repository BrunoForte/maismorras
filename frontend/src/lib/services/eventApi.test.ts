import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./httpClient', () => ({ request }));

import { campaignEventToMessage, publishSpellToChat, rollDice } from './eventApi';

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

	it('envia a ficha associada à rolagem para validação pelo backend', async () => {
		request.mockResolvedValueOnce({ id: 93, type: 'dice.roll', payload: {} });
		await rollDice(
			{} as Session,
			'campaign-1',
			'1d20+4',
			undefined,
			'combat',
			undefined,
			false,
			false,
			'character-1'
		);

		const body = JSON.parse(request.mock.calls[0][2].body as string);
		expect(body).toEqual({
			type: 'dice.roll',
			payload: { expression: '1d20+4', channel: 'combat', characterId: 'character-1' }
		});
	});

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

describe('campaignEventToMessage roll authorship', () => {
	const rollEvent = (author: string, payload: Record<string, unknown>) => ({
		id: 94,
		author,
		type: 'dice.roll' as const,
		payload: {
			expressao: '1d20+4',
			dados: [13],
			total: 17,
			label: 'Teste de Percepção',
			text: 'Teste de Percepção · Normal · resultado 17',
			channel: 'combat',
			...payload
		},
		createdAt: '2026-11-15T12:00:00Z'
	});

	it('uses the associated character as chat author and supplies the overlay name-label pair', () => {
		const message = campaignEventToMessage(
			rollEvent('Conta do narrador', { characterName: 'Aela' })
		);

		expect(message).toMatchObject({
			tipo: 'rolagem',
			autor: 'Aela',
			detalhesRolagem: { label: 'Teste de Percepção', expressao: '1d20+4' }
		});
		expect(`${message?.autor} · ${message?.detalhesRolagem?.label}`).toBe(
			'Aela · Teste de Percepção'
		);
	});

	it.each([
		{ name: 'legacy event without characterName', payload: {} },
		{ name: 'event without an associated character', payload: { characterName: '  ' } }
	])('keeps the account author for a $name', ({ payload }) => {
		const message = campaignEventToMessage(rollEvent('Conta da jogadora', payload));

		expect(message?.autor).toBe('Conta da jogadora');
		expect(message?.detalhesRolagem?.label).toBe('Teste de Percepção');
	});
});
