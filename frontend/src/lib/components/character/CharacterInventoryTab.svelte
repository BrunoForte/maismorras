<script lang="ts">
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import type { Dnd2024Money, InventoryItem } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	import { translatedCompendiumText } from '$lib/utils/compendium/compendiumRules';
	import {
		itemWeight,
		type InventoryCategory,
		type InventoryOptionGroup
	} from '$lib/utils/characterEquipment';
	import { groupInventoryOptions } from '$lib/utils/inventoryRules';
	import type { CustomInventoryItemDraft } from './inventoryTypes';
	import { parseDnd2024CoinAmount } from '$lib/utils/character/dnd2024Money';
	import {
		formatDnd2024Distance,
		formatDnd2024Weight,
		poundsToKilograms
	} from '$lib/utils/dnd2024MetricUnits';

	let {
		itemEntries,
		allCompendiumEntries,
		visibleItems,
		carriedWeight,
		capacityLb,
		pushDragLiftLb,
		powerfulBuildApplied,
		loadIncomplete,
		unknownItemCount,
		canUseLargeForm,
		largeFormActive,
		onLargeFormChange,
		money,
		onMoneyChange,
		inventoryFilter = $bindable(),
		optionLabel,
		onAddCompendiumItem,
		onAddCustomItem,
		onRemoveItem,
		onChangeQuantity,
		onChangeDescription
	}: {
		itemEntries: CompendiumEntry[];
		allCompendiumEntries: CompendiumEntry[];
		visibleItems: { item: InventoryItem; index: number }[];
		carriedWeight: number;
		capacityLb: number | null;
		pushDragLiftLb: number | null;
		powerfulBuildApplied: boolean;
		loadIncomplete: boolean;
		unknownItemCount: number;
		canUseLargeForm: boolean;
		largeFormActive: boolean;
		onLargeFormChange: (active: boolean) => void;
		money: Dnd2024Money;
		onMoneyChange: (money: Dnd2024Money) => void;
		inventoryFilter: InventoryCategory;
		optionLabel: (entry: CompendiumEntry) => string;
		onAddCompendiumItem: (entryId: string) => void;
		onAddCustomItem: (draft: CustomInventoryItemDraft) => Promise<boolean>;
		onRemoveItem: (index: number) => void;
		onChangeQuantity: (index: number, quantity: number) => void;
		onChangeDescription: (index: number, description: string) => void;
	} = $props();

	let selectedItemId = $state('');
	let expandedIndex = $state<number | null>(null);
	let customItem = $state<CustomInventoryItemDraft>({
		name: '',
		category: 'gear',
		damage: '',
		defense: 10,
		bonus: 0,
		weight: 0,
		quantity: 1
	});
	const filters: [InventoryCategory, string, string][] = [
		['all', 'Tudo', 'All'],
		['weapon', 'Armas', 'Weapons'],
		['armor', 'Armaduras', 'Armor'],
		['consumable', 'Consumíveis', 'Consumables'],
		['tool', 'Ferramentas', 'Tools'],
		['gear', 'Outros', 'Other']
	];
	const itemOptionGroups = $derived(
		groupInventoryOptions(itemEntries, optionLabel, $appLocale === 'en' ? 'en' : 'pt-BR')
	);
	const magicItemCatalogEntry = (item: InventoryItem) =>
		allCompendiumEntries.find(
			(entry) =>
				entry.id === item.entryId &&
				entry.entryType === 'other' &&
				entry.rules.catalog === 'magic-item'
		);
	const formatWeight = (weight: number | null) => formatDnd2024Weight(weight, $appLocale);
	const moneyFields: { key: keyof Dnd2024Money; labelPt: string; labelEn: string }[] = [
		{ key: 'cp', labelPt: 'PC · Cobre', labelEn: 'CP · Copper' },
		{ key: 'sp', labelPt: 'PP · Prata', labelEn: 'SP · Silver' },
		{ key: 'ep', labelPt: 'PE · Electro', labelEn: 'EP · Electrum' },
		{ key: 'gp', labelPt: 'PO · Ouro', labelEn: 'GP · Gold' },
		{ key: 'pp', labelPt: 'PL · Platina', labelEn: 'PP · Platinum' }
	];
	function updateMoney(key: keyof Dnd2024Money, input: HTMLInputElement) {
		const value = input.valueAsNumber;
		const amount = parseDnd2024CoinAmount(value);
		if (!input.validity.valid || amount === null) {
			input.setCustomValidity(
				$appLocale === 'en'
					? 'Enter a non-negative whole number.'
					: 'Informe um número inteiro não negativo.'
			);
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
		onMoneyChange({ ...money, [key]: amount });
	}
	const optionGroupLabel = (category: InventoryOptionGroup) => {
		const labels: Record<InventoryOptionGroup, [string, string]> = {
			weapon: ['Armas', 'Weapons'],
			armor: ['Armaduras', 'Armor'],
			shield: ['Escudos', 'Shields'],
			equipment: ['Equipamentos', 'Equipment'],
			tool: ['Ferramentas', 'Tools'],
			other: ['Outros itens', 'Other items']
		};
		return labels[category][$appLocale === 'en' ? 1 : 0];
	};
	async function addCustomItem() {
		if (await onAddCustomItem({ ...customItem })) {
			customItem = {
				name: '',
				category: 'gear',
				damage: '',
				defense: 10,
				bonus: 0,
				weight: 0,
				quantity: 1
			};
		}
	}
</script>

<section class="inventory-section">
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Equipment' : 'Equipamento'}</h3>
	</div>
	<div
		class="carrying-capacity"
		aria-label={$appLocale === 'en' ? 'Carrying capacity' : 'Capacidade de carga'}
	>
		<strong
			>{$appLocale === 'en'
				? 'Carried weight / maximum capacity'
				: 'Peso carregado / capacidade máxima'}</strong
		>
		<span data-testid="carrying-weight"
			>{formatWeight(carriedWeight)} / {formatWeight(capacityLb)} kg</span
		>
		<div class="weight-limit-row">
			<strong
				>{$appLocale === 'en'
					? 'Push / drag / lift limit'
					: 'Limite para empurrar / arrastar / levantar'}</strong
			>
			<span data-testid="push-drag-lift-limit">{formatWeight(pushDragLiftLb)} kg</span>
		</div>
		{#if powerfulBuildApplied}
			<small class="capacity-adjustment" data-testid="powerful-build-capacity-note">
				{$appLocale === 'en'
					? 'Powerful Build changes carrying capacity only; the push, drag, and lift limit uses your actual size.'
					: 'Porte Poderoso altera apenas a capacidade de carga; o limite para empurrar, arrastar e levantar usa seu tamanho atual.'}
			</small>
		{/if}
		<small class="unit-conversion-note" data-testid="metric-rounding-note">
			{$appLocale === 'en'
				? 'Metric values are rounded to 0.01 for display; calculations keep their existing internal values.'
				: 'Valores métricos arredondados a 0,01 apenas na exibição; os cálculos mantêm os valores internos existentes.'}
		</small>
		{#if pushDragLiftLb !== null && capacityLb !== null}
			<small class="movement-limit-note" data-testid="hauling-speed-limit">
				{$appLocale === 'en'
					? `When pushing, dragging, or lifting more than your carrying capacity, your Speed can be no more than ${formatDnd2024Distance(5, $appLocale)} m.`
					: `Ao empurrar, arrastar ou levantar mais que sua capacidade de carga, seu deslocamento não pode exceder ${formatDnd2024Distance(5, $appLocale)} m.`}
			</small>
		{/if}
		{#if loadIncomplete}
			<small role="status">
				{$appLocale === 'en'
					? `The total may be incomplete: ${unknownItemCount} item(s) have missing or invalid weight or quantity.`
					: `O total pode estar incompleto: ${unknownItemCount} item(ns) têm peso ou quantidade ausente ou inválida.`}
			</small>
		{/if}
		{#if capacityLb !== null && carriedWeight > capacityLb}
			<small role="status" class="over-capacity">
				{$appLocale === 'en'
					? 'Above carrying capacity; resolve according to the table rules.'
					: 'Acima da capacidade de carga; adjudique conforme as regras da mesa.'}
			</small>
		{/if}
		{#if canUseLargeForm}
			<label class="large-form-toggle">
				<input
					type="checkbox"
					checked={largeFormActive}
					onchange={(event) => onLargeFormChange(event.currentTarget.checked)}
				/>
				{$appLocale === 'en' ? 'Large Form active' : 'Forma Grande ativa'}
				<small
					>{$appLocale === 'en'
						? 'Turn off when the 10-minute effect ends.'
						: 'Desative quando o efeito de 10 minutos terminar.'}</small
				>
			</label>
		{/if}
	</div>
	<fieldset class="money-panel">
		<legend>{$appLocale === 'en' ? 'Money' : 'Dinheiro'}</legend>
		{#each moneyFields as field (field.key)}
			<label>
				{$appLocale === 'en' ? field.labelEn : field.labelPt}
				<input
					type="number"
					min="0"
					max="9007199254740991"
					step="1"
					value={money[field.key]}
					inputmode="numeric"
					aria-label={$appLocale === 'en' ? field.labelEn : field.labelPt}
					oninput={(event) => event.currentTarget.setCustomValidity('')}
					onchange={(event) => updateMoney(field.key, event.currentTarget)}
				/>
			</label>
		{/each}
	</fieldset>
	<div
		class="inventory-filters"
		aria-label={$appLocale === 'en' ? 'Equipment categories' : 'Categorias de equipamento'}
	>
		{#each filters as [filter, labelPt, labelEn] (filter)}
			<button
				class:active={inventoryFilter === filter}
				onclick={() => {
					inventoryFilter = filter;
					selectedItemId = '';
				}}
			>
				{$appLocale === 'en' ? labelEn : labelPt}
			</button>
		{/each}
	</div>
	<div class="compendium-picker">
		<select
			bind:value={selectedItemId}
			aria-label={$appLocale === 'en'
				? 'Choose equipment from compendium'
				: 'Escolher item do compêndio'}
		>
			<option value=""
				>{$appLocale === 'en'
					? 'Add item from compendium…'
					: 'Adicionar item do compêndio…'}</option
			>
			{#each itemOptionGroups as group (group.category)}
				<optgroup label={optionGroupLabel(group.category)}>
					{#each group.items as entry (entry.id)}<option value={entry.id}
							>{optionLabel(entry)}</option
						>{/each}
				</optgroup>
			{/each}
		</select>
		<button
			type="button"
			onclick={() => {
				onAddCompendiumItem(selectedItemId);
				selectedItemId = '';
			}}
			disabled={!selectedItemId}>{$appLocale === 'en' ? 'Add' : 'Adicionar'}</button
		>
	</div>
	<div class="custom-item-form">
		<strong>{$appLocale === 'en' ? 'Custom item' : 'Item personalizado'}</strong>
		<input
			class="custom-name"
			bind:value={customItem.name}
			placeholder={$appLocale === 'en' ? 'Item name' : 'Nome do item'}
			maxlength="120"
		/>
		<select bind:value={customItem.category} aria-label="Categoria do item">
			<option value="gear">{$appLocale === 'en' ? 'Other' : 'Outro'}</option>
			<option value="weapon">{$appLocale === 'en' ? 'Weapon' : 'Arma'}</option>
			<option value="armor">{$appLocale === 'en' ? 'Armor' : 'Armadura'}</option>
			<option value="consumable">{$appLocale === 'en' ? 'Consumable' : 'Consumível'}</option>
		</select>
		<label
			>{$appLocale === 'en' ? 'Weight (kg)' : 'Peso (kg)'}<input
				type="number"
				min="0"
				max={poundsToKilograms(9999)}
				step="0.01"
				bind:value={customItem.weight}
			/></label
		>
		{#if customItem.category === 'weapon'}
			<input
				bind:value={customItem.damage}
				placeholder={$appLocale === 'en' ? 'Damage (e.g. 1d8)' : 'Dano (ex.: 1d8)'}
				maxlength="40"
			/>
			<label
				>{$appLocale === 'en' ? 'Item bonus' : 'Bônus do item'}<input
					type="number"
					min="-10"
					max="10"
					bind:value={customItem.bonus}
				/></label
			>
		{:else if customItem.category === 'armor'}
			<label
				>{$appLocale === 'en' ? 'Base AC' : 'Defesa base'}<input
					type="number"
					min="0"
					max="99"
					bind:value={customItem.defense}
				/></label
			>
			<label
				>{$appLocale === 'en' ? 'Item bonus' : 'Bônus do item'}<input
					type="number"
					min="-10"
					max="10"
					bind:value={customItem.bonus}
				/></label
			>
		{:else if customItem.category === 'consumable'}
			<label
				>{$appLocale === 'en' ? 'Quantity' : 'Quantidade'}<input
					type="number"
					min="1"
					max="9999"
					bind:value={customItem.quantity}
				/></label
			>
		{/if}
		<button type="button" onclick={() => void addCustomItem()} disabled={!customItem.name.trim()}
			>{$appLocale === 'en' ? 'Add custom item' : 'Adicionar item personalizado'}</button
		>
	</div>
	{#if visibleItems.length}
		<div class="inventory-list">
			{#each visibleItems as { item, index } (`${item.entryId}:${index}`)}
				{@const catalogEntry = magicItemCatalogEntry(item)}
				{@const catalogDescription = catalogEntry
					? translatedCompendiumText(
							catalogEntry,
							'rules.description',
							catalogEntry.rules.description,
							$appLocale
						)
					: ''}
				<div class="inventory-item">
					<button
						type="button"
						class="inventory-item-expand"
						aria-expanded={expandedIndex === index}
						onclick={() => (expandedIndex = expandedIndex === index ? null : index)}
					>
						{item.name}<span>{expandedIndex === index ? '⌃' : '⌄'}</span>
					</button>
					{#if catalogDescription && expandedIndex !== index}<small class="catalog-item-description"
							>{catalogDescription}</small
						>{/if}
					<input
						type="number"
						min="0"
						max="9999"
						value={item.quantity}
						aria-label={$appLocale === 'en'
							? `Quantity of ${item.name}`
							: `Quantidade de ${item.name}`}
						onchange={(event) => onChangeQuantity(index, Number(event.currentTarget.value))}
					/>
					<small class="inventory-weight"
						>{itemWeight(item) > 0 ? `${formatWeight(itemWeight(item))} kg` : '—'}</small
					>
					<button
						type="button"
						aria-label={$appLocale === 'en' ? `Remove ${item.name}` : `Remover ${item.name}`}
						onclick={() => onRemoveItem(index)}>×</button
					>
				</div>
				{#if expandedIndex === index}
					{#if catalogDescription}<p class="catalog-item-description full">
							{catalogDescription}
						</p>{/if}
					<label class="inventory-item-description"
						>{$appLocale === 'en' ? 'Description / function' : 'Descrição / função'}<textarea
							value={String(item.rules.playerDescription ?? '')}
							oninput={(event) => onChangeDescription(index, event.currentTarget.value)}
							placeholder={$appLocale === 'en' ? 'What does this item do?' : 'O que este item faz?'}
						></textarea></label
					>
				{/if}
			{/each}
		</div>
	{:else}
		<p class="empty-inline">
			{$appLocale === 'en'
				? 'No items in this category. Choose a category and add items from the compendium.'
				: 'Nenhum item nesta categoria. Escolha uma categoria e adicione itens pelo compêndio.'}
		</p>
	{/if}
</section>

<style>
	.inventory-section {
		display: grid;
		gap: 0.75rem;
	}
	.carrying-capacity {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.65rem;
		border: 1px solid #554841;
		border-radius: 7px;
		padding: 0.65rem 0.8rem;
		background: #1c1718;
	}
	.carrying-capacity strong {
		color: #e7c98c;
	}
	.carrying-capacity > span {
		font-variant-numeric: tabular-nums;
	}
	.carrying-capacity > small {
		flex-basis: 100%;
		color: #e2bc76;
	}
	.weight-limit-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.55rem;
		align-items: baseline;
	}
	.weight-limit-row strong {
		color: #d7cec4;
		font-size: 0.82rem;
	}
	.weight-limit-row span {
		font-variant-numeric: tabular-nums;
	}
	.carrying-capacity > .capacity-adjustment {
		color: #b9aa9d;
	}
	.carrying-capacity > .movement-limit-note {
		color: #b9aa9d;
	}
	.over-capacity {
		color: #f0a29b !important;
	}
	.large-form-toggle {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		color: #d7cec4;
	}
	.large-form-toggle small {
		flex-basis: 100%;
		margin-left: 1.25rem;
		color: #a99c91;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.section-title h3 {
		margin: 0;
		color: #e7c98c;
		font-size: 1rem;
	}
	.money-panel {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
		gap: 0.55rem;
		margin: 0;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem;
	}
	.money-panel legend {
		padding: 0 0.35rem;
		color: #e7c98c;
		font-size: 0.82rem;
	}
	.money-panel label {
		display: grid;
		gap: 0.25rem;
		color: #cdbfae;
		font-size: 0.7rem;
	}
	.money-panel input {
		min-width: 0;
		width: 100%;
		border: 1px solid #493c39;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
	}
	.inventory-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.inventory-filters button,
	.compendium-picker button,
	.inventory-item button {
		border: 1px solid #5b493b;
		border-radius: 6px;
		padding: 0.4rem 0.55rem;
		color: #dfceb7;
		background: #241d1e;
		cursor: pointer;
	}
	.inventory-filters button.active {
		border-color: #c89655;
		color: #f0d29d;
		background: #38281f;
	}
	.compendium-picker {
		display: flex;
		gap: 0.45rem;
	}
	.compendium-picker select,
	.custom-item-form input,
	.custom-item-form select,
	.inventory-item input {
		min-width: 0;
		border: 1px solid #493c39;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
	}
	.compendium-picker select {
		flex: 1;
	}
	.compendium-picker button:disabled,
	.custom-item-form button:disabled {
		opacity: 0.55;
	}
	.custom-item-form {
		display: grid;
		grid-template-columns: minmax(120px, 1.5fr) repeat(3, minmax(90px, 1fr));
		gap: 0.45rem;
		align-items: end;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem;
		background: #171417;
	}
	.custom-item-form strong {
		grid-column: 1 / -1;
		color: #e7c98c;
		font-size: 0.8rem;
	}
	.custom-item-form .custom-name {
		grid-column: span 2;
	}
	.custom-item-form label {
		display: grid;
		gap: 0.25rem;
		color: #b9aa9d;
		font-size: 0.68rem;
	}
	.custom-item-form label input {
		width: 100%;
	}
	.custom-item-form button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem;
		color: #291b10;
		background: #e0b86f;
		font-weight: 700;
	}
	.inventory-list {
		display: grid;
		gap: 0.5rem;
	}
	.inventory-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 60px auto;
		gap: 0.4rem;
		align-items: center;
	}
	.inventory-item-expand {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
		text-align: left;
	}
	.inventory-item-expand span {
		color: #d8ad67;
	}
	.inventory-item input {
		width: 100%;
		text-align: center;
	}
	.inventory-weight {
		color: #aa9d91;
		text-align: right;
	}
	.inventory-item-description {
		display: grid;
		gap: 0.35rem;
		grid-column: 1 / -1;
		color: #b9aa9d;
		font-size: 0.7rem;
	}
	.catalog-item-description {
		grid-column: 1 / -1;
		margin: 0;
		color: #b9aa9d;
		font-size: 0.7rem;
		line-height: 1.35;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
	}
	.catalog-item-description.full {
		display: block;
		line-clamp: unset;
		-webkit-line-clamp: unset;
		overflow: visible;
	}
	.inventory-item-description textarea {
		min-height: 3.5rem;
		resize: vertical;
		border: 1px solid #493c39;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
	}
	.empty-inline {
		margin: 0;
		color: #96897e;
		font-size: 0.76rem;
	}
	@media (max-width: 700px) {
		.custom-item-form {
			grid-template-columns: 1fr 1fr;
		}
		.custom-item-form strong {
			grid-column: 1 / -1;
		}
		.custom-item-form .custom-name {
			grid-column: 1 / -1;
		}
		.inventory-item {
			grid-template-columns: minmax(0, 1fr) 58px 48px auto;
		}
	}
</style>
