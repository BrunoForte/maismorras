import { describe, expect, it } from 'vitest';
import { mergeCampaignMessages } from './campaignChatState';
import type { Mensagem } from '$lib/stores/chatStore';

const message = (id: string, texto = id): Mensagem => ({
	id,
	autor: 'Jogador',
	texto,
	tipo: 'texto'
});

describe('mergeCampaignMessages', () => {
	it('deduplicates realtime-first and optimistic HTTP responses using the persistent ID', () => {
		expect(
			mergeCampaignMessages([message('12')], [message('12', 'websocket'), message('13')])
		).toEqual([message('12', 'websocket'), message('13')]);
	});

	it('orders out-of-order events deterministically by database ID', () => {
		expect(
			mergeCampaignMessages([], [message('22'), message('8'), message('10')]).map(({ id }) => id)
		).toEqual(['8', '10', '22']);
	});

	it('retains only the newest configured number of messages', () => {
		expect(
			mergeCampaignMessages([], [message('1'), message('2'), message('3')], 2).map(({ id }) => id)
		).toEqual(['2', '3']);
	});
});
