<script lang="ts">
	import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';

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
	let {
		items,
		attributes,
		rollingWeaponAction,
		weaponKey,
		weaponAbility,
		abilityLabel,
		abilityModifier,
		modifierText,
		proficiencyStatus,
		proficiencyBonus,
		attackBonusTotal,
		damageBonusTotal,
		weaponEffects,
		weaponProfiles,
		hasGreatWeaponFighting,
		weaponSupportsGreatWeaponFighting,
		onWeaponChange,
		onToggleEffect,
		onAddProfile,
		onRemoveProfile,
		onProfileChange,
		onRoll
	}: {
		items: InventoryItem[];
		attributes: { key: keyof AbilityScores; label: string }[];
		rollingWeaponAction: string | null;
		weaponKey: (item: InventoryItem) => string;
		weaponAbility: (item: InventoryItem) => keyof AbilityScores;
		abilityLabel: (key: keyof AbilityScores) => string;
		abilityModifier: (key: keyof AbilityScores) => number;
		modifierText: (value: number) => string;
		proficiencyStatus: (item: InventoryItem) => boolean;
		proficiencyBonus: (item: InventoryItem) => number;
		attackBonusTotal: (item: InventoryItem) => number;
		damageBonusTotal: (item: InventoryItem) => number;
		weaponEffects: (item: InventoryItem) => WeaponEffect[];
		weaponProfiles: (item: InventoryItem) => WeaponAttackProfile[];
		hasGreatWeaponFighting: () => boolean;
		weaponSupportsGreatWeaponFighting: (item: InventoryItem) => boolean;
		onWeaponChange: (
			item: InventoryItem,
			changes: Record<string, unknown>,
			autosave?: boolean
		) => void;
		onToggleEffect: (item: InventoryItem, key: string) => void;
		onAddProfile: (item: InventoryItem) => void;
		onRemoveProfile: (item: InventoryItem, id: string) => void;
		onProfileChange: (
			item: InventoryItem,
			id: string,
			changes: Partial<WeaponAttackProfile>
		) => void;
		onRoll: (
			item: InventoryItem,
			action: 'attack' | 'damage',
			profile?: WeaponAttackProfile
		) => void;
	} = $props();
	let expandedWeapon = $state<string | null>(null);
</script>

