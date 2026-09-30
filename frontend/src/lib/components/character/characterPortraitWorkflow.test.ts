import { describe, expect, it, vi } from 'vitest';
import { createCharacterPortraitWorkflow } from './characterPortraitWorkflow.svelte';

function setup(overrides: Partial<Parameters<typeof createCharacterPortraitWorkflow>[0]> = {}) {
	const setMessage = vi.fn();
	const workflow = createCharacterPortraitWorkflow({
		campaignId: 'campaign-1',
		session: { user: { id: 'user-1' } } as never,
		getPortraitPath: () => '',
		setPortraitPaths: vi.fn(),
		setMessage,
		getSupabaseClient: vi.fn(),
		optimizeImage: vi.fn(),
		createThumbnail: vi.fn(),
		getSignedAssetUrl: vi.fn(),
		generateImage: vi.fn(),
		fetchGeneratedBlob: vi.fn(),
		createId: () => 'asset-1',
		...overrides
	});
	return { workflow, setMessage };
}

describe('character portrait workflow', () => {
	it('restores processing state and exposes an AI generation error', async () => {
		const { workflow, setMessage } = setup({
			generateImage: vi.fn().mockRejectedValue(new Error('Serviço de imagem indisponível'))
		});

		await workflow.generatePortrait('um retrato');

		expect(workflow.state.busy).toBe(false);
		expect(setMessage).toHaveBeenCalledWith('Serviço de imagem indisponível');
	});

	it('restores processing state and exposes an upload optimization error', async () => {
		const { workflow, setMessage } = setup({
			optimizeImage: vi.fn().mockRejectedValue(new Error('Falha ao otimizar imagem'))
		});
		const file = new File(['image'], 'portrait.png', { type: 'image/png' });
		const input = { files: [file], value: 'portrait.png' };

		await workflow.uploadPortrait({ currentTarget: input } as unknown as Event);

		expect(workflow.state.busy).toBe(false);
		expect(input.value).toBe('');
		expect(setMessage).toHaveBeenCalledWith('Falha ao otimizar imagem');
	});
});
