<script lang="ts">
	import type {
		CampaignFeatSpellGrant,
		CharacterSheet,
		Dnd2024FeatSpellGrant
	} from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import { appLocale } from '$lib/stores/locale';
	import { translatedFeatDetails } from '$lib/utils/compendium/compendiumRules';
	import CharacterFeatSpellGrants from './CharacterFeatSpellGrants.svelte';
	import CharacterCampaignFeatSpellGrants from './CharacterCampaignFeatSpellGrants.svelte';

	let {
		sheet,
		feats,
		featEntries,
		spellEntries,
		featSpellGrants,
		campaignFeatSpellGrants,
		optionLabel,
		onFeatsChange,
		onFeatSpellGrantsChange,
		onCampaignFeatSpellGrantsChange,
		onSpellcastingOverride,
		onFeaturesChange,
		onEquipmentChange
	}: {
		sheet: CharacterSheet;
		feats: string[];
		featEntries: CompendiumEntry[];
		spellEntries: CompendiumEntry[];
		featSpellGrants: Dnd2024FeatSpellGrant[];
		campaignFeatSpellGrants: CampaignFeatSpellGrant[];
		optionLabel: (entry: CompendiumEntry) => string;
		onFeatsChange: (feats: string) => void;
		onFeatSpellGrantsChange: (grants: Dnd2024FeatSpellGrant[]) => void;
		onCampaignFeatSpellGrantsChange: (grants: CampaignFeatSpellGrant[]) => void;
		onSpellcastingOverride: (enabled: boolean) => void;
		onFeaturesChange: (features: string) => void;
		onEquipmentChange: (equipment: string) => void;
	} = $props();

	let newFeat = $state('');
	let selectedFeat = $state('');
	const featDescription = (feat: string) => {
		const entry = featEntries.find(
			(item) =>
				optionLabel(item).toLowerCase() === feat.toLowerCase() ||
				item.name.toLowerCase() === feat.toLowerCase()
		);
		if (!entry) {
			if (/great weapon fighting|luta com armas grandes/i.test(feat))
				return $appLocale === 'en'
					? 'When you roll damage for a melee weapon attack made with a weapon wielded in two hands, you can reroll a 1 or 2 on a damage die. You must use the new roll.'
					: 'Ao rolar o dano de um ataque corpo a corpo com uma arma empunhada com as duas mãos, você pode rolar novamente um dado de dano que tenha resultado 1 ou 2. Você deve usar o novo resultado.';
			return 'Talento privado ou sem descrição cadastrada no compêndio.';
		}
		const resolved = translatedFeatDetails(entry, $appLocale);
		if (resolved) return resolved;
		if (/great weapon fighting|luta com armas grandes/i.test(feat))
			return $appLocale === 'en'
				? 'When you roll damage for a melee weapon attack made with a weapon wielded in two hands, you can reroll a 1 or 2 on a damage die. You must use the new roll.'
				: 'Ao rolar o dano de um ataque corpo a corpo com uma arma empunhada com as duas mãos, você pode rolar novamente um dado de dano que tenha resultado 1 ou 2. Você deve usar o novo resultado.';
		return entry.summary || 'Descrição ainda não cadastrada no compêndio.';
	};
	function addFeat() {
		const feat = newFeat.trim();
		if (!feat || feats.some((item) => item.toLowerCase() === feat.toLowerCase())) return;
		onFeatsChange([...feats, feat].join('\n'));
		selectedFeat = feat;
		newFeat = '';
	}
	function removeFeat(feat: string) {
		onFeatsChange(feats.filter((item) => item !== feat).join('\n'));
		if (selectedFeat === feat) selectedFeat = '';
	}
</script>

