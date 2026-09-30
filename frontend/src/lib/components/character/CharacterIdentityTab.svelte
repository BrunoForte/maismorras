<script lang="ts">
	import type { CharacterSheet as Sheet } from '$lib/services/characterApi';
	import type { CompendiumEntry } from '$lib/services/compendiumApi';
	import { appLocale, distance, distanceText } from '$lib/stores/locale';
	import {
		displayedSpeed,
		getActiveSpeciesTraits,
		getSpeciesProfile,
		getSpeciesSpeed,
		speciesProfileLabel,
		speciesTraitDescription,
		storedSpeedFromDisplay,
		updateSpeciesSelection
	} from '$lib/utils/speciesRules';
	import CharacterAbilityScores from './CharacterAbilityScores.svelte';
	import CharacterSavingThrows from './CharacterSavingThrows.svelte';

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
		expandedFeature = $bindable<string | null>(null),
		expertiseChoices,
		skills,
		onExpertiseChoice
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
		expandedFeature?: string | null;
		expertiseChoices: number;
		skills: readonly Skill[];
		onExpertiseChoice: (index: number, value: string) => void;
	} = $props();

	const speciesProfile = () => getSpeciesProfile(sheet.species);
	const lineageOptions = () => Object.keys(speciesProfile()?.lineages ?? {});
	const activeSpeciesTraits = () => getActiveSpeciesTraits(sheet.species, sheet.speciesLineage);
	const profileSpeed = () => getSpeciesSpeed(sheet.species, sheet.speciesLineage, sheet.speed);
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

<section
	class="portrait-editor"
	aria-label={$appLocale === 'en' ? 'Character portrait' : 'Retrato do personagem'}
