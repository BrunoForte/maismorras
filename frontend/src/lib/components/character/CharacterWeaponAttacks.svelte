<script lang="ts">
	import type { AbilityScores, InventoryItem } from '$lib/services/characterApi';
	import type { WeaponCombatActions } from '$lib/utils/weaponRules';
	import { appLocale } from '$lib/stores/locale';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import { tick } from 'svelte';
	import WeaponDamageBuilder from './WeaponDamageBuilder.svelte';
	import {
		validateDamageBonus,
		serializeDamageComponents,
		validateDamageComponents
	} from '$lib/utils/weaponDamageBuilder';
	let {
		items,
		attributes,
		rollingWeaponAction,
		rollMode = $bindable<'normal' | 'advantage' | 'disadvantage'>('normal'),
		attackDisadvantage = false,
		actions
	}: {
		items: InventoryItem[];
		attributes: { key: keyof AbilityScores; label: string }[];
		rollingWeaponAction: string | null;
		rollMode?: 'normal' | 'advantage' | 'disadvantage';
		attackDisadvantage?: boolean;
		actions: WeaponCombatActions;
	} = $props();
	let expandedWeapon = $state<string | null>(null);
	$effect(() => {
		const invalidKey = actions.invalidWeaponKey();
		if (!invalidKey || !items.some((item) => actions.weaponKey(item) === invalidKey)) return;
		expandedWeapon = invalidKey;
		const index = actions.invalidDamageIndex();
		const profileId = actions.invalidDamageProfileId();
		void tick().then(() => {
			if (actions.invalidWeaponField() === 'bonus') {
				document.getElementById(`damage-bonus-${invalidKey}-${profileId ?? 'base'}`)?.focus();
				return;
			}
			if (profileId) {
				const details = document.getElementById(
					`damage-profile-${invalidKey}-${profileId}`
				) as HTMLDetailsElement | null;
				if (details) details.open = true;
			}
			const identifier = `${invalidKey}-${profileId ?? 'base'}`;
			const field = document.getElementById(`damage-count-${identifier}-${index}`);
			(field ?? document.getElementById(`damage-add-${identifier}`))?.focus();
		});
	});
</script>