<section class="notes">
	<div class="spellcasting-override">
		<label>
			<input
				type="checkbox"
				checked={sheet.spellcastingOverride ?? false}
				onchange={(event) => onSpellcastingOverride(event.currentTarget.checked)}
			/>
			{$appLocale === 'en' ? 'Show the Spells tab manually' : 'Exibir a aba Magias manualmente'}
		</label>
		<small>
			{$appLocale === 'en'
				? 'Enable this if this class can cast spells but its compendium entry is not mapped.'
				: 'Ative se esta classe puder conjurar, mas não estiver mapeada no compêndio.'}
		</small>
	</div>
	<div class="feat-manager">
		<div>
			<h3>{$appLocale === 'en' ? 'Feats' : 'Talentos'}</h3>
			<div class="feat-add">
				<input
					bind:value={newFeat}
					list="feat-options"
					placeholder={$appLocale === 'en' ? 'Add feat' : 'Adicionar talento'}
				/>
				<button type="button" onclick={addFeat}>{$appLocale === 'en' ? 'Add' : 'Adicionar'}</button>
			</div>
			<datalist id="feat-options">
				{#each featEntries as feat (feat.id)}<option value={optionLabel(feat)}
						>{feat.summary}</option
					>{/each}
			</datalist>
			<div class="feat-list">
				{#each feats as feat, index (`${feat}-${index}`)}
					<div class="feat-row">
						<button
							type="button"
							class:active={selectedFeat === feat}
							onclick={() => (selectedFeat = feat)}>{feat}</button
						>
						<button
							type="button"
							class="remove-feat"
							aria-label={$appLocale === 'en' ? `Remove ${feat}` : `Remover ${feat}`}
							onclick={() => removeFeat(feat)}>×</button
						>
					</div>
				{:else}
					<small>{$appLocale === 'en' ? 'No feats added.' : 'Nenhum talento cadastrado.'}</small>
				{/each}
			</div>
		</div>
		<aside>
			<strong
				>{selectedFeat || ($appLocale === 'en' ? 'Select a feat' : 'Selecione um talento')}</strong
			>
			<p>
				{selectedFeat
					? featDescription(selectedFeat)
					: $appLocale === 'en'
						? 'The feat description appears here without taking over the entire sheet.'
						: 'A descrição do talento aparece aqui sem ocupar a ficha inteira.'}
			</p>
		</aside>
	</div>
	<CharacterFeatSpellGrants
		{feats}
		{featEntries}
		{spellEntries}
		grants={featSpellGrants}
		{optionLabel}
		onChange={onFeatSpellGrantsChange}
	/>
	<CharacterCampaignFeatSpellGrants
		{feats}
		{featEntries}
		{spellEntries}
		grants={campaignFeatSpellGrants}
		{optionLabel}
		onChange={onCampaignFeatSpellGrantsChange}
	/>
	<label>
		{$appLocale === 'en' ? 'Features' : 'Características'}
		<textarea
			value={sheet.features}
			oninput={(event) => onFeaturesChange(event.currentTarget.value)}
			placeholder={$appLocale === 'en'
				? 'Species, class features, and notes.'
				: 'Habilidades raciais, de classe e observações.'}></textarea>
	</label>
	<label class="legacy-equipment">
		{$appLocale === 'en' ? 'Equipment notes' : 'Anotações de equipamento'}
		<textarea
			value={sheet.equipment}
			oninput={(event) => onEquipmentChange(event.currentTarget.value)}
			placeholder={$appLocale === 'en'
				? 'Charges, pack contents, and notes.'
				: 'Cargas, conteúdo de mochilas e observações.'}></textarea>
	</label>
</section>

<style>
	.notes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
	}
	.notes > label {
		display: grid;
		gap: 0.4rem;
		color: #cdbfae;
		font-size: 0.75rem;
	}
	.notes textarea,
	.feat-add input {
		min-width: 0;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.65rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
	}
	.notes textarea {
		min-height: 5rem;
		resize: vertical;
	}
	.spellcasting-override {
		display: grid;
		gap: 0.35rem;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		background: #171417;
	}
	.spellcasting-override label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: #e1d5c9;
		font-size: 0.78rem;
	}
	.spellcasting-override input {
		width: 1rem;
		margin: 0;
		accent-color: #c89655;
	}
	.spellcasting-override small {
		margin-left: 1.55rem;
		color: #a99c91;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.feat-manager {
		display: grid;
		grid-template-columns: minmax(180px, 0.9fr) 1.1fr;
		gap: 0.8rem;
		border: 1px solid #494045;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.feat-manager h3 {
		margin: 0 0 0.5rem;
		font-size: 0.92rem;
	}
	.feat-add {
		display: flex;
		gap: 0.4rem;
	}
	.feat-add input {
		min-width: 0;
		flex: 1;
	}
	.feat-add button,
	.feat-list button {
		border: 1px solid #5b493b;
		border-radius: 6px;
		color: #dfceb7;
		background: #241d1e;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.feat-add button {
		padding: 0.4rem 0.5rem;
	}
	.feat-list {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}
	.feat-row {
		display: flex;
		gap: 0.3rem;
	}
	.feat-row > button:first-child {
		flex: 1;
		text-align: left;
		padding: 0.42rem 0.5rem;
	}
	.feat-row .remove-feat {
		width: 2rem;
		color: #cda692;
		font-size: 1rem;
	}
	.feat-list button.active {
		border-color: #c89655;
		background: #38281f;
	}
	.feat-manager aside {
		min-height: 90px;
		border-left: 1px solid #493c39;
		padding-left: 0.8rem;
	}
	.feat-manager aside strong {
		color: #f0cb85;
		font:
			600 0.9rem Georgia,
			serif;
	}
	.feat-manager aside p {
		color: #b9aa9d;
		font-size: 0.78rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}
	.legacy-equipment {
		grid-column: 1 / -1;
	}
	@media (max-width: 700px) {
		.feat-manager {
			grid-template-columns: 1fr;
		}
		.feat-manager aside {
			border-left: 0;
			border-top: 1px solid #493c39;
			padding: 0.7rem 0 0;
		}
	}
</style>
