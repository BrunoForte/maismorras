<script lang="ts">
	import type { CharacterSheet } from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import type { AppLocale } from '$lib/utils/speciesRules';
	import { translatedCompendiumText } from '$lib/utils/compendium/compendiumRules';
	import {
		DND2024_SIZES,
		defaultCharacterSize,
		type Dnd2024Size
	} from '$lib/utils/carryingCapacity';

	let {
		locale,
		sheet = $bindable(),
		optionsFor,
		optionLabel,
		subclassOptions,
		lineageOptions,
		onClassChanged,
		onSubclassChanged,
		onLevelChanged,
		onSpeciesChanged,
		onLineageChanged
	}: {
		locale: AppLocale;
		sheet: CharacterSheet;
		optionsFor: (entryType: string) => CompendiumEntry[];
		optionLabel: (entry: CompendiumEntry) => string;
		subclassOptions: string[];
		lineageOptions: string[];
		onClassChanged: () => void;
		onSubclassChanged: () => void;
		onLevelChanged: () => void;
		onSpeciesChanged: () => void;
		onLineageChanged: (value: string) => void;
	} = $props();
	const shownSize = () => sheet.creatureSize ?? defaultCharacterSize(sheet.species);
	const sizeLabel = (size: Dnd2024Size) =>
		locale === 'en'
			? size[0].toUpperCase() + size.slice(1)
			: {
					tiny: 'Miúdo',
					small: 'Pequeno',
					medium: 'Médio',
					large: 'Grande',
					huge: 'Enorme',
					gargantuan: 'Imenso'
				}[size];
</script>

<section class="identity">
	<label class="identity-name"
		>{locale === 'en' ? 'Name' : 'Nome'}<input
			bind:value={sheet.name}
			maxlength="120"
			placeholder={locale === 'en' ? 'Character name' : 'Nome do personagem'}
		/></label
	>
	<label class="identity-class"
		>{locale === 'en' ? 'Class' : 'Classe'}<input
			bind:value={sheet.class}
			onchange={onClassChanged}
			list="class-options"
			placeholder={locale === 'en' ? 'E.g. Fighter' : 'Ex.: Guerreiro'}
		/></label
	>
	{#if subclassOptions.length}
		<label class="identity-subclass"
			>{locale === 'en' ? 'Subclass' : 'Subclasse'}<select
				bind:value={sheet.subclass}
				onchange={onSubclassChanged}
				><option value="">{locale === 'en' ? 'Choose at level 3…' : 'Escolha no nível 3…'}</option
				>{#each subclassOptions as subclass (subclass)}<option value={subclass}>{subclass}</option
					>{/each}</select
			></label
		>
	{/if}
	<label class="identity-level"
		>{locale === 'en' ? 'Level' : 'Nível'}<input
			type="number"
			min="1"
			max="20"
			bind:value={sheet.level}
			onchange={onLevelChanged}
		/></label
	>
	<label class="identity-species"
		>{locale === 'en' ? 'Species' : 'Espécie'}<input
			bind:value={sheet.species}
			onchange={onSpeciesChanged}
			list="species-options"
			placeholder={locale === 'en' ? 'E.g. Human' : 'Ex.: Humano'}
		/></label
	>
	<label class="identity-background"
		>{locale === 'en' ? 'Background' : 'Antecedente'}<input
			bind:value={sheet.background}
			list="background-options"
		/></label
	>
	<label class="identity-size"
		>{locale === 'en' ? 'Size' : 'Tamanho'}<select
			aria-label={locale === 'en' ? 'Character size' : 'Tamanho do personagem'}
			value={shownSize()}
			onchange={(event) => (sheet.creatureSize = event.currentTarget.value as Dnd2024Size)}
			>{#each DND2024_SIZES as size (size)}<option value={size}>{sizeLabel(size)}</option
				>{/each}</select
		></label
	>
	{#if lineageOptions.length}
		<label class="identity-lineage"
			>{locale === 'en' ? 'Lineage / legacy' : 'Linhagem / legado'}<select
				value={sheet.speciesLineage ?? ''}
				onchange={(event) => onLineageChanged(event.currentTarget.value)}
				><option value="">{locale === 'en' ? 'Choose an option…' : 'Escolha uma opção…'}</option
				>{#each lineageOptions as lineage (lineage)}<option value={lineage}>{lineage}</option
					>{/each}</select
			></label
		>
	{/if}
	<label class="identity-alignment"
		>{locale === 'en' ? 'Alignment' : 'Alinhamento'}<input bind:value={sheet.alignment} /></label
	>
	<label class="identity-proficiency"
		>{locale === 'en' ? 'Proficiency bonus' : 'Bônus de proficiência'}<input
			type="number"
			min="0"
			max="20"
			bind:value={sheet.proficiencyBonus}
		/></label
	>
	<datalist id="class-options"
		>{#each optionsFor('class') as entry (entry.id)}<option value={optionLabel(entry)}
				>{translatedCompendiumText(entry, 'summary', entry.summary, locale)}</option
			>{/each}</datalist
	>
	<datalist id="species-options"
		>{#each optionsFor('species') as entry (entry.id)}<option value={optionLabel(entry)}
				>{translatedCompendiumText(entry, 'summary', entry.summary, locale)}</option
			>{/each}</datalist
	>
	<datalist id="background-options"
		>{#each optionsFor('background') as entry (entry.id)}<option value={optionLabel(entry)}
				>{translatedCompendiumText(entry, 'summary', entry.summary, locale)}</option
			>{/each}</datalist
	>
</section>

<style>
	.identity {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-template-areas: 'name class subclass level' 'species background size proficiency' 'alignment alignment alignment alignment' 'lineage lineage lineage lineage';
		gap: 0.7rem;
	}
	.identity-name {
		grid-area: name;
	}
	.identity-class {
		grid-area: class;
	}
	.identity-subclass {
		grid-area: subclass;
	}
	.identity-level {
		grid-area: level;
	}
	.identity-species {
		grid-area: species;
	}
	.identity-background {
		grid-area: background;
	}
	.identity-size {
		grid-area: size;
	}
	.identity-alignment {
		grid-area: alignment;
	}
	.identity-proficiency {
		grid-area: proficiency;
	}
	.identity-lineage {
		grid-area: lineage;
	}
	.identity label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.identity input,
	.identity select {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	@media (max-width: 700px) {
		.identity {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-areas: 'name name' 'class subclass' 'level level' 'species background' 'size proficiency' 'alignment alignment' 'lineage lineage';
		}
	}
</style>
