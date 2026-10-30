<script lang="ts">
	import type { AppLocale } from '$lib/utils/speciesRules';
	import { distanceText } from '$lib/stores/locale';

	type ProgressionFeature = { id: string; level: number; name: string; description: string };
	type Skill = readonly [string, string];

	let {
		locale,
		passivePerception,
		features,
		canDisplayCharacter,
		expandedFeature = $bindable<string | null>(null),
		expertiseChoices,
		skills,
		skillExpertise,
		onExpertiseChoice,
		onPresentFeature
	}: {
		locale: AppLocale;
		passivePerception: number;
		features: ProgressionFeature[];
		canDisplayCharacter: boolean;
		expandedFeature?: string | null;
		expertiseChoices: number;
		skills: readonly Skill[];
		skillExpertise: string[];
		onExpertiseChoice: (index: number, value: string) => void;
		onPresentFeature: (title: string, description: string) => void;
	} = $props();
</script>

<div class="passive-perception">
	<span>{locale === 'en' ? 'Passive Perception' : 'Percepção passiva'}</span><strong
		class="derived-value">{passivePerception}</strong
	>
	<small
		>{locale === 'en'
			? '10 + Wisdom + Perception proficiency'
			: '10 + Sabedoria + proficiência em Percepção'}</small
	>
</div>
{#if features.length}
	<section class="progression">
		<h3>{locale === 'en' ? 'Class progression' : 'Progressão de classe'}</h3>
		<ul>
			{#each features as feature (feature.id)}
				<li>
					<button
						class="feature-toggle"
						type="button"
						aria-expanded={expandedFeature === feature.id}
						onclick={() => (expandedFeature = expandedFeature === feature.id ? null : feature.id)}
					>
						<span>{locale === 'en' ? 'Level' : 'Nível'} {feature.level}</span><strong
							>{feature.name}</strong
						><small>{expandedFeature === feature.id ? '⌃' : '⌄'}</small>
					</button>
					{#if expandedFeature === feature.id && feature.description}
						<p class="feature-description">{distanceText(feature.description, locale)}</p>
					{/if}
					{#if expandedFeature === feature.id && canDisplayCharacter}
						<button
							class="present-feature"
							type="button"
							onclick={() =>
								onPresentFeature(
									feature.name,
									feature.description ||
										(locale === 'en' ? 'Description unavailable.' : 'Descrição não cadastrada.')
								)}
						>
							{locale === 'en' ? 'Show to table' : 'Destacar na tela'}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if expertiseChoices > 0}
			<div class="expertise-choices">
				<strong>{locale === 'en' ? 'Class expertise' : 'Especialização de classe'}</strong>
				<p>
					{locale === 'en'
						? `Choose ${expertiseChoices} skill${expertiseChoices > 1 ? 's' : ''}; they automatically gain double proficiency bonus.`
						: `Escolha ${expertiseChoices} perícia${expertiseChoices > 1 ? 's' : ''}; elas recebem o dobro do bônus de proficiência automaticamente.`}
				</p>
				<div>
					{#each [...Array(expertiseChoices).keys()] as index (index)}
						<label
							>{locale === 'en' ? `Expertise ${index + 1}` : `Especialização ${index + 1}`}<select
								value={skillExpertise[index] ?? ''}
								onchange={(event) => onExpertiseChoice(index, event.currentTarget.value)}
								><option value=""
									>{locale === 'en' ? 'Choose a skill…' : 'Escolha uma perícia…'}</option
								>{#each skills as [name] (name)}<option value={name}>{name}</option>{/each}</select
							></label
						>
					{/each}
				</div>
			</div>
		{/if}
	</section>
{/if}

<style>
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
	.present-feature {
		margin: 0.1rem 0 0.45rem 4.1rem;
		border: 1px solid #725a3b;
		border-radius: 5px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #241d1e;
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
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
		.expertise-choices > div {
			grid-template-columns: 1fr;
		}
	}
</style>
