<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { Attack, CharacterSheet, InventoryItem, Spell } from '$lib/services/characterApi';
	import type { WeaponAttackProfile } from '$lib/utils/weaponRules';
	import { equipmentCategory } from '$lib/utils/characterEquipment';
	import { weaponAttackProfiles } from '$lib/utils/weaponRules';

	type WeaponAction = (
		item: InventoryItem,
		action: 'attack' | 'damage',
		profile?: WeaponAttackProfile
	) => void;
	type Props = {
		sheet: CharacterSheet;
		isEnglish?: boolean;
		isGM?: boolean;
		canCastSpells?: boolean;
		hitPointsUpdating?: boolean;
		hitPointsCurrent?: number;
		hitPointsMax?: number;
		onHitPointsChange?: (delta: number) => void;
		onHitPointsSet?: (value: string) => void;
		onWeaponRoll?: WeaponAction;
		onCustomAttack?: (attack: Attack, index: number, action: 'attack' | 'damage') => void;
		onCastSpell?: (spell: Spell, index: number) => void;
		onPresentSpell?: (spell: Spell) => void;
	};
	let {
		sheet,
		isEnglish = false,
		isGM = false,
		canCastSpells = false,
		hitPointsUpdating = false,
		hitPointsCurrent = sheet.hitPointsCurrent,
		hitPointsMax = sheet.hitPointsMax,
		onHitPointsChange = () => {},
		onHitPointsSet = () => {},
		onWeaponRoll = () => {},
		onCustomAttack = () => {},
		onCastSpell = () => {},
		onPresentSpell = () => {}
	}: Props = $props();
	const weapons = $derived(sheet.inventory.filter((item) => equipmentCategory(item) === 'weapon'));
	const spellGroups = $derived.by(() => {
		const groups = new SvelteMap<number, { spell: Spell; index: number }[]>();
		sheet.spells.forEach((spell, index) => {
			const group = groups.get(spell.level) ?? [];
			group.push({ spell, index });
			groups.set(spell.level, group);
		});
		return [...groups.entries()].sort(([left], [right]) => left - right);
	});
	const canCastSpell = (spell: Spell) =>
		spell.level === 0 ||
		(canCastSpells &&
			sheet.spellSlots.some((slot) => slot.level >= spell.level && slot.current > 0));
	const circleLabel = (level: number) =>
		level === 0
			? isEnglish
				? 'Cantrips'
				: 'Truques'
			: isEnglish
				? `${level}${ordinal(level)} circle`
				: `${level}º círculo`;
	function ordinal(value: number) {
		if (value === 1) return 'st';
		if (value === 2) return 'nd';
		if (value === 3) return 'rd';
		return 'th';
	}
</script>

<section
	class="map-summary"
	aria-label={isEnglish ? 'Character quick sheet' : 'Ficha resumida do personagem'}