<section class="combat-equipment">
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Weapon attacks' : 'Ataques com armas'}</h3>
	</div>
	{#if items.length}
		<div class="weapon-combat-list">
			{#each items as item (weaponKey(item))}
				<article class="weapon-combat-card">
					<button
						class="weapon-toggle"
						type="button"
						aria-expanded={expandedWeapon === weaponKey(item)}
						onclick={() =>
							(expandedWeapon = expandedWeapon === weaponKey(item) ? null : weaponKey(item))}
					>
						<strong>{item.name}</strong><span>{expandedWeapon === weaponKey(item) ? '⌃' : '⌄'}</span
						>
					</button>
					{#if expandedWeapon === weaponKey(item)}
						<div class="weapon-modifications">
							<label
								>{$appLocale === 'en' ? 'Enchantment bonus' : 'Bônus de encantamento'}
								<input
									type="number"
									min="-10"
									max="10"
									value={Number(item.rules.enchantmentBonus) || 0}
									oninput={(event) =>
										onWeaponChange(item, {
											enchantmentBonus: Number(event.currentTarget.value) || 0
										})}
								/>
							</label>
							<label
								>{$appLocale === 'en' ? 'Modifications' : 'Modificações'}
								<input
									value={String(item.rules.modifications ?? '')}
									oninput={(event) =>
										onWeaponChange(item, { modifications: event.currentTarget.value })}
									placeholder={$appLocale === 'en'
										? 'Notes on this weapon'
										: 'Ex.: runas, ajustes…'}
								/>
							</label>
							<label class="weapon-description-field"
								>{$appLocale === 'en' ? 'Description / ability' : 'Descrição / função'}
								<textarea
									value={String(item.rules.playerDescription ?? '')}
									oninput={(event) =>
										onWeaponChange(item, { playerDescription: event.currentTarget.value }, true)}
									placeholder={$appLocale === 'en'
										? 'Item function or special ability'
										: 'Função do item ou habilidade especial'}></textarea>
							</label>
						</div>
						<div class="weapon-combat-fields">
							<label
								>{$appLocale === 'en' ? 'Attack ability' : 'Atributo do ataque'}
								<select
									value={weaponAbility(item)}
									onchange={(event) =>
										onWeaponChange(item, { attackAbility: event.currentTarget.value }, true)}
								>
									{#each attributes as attribute (attribute.key)}<option value={attribute.key}
											>{abilityLabel(attribute.key)} ({modifierText(
												abilityModifier(attribute.key)
											)})</option
										>{/each}
								</select>
							</label>
							<label
								>{$appLocale === 'en' ? 'Bonus to attack and damage' : 'Bônus no ataque e dano'}
								<input
									type="number"
									min="-10"
									max="10"
									value={Number(item.rules.bonus) || 0}
									oninput={(event) =>
										onWeaponChange(item, { bonus: Number(event.currentTarget.value) || 0 })}
									aria-label={$appLocale === 'en'
										? `Bonus for ${item.name}`
										: `Bônus de ${item.name}`}
								/>
							</label>
							<span class:unproficient={!proficiencyStatus(item)} class="weapon-proficiency">
								{proficiencyStatus(item)
									? `${$appLocale === 'en' ? 'Proficient' : 'Proficiente'} · ${modifierText(proficiencyBonus(item))}`
									: $appLocale === 'en'
										? 'Not proficient'
										: 'Não proficiente'}
							</span>
							<label class="weapon-proficiency-override"
								><input
									type="checkbox"
									checked={proficiencyStatus(item)}
									onchange={(event) =>
										onWeaponChange(item, { proficient: event.currentTarget.checked }, true)}
								/>{$appLocale === 'en' ? 'Manual proficiency' : 'Proficiência manual'}</label
							>
							<label
								>{$appLocale === 'en' ? 'Damage' : 'Dano'}
								<input
									value={String(item.rules.damage ?? '')}
									oninput={(event) => onWeaponChange(item, { damage: event.currentTarget.value })}
								/>
							</label>
						</div>
						{#if weaponEffects(item).length}
							<fieldset class="weapon-effects">
								<legend
									>{$appLocale === 'en'
										? 'Applicable class/feat bonuses'
										: 'Bônus de classe/talentos aplicáveis'}</legend
								>
								{#each weaponEffects(item) as effect (effect.key)}
									<label
										><input
											type="checkbox"
											checked={(Array.isArray(item.rules.enabledCombatModifiers)
												? item.rules.enabledCombatModifiers.map(String)
												: []
											).includes(effect.key)}
											onchange={() => onToggleEffect(item, effect.key)}
										/>{effect.name}<small
											>{#if effect.attackBonus}{$appLocale === 'en'
													? `Attack +${effect.attackBonus}`
													: `Ataque +${effect.attackBonus}`}{/if}{#if effect.attackBonus && effect.damageBonus}
												·
											{/if}{#if effect.damageBonus}{$appLocale === 'en'
													? `Damage +${effect.damageBonus}`
													: `Dano +${effect.damageBonus}`}{/if}</small
										></label
									>
								{/each}
							</fieldset>
						{:else}<small class="weapon-effects-empty"
								>{$appLocale === 'en'
									? 'No numeric class or feat modifiers are mapped to this weapon.'
									: 'Nenhum bônus numérico de habilidade ou talento foi mapeado para esta arma.'}</small
							>{/if}
						<div class="weapon-combat-summary">
							{$appLocale === 'en' ? 'Attack' : 'Ataque'}: {modifierText(attackBonusTotal(item))} · {$appLocale ===
							'en'
								? 'Damage'
								: 'Dano'}: {String(item.rules.damage ?? '—')}
							{modifierText(damageBonusTotal(item))}
						</div>
						<div class="weapon-combat-actions">
							<button
								class="roll-weapon"
								onclick={() => onRoll(item, 'attack')}
								disabled={rollingWeaponAction !== null}
								>{rollingWeaponAction === `${weaponKey(item)}:default:attack`
									? '…'
									: $appLocale === 'en'
										? '🎲 Attack'
										: '🎲 Ataque'}</button
							>
							<button
								onclick={() => onRoll(item, 'damage')}
								disabled={rollingWeaponAction !== null ||
									!String(item.rules.damage ?? '').match(/^\d+d\d+/i)}
								>{rollingWeaponAction === `${weaponKey(item)}:default:damage`
									? '…'
									: $appLocale === 'en'
										? '🎲 Damage'
										: '🎲 Dano'}</button
							>
						</div>
						<div class="weapon-profile-list">
							<button type="button" class="secondary-button" onclick={() => onAddProfile(item)}
								>+ {$appLocale === 'en' ? 'Alternate attack' : 'Golpe'}</button
							>
							{#each weaponProfiles(item) as profile (profile.id)}
								<details class="weapon-profile">
									<summary>{profile.name}</summary>
									<div class="weapon-profile-fields">
										<input
											aria-label="Nome do golpe"
											value={profile.name}
											oninput={(event) =>
												onProfileChange(item, profile.id, { name: event.currentTarget.value })}
										/>
										<textarea
											aria-label="Descrição do golpe"
											value={profile.description}
											oninput={(event) =>
												onProfileChange(item, profile.id, {
													description: event.currentTarget.value
												})}></textarea>
										<label
											>{$appLocale === 'en' ? 'Ability' : 'Atributo'}<select
												value={profile.attackAbility}
												onchange={(event) =>
													onProfileChange(item, profile.id, {
														attackAbility: event.currentTarget.value as keyof AbilityScores
													})}
												>{#each attributes as attribute (attribute.key)}<option
														value={attribute.key}>{abilityLabel(attribute.key)}</option
													>{/each}</select
											></label
										>
										<label
											>{$appLocale === 'en' ? 'Attack bonus' : 'Bônus de ataque'}<input
												type="number"
												value={profile.attackBonus}
												oninput={(event) =>
													onProfileChange(item, profile.id, {
														attackBonus: Number(event.currentTarget.value)
													})}
											/></label
										>
										<label
											>{$appLocale === 'en' ? 'Damage' : 'Dano'}<input
												value={profile.damage}
												oninput={(event) =>
													onProfileChange(item, profile.id, { damage: event.currentTarget.value })}
											/></label
										>
										<label
											>{$appLocale === 'en' ? 'Damage bonus' : 'Bônus de dano'}<input
												type="number"
												value={profile.damageBonus}
												oninput={(event) =>
													onProfileChange(item, profile.id, {
														damageBonus: Number(event.currentTarget.value)
													})}
											/></label
										>
										{#if hasGreatWeaponFighting() && weaponSupportsGreatWeaponFighting(item)}<label
												><input
													type="checkbox"
													checked={profile.greatWeaponFighting}
													onchange={(event) =>
														onProfileChange(item, profile.id, {
															greatWeaponFighting: event.currentTarget.checked
														})}
												/>{$appLocale === 'en'
													? 'Great Weapon Fighting'
													: 'Luta com Armas Grandes'}</label
											>{/if}
										<div class="weapon-combat-actions">
											<button
												class="roll-weapon"
												onclick={() => onRoll(item, 'attack', profile)}
												disabled={rollingWeaponAction !== null}
												>🎲 {$appLocale === 'en' ? 'Attack' : 'Ataque'}</button
											>
											<button
												onclick={() => onRoll(item, 'damage', profile)}
												disabled={rollingWeaponAction !== null || !/^\d+d\d+/i.test(profile.damage)}
												>🎲 {$appLocale === 'en' ? 'Damage' : 'Dano'}</button
											>
											<button
												class="danger-button"
												onclick={() => onRemoveProfile(item, profile.id)}>×</button
											>
										</div>
									</div>
								</details>
							{/each}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}
		<p class="empty-inline">
			{$appLocale === 'en'
				? 'Add weapons in Inventory to roll them here.'
				: 'Adicione armas no Inventário para rolar por aqui.'}
		</p>
	{/if}
</section>

<style>
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.weapon-combat-list {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.65rem;
	}
	.weapon-combat-card {
		min-width: 0;
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem;
		border: 1px solid #51443e;
		border-radius: 8px;
		background: #181416;
	}
	.weapon-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border: 0;
		padding: 0.2rem 0;
		color: #f0d8aa;
		background: transparent;
		text-align: left;
	}
	.weapon-toggle span {
		color: #c9a972;
	}
	.weapon-modifications {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid #393034;
	}
	.weapon-modifications label {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
		color: #bcae9f;
		font-size: 0.68rem;
	}
	.weapon-modifications input {
		width: 100%;
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.45rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.weapon-modifications .weapon-description-field {
		grid-column: 1 / -1;
	}
	.weapon-description-field textarea {
		width: 100%;
		min-width: 0;
		min-height: 3rem;
		resize: vertical;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.45rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.weapon-combat-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.weapon-combat-fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		align-items: end;
		gap: 0.55rem;
	}
	.weapon-proficiency {
		align-self: end;
		padding-bottom: 0.5rem;
		color: #a9c99a;
		font-size: 0.68rem;
	}
	.weapon-proficiency.unproficient {
		color: #e3a09a;
	}
	.weapon-proficiency-override {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: #c5b5a5;
		font-size: 0.72rem;
	}
	.weapon-proficiency-override input {
		accent-color: #d8ad67;
	}
	.weapon-profile-list,
	.weapon-profile-fields {
		display: grid;
		gap: 0.5rem;
	}
	.weapon-profile-list > button {
		justify-self: start;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.4rem 0.65rem;
		color: #f0d29d;
		background: #2b211c;
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.weapon-profile {
		padding: 0.5rem;
		border: 1px solid #4f433d;
		border-radius: 7px;
		background: #211b1e;
	}
	.weapon-profile summary {
		color: #e8c786;
		cursor: pointer;
	}
	.weapon-profile-fields {
		margin-top: 0.55rem;
	}
	.weapon-profile-fields input,
	.weapon-profile-fields textarea,
	.weapon-profile-fields select {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.45rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.weapon-combat-summary {
		color: #b9aa9b;
		font-size: 0.75rem;
	}
	.weapon-combat-fields label {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
		color: #bcae9f;
		font-size: 0.68rem;
	}
	.weapon-combat-fields input,
	.weapon-combat-fields select {
		width: 100%;
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.45rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.weapon-effects {
		min-width: 0;
		display: grid;
		gap: 0.35rem;
		margin: 0;
		border: 1px solid #493e39;
		border-radius: 6px;
		padding: 0.5rem;
	}
	.weapon-effects legend {
		padding: 0 0.25rem;
		color: #d6b879;
		font-size: 0.68rem;
	}
	.weapon-effects label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #e1d5c9;
		font-size: 0.72rem;
	}
	.weapon-effects small {
		margin-left: auto;
		color: #b9aa9b;
		font-size: 0.65rem;
	}
	.weapon-effects-empty {
		color: #93877d;
		font-size: 0.68rem;
	}
	.weapon-combat-actions button {
		flex: 1;
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.48rem 0.6rem;
		color: #e8c786;
		background: #2a211e;
	}
	.weapon-combat-actions .roll-weapon {
		color: #ffe1a4;
		background: #3b291e;
	}
	.roll-weapon {
		border-color: #9d7744 !important;
		color: #ffe1a4 !important;
		background: #3b291e !important;
	}
	.empty-inline {
		margin: 0;
		color: #96897e;
		font-size: 0.76rem;
	}
	@media (max-width: 520px) {
		.weapon-combat-fields,
		.weapon-modifications {
			grid-template-columns: 1fr;
		}
	}
</style>
