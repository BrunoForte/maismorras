import { describe, expect, it } from 'vitest';
import { campaignAssetPath } from './assetApi';

describe('campaignAssetPath', () => {
	it('removes the signature from a regular signed campaign asset URL', () => {
		expect(
			campaignAssetPath(
				'https://example.supabase.co/storage/v1/object/sign/campaign-assets/campaigns/c1/portraits/p1/hero.png?token=secret'
			)
		).toBe('campaigns/c1/portraits/p1/hero.png');
	});

	it('decodes encoded path separators in older signed URLs', () => {
		expect(
			campaignAssetPath(
				'https://example.supabase.co/storage/v1/object/sign/campaign-assets/campaigns%2Fc1%2Fportraits%2Fp1%2Fhero.png?token=secret'
			)
		).toBe('campaigns/c1/portraits/p1/hero.png');
	});

	it('supports public references and leaves unrelated URLs untouched', () => {
		expect(
			campaignAssetPath(
				'https://example.supabase.co/storage/v1/object/public/campaign-assets/campaigns/c1/map.webp'
			)
		).toBe('campaigns/c1/map.webp');
		expect(campaignAssetPath('https://cdn.example.com/image.png')).toBeNull();
	});
});
