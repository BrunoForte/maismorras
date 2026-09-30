<script lang="ts">
	import type {
		AbilityScores,
		CharacterSheet as Sheet,
		InventoryItem
	} from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	import CharacterWeaponAttacks from './CharacterWeaponAttacks.svelte';

	type WeaponEffect = { key: string; name: string; attackBonus: number; damageBonus: number };
	type WeaponAttackProfile = {
		id: string;
		name: string;
		description: string;
		attackAbility: keyof AbilityScores;
		damage: string;
		attackBonus: number;
		damageBonus: number;
		greatWeaponFighting: boolean;
	};
	type GrantedSpell = Sheet['spells'][number];
	type Attack = Sheet['attacks'][number];
	type Actions = {
		rest: (kind: 'short' | 'long') => void;
		syncTokenSoon: () => void;
		spendResource: (index: number) => void;
		setResourceMax: (index: number, value: string) => void;
		spellDisplayName: (spell: GrantedSpell) => string;
		circleLabel: (level: number) => string;
		spellOrigin: (spell: GrantedSpell) => string;
		equipmentCategory: (item: Pick<InventoryItem, 'name' | 'rules'>) => string;
		weaponKey: (item: InventoryItem) => string;
		weaponAbility: (item: InventoryItem) => keyof AbilityScores;
		abilityLabel: (key: keyof AbilityScores) => string;
		modifierText: (value: number) => string;
		proficiencyStatus: (item: InventoryItem) => boolean;
		proficiencyBonus: (item: InventoryItem) => number;
		attackBonusTotal: (item: InventoryItem) => number;
		damageBonusTotal: (item: InventoryItem) => number;
		weaponEffects: (item: InventoryItem) => WeaponEffect[];
		weaponProfiles: (item: InventoryItem) => WeaponAttackProfile[];
		hasGreatWeaponFighting: () => boolean;
		weaponSupportsGreatWeaponFighting: (item: InventoryItem) => boolean;
		updateWeaponRules: (
			item: InventoryItem,
			changes: Record<string, unknown>,
			autosave?: boolean
		) => void;
		toggleWeaponEffect: (item: InventoryItem, key: string) => void;
		addWeaponAttackProfile: (item: InventoryItem) => void;
		removeWeaponAttackProfile: (item: InventoryItem, id: string) => void;
		updateWeaponProfile: (
			item: InventoryItem,
			id: string,
			changes: Partial<WeaponAttackProfile>
		) => void;
		rollWeapon: (
			item: InventoryItem,
			action: 'attack' | 'damage',
			profile?: WeaponAttackProfile
		) => void;
		addAttack: () => void;
		toggleVisibleRoll: (key: string) => void;
		setAttackType: (attack: Attack, value: string) => void;
		rollCustomAttack: (attack: Attack, index: number) => void;
		rollCustomDamage: (attack: Attack, index: number) => void;
		removeAttack: (index: number) => void;
	};

	let {
		sheet = $bindable<Sheet>(),
		saving,
		armorClass,
		attributes,
		rollingWeaponAction,
		rollingAttack,
		rollingAttackAction,
		spells,
		actions
	}: {
		sheet: Sheet;
		saving: boolean;
		armorClass: number;
		attributes: { key: keyof AbilityScores; label: string }[];
		rollingWeaponAction: string | null;
		rollingAttack: number | null;
		rollingAttackAction: 'attack' | 'damage' | null;
		spells: GrantedSpell[];
		actions: Actions;
	} = $props();
	const modifier = (score: number) => Math.floor((score - 10) / 2);
	const weaponItems = () =>
		sheet.inventory.filter((item) => actions.equipmentCategory(item) === 'weapon');
	const armorItems = () =>
		sheet.inventory.filter((item) => actions.equipmentCategory(item) === 'armor');
</script>

