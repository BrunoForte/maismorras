<script lang="ts">
	import type { Dnd2024FeatSpellGrant } from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import { appLocale } from '$lib/stores/locale';
	import {
		availableDndFeatSpellLists,
		DND2024_FEAT_SPELL_RULES,
		eligibleDnd2024FeatSpells,
		isDnd2024MagicInitiate,
		newMagicInitiateGrant,
		normalizeDndFeatKey
	} from '$lib/data/dnd2024FeatSpells';

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
		grants: Dnd2024FeatSpellGrant[];
		optionLabel: (entry: CompendiumEntry) => string;
		onChange: (grants: Dnd2024FeatSpellGrant[]) => void;
	} = $props();

	const rule = DND2024_FEAT_SPELL_RULES['magic-initiate'];
	const mappedFeat = $derived(featEntries.find(isDnd2024MagicInitiate));
	const hasFeat = $derived(
		feats.some((feat) =>
			rule.localizedNames.some((name) => normalizeDndFeatKey(name) === normalizeDndFeatKey(feat))
		)
	);
	const activeGrants = $derived(grants.filter((grant) => grant.active !== false));
	const canAdd = $derived(
		Boolean(
			mappedFeat &&
			hasFeat &&
			activeGrants.length <
				feats.filter((feat) =>
					rule.localizedNames.some(
						(name) => normalizeDndFeatKey(name) === normalizeDndFeatKey(feat)
					)
				).length
		)
	);

	function updateGrant(id: string, changes: Partial<Dnd2024FeatSpellGrant>) {
		onChange(grants.map((grant) => (grant.id === id ? { ...grant, ...changes } : grant)));
	}
	function addGrant() {
		if (!canAdd) return;
		onChange([...activeGrants, newMagicInitiateGrant()]);
	}
	function removeGrant(id: string) {
		onChange(grants.filter((grant) => grant.id !== id));
	}
	function cantripChoices(grant: Dnd2024FeatSpellGrant, index: number) {
		return eligibleDnd2024FeatSpells(spellEntries, grant.spellList, 0, [
			...grant.cantripEntryIds.filter((_, current) => current !== index),
			grant.firstLevelSpellEntryId
		]);
	}
	function firstLevelChoices(grant: Dnd2024FeatSpellGrant) {
		return eligibleDnd2024FeatSpells(
			spellEntries,
			grant.spellList,
			rule.firstLevelSpellLevel,
			grant.cantripEntryIds
		);
	}
	function spellListLabel(classId: string) {
		if ($appLocale === 'en') return classId[0].toUpperCase() + classId.slice(1);
		const labels: Record<string, string> = {
			bard: 'Bardo',
			cleric: 'Clérigo',
			druid: 'Druida',
			sorcerer: 'Feiticeiro',
			warlock: 'Bruxo',
			wizard: 'Mago'
		};
		return labels[classId] ?? classId;
	}
	function spellListsFor(grant: Dnd2024FeatSpellGrant) {
		return availableDndFeatSpellLists(grants, grant.featId, grant.id);
	}
</script>

<section
	class="feat-spell-grants"
	aria-label={$appLocale === 'en' ? 'Feat-granted spells' : 'Magias concedidas por talentos'}
