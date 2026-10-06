<script lang="ts">
	import type { CampaignFeatSpellGrant } from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import { campaignFeatSpellRuleEntries, normalizeDndFeatKey } from '$lib/data/dnd2024FeatSpells';
	import { appLocale } from '$lib/stores/locale';

	let {
		feats,
		featEntries,
		spellEntries,
		grants,
		optionLabel,
		onChange
	}: {
		feats: string[];
		featEntries: CompendiumEntry[];
		spellEntries: CompendiumEntry[];
		grants: CampaignFeatSpellGrant[];
		optionLabel: (entry: CompendiumEntry) => string;
		onChange: (grants: CampaignFeatSpellGrant[]) => void;
	} = $props();

	const activeRules = $derived(campaignFeatSpellRuleEntries(featEntries));
	const activeFeatNames = $derived(new Set(feats.map(normalizeDndFeatKey)));
	const visible = $derived(
		activeRules.filter(({ entry }) =>
			[entry.name, entry.translations?.['pt-BR'] ?? ''].some((name) =>
				activeFeatNames.has(normalizeDndFeatKey(name))
			)
		)
	);

	function chooseAbility(grant: CampaignFeatSpellGrant, spellId: string, ability: string) {
		onChange(
			grants.map((item) => {
				if (item.id !== grant.id) return item;
				const spellcastingAbilities = { ...item.spellcastingAbilities };
				if (ability)
					spellcastingAbilities[spellId] =
						ability as CampaignFeatSpellGrant['spellcastingAbilities'][string];
				else delete spellcastingAbilities[spellId];
				return { ...item, spellcastingAbilities };
			})
		);
	}
</script>

{#each visible as { entry, rule } (entry.id)}
	{@const grant = grants.find((item) => item.featEntryId === entry.id && item.active !== false)}
	<section
		class="campaign-grant"
		aria-label={$appLocale === 'en'
			? `Spells granted by ${optionLabel(entry)}`
			: `Magias concedidas por ${optionLabel(entry)}`}
	>
		<h3>
			{$appLocale === 'en'
				? `Granted by ${optionLabel(entry)}`
				: `Concedidas por ${optionLabel(entry)}`}
		</h3>
		<p>
			{$appLocale === 'en'
				? 'Campaign rule configured by the narrator; it does not add spell slots.'
				: 'Regra específica desta campanha, configurada pelo narrador; não adiciona espaços de magia.'}
		</p>
		{#each rule.spells as configured (configured.spellEntryId)}
			{@const spell = spellEntries.find((item) => item.id === configured.spellEntryId)}
			{@const ability = grant?.spellcastingAbilities?.[configured.spellEntryId]}
			{#if spell}
				<div class="granted-spell">
					<strong>{optionLabel(spell)}</strong>
					<span
						>{configured.canUseExistingSlots
							? $appLocale === 'en'
								? 'Compatible existing slots'
								: 'Espaços existentes compatíveis'
							: $appLocale === 'en'
								? 'No slot use'
								: 'Sem uso de espaços'}</span
					>
					{#if configured.freeUses > 0}
						<span
							>{$appLocale === 'en'
								? `${grant?.freeCastsRemaining?.[configured.spellEntryId] ?? configured.freeUses}/${configured.freeUses} free uses · ${configured.recovery} rest`
								: `${grant?.freeCastsRemaining?.[configured.spellEntryId] ?? configured.freeUses}/${configured.freeUses} usos gratuitos · recupera em descanso ${configured.recovery === 'long' ? 'longo' : 'curto'}`}</span
						>
					{/if}
					{#if configured.abilityOptions.length > 1}
						<label>
							{$appLocale === 'en' ? 'Spellcasting ability' : 'Habilidade de conjuração'}
							<select
								value={ability ?? ''}
								onchange={(event) =>
									grant && chooseAbility(grant, configured.spellEntryId, event.currentTarget.value)}
							>
								<option value="">{$appLocale === 'en' ? 'Choose…' : 'Escolha…'}</option>
								{#each configured.abilityOptions as option (option)}<option value={option}
										>{option}</option
									>{/each}
							</select>
						</label>
					{:else if configured.abilityOptions.length === 1}
						<span
							>{$appLocale === 'en' ? 'Ability' : 'Habilidade'}: {configured
								.abilityOptions[0]}</span
						>
					{/if}
				</div>
			{/if}
		{/each}
	</section>
{/each}

<style>
	.campaign-grant {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.campaign-grant h3 {
		margin: 0;
		color: #e7c98c;
		font-size: 0.9rem;
	}
	.campaign-grant p,
	.granted-spell span {
		margin: 0;
		color: #aa9d91;
		font-size: 0.72rem;
	}
	.granted-spell {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
		align-items: center;
		gap: 0.4rem;
		border-top: 1px solid #493c39;
		padding-top: 0.5rem;
	}
	.granted-spell label {
		display: grid;
		gap: 0.25rem;
		font-size: 0.7rem;
	}
</style>
