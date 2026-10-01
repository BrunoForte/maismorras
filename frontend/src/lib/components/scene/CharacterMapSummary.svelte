<script lang="ts">
	import type { CharacterSheet, AbilityScores } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';

	let { sheet }: { sheet: CharacterSheet } = $props();
	const abilities: { key: keyof AbilityScores; label: string }[] = [
		{ key: 'strength', label: 'FOR' },
		{ key: 'dexterity', label: 'DES' },
		{ key: 'constitution', label: 'CON' },
		{ key: 'intelligence', label: 'INT' },
		{ key: 'wisdom', label: 'SAB' },
		{ key: 'charisma', label: 'CAR' }
	];
	const modifier = (score: number) => Math.floor((score - 10) / 2);
	const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
	const skills: [string, string][] = [
		['Acrobacia', 'dexterity'],
		['Adestrar Animais', 'wisdom'],
		['Arcanismo', 'intelligence'],
		['Atletismo', 'strength'],
		['Atuação', 'charisma'],
		['Enganação', 'charisma'],
		['Furtividade', 'dexterity'],
		['História', 'intelligence'],
		['Intimidação', 'charisma'],
		['Intuição', 'wisdom'],
		['Investigação', 'intelligence'],
		['Medicina', 'wisdom'],
		['Natureza', 'intelligence'],
		['Percepção', 'wisdom'],
		['Persuasão', 'charisma'],
		['Prestidigitação', 'dexterity'],
		['Religião', 'intelligence'],
		['Sobrevivência', 'wisdom']
	];
	const relevantSkills = $derived(
		skills.filter(
			([name]) => sheet.skillProficiencies.includes(name) || sheet.skillExpertise.includes(name)
		)
	);
	function uniqueByKey<T>(items: readonly T[], keyFor: (item: T) => string): T[] {
		const indexes: Record<string, number> = Object.create(null) as Record<string, number>;
		const unique: T[] = [];
		for (const item of items) {
			const key = keyFor(item);
			if (Object.hasOwn(indexes, key)) unique[indexes[key]] = item;
			else {
				indexes[key] = unique.length;
				unique.push(item);
			}
		}
		return unique;
	}
	const weapons = $derived(
		uniqueByKey(
			sheet.inventory.filter(
				(item) => String(item.rules.category ?? '').toLowerCase() === 'weapon'
			),
			(item) => item.entryId || `${item.name}:${item.rules.damage ?? ''}`
		)
	);
	const availableResources = $derived(
		uniqueByKey(
			sheet.resources.filter((resource) => resource.max > 0),
			(resource) => resource.id || resource.name
		)
	);
	const spells = $derived(
		uniqueByKey(
			sheet.spells,
			(spell) =>
				spell.entryId ||
				`${spell.name
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '')
					.toLowerCase()}:${spell.level}`
		)
	);
	const spellSlots = $derived(uniqueByKey(sheet.spellSlots, (slot) => String(slot.level)));
</script>

<section
	class="map-summary"
	aria-label={$appLocale === 'en' ? 'Character quick sheet' : 'Ficha resumida do personagem'}