>
	<header class="summary-heading">
		<strong>{sheet.name}</strong>
		<span class="armor-class"><b>CA</b>{sheet.armorClass}</span>
	</header>
	<div class="hit-points">
		<label for="map-summary-hp">{isEnglish ? 'Hit points' : 'PV'}</label>
		<div class="hp-controls">
			<button
				disabled={hitPointsUpdating}
				onclick={() => onHitPointsChange(-1)}
				aria-label={isEnglish ? 'Remove 1 HP' : 'Reduzir 1 PV'}>−</button
			>
			<input
				id="map-summary-hp"
				aria-label={isEnglish
					? 'Current hit points; signed numbers change the value'
					: 'PV atuais; valores com sinal alteram o total'}
				type="text"
				inputmode="numeric"
				value={hitPointsCurrent}
				aria-busy={hitPointsUpdating}
				disabled={hitPointsUpdating}
				onchange={(event) => onHitPointsSet(event.currentTarget.value)}
			/>
			<button
				disabled={hitPointsUpdating}
				onclick={() => onHitPointsChange(1)}
				aria-label={isEnglish ? 'Add 1 HP' : 'Aumentar 1 PV'}>+</button
			>
			<span>/ {hitPointsMax}{sheet.temporaryHP ? ` (+${sheet.temporaryHP})` : ''}</span>
		</div>
		<small
			>{isEnglish ? 'Enter -10 to take 10 damage.' : 'Digite -10 para sofrer 10 de dano.'}</small
		>
	</div>

	{#if weapons.length || sheet.attacks.length}
		<section
			class="summary-section"
			aria-label={isEnglish ? 'Weapon attacks' : 'Ataques com armas'}
		>
			<strong>{isEnglish ? 'Attacks' : 'Ataques'}</strong>
			{#each weapons as item (item.entryId || item.name)}
				{@const profiles = weaponAttackProfiles(item)}
				<div class="action-row">
					<strong>{item.name}</strong>
					<div>
						<button onclick={() => onWeaponRoll(item, 'attack')}
							>{isEnglish ? 'Attack' : 'Ataque'}</button
						>
						<button onclick={() => onWeaponRoll(item, 'damage')}
							>{isEnglish ? 'Damage' : 'Dano'}</button
						>
					</div>
				</div>
				{#each profiles as profile (profile.id)}
					<div class="action-row custom-profile">
						<strong>{profile.name}</strong>
						<div>
							<button onclick={() => onWeaponRoll(item, 'attack', profile)}
								>{isEnglish ? 'Attack' : 'Ataque'}</button
							>
							<button onclick={() => onWeaponRoll(item, 'damage', profile)}
								>{isEnglish ? 'Damage' : 'Dano'}</button
							>
						</div>
					</div>
				{/each}
			{/each}
			{#each sheet.attacks as attack, index (index)}
				<div class="action-row">
					<strong>{attack.name}</strong>
					<div>
						<button onclick={() => onCustomAttack(attack, index, 'attack')}
							>{isEnglish ? 'Attack' : 'Ataque'}</button
						>
						<button
							disabled={!attack.damage.trim()}
							onclick={() => onCustomAttack(attack, index, 'damage')}
							>{isEnglish ? 'Damage' : 'Dano'}</button
						>
					</div>
				</div>
			{/each}
		</section>
	{/if}

	{#if spellGroups.length}
		<section
			class="summary-section spell-groups"
			aria-label={isEnglish ? 'Spells by circle' : 'Magias por círculo'}
		>
			<strong>{isEnglish ? 'Spells' : 'Magias'}</strong>
			{#each spellGroups as [level, entries] (level)}
				<details>
					<summary>{circleLabel(level)}</summary>
					{#each entries as { spell, index } (spell.entryId || `${spell.name}:${index}`)}
						<div class="action-row spell-row">
							<strong>{spell.name}</strong>
							<div>
								<button disabled={!canCastSpell(spell)} onclick={() => onCastSpell(spell, index)}
									>{isEnglish ? 'Cast' : 'Lançar'}</button
								>
								{#if isGM}<button onclick={() => onPresentSpell(spell)}
										>{isEnglish ? 'Display' : 'Exibir'}</button
									>{/if}
							</div>
						</div>
					{/each}
				</details>
			{/each}
		</section>
	{/if}
</section>

<style>
	.map-summary {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #51443e;
		border-radius: 8px;
		padding: 0.6rem;
		color: #e9dfd4;
		background: #171316;
		font-size: 0.7rem;
	}
	.summary-heading {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
	}
	.summary-heading > strong {
		overflow: hidden;
		color: #f0d29d;
		font-size: 0.86rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.armor-class {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		border: 1px solid #393034;
		border-radius: 5px;
		padding: 0.25rem 0.45rem;
	}
	.armor-class b,
	.summary-section > strong,
	.hit-points > label {
		color: #d8ad67;
	}
	.hit-points {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.25rem 0.5rem;
	}
	.hp-controls {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}
	.hp-controls input {
		width: 3.8rem;
		min-width: 2.8rem;
		border: 1px solid #594941;
		border-radius: 5px;
		padding: 0.3rem;
		color: #f4eee4;
		background: #100e11;
		text-align: center;
	}
	.hp-controls button,
	.action-row button {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.26rem 0.45rem;
		color: #f0d29d;
		background: #2b2224;
		font-size: 0.66rem;
	}
	.hp-controls button {
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		font-size: 0.9rem;
	}
	.hit-points small {
		grid-column: 2;
		color: #b9aa9b;
		font-size: 0.6rem;
	}
	.summary-section {
		display: grid;
		gap: 0.28rem;
	}
	.action-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.35rem;
		align-items: center;
		border-top: 1px solid #393034;
		padding-top: 0.28rem;
	}
	.action-row > strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.68rem;
	}
	.action-row > div {
		display: flex;
		gap: 0.25rem;
	}
	.action-row button {
		white-space: nowrap;
	}
	.action-row button:disabled,
	.hp-controls button:disabled {
		opacity: 0.5;
	}
	.custom-profile {
		padding-left: 0.6rem;
	}
	.spell-groups details {
		border: 1px solid #393034;
		border-radius: 5px;
		padding: 0.3rem 0.4rem;
	}
	.spell-groups summary {
		color: #e8c786;
		cursor: pointer;
	}
	.spell-row {
		border-top: 0;
	}
	@media (max-width: 420px) {
		.action-row {
			grid-template-columns: minmax(0, 1fr);
		}
		.action-row > div {
			justify-content: flex-start;
		}
	}
</style>