<section class="combat-equipment">
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Weapon attacks' : 'Ataques com armas'}</h3>
		<label class="weapon-roll-mode">
			{$appLocale === 'en' ? 'Attack roll' : 'Rolagem de ataque'}
			<select
				bind:value={rollMode}
				aria-label={$appLocale === 'en' ? 'Weapon attack mode' : 'Modo de ataque das armas'}
			>
				<option value="normal">{$appLocale === 'en' ? 'Normal' : 'Normal'}</option>
				<option value="advantage" disabled={attackDisadvantage}
					>{$appLocale === 'en' ? 'Advantage' : 'Vantagem'}</option
				>
				<option value="disadvantage">{$appLocale === 'en' ? 'Disadvantage' : 'Desvantagem'}</option>
			</select>
		</label>
	</div>
	{#if attackDisadvantage}<small class="forced-disadvantage"
			>{$appLocale === 'en'
				? 'An active condition forces disadvantage.'
				: 'Uma condição ativa impõe desvantagem.'}</small
		>{/if}
	{#if items.length}
		<div class="weapon-combat-list">
			{#each items as item (actions.weaponKey(item))}
				<article class="weapon-combat-card">
					<button
						class="weapon-toggle"
						type="button"
						aria-expanded={expandedWeapon === actions.weaponKey(item)}
						onclick={() =>
							(expandedWeapon =
								expandedWeapon === actions.weaponKey(item) ? null : actions.weaponKey(item))}
					>
						<strong>{item.name}</strong><span
							>{expandedWeapon === actions.weaponKey(item) ? '⌃' : '⌄'}</span
						>
					</button>
					{#if expandedWeapon === actions.weaponKey(item)}
						<div class="weapon-modifications">
							<label
								>{$appLocale === 'en' ? 'Enchantment bonus' : 'Bônus de encantamento'}
								<input
									type="number"
									min="-10"
									max="10"
									value={Number(item.rules.enchantmentBonus) || 0}
									oninput={(event) =>
										actions.updateWeaponRules(item, {
											enchantmentBonus: Number(event.currentTarget.value) || 0
										})}
								/>
							</label>
							<label
								>{$appLocale === 'en' ? 'Modifications' : 'Modificações'}
								<input
									value={String(item.rules.modifications ?? '')}
									oninput={(event) =>
										actions.updateWeaponRules(item, { modifications: event.currentTarget.value })}
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
										actions.updateWeaponRules(
											item,
											{ playerDescription: event.currentTarget.value },
											true
										)}
									placeholder={$appLocale === 'en'
										? 'Item function or special ability'
										: 'Função do item ou habilidade especial'}></textarea>
							</label>
						</div>
						<div class="weapon-combat-fields">
							<label
								>{$appLocale === 'en' ? 'Attack ability' : 'Atributo do ataque'}
								<select
									value={actions.weaponAbility(item)}
									onchange={(event) =>
										actions.updateWeaponRules(
											item,
											{ attackAbility: event.currentTarget.value },
											true
										)}
								>
									{#each attributes as attribute (attribute.key)}<option value={attribute.key}
											>{actions.abilityLabel(attribute.key)} ({actions.modifierText(
												actions.abilityModifier(attribute.key)
											)})</option
										>{/each}
								</select>
							</label>
							<label
								>{$appLocale === 'en' ? 'Attack bonus' : 'Bônus de ataque'}
								<input
									type="number"
									min="-10"
									max="10"
									value={Number(item.rules.attackBonus ?? item.rules.bonus) || 0}
									oninput={(event) =>
										actions.updateWeaponRules(item, {
											attackBonus: Number(event.currentTarget.value) || 0,
											damageBonus: Number(item.rules.damageBonus ?? item.rules.bonus) || 0
										})}
									aria-label={$appLocale === 'en'
										? `Bonus for ${item.name}`
										: `Bônus de ${item.name}`}
								/>
							</label>
							<span
								class:unproficient={!actions.proficiencyStatus(item)}
								class="weapon-proficiency"
							>
								{actions.proficiencyStatus(item)
									? `${$appLocale === 'en' ? 'Proficient' : 'Proficiente'} · ${actions.modifierText(actions.proficiencyBonus(item))}`
									: $appLocale === 'en'
										? 'Not proficient'
										: 'Não proficiente'}
							</span>
							<label class="weapon-proficiency-override"
								><input
									type="checkbox"
									checked={actions.proficiencyStatus(item)}
									onchange={(event) =>
										actions.updateWeaponRules(
											item,
											{ proficient: event.currentTarget.checked },
											true
										)}
								/>{$appLocale === 'en' ? 'Manual proficiency' : 'Proficiência manual'}</label
							>
						</div>
						{@const baseComponents = actions.damageComponents(item)}
						{@const baseIssue = validateDamageComponents(baseComponents)}
						<fieldset
							class="damage-builder"
							aria-label={$appLocale === 'en'
								? 'Weapon damage configuration'
								: 'Configuração do dano da arma'}
						>
							<legend>{$appLocale === 'en' ? 'Damage' : 'Dano'}</legend>
							<WeaponDamageBuilder
								identifier={`${actions.weaponKey(item)}-base`}
								components={baseComponents}
								invalidIndex={baseIssue?.index ?? -1}
								error={item.rules.damageNeedsRepair
									? $appLocale === 'en'
										? 'This legacy formula cannot be converted. Rebuild its components explicitly.'
										: 'Esta fórmula antiga não pode ser convertida. Refaça os componentes explicitamente.'
									: baseIssue
										? `${baseIssue.message} Configure quantidade + tipo de dado, até 10 dados no total; valores sem dados vão em Bônus de dano.`
										: actions.invalidWeaponKey() === actions.weaponKey(item) &&
											  actions.invalidDamageProfileId() === null &&
											  actions.invalidWeaponField() === 'damage'
											? 'Configure quantidade + tipo de dado, até 10 dados no total; valores sem dados vão em Bônus de dano.'
											: ''}
								onchange={(components) => actions.setDamageComponents(item, components)}
							/>
							<label class="damage-bonus-field"
								>{$appLocale === 'en' ? 'Damage bonus' : 'Bônus de dano'}<input
									id={`damage-bonus-${actions.weaponKey(item)}-base`}
									type="number"
									step="1"
									min="-10000"
									max="10000"
									aria-invalid={actions.invalidWeaponKey() === actions.weaponKey(item) &&
										actions.invalidDamageProfileId() === null &&
										actions.invalidWeaponField() === 'bonus'}
									value={Number(item.rules.damageBonus ?? item.rules.bonus) || 0}
									oninput={(event) =>
										actions.updateWeaponRules(
											item,
											{
												damageBonus: Number(event.currentTarget.value) || 0,
												attackBonus: Number(item.rules.attackBonus ?? item.rules.bonus) || 0
											},
											true
										)}
								/></label
							>
						</fieldset>
						{#if actions.weaponEffects(item).length}
							<fieldset class="weapon-effects">
								<legend
									>{$appLocale === 'en'
										? 'Applicable class/feat bonuses'
										: 'Bônus de classe/talentos aplicáveis'}</legend
								>
								{#each actions.weaponEffects(item) as effect (effect.key)}
									<label
										><input
											type="checkbox"
											checked={(Array.isArray(item.rules.enabledCombatModifiers)
												? item.rules.enabledCombatModifiers.map(String)
												: []
											).includes(effect.key)}
											onchange={() => actions.toggleWeaponEffect(item, effect.key)}
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
							{$appLocale === 'en' ? 'Attack' : 'Ataque'}: {actions.modifierText(
								actions.attackBonusTotal(item)
							)} · {$appLocale === 'en' ? 'Damage' : 'Dano'}: {serializeDamageComponents(
								actions.damageComponents(item)
							) || '—'}
							{actions.modifierText(actions.damageBonusTotal(item))}
						</div>
						<div class="weapon-combat-actions">
							<button
								class="roll-weapon"
								onclick={() => actions.rollWeapon(item, 'attack')}
								disabled={rollingWeaponAction !== null}
								>{rollingWeaponAction === `${actions.weaponKey(item)}:default:attack`
									? '…'
									: $appLocale === 'en'
										? 'Attack'
										: 'Ataque'}<RpgIcon name="d20" size={18} /></button
							>
							<button
								onclick={() => actions.rollWeapon(item, 'damage')}
								disabled={rollingWeaponAction !== null ||
									!actions.damageComponents(item).length ||
									!!validateDamageComponents(actions.damageComponents(item)) ||
									!!validateDamageBonus(item.rules.damageBonus ?? item.rules.bonus) ||
									!!item.rules.damageNeedsRepair}
								>{rollingWeaponAction === `${actions.weaponKey(item)}:default:damage`
									? '…'
									: $appLocale === 'en'
										? 'Damage'
										: 'Dano'}<RpgIcon name="d20" size={18} /></button
							>
						</div>
						<div class="weapon-profile-list">
							<button
								type="button"
								class="secondary-button"
								onclick={() => actions.addWeaponAttackProfile(item)}
								>+ {$appLocale === 'en' ? 'Alternate attack' : 'Golpe'}</button
							>
							{#each actions.weaponProfiles(item) as profile (profile.id)}
								{@const profileComponents = actions.damageComponents(item, profile)}
								{@const profileIssue = validateDamageComponents(profileComponents)}
								<details
									class="weapon-profile"
									id={`damage-profile-${actions.weaponKey(item)}-${profile.id}`}
								>
									<summary>{profile.name}</summary>
									<div class="weapon-profile-fields">
										<input
											aria-label="Nome do golpe"
											value={profile.name}
											oninput={(event) =>
												actions.updateWeaponProfile(item, profile.id, {
													name: event.currentTarget.value
												})}
										/>
										<textarea
											aria-label="Descrição do golpe"
											value={profile.description}
											oninput={(event) =>
												actions.updateWeaponProfile(item, profile.id, {
													description: event.currentTarget.value
												})}></textarea>
										<label
											>{$appLocale === 'en' ? 'Ability' : 'Atributo'}<select
												value={profile.attackAbility}
												onchange={(event) =>
													actions.updateWeaponProfile(item, profile.id, {
														attackAbility: event.currentTarget.value as keyof AbilityScores
													})}
												>{#each attributes as attribute (attribute.key)}<option
														value={attribute.key}>{actions.abilityLabel(attribute.key)}</option
													>{/each}</select
											></label
										>
										<label
											>{$appLocale === 'en' ? 'Attack bonus' : 'Bônus de ataque'}<input
												type="number"
												value={profile.attackBonus}
												oninput={(event) =>
													actions.updateWeaponProfile(item, profile.id, {
														attackBonus: Number(event.currentTarget.value)
													})}
											/></label
										>
										<fieldset class="profile-damage-builder">
											<legend>{$appLocale === 'en' ? 'Damage' : 'Dano'}</legend>
											<WeaponDamageBuilder
												identifier={`${actions.weaponKey(item)}-${profile.id}`}
												components={profileComponents}
												invalidIndex={profileIssue?.index ?? -1}
												error={profile.damageNeedsRepair
													? $appLocale === 'en'
														? 'This legacy formula cannot be converted. Rebuild its components explicitly.'
														: 'Esta fórmula antiga não pode ser convertida. Refaça os componentes explicitamente.'
													: profileIssue
														? $appLocale === 'en'
															? `${profileIssue.message} The total limit is 10 dice; fixed values belong in Damage bonus.`
															: `${profileIssue.message} O limite é 10 dados no total; valores sem dados vão em Bônus de dano.`
														: actions.invalidWeaponKey() === actions.weaponKey(item) &&
															  actions.invalidDamageProfileId() === profile.id &&
															  actions.invalidWeaponField() === 'damage'
															? $appLocale === 'en'
																? 'Configure quantity + die type, up to 10 dice total; fixed values belong in Damage bonus.'
																: 'Configure quantidade + tipo de dado, até 10 dados no total; valores sem dados vão em Bônus de dano.'
															: ''}
												onchange={(components) =>
													actions.setDamageComponents(item, components, profile)}
											/>
										</fieldset>
										<label
											>{$appLocale === 'en' ? 'Damage bonus' : 'Bônus de dano'}<input
												id={`damage-bonus-${actions.weaponKey(item)}-${profile.id}`}
												type="number"
												min="-10000"
												max="10000"
												step="1"
												value={profile.damageBonus}
												aria-invalid={actions.invalidWeaponKey() === actions.weaponKey(item) &&
													actions.invalidDamageProfileId() === profile.id &&
													actions.invalidWeaponField() === 'bonus'}
												oninput={(event) =>
													actions.updateWeaponProfile(item, profile.id, {
														damageBonus: Number(event.currentTarget.value)
													})}
											/></label
										>
										{#if actions.hasGreatWeaponFighting() && actions.weaponSupportsGreatWeaponFighting(item)}<label
												><input
													type="checkbox"
													checked={profile.greatWeaponFighting}
													onchange={(event) =>
														actions.updateWeaponProfile(item, profile.id, {
															greatWeaponFighting: event.currentTarget.checked
														})}
												/>{$appLocale === 'en'
													? 'Great Weapon Fighting'
													: 'Luta com Armas Grandes'}</label
											>{/if}
										<div class="weapon-combat-actions">
											<button
												class="roll-weapon"
												onclick={() => actions.rollWeapon(item, 'attack', profile)}
												disabled={rollingWeaponAction !== null}
												><RpgIcon name="d20" size={18} />
												{$appLocale === 'en' ? 'Attack' : 'Ataque'}</button
											>
											<button
												onclick={() => actions.rollWeapon(item, 'damage', profile)}
												disabled={rollingWeaponAction !== null ||
													!profileComponents.length ||
													!!profileIssue ||
													!!validateDamageBonus(profile.damageBonus) ||
													!!profile.damageNeedsRepair}
												><RpgIcon name="d20" size={18} />
												{$appLocale === 'en' ? 'Damage' : 'Dano'}</button
											>
											<button
												class="danger-button"
												onclick={() => actions.removeWeaponAttackProfile(item, profile.id)}
												>×</button
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
	.weapon-roll-mode {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: #bcae9f;
		font-size: 0.7rem;
	}
	.weapon-roll-mode select {
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.forced-disadvantage {
		color: #e3a09a;
		font-size: 0.68rem;
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
	.damage-builder {
		min-width: 0;
		display: grid;
		gap: 0.55rem;
		border: 1px solid #51443e;
		border-radius: 8px;
		padding: 0.65rem;
	}
	.damage-bonus-field {
		min-width: 0;
		display: grid;
		gap: 0.25rem;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
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
