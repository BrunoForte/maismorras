import { describe, expect, it } from 'vitest';
import {
	campaignFeatSpellRuleFromEntryRules,
	campaignFeatSpellRuleDraft,
	emptyCampaignFeatSpellRuleDraft,
	serializeCampaignFeatSpellRuleDraft
} from './campaignFeatSpellRule';

describe('campaign feat spell rule editor model', () => {
	it('loads the campaign override without changing the feat text or translation fields', () => {
		const rules = {
			id: 'magic-initiate',
			campaignOverrides: {
				featSpellGrant: {
					enabled: true,
					spells: [
						{
							spellEntryId: 'campaign-spell',
							canUseExistingSlots: true,
							freeUses: 1,
							recovery: 'long',
							abilityOptions: ['intelligence', 'wisdom']
						}
					]
				}
			}
		};
		const draft = campaignFeatSpellRuleFromEntryRules(rules);
		expect(draft.enabled).toBe(true);
		expect(draft.spells[0]).toMatchObject({ spellEntryId: 'campaign-spell', freeUses: 1 });
		const serialized = serializeCampaignFeatSpellRuleDraft(draft);
		expect(serialized.spells[0]).not.toHaveProperty('draftId');
		expect(rules.id).toBe('magic-initiate');
	});

	it('normalizes malformed saved data defensively and starts new campaign rules disabled', () => {
		expect(emptyCampaignFeatSpellRuleDraft()).toEqual({ enabled: false, spells: [] });
		expect(
			campaignFeatSpellRuleDraft({
				enabled: true,
				spells: [{ recovery: 'unknown', abilityOptions: ['strength'] }]
			})
		).toMatchObject({
			enabled: true,
			spells: [{ recovery: 'none', abilityOptions: [], freeUses: 0 }]
		});
	});
});