>
	<header>
		<div>
			<h3>{$appLocale === 'en' ? 'Feat-granted spells' : 'Magias concedidas por talentos'}</h3>
			<p>
				{$appLocale === 'en'
					? 'Only reviewed D&D 2024 mappings appear here. Spell choices are checked against the campaign compendium.'
					: 'Somente mapeamentos revisados de D&D 2024 aparecem aqui. As escolhas são conferidas no compêndio da campanha.'}
			</p>
		</div>
		<button type="button" onclick={addGrant} disabled={!canAdd}>
			{$appLocale === 'en' ? 'Add Magic Initiate mapping' : 'Mapear Iniciado em Magia'}
		</button>
	</header>
	{#if !hasFeat}
		<small class="hint">
			{$appLocale === 'en'
				? 'Add Magic Initiate to the feats above before mapping its spells.'
				: 'Adicione Iniciado em Magia à lista de talentos antes de mapear as magias.'}
		</small>
	{:else if !activeGrants.length}
		<small class="hint">
			{$appLocale === 'en'
				? 'No spell choices are mapped yet. This feat grants two cantrips and one 1st-level spell; it does not add spell slots.'
				: 'Ainda não há escolhas mapeadas. O talento concede dois truques e uma magia de 1º círculo; ele não adiciona espaços de magia.'}
		</small>
	{/if}
	{#each activeGrants as grant, index (grant.id)}
		<article>
			<div class="grant-heading">
				<strong>{mappedFeat ? optionLabel(mappedFeat) : rule.name} · {index + 1}</strong>
				<button type="button" class="remove" onclick={() => removeGrant(grant.id)}>
					{$appLocale === 'en' ? 'Remove mapping' : 'Remover mapeamento'}
				</button>
			</div>
			<div class="grant-grid">
				<label>
					{$appLocale === 'en' ? 'Spell list' : 'Lista de magias'}
					<select
						value={grant.spellList}
						onchange={(event) => updateGrant(grant.id, { spellList: event.currentTarget.value })}
					>
						{#each spellListsFor(grant) as classId (classId)}
							<option value={classId}>{spellListLabel(classId)}</option>
						{/each}
					</select>
				</label>
				<label>
					{$appLocale === 'en' ? 'Spellcasting ability' : 'Habilidade de conjuração'}
					<select
						value={grant.ability}
						onchange={(event) =>
							updateGrant(grant.id, {
								ability: event.currentTarget.value as Dnd2024FeatSpellGrant['ability']
							})}
					>
						{#each rule.spellcastingAbilities as ability (ability)}
							<option value={ability}>{ability.toLocaleUpperCase()}</option>
						{/each}
					</select>
				</label>
				{#each grant.cantripEntryIds as entryId, spellIndex (spellIndex)}
					<label>
						{$appLocale === 'en' ? `Cantrip ${spellIndex + 1}` : `Truque ${spellIndex + 1}`}
						<select
							value={entryId}
							onchange={(event) => {
								const next = [...grant.cantripEntryIds];
								next[spellIndex] = event.currentTarget.value;
								updateGrant(grant.id, { cantripEntryIds: next });
							}}
						>
							<option value=""
								>{$appLocale === 'en' ? 'Choose a cantrip…' : 'Escolha um truque…'}</option
							>
							{#each cantripChoices(grant, spellIndex) as spell (spell.id)}
								<option value={spell.id}>{optionLabel(spell)}</option>
							{/each}
						</select>
					</label>
				{/each}
				<label>
					{$appLocale === 'en' ? '1st-level spell' : 'Magia de 1º círculo'}
					<select
						value={grant.firstLevelSpellEntryId}
						onchange={(event) =>
							updateGrant(grant.id, { firstLevelSpellEntryId: event.currentTarget.value })}
					>
						<option value=""
							>{$appLocale === 'en' ? 'Choose a spell…' : 'Escolha uma magia…'}</option
						>
						{#each firstLevelChoices(grant) as spell (spell.id)}
							<option value={spell.id}>{optionLabel(spell)}</option>
						{/each}
					</select>
				</label>
			</div>
			<p class="usage">
				{$appLocale === 'en'
					? `Free casting: ${grant.freeCastsRemaining}/${rule.freeCasts}, restored on a Long Rest. The 1st-level spell can also use compatible existing slots.`
					: `Conjuração gratuita: ${grant.freeCastsRemaining}/${rule.freeCasts}, recuperada em Descanso Longo. A magia de 1º círculo também pode usar espaços existentes compatíveis.`}
			</p>
		</article>
	{/each}
</section>

<style>
	.feat-spell-grants {
		display: grid;
		gap: 0.8rem;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.8rem;
	}
	.feat-spell-grants header,
	.grant-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
	}
	.feat-spell-grants h3 {
		margin: 0;
		color: #e7c98c;
		font-size: 0.95rem;
	}
	.feat-spell-grants p {
		margin: 0.25rem 0 0;
		color: #aa9d91;
		font-size: 0.72rem;
	}
	.feat-spell-grants article {
		display: grid;
		gap: 0.65rem;
		border-top: 1px solid #493c39;
		padding-top: 0.7rem;
	}
	.grant-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		gap: 0.55rem;
	}
	.grant-grid label {
		display: grid;
		gap: 0.3rem;
		color: #cdbfae;
		font-size: 0.72rem;
	}
	.grant-grid select {
		min-width: 0;
		width: 100%;
	}
	.hint,
	.usage {
		color: #aa9d91;
		font-size: 0.72rem;
	}
	.remove {
		background: transparent;
	}
</style>
