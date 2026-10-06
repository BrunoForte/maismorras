import type {
	CampaignFeatSpellDefinition,
	CampaignFeatSpellRule,
	Dnd2024Ability
} from '$lib/services/compendiumApi';

export type CampaignFeatSpellRuleDraft = Omit<CampaignFeatSpellRule, 'spells'> & {
	spells: Array<CampaignFeatSpellDefinition & { draftId: string }>;
};

export const DND2024_SPELLCASTING_ABILITIES: Dnd2024Ability[] = [
	'intelligence',
	'wisdom',
	'charisma'
];

export function emptyCampaignFeatSpellRuleDraft(): CampaignFeatSpellRuleDraft {
	return { enabled: false, spells: [] };
}

export function campaignFeatSpellRuleDraft(value: unknown): CampaignFeatSpellRuleDraft {
	const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const rawSpells = Array.isArray(record.spells) ? record.spells : [];
	const spells = rawSpells.flatMap((raw, index) => {
		if (!raw || typeof raw !== 'object') return [];
		const item = raw as Record<string, unknown>;
		const recovery: CampaignFeatSpellDefinition['recovery'] =
			item.recovery === 'short' || item.recovery === 'long' ? item.recovery : 'none';
		return [
			{
				draftId: `saved-${index}-${String(item.spellEntryId ?? '')}`,
				spellEntryId: typeof item.spellEntryId === 'string' ? item.spellEntryId : '',
				canUseExistingSlots: item.canUseExistingSlots === true,
				freeUses: Number.isInteger(item.freeUses) ? Number(item.freeUses) : 0,
				recovery,
				abilityOptions: Array.isArray(item.abilityOptions)
					? item.abilityOptions.filter((ability): ability is Dnd2024Ability =>
							DND2024_SPELLCASTING_ABILITIES.includes(ability as Dnd2024Ability)
						)
					: []
			}
		];
	});
	return { enabled: record.enabled === true, spells };
}

export function serializeCampaignFeatSpellRuleDraft(
	draft: CampaignFeatSpellRuleDraft
): CampaignFeatSpellRule {
	return {
		enabled: draft.enabled,
		spells: draft.spells.map((spell) => ({
			spellEntryId: spell.spellEntryId,
			canUseExistingSlots: spell.canUseExistingSlots,
			freeUses: spell.freeUses,
			recovery: spell.recovery,
			abilityOptions: spell.abilityOptions.filter(
				(ability, index, options) =>
					options.indexOf(ability) === index && DND2024_SPELLCASTING_ABILITIES.includes(ability)
			)
		}))
	};
}

export function campaignFeatSpellRuleFromEntryRules(
	rules: Record<string, unknown>
): CampaignFeatSpellRuleDraft {
	const overrides = rules.campaignOverrides;
	if (!overrides || typeof overrides !== 'object') return emptyCampaignFeatSpellRuleDraft();
	return campaignFeatSpellRuleDraft((overrides as Record<string, unknown>).featSpellGrant);
}
