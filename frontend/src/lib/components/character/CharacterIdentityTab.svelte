<script lang="ts">
	import type { CharacterSheet as Sheet } from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import { appLocale, distance } from '$lib/stores/locale';
	import {
		displayedSpeed,
		getSpeciesProfile,
		getSpeciesSpeed,
		getSpeciesLineageOptions,
		speciesProfileLabel,
		normalizeSpecies,
		speciesTraitsForDisplay,
		storedSpeedFromDisplay,
		updateSpeciesSelection
	} from '$lib/utils/speciesRules';
	import CharacterAbilityScores from './CharacterAbilityScores.svelte';
	import CharacterClassProgression from './CharacterClassProgression.svelte';
	import CharacterCombatProfile from './CharacterCombatProfile.svelte';
	import CharacterIdentityFields from './CharacterIdentityFields.svelte';
	import CharacterPortraitPanel from './CharacterPortraitPanel.svelte';
	import CharacterSavingThrows from './CharacterSavingThrows.svelte';
	import CharacterSpeciesTraits from './CharacterSpeciesTraits.svelte';

	type AbilityKey = keyof Sheet['abilityScores'];
	type Attribute = { key: AbilityKey; label: string };
	type Skill = readonly [string, AbilityKey];
	type ProgressionFeature = { id: string; level: number; name: string; description: string };
	type RollMode = 'normal' | 'advantage' | 'disadvantage';

	let {
		sheet = $bindable(),
		portraitPreview,
		portraitBusy,
		portraitPrompt = $bindable(''),
		uploadPortrait,
		generatePortrait,
		optionsFor,
		optionLabel,
		subclassOptions,
		onClassChanged,
		onSubclassChanged,
		onLevelChanged,
		onSpeciesChanged,
		onLineageChanged,
		initiativeTokenId,
		onRollInitiative,
		onSetInitiativeAdvantage,
		onSyncToken,
		attributes,
		abilityLabel,
		modifier,
		onScoreChange,
		saveBonus,
		onToggleSavingThrow,
		onRollSave,
		hasAttackDisadvantage,
		rollMode = $bindable<RollMode>('normal'),
		passivePerception,
		derivedFeatures,
		canDisplayCharacter,
		expandedFeature = $bindable<string | null>(null),
		expertiseChoices,
		skills,
		onExpertiseChoice,
		onPresentFeature
	}: {
		sheet: Sheet;
		portraitPreview: string | null;
		portraitBusy: boolean;
		portraitPrompt?: string;
		uploadPortrait: (event: Event) => void;
		generatePortrait: () => void | Promise<void>;
		optionsFor: (entryType: string) => CompendiumEntry[];
		optionLabel: (entry: CompendiumEntry) => string;
		subclassOptions: string[];
		onClassChanged: () => void;
		onSubclassChanged: () => void;
		onLevelChanged: () => void;
		onSpeciesChanged: () => void;
		onLineageChanged: () => void;
		initiativeTokenId: string | null;
		onRollInitiative: () => void | Promise<void>;
		onSetInitiativeAdvantage: (enabled: boolean) => void | Promise<void>;
		onSyncToken: () => void;
		attributes: Attribute[];
		abilityLabel: (key: AbilityKey) => string;
		modifier: (score: number) => number;
		onScoreChange: (key: AbilityKey, value: string) => void;
		saveBonus: (key: AbilityKey) => number;
		onToggleSavingThrow: (key: AbilityKey) => void;
		onRollSave: (key: AbilityKey, label: string) => Promise<void>;
		hasAttackDisadvantage: () => boolean;
		rollMode?: RollMode;
		passivePerception: number;
		derivedFeatures: ProgressionFeature[];
		canDisplayCharacter: boolean;
		expandedFeature?: string | null;
		expertiseChoices: number;
		skills: readonly Skill[];
		onExpertiseChoice: (index: number, value: string) => void;
		onPresentFeature: (title: string, description: string) => void;
	} = $props();

	const speciesProfile = () => getSpeciesProfile(sheet.species);
	const catalogSpecies = () =>
		optionsFor('species').find((entry) => {
			const rules = (entry.rules ?? {}) as Record<string, unknown>;
			return [rules.id, entry.name, entry.translations?.['pt-BR']].some(
				(value) => normalizeSpecies(value) === normalizeSpecies(sheet.species)
			);
		});
	const lineageOptions = () => getSpeciesLineageOptions(sheet.species);
	const profileSpeed = () => getSpeciesSpeed(sheet.species, sheet.speciesLineage, sheet.speed);
	const activeSpeciesTraits = () => {
		return speciesTraitsForDisplay(
			sheet.species,
			sheet.speciesLineage,
			catalogSpecies(),
			$appLocale
		);
	};
	const shownSpeed = () => displayedSpeed(sheet.speed, $appLocale);

	function applySpeciesSelection(species: string, lineage = sheet.speciesLineage ?? '') {
		const next = updateSpeciesSelection(sheet, species, lineage);
		sheet.species = next.species;
		sheet.speciesLineage = next.speciesLineage ?? '';
	}

	function handleSpeciesChange() {
		applySpeciesSelection(sheet.species);
		onSpeciesChanged();
	}

	function handleLineageChange(value: string) {
		applySpeciesSelection(sheet.species, value);
		onLineageChanged();
	}

	function handleSpeedChange(value: string) {
		const speed = storedSpeedFromDisplay(value, $appLocale);
		if (speed !== null) sheet.speed = speed;
	}
</script>

<CharacterPortraitPanel
	locale={$appLocale}
	characterName={sheet.name}
	{portraitPreview}
	{portraitBusy}
	bind:portraitPrompt
	{uploadPortrait}
	{generatePortrait}
/>
<CharacterIdentityFields
	locale={$appLocale}
	bind:sheet
	{optionsFor}
	{optionLabel}
	{subclassOptions}
	lineageOptions={lineageOptions()}
	{onClassChanged}
	{onSubclassChanged}
	{onLevelChanged}
	onSpeciesChanged={handleSpeciesChange}
	onLineageChanged={handleLineageChange}
/>
<CharacterCombatProfile
	locale={$appLocale}
	bind:sheet
	shownSpeed={shownSpeed()}
	{initiativeTokenId}
	onSpeedChange={handleSpeedChange}
	{onRollInitiative}
	{onSetInitiativeAdvantage}
	{onSyncToken}
/>
<CharacterSpeciesTraits
	locale={$appLocale}
	speciesName={speciesProfile() ? speciesProfileLabel(speciesProfile()!, $appLocale) : null}
	lineage={sheet.speciesLineage}
	baseSpeedLabel={distance(profileSpeed(), $appLocale)}
	traits={activeSpeciesTraits()}
/>
<CharacterAbilityScores {sheet} {attributes} {abilityLabel} {modifier} {onScoreChange} />
<CharacterSavingThrows
	{sheet}
	{attributes}
	{abilityLabel}
	{saveBonus}
	toggleSavingThrow={onToggleSavingThrow}
	rollSave={onRollSave}
	{hasAttackDisadvantage}
	bind:rollMode
/>
<CharacterClassProgression
	locale={$appLocale}
	{passivePerception}
	features={derivedFeatures}
	{canDisplayCharacter}
	bind:expandedFeature
	{expertiseChoices}
	{skills}
	skillExpertise={sheet.skillExpertise}
	{onExpertiseChoice}
	{onPresentFeature}
/>
