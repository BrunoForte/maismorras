import type { Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { DND2024_REF } from '$lib/systems/types';
import { createCampaign, normalizeCampaign } from './campaignApi';

describe('normalizeCampaign', () => {
	it('keeps legacy campaign payloads pinned to the current D&D 2024 release', () => {
		expect(normalizeCampaign({ id: 'legacy', name: 'Old campaign' })).toMatchObject({
			systemId: 'dnd2024',
			systemVersion: '1.0.0'
		});
	});

	it('preserves an explicitly versioned system reference from the API', () => {
		expect(
			normalizeCampaign({
				id: 'campaign',
				name: 'Versioned campaign',
				system_id: 'custom-system',
				system_version: '2.1.3'
			})
		).toMatchObject({
			systemId: 'custom-system',
			systemVersion: '2.1.3'
		});
	});
});

describe('createCampaign', () => {
	it('sends the explicit pinned D&D 2024 reference for a new campaign', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'new-campaign', name: 'New campaign' }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		try {
			await createCampaign({ access_token: 'test-token' } as Session, {
				name: 'New campaign',
				...DND2024_REF
			});
			const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as unknown;
			expect(requestBody).toEqual({
				name: 'New campaign',
				systemId: DND2024_REF.systemId,
				systemVersion: DND2024_REF.systemVersion
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
