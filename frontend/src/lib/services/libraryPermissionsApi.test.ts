import { describe, expect, it, vi } from 'vitest';
import { currentPlayerIds, uploadLibraryAssetPrivately } from './libraryPermissionsApi';

describe('currentPlayerIds', () => {
	it('removes users no longer in the campaign and deduplicates current selections', () => {
		expect(
			currentPlayerIds(['player-a', 'former-player', ' player-a '], ['player-a', 'player-b'])
		).toEqual(['player-a']);
	});

	it('returns an empty allowlist when none of the selected users are current players', () => {
		expect(currentPlayerIds(['former-player'], ['player-a'])).toEqual([]);
	});

	it('restricts a new asset to the GM before uploading it', async () => {
		const order: string[] = [];
		const setGMOnlyAccess = vi.fn(async () => {
			order.push('permission');
		});
		const upload = vi.fn(async () => {
			order.push('upload');
		});
		await uploadLibraryAssetPrivately(setGMOnlyAccess, upload);
		expect(order).toEqual(['permission', 'upload']);
		expect(setGMOnlyAccess.mock.invocationCallOrder[0]).toBeLessThan(
			upload.mock.invocationCallOrder[0]
		);
	});

	it('does not upload if the GM-only permission could not be saved', async () => {
		const setGMOnlyAccess = vi.fn(async () => {
			throw new Error('permission save failed');
		});
		const upload = vi.fn(async () => {});
		await expect(uploadLibraryAssetPrivately(setGMOnlyAccess, upload)).rejects.toThrow(
			'permission save failed'
		);
		expect(upload).not.toHaveBeenCalled();
	});

	it('keeps the GM-only permission if the upload fails', async () => {
		const setGMOnlyAccess = vi.fn(async () => {});
		const upload = vi.fn(async () => {
			throw new Error('upload failed');
		});
		await expect(uploadLibraryAssetPrivately(setGMOnlyAccess, upload)).rejects.toThrow(
			'upload failed'
		);
		expect(setGMOnlyAccess).toHaveBeenCalledOnce();
	});
});
