<script lang="ts">
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import type { Dnd2024Money, InventoryItem } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	import {
		itemWeight,
		type InventoryCategory,
		type InventoryOptionGroup
	} from '$lib/utils/characterEquipment';
	import { groupInventoryOptions } from '$lib/utils/inventoryRules';
	import type { CustomInventoryItemDraft } from './inventoryTypes';
	import { parseDnd2024CoinAmount } from '$lib/utils/character/dnd2024Money';

	let {
		itemEntries,
		visibleItems,
		carriedWeight,
		capacityLb,
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
		visibleItems: { item: InventoryItem; index: number }[];
		carriedWeight: number;
		capacityLb: number | null;
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
	const formatWeight = (weight: number | null) =>
		weight === null
			? '—'
			: new Intl.NumberFormat($appLocale === 'en' ? 'en-US' : 'pt-BR', {
					maximumFractionDigits: 2
				}).format(weight);
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
			>{formatWeight(carriedWeight)} / {formatWeight(capacityLb)} lb</span
		>
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
			>{$appLocale === 'en' ? 'Weight (lb)' : 'Peso (lb)'}<input
				type="number"
				min="0"
				max="9999"
				step="0.1"
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
				<div class="inventory-item">
					<button
						type="button"
						class="inventory-item-expand"
						aria-expanded={expandedIndex === index}
						onclick={() => (expandedIndex = expandedIndex === index ? null : index)}
					>
						{item.name}<span>{expandedIndex === index ? '⌃' : '⌄'}</span>
					</button>
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
						>{itemWeight(item) > 0 ? `${itemWeight(item)} lb` : '—'}</small
					>
					<button
						type="button"
						aria-label={$appLocale === 'en' ? `Remove ${item.name}` : `Remover ${item.name}`}
						onclick={() => onRemoveItem(index)}>×</button
					>
				</div>
				{#if expandedIndex === index}
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