>
	<div class="portrait-preview">
		{#if portraitPreview}<img
				src={portraitPreview}
				alt={`Retrato de ${sheet.name || 'personagem'}`}
			/>{:else}<span>◈</span>{/if}
	</div>
	<div>
		<h3>{$appLocale === 'en' ? 'Portrait and token' : 'Retrato e token'}</h3>
		<p>
			{$appLocale === 'en'
				? 'Use your own image or create an AI portrait. Saving the sheet updates the linked token image.'
				: 'Use uma imagem própria ou crie um retrato por IA. Ao salvar a ficha, o token vinculado recebe a nova imagem.'}
		</p>
		<label class="portrait-upload">
			{portraitBusy
				? $appLocale === 'en'
					? 'Processing…'
					: 'Processando…'
				: $appLocale === 'en'
					? 'Upload image'
					: 'Enviar imagem'}
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				onchange={(event) => uploadPortrait(event)}
				disabled={portraitBusy}
			/>
		</label>
		<div class="portrait-ai">
			<input
				bind:value={portraitPrompt}
				maxlength="600"
				placeholder={$appLocale === 'en'
					? 'E.g. drow sorceress, white hair, violet eyes'
					: 'Ex.: elfa drow feiticeira, cabelos brancos, olhos violeta'}
			/>
			<button
				type="button"
				onclick={() => void generatePortrait()}
				disabled={portraitBusy || portraitPrompt.trim().length < 3}
			>
				{portraitBusy
					? $appLocale === 'en'
						? 'Generating…'
						: 'Gerando…'
					: $appLocale === 'en'
						? 'Generate with AI'
						: 'Gerar com IA'}
			</button>
		</div>
		<small
			>{$appLocale === 'en'
				? 'JPG, PNG, or WebP up to 5 MB. The portrait is private in storage and visible only to campaign members.'
				: 'JPG, PNG ou WebP de até 5 MB. O retrato é privado no armazenamento e exibido somente para membros da campanha.'}</small
		>
	</div>
</section>

<section class="identity">
	<label class="identity-name"
		>{$appLocale === 'en' ? 'Name' : 'Nome'}<input
			bind:value={sheet.name}
			maxlength="120"
			placeholder={$appLocale === 'en' ? 'Character name' : 'Nome do personagem'}
		/></label
	>
	<label class="identity-class"
		>{$appLocale === 'en' ? 'Class' : 'Classe'}<input
			bind:value={sheet.class}
			onchange={onClassChanged}
			list="class-options"
			placeholder={$appLocale === 'en' ? 'E.g. Fighter' : 'Ex.: Guerreiro'}
		/></label
	>
	{#if subclassOptions.length}
		<label class="identity-subclass"
			>{$appLocale === 'en' ? 'Subclass' : 'Subclasse'}<select
				bind:value={sheet.subclass}
				onchange={onSubclassChanged}
				><option value=""
					>{$appLocale === 'en' ? 'Choose at level 3…' : 'Escolha no nível 3…'}</option
				>{#each subclassOptions as subclass (subclass)}<option value={subclass}>{subclass}</option
					>{/each}</select
			></label
		>
	{/if}
	<label class="identity-level"
		>{$appLocale === 'en' ? 'Level' : 'Nível'}<input
			type="number"
			min="1"
			max="20"
			bind:value={sheet.level}
			onchange={onLevelChanged}
		/></label
	>
	<label class="identity-species"
		>{$appLocale === 'en' ? 'Species' : 'Espécie'}<input
			bind:value={sheet.species}
			onchange={handleSpeciesChange}
			list="species-options"
			placeholder={$appLocale === 'en' ? 'E.g. Human' : 'Ex.: Humano'}
		/></label
	>
	<label class="identity-background"
		>{$appLocale === 'en' ? 'Background' : 'Antecedente'}<input
			bind:value={sheet.background}
			list="background-options"
		/></label
	>
	{#if lineageOptions().length}
		<label class="identity-lineage"
			>{$appLocale === 'en' ? 'Lineage / legacy' : 'Linhagem / legado'}<select
				value={sheet.speciesLineage ?? ''}
				onchange={(event) => handleLineageChange(event.currentTarget.value)}
				><option value="">{$appLocale === 'en' ? 'Choose an option…' : 'Escolha uma opção…'}</option
				>{#each lineageOptions() as lineage (lineage)}<option value={lineage}>{lineage}</option
					>{/each}</select
			></label
		>
	{/if}
	<label class="identity-alignment"
		>{$appLocale === 'en' ? 'Alignment' : 'Alinhamento'}<input
			bind:value={sheet.alignment}
		/></label
	>
	<label class="identity-proficiency"
		>{$appLocale === 'en' ? 'Proficiency bonus' : 'Bônus de proficiência'}<input
			type="number"
			min="0"
			max="20"
			bind:value={sheet.proficiencyBonus}
		/></label
	>
	<datalist id="class-options"
		>{#each optionsFor('class') as entry (entry.id)}<option value={optionLabel(entry)}
				>{entry.summary}</option
			>{/each}</datalist
	>
	<datalist id="species-options"
		>{#each optionsFor('species') as entry (entry.id)}<option value={optionLabel(entry)}
				>{entry.summary}</option
			>{/each}</datalist
	>
	<datalist id="background-options"
		>{#each optionsFor('background') as entry (entry.id)}<option value={optionLabel(entry)}
				>{entry.summary}</option
			>{/each}</datalist
	>
</section>

<section class="profile-combat-fields">
	<h3>{$appLocale === 'en' ? 'Combat profile' : 'Perfil de combate'}</h3>
	<label
		>{$appLocale === 'en' ? 'Speed' : 'Deslocamento'}<input
			type="number"
			min="0"
			value={shownSpeed()}
			onchange={(event) => handleSpeedChange(event.currentTarget.value)}
		/></label
	>
	<label class="hit-dice-label"
		><span
			>{$appLocale === 'en' ? 'Hit dice' : 'Dados de vida'}<small
				>{sheet.level - sheet.hitDiceSpent}/{sheet.level}</small
			></span
		><input bind:value={sheet.hitDice} /></label
	>
	<label
		>{$appLocale === 'en' ? 'Initiative bonus' : 'Bônus de iniciativa'}<input
			type="number"
			min="-20"
			max="20"
			bind:value={sheet.initiative}
			oninput={onSyncToken}
		/></label
	>
	<div class="initiative-actions">
		<button
			type="button"
			class="initiative-roll"
			onclick={() => void onRollInitiative()}
			disabled={!initiativeTokenId}
			>{$appLocale === 'en' ? 'Roll initiative' : 'Rolar iniciativa'}</button
		>
		<label
			class="initiative-advantage-toggle"
			title={$appLocale === 'en'
				? 'Advantage on the next initiative roll'
				: 'Aplica vantagem à próxima rolagem de iniciativa'}
		>
			<input
				type="checkbox"
				class="switch-input"
				checked={sheet.initiativeAdvantage ?? false}
				onchange={(event) => void onSetInitiativeAdvantage(event.currentTarget.checked)}
			/>
			<span class="switch-track" aria-hidden="true"></span>{$appLocale === 'en'
				? 'Advantage'
				: 'Vantagem'}
		</label>
	</div>
</section>

{#if speciesProfile()}
	<section
		class="species-traits"
		aria-label={$appLocale === 'en' ? 'Applied species traits' : 'Traços de espécie aplicados'}
	>
		<div>
			<h3>
				{speciesProfileLabel(speciesProfile()!, $appLocale)}{sheet.speciesLineage
					? ` · ${sheet.speciesLineage}`
					: ''}
			</h3>
			<span
				>{$appLocale === 'en' ? 'Applied base speed' : 'Deslocamento base aplicado'}: {distance(
					profileSpeed(),
					$appLocale
				)}</span
			>
		</div>
		<div class="species-trait-list">
			{#each activeSpeciesTraits() as trait (trait)}<details class="species-trait">
					<summary>{distanceText(trait, $appLocale)}</summary>
					<p>{speciesTraitDescription(trait, $appLocale)}</p>
				</details>{/each}
		</div>
		<small
			>{$appLocale === 'en'
				? 'These traits are calculated from the selected species and lineage. HP, spells, and uses appear here for the table; complete current combat values and add the desired spells to the sheet.'
				: 'Estes traços são calculados pela espécie e linhagem selecionadas. Ajustes de PV, magias e usos são exibidos aqui para a mesa; preencha os valores atuais de combate e inclua as magias desejadas na ficha.'}</small
		>
	</section>
{/if}

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
<div class="passive-perception">
	<span>{$appLocale === 'en' ? 'Passive Perception' : 'Percepção passiva'}</span><strong
		class="derived-value">{passivePerception}</strong
	>
	<small
		>{$appLocale === 'en'
			? '10 + Wisdom + Perception proficiency'
			: '10 + Sabedoria + proficiência em Percepção'}</small
	>
</div>
{#if derivedFeatures.length}
	<section class="progression">
		<h3>{$appLocale === 'en' ? 'Class progression' : 'Progressão de classe'}</h3>
		<ul>
			{#each derivedFeatures as feature (feature.id)}<li>
					<button
						class="feature-toggle"
						type="button"
						aria-expanded={expandedFeature === feature.id}
						onclick={() => (expandedFeature = expandedFeature === feature.id ? null : feature.id)}
					>
						<span>{$appLocale === 'en' ? 'Level' : 'Nível'} {feature.level}</span><strong
							>{feature.name}</strong
						><small>{expandedFeature === feature.id ? '⌃' : '⌄'}</small>
					</button>
					{#if expandedFeature === feature.id && feature.description}<p class="feature-description">
							{feature.description}
						</p>{/if}
				</li>{/each}
		</ul>
		{#if expertiseChoices > 0}
			<div class="expertise-choices">
				<strong>{$appLocale === 'en' ? 'Class expertise' : 'Especialização de classe'}</strong>
				<p>
					{$appLocale === 'en'
						? `Choose ${expertiseChoices} skill${expertiseChoices > 1 ? 's' : ''}; they automatically gain double proficiency bonus.`
						: `Escolha ${expertiseChoices} perícia${expertiseChoices > 1 ? 's' : ''}; elas recebem o dobro do bônus de proficiência automaticamente.`}
				</p>
				<div>
					{#each [...Array(expertiseChoices).keys()] as index (index)}<label
							>{$appLocale === 'en'
								? `Expertise ${index + 1}`
								: `Especialização ${index + 1}`}<select
								value={sheet.skillExpertise[index] ?? ''}
								onchange={(event) => onExpertiseChoice(index, event.currentTarget.value)}
								><option value=""
									>{$appLocale === 'en' ? 'Choose a skill…' : 'Escolha uma perícia…'}</option
								>{#each skills as [name] (name)}<option value={name}>{name}</option>{/each}</select
							></label
						>{/each}
				</div>
			</div>
		{/if}
	</section>
{/if}

<style>
	.portrait-editor {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.85rem;
		align-items: start;
		border: 1px solid #493c39;
		border-radius: 10px;
		padding: 0.8rem;
		background: #211b1e;
	}
	.portrait-preview {
		display: grid;
		place-items: center;
		width: 92px;
		height: 92px;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 50%;
		color: #e0b86f;
		background: #171216;
		font-size: 2rem;
	}
	.portrait-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.portrait-editor h3 {
		margin: 0 0 0.3rem;
		color: #f0d29d;
		font:
			600 1rem Georgia,
			serif;
	}
	.portrait-editor p,
	.portrait-editor small {
		margin: 0;
		color: #aa9d91;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.portrait-upload {
		display: inline-flex;
		margin: 0.55rem 0.4rem 0.55rem 0;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-upload input {
		display: none;
	}
	.portrait-ai {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
	}
	.portrait-ai input {
		min-width: 0;
		flex: 1;
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.42rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
		font-size: 0.68rem;
	}
	.portrait-ai button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #291b10;
		background: #e0b86f;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-ai button:disabled,
	.portrait-upload:has(input:disabled) {
		opacity: 0.6;
		cursor: wait;
	}
	.identity,
	.profile-combat-fields {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.identity {
		grid-template-areas: 'name class subclass level' 'species background alignment proficiency' 'lineage lineage lineage lineage';
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
	.identity-alignment {
		grid-area: alignment;
	}
	.identity-proficiency {
		grid-area: proficiency;
	}
	.identity-lineage {
		grid-area: lineage;
	}
	.identity label,
	.profile-combat-fields label {
		display: grid;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.identity input,
	.identity select,
	.profile-combat-fields input {
		width: 100%;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.profile-combat-fields h3 {
		grid-column: 1 / -1;
		margin: 0;
		color: #e7c98c;
		font-size: 1rem;
	}
	.initiative-actions {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hit-dice-label > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.hit-dice-label small {
		color: #d8ad67;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.initiative-roll {
		min-height: 2.35rem;
		border: 1px solid #8c6d43;
		border-radius: 7px;
		padding: 0.45rem 0.7rem;
		color: #f5e4c0;
		background: linear-gradient(180deg, #423126, #2b211c);
		font: 650 0.75rem inherit;
		white-space: nowrap;
		cursor: pointer;
	}
	.initiative-roll:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #493020;
	}
	.initiative-roll:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.initiative-advantage-toggle {
		display: flex !important;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem !important;
		cursor: pointer;
	}
	.switch-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.switch-track {
		position: relative;
		flex: 0 0 auto;
		width: 2.25rem;
		height: 1.25rem;
		border: 1px solid #80603b;
		border-radius: 999px;
		background: #30282a;
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}
	.switch-track::after {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 50%;
		background: #c6b8ac;
		content: '';
		transition:
			transform 140ms ease,
			background 140ms ease;
	}
	.switch-input:checked + .switch-track {
		border-color: #c89655;
		background: #684829;
	}
	.switch-input:checked + .switch-track::after {
		transform: translateX(1rem);
		background: #ffe0a5;
	}
	.switch-input:focus-visible + .switch-track {
		outline: 2px solid #f2d49a;
		outline-offset: 2px;
	}
	.species-traits {
		display: grid;
		gap: 0.55rem;
		border: 1px solid rgba(101, 130, 158, 0.5);
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		background: rgba(33, 54, 74, 0.32);
	}
	.species-traits > div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.species-traits h3 {
		margin: 0;
		color: #b9d7ee;
	}
	.species-traits span,
	.species-traits small {
		color: #a7bac9;
		font-size: 0.72rem;
		line-height: 1.4;
	}
	.species-trait-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
		gap: 0.45rem;
	}
	.species-trait {
		border: 1px solid rgba(124, 161, 189, 0.35);
		border-radius: 7px;
		color: #d5e4ed;
		font-size: 0.7rem;
	}
	.species-trait summary {
		padding: 0.45rem 0.55rem;
		cursor: pointer;
	}
	.species-trait[open] summary {
		color: #f1d59e;
	}
	.species-trait p {
		margin: 0;
		padding: 0 0.55rem 0.55rem;
		color: #b9c8d3;
		font-size: 0.68rem;
		line-height: 1.5;
	}
	.derived-value {
		display: block;
		color: #f0d29d;
		font-size: 1.1rem;
	}
	.passive-perception {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgba(116, 151, 179, 0.48);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
		color: #c9dced;
		background: rgba(33, 54, 74, 0.28);
		font-size: 0.74rem;
	}
	.passive-perception small {
		color: #9eb3c6;
		font-size: 0.65rem;
	}
	.progression {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #494045;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.progression h3 {
		margin: 0 0 0.1rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	.progression ul {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.progression li {
		color: #d7c9ba;
		font-size: 0.78rem;
	}
	.progression li span {
		display: inline-block;
		width: 4.1rem;
		color: #d8ad67;
		font-size: 0.68rem;
	}
	.feature-toggle {
		display: grid;
		grid-template-columns: 4.1rem 1fr auto;
		align-items: center;
		width: 100%;
		gap: 0.35rem;
		border: 0;
		padding: 0.25rem 0;
		color: inherit;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.feature-toggle strong {
		font-weight: 600;
	}
	.feature-toggle small {
		color: #d8ad67;
	}
	.feature-description {
		margin: 0.15rem 0 0.45rem 4.1rem;
		color: #bcae9e;
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.expertise-choices {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.65rem;
		border-top: 1px solid #493c39;
		padding-top: 0.65rem;
	}
	.expertise-choices > strong {
		color: #f0cb85;
		font-size: 0.8rem;
	}
	.expertise-choices p {
		margin: 0;
		color: #a99c91;
		font-size: 0.7rem;
		line-height: 1.4;
	}
	.expertise-choices > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.expertise-choices label {
		font-size: 0.63rem;
	}
	@media (max-width: 700px) {
		.identity,
		.profile-combat-fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.identity {
			grid-template-areas: 'name name' 'class subclass' 'level level' 'species background' 'alignment proficiency' 'lineage lineage';
		}
		.expertise-choices > div {
			grid-template-columns: 1fr;
		}
		.initiative-actions {
			grid-column: 1 / -1;
			align-items: center;
		}
		.initiative-roll {
			width: auto;
		}
		.species-traits > div {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
	}
</style>