>
	<header>
		<strong>{sheet.name}</strong>
		<span>{sheet.class}{sheet.subclass ? ` · ${sheet.subclass}` : ''} · N{sheet.level}</span>
		<small>{[sheet.species, sheet.background].filter(Boolean).join(' · ')}</small>
	</header>
	<div class="combat-stats">
		<span><b>CA</b>{sheet.armorClass}</span>
		<span
			><b>PV</b>{sheet.hitPointsCurrent}/{sheet.hitPointsMax}{sheet.temporaryHP
				? ` (+${sheet.temporaryHP})`
				: ''}</span
		>
		<span><b>{$appLocale === 'en' ? 'Speed' : 'Desloc.'}</b>{sheet.speed}</span>
		<span><b>{$appLocale === 'en' ? 'Prof.' : 'Prof.'}</b>+{sheet.proficiencyBonus}</span>
	</div>
	<div class="ability-grid">
		{#each abilities as ability (ability.key)}<span
				><b>{ability.label}</b>{sheet.abilityScores[ability.key]}
				<small>({signed(modifier(sheet.abilityScores[ability.key]))})</small></span
			>{/each}
	</div>
	{#if sheet.savingThrows.length}<p>
			<b>{$appLocale === 'en' ? 'Saves' : 'Salvaguardas'}:</b>
			{sheet.savingThrows.join(', ')}
		</p>{/if}
	{#if relevantSkills.length}<p>
			<b>{$appLocale === 'en' ? 'Skills' : 'Perícias'}:</b>
			{relevantSkills.map(([name]) => name).join(', ')}
		</p>{/if}
	{#if weapons.length}<div class="summary-list">
			<strong>{$appLocale === 'en' ? 'Weapons' : 'Armas'}</strong>
			{#each weapons as item (item.entryId || `${item.name}:${item.rules.damage ?? ''}`)}
				{@const requestedAbility = String(
					item.rules.attackAbility ??
						(/ranged|dist[aâ]ncia|arco|besta/i.test(item.name) ? 'dexterity' : 'strength')
				)}
				{@const ability = (
					['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(
						requestedAbility
					)
						? requestedAbility
						: 'strength'
				) as keyof AbilityScores}
				{@const bonus = Number(item.rules.bonus ?? 0) + Number(item.rules.enchantmentBonus ?? 0)}
				<span
					>{item.name} · {$appLocale === 'en' ? 'attack' : 'ataque'}
					{signed(
						modifier(sheet.abilityScores[ability]) +
							bonus +
							(item.rules.proficient === true ? sheet.proficiencyBonus : 0)
					)} · {String(item.rules.damage ?? '—')}{signed(
						bonus + modifier(sheet.abilityScores[ability])
					)}</span
				>
			{/each}
		</div>{/if}
	{#if availableResources.length}<div class="summary-list">
			<strong>{$appLocale === 'en' ? 'Resources' : 'Recursos'}</strong>
			{#each availableResources as resource (resource.id || resource.name)}<span
					>{resource.name} · {resource.current}/{resource.max}</span
				>{/each}
		</div>{/if}
	{#if sheet.spells.length || sheet.spellSlots.length}<div class="summary-list">
			<strong>{$appLocale === 'en' ? 'Spells and slots' : 'Magias e espaços'}</strong>
			{#each spells as spell (spell.entryId || `${spell.name}:${spell.level}`)}<span
					>{spell.name} · {spell.level === 0
						? $appLocale === 'en'
							? 'Cantrip'
							: 'Truque'
						: `${$appLocale === 'en' ? 'Circle' : 'Círculo'} ${spell.level}`}</span
				>{/each}
			{#each spellSlots as slot (slot.level)}<span
					>{$appLocale === 'en' ? 'Circle' : 'Círculo'}
					{slot.level}: {slot.current}/{slot.max}
					{$appLocale === 'en' ? 'slots' : 'espaços'}</span
				>{/each}
		</div>{/if}
</section>

<style>
	.map-summary {
		display: grid;
		gap: 0.42rem;
		border: 1px solid #51443e;
		border-radius: 8px;
		padding: 0.6rem;
		color: #e9dfd4;
		background: #171316;
		font-size: 0.68rem;
	}
	.map-summary header {
		display: grid;
		gap: 0.14rem;
	}
	.map-summary header strong {
		color: #f0d29d;
		font-size: 0.86rem;
	}
	.map-summary header small,
	.map-summary p {
		margin: 0;
		color: #b9aa9b;
	}
	.combat-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.combat-stats span,
	.ability-grid span {
		display: grid;
		justify-items: center;
		padding: 0.3rem 0.15rem;
		border: 1px solid #393034;
		border-radius: 5px;
		text-align: center;
	}
	.combat-stats b,
	.ability-grid b {
		color: #d8ad67;
		font-size: 0.56rem;
	}
	.ability-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.2rem;
	}
	.ability-grid small {
		color: #baa98e;
	}
	.summary-list {
		display: grid;
		gap: 0.16rem;
	}
	.summary-list strong {
		color: #d8ad67;
	}
	.summary-list span {
		color: #d0c3b5;
	}
</style>