<div class="combat-tab">
	<section class="combat">
		<h3>{$appLocale === 'en' ? 'Combat' : 'Combate'}</h3>
		<div class="rest-actions">
			<button disabled={saving} onclick={() => actions.rest('short')}
				>{$appLocale === 'en' ? 'Short rest' : 'Descanso curto'}</button
			><button disabled={saving} onclick={() => actions.rest('long')}
				>{$appLocale === 'en' ? 'Long rest' : 'Descanso longo'}</button
			>
		</div>
		<label
			>{$appLocale === 'en' ? 'AC' : 'CA'}<input
				type="number"
				min="0"
				max="99"
				value={armorClass}
				readonly
			/></label
		>
		<label
			>{$appLocale === 'en' ? 'Current HP' : 'PV atuais'}<input
				type="number"
				min="0"
				max={sheet.hitPointsMax}
				bind:value={sheet.hitPointsCurrent}
				oninput={actions.syncTokenSoon}
			/></label
		>
		<label
			>{$appLocale === 'en' ? 'Maximum HP' : 'PV máximos'}<input
				type="number"
				min="1"
				bind:value={sheet.hitPointsMax}
				oninput={actions.syncTokenSoon}
			/></label
		>
		<label
			>{$appLocale === 'en' ? 'Temporary HP' : 'PV temporários'}<input
				type="number"
				min="0"
				bind:value={sheet.temporaryHP}
			/></label
		>
	</section>

	{#if sheet.resources.length || spells.length}
		<section class="resources">
			<h3>{$appLocale === 'en' ? 'Resources' : 'Recursos'}</h3>
			{#each sheet.resources as resource, index (resource.id || index)}
				<div class="resource-row">
					<strong>{resource.name}</strong>
					<span
						>{resource.current}/{resource.max} · {resource.restoreOn === 'short'
							? $appLocale === 'en'
								? 'short rest'
								: 'descanso curto'
							: $appLocale === 'en'
								? 'long rest'
								: 'descanso longo'}</span
					>
					<button onclick={() => actions.spendResource(index)} disabled={resource.current === 0}
						>{$appLocale === 'en' ? 'Use' : 'Usar'}</button
					>
					<label class="resource-max"
						>{$appLocale === 'en' ? 'Max' : 'Máx.'}<input
							type="number"
							min="0"
							max="999"
							step="1"
							value={resource.max}
							onchange={(event) => actions.setResourceMax(index, event.currentTarget.value)}
						/></label
					>
					{#if resource.maxOverride !== undefined}
						<button
							class="resource-auto"
							type="button"
							onclick={() => actions.setResourceMax(index, '')}
							>{$appLocale === 'en' ? 'Auto' : 'Auto'}</button
						>
					{/if}
				</div>
			{/each}
			{#if spells.length}
				<div class="granted-spells">
					<h4>{$appLocale === 'en' ? 'Species and feat spells' : 'Magias de raça e talentos'}</h4>
					{#each spells as spell, index (spell.entryId ?? `${spell.name}-${index}`)}
						<div>
							<strong>{actions.spellDisplayName(spell)}</strong>
							<span
								>{actions.circleLabel(spell.level)} · {actions.spellOrigin(spell) === 'species'
									? $appLocale === 'en'
										? 'Species'
										: 'Raça'
									: $appLocale === 'en'
										? 'Feat'
										: 'Talento'}</span
							>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<CharacterWeaponAttacks
		items={weaponItems()}
		{attributes}
		{rollingWeaponAction}
		weaponKey={actions.weaponKey}
		weaponAbility={actions.weaponAbility}
		abilityLabel={actions.abilityLabel}
		abilityModifier={(key) => modifier(sheet.abilityScores[key])}
		modifierText={actions.modifierText}
		proficiencyStatus={actions.proficiencyStatus}
		proficiencyBonus={actions.proficiencyBonus}
		attackBonusTotal={actions.attackBonusTotal}
		damageBonusTotal={actions.damageBonusTotal}
		weaponEffects={actions.weaponEffects}
		weaponProfiles={actions.weaponProfiles}
		hasGreatWeaponFighting={actions.hasGreatWeaponFighting}
		weaponSupportsGreatWeaponFighting={actions.weaponSupportsGreatWeaponFighting}
		onWeaponChange={actions.updateWeaponRules}
		onToggleEffect={actions.toggleWeaponEffect}
		onAddProfile={actions.addWeaponAttackProfile}
		onRemoveProfile={actions.removeWeaponAttackProfile}
		onProfileChange={actions.updateWeaponProfile}
		onRoll={(item, action, profile) => actions.rollWeapon(item, action, profile)}
	/>

	{#if armorItems().length}
		<section class="combat-equipment">
			<div class="combat-armor-list">
				<h4>{$appLocale === 'en' ? 'Armor' : 'Armaduras'}</h4>
				{#each armorItems() as item (item.entryId)}
					<label
						><input type="checkbox" bind:checked={item.equipped} /><span
							>{$appLocale === 'en' ? 'Equipped' : 'Equipado'} · {item.name}</span
						></label
					>
				{/each}
			</div>
		</section>
	{/if}

	<section class="combat-attacks">
		<div class="section-title">
			<h3>{$appLocale === 'en' ? 'Other attacks' : 'Outros ataques'}</h3>
			<button onclick={actions.addAttack}>+ {$appLocale === 'en' ? 'Attack' : 'Ataque'}</button>
		</div>
		{#each sheet.attacks as attack, index (index)}
			<div class="line-item attack-row">
				<label
					class="token-roll-toggle"
					title={$appLocale === 'en' ? 'Show on token' : 'Exibir no token'}
					><input
						type="checkbox"
						checked={(sheet.visibleRolls ?? []).includes(`attack:${index}`)}
						onchange={() => actions.toggleVisibleRoll(`attack:${index}`)}
					/>⌁</label
				>
				<input class="attack-name" bind:value={attack.name} placeholder="Nome do ataque" />
				<select
					class="attack-type"
					aria-label={$appLocale === 'en' ? 'Attack range' : 'Tipo de ataque'}
					value={attack.attackType ?? 'melee'}
					onchange={(event) => actions.setAttackType(attack, event.currentTarget.value)}
				>
					<option value="melee">{$appLocale === 'en' ? 'Melee' : 'Corpo a corpo'}</option>
					<option value="ranged">{$appLocale === 'en' ? 'Ranged' : 'À distância'}</option>
				</select>
				<select
					class="attack-ability"
					aria-label={$appLocale === 'en' ? 'Attack ability' : 'Atributo do ataque'}
					value={attack.ability ?? 'strength'}
					onchange={(event) => {
						attack.ability = event.currentTarget.value as keyof AbilityScores;
						actions.syncTokenSoon();
					}}
				>
					{#each attributes as attribute (attribute.key)}
						<option value={attribute.key}
							>{attribute.label} ({modifier(sheet.abilityScores[attribute.key]) >= 0
								? '+'
								: ''}{modifier(sheet.abilityScores[attribute.key])})</option
						>
					{/each}
				</select>
				<input
					class="attack-bonus"
					type="number"
					bind:value={attack.attackBonus}
					aria-label={$appLocale === 'en' ? 'Additional attack bonus' : 'Bônus adicional de ataque'}
				/>
				<input class="attack-damage" bind:value={attack.damage} placeholder="Dano" />
				<button
					class="roll-custom"
					onclick={() => actions.rollCustomAttack(attack, index)}
					disabled={rollingAttack !== null}
					>{rollingAttack === index && rollingAttackAction === 'attack'
						? '…'
						: $appLocale === 'en'
							? '🎲 Attack'
							: '🎲 Ataque'}</button
				>
				<button
					class="roll-custom"
					onclick={() => actions.rollCustomDamage(attack, index)}
					disabled={rollingAttack !== null || !attack.damage.trim()}
					>{rollingAttack === index && rollingAttackAction === 'damage'
						? '…'
						: $appLocale === 'en'
							? '🎲 Damage'
							: '🎲 Dano'}</button
				>
				<button onclick={() => actions.removeAttack(index)}>×</button>
			</div>
		{/each}
	</section>
</div>

<style>
	.combat-tab {
		display: grid;
		gap: 1rem;
		min-width: 0;
		width: 100%;
	}
	.combat-tab label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.combat-tab input,
	.combat-tab select {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	:global(button) {
		cursor: pointer;
	}
	h3 {
		margin: 0 0 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.combat {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.combat h3,
	.rest-actions {
		grid-column: 1 / -1;
	}
	.rest-actions {
		display: flex;
		gap: 0.45rem;
	}
	.rest-actions button,
	.resources button {
		border: 1px solid #80603b;
		border-radius: 6px;
		padding: 0.42rem 0.6rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.72rem;
	}
	.combat-attacks {
		display: grid;
		gap: 0.45rem;
	}
	.resources {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #494045;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.resource-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto auto auto;
		align-items: center;
		gap: 0.5rem;
		border-top: 1px solid #393034;
		padding-top: 0.45rem;
	}
	.resources span {
		color: #a99c91;
		font-size: 0.7rem;
	}
	.resource-max {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.68rem;
	}
	.resource-max input {
		width: 3.3rem;
		min-width: 0;
		border: 1px solid #594a42;
		border-radius: 5px;
		padding: 0.3rem;
		color: #f0d29d;
		background: #211b1b;
	}
	.resources .resource-auto {
		padding-inline: 0.4rem;
	}
	.granted-spells {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		padding-top: 0.65rem;
		border-top: 1px solid #493c39;
	}
	.granted-spells h4 {
		margin: 0;
		color: #e8c786;
	}
	.granted-spells > div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.granted-spells span {
		color: #bcae9f;
		font-size: 0.76rem;
	}
	.combat-armor-list {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0.9rem;
		margin-top: 0.65rem;
		border-top: 1px solid #403536;
		padding-top: 0.65rem;
	}
	.combat-armor-list h4 {
		width: 100%;
		margin: 0;
		color: #d9c4a3;
		font-size: 0.78rem;
	}
	.combat-armor-list label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #d5c7b9;
		font-size: 0.75rem;
	}
	.line-item {
		display: grid;
		grid-template-columns: 1fr 80px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.45rem;
	}
	.line-item.attack-row {
		grid-template-columns:
			28px minmax(110px, 2fr) minmax(80px, 0.8fr) minmax(90px, 0.9fr)
			60px minmax(80px, 1.1fr) auto auto 32px;
		align-items: center;
	}
	.attack-row > input,
	.attack-row > select {
		width: 100%;
		min-width: 0;
	}
	.attack-row .attack-bonus {
		text-align: center;
	}
	.token-roll-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		color: #d8ad67;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.token-roll-toggle input {
		accent-color: #d8ad67;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-title button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.roll-custom {
		border: 1px solid #765d3d !important;
		border-radius: 5px !important;
		color: #f0d29d !important;
		background: #2b211c !important;
	}
	@media (max-width: 700px) {
		.combat {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.line-item.attack-row {
			grid-template-columns: 28px minmax(0, 1fr) 64px;
			gap: 0.35rem;
		}
		.attack-row .token-roll-toggle {
			grid-area: 1 / 1;
		}
		.attack-row .attack-name {
			grid-area: 1 / 2 / 2 / 3;
		}
		.attack-row > button:last-child {
			grid-area: 1 / 3;
		}
		.attack-row .attack-type {
			grid-area: 2 / 1 / 3 / 3;
		}
		.attack-row .attack-ability {
			grid-area: 3 / 1 / 4 / 3;
		}
		.attack-row .attack-bonus {
			grid-area: 3 / 3;
		}
		.attack-row .attack-damage {
			grid-area: 4 / 1 / 5 / 4;
		}
		.attack-row .roll-custom {
			grid-column: 1 / -1;
		}
		.resource-row {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}
		.resource-row > strong {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 520px) {
		.resource-row {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}
		.resource-row > strong {
			grid-column: 1 / -1;
		}
	}
</style>
