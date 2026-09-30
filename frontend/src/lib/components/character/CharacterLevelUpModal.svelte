<script lang="ts">
	import type { AppLocale } from '$lib/utils/speciesRules';
	import { createLevelUpChoiceActions, type LevelUpHPChoice } from './levelUpChoiceActions';

	let {
		locale,
		level,
		onChoose
	}: {
		locale: AppLocale;
		level: number;
		onChoose: (choice: LevelUpHPChoice) => void;
	} = $props();
	const actions = $derived(createLevelUpChoiceActions(onChoose));
</script>

<div class="level-modal" role="presentation">
	<div role="dialog" aria-modal="true" aria-labelledby="level-up-title" tabindex="-1">
		<h3 id="level-up-title">
			{locale === 'en' ? `Level ${level}` : `Subida para o nível ${level}`}
		</h3>
		<p>
			{locale === 'en'
				? 'How should HP gained at these levels be adjusted?'
				: 'Como deseja ajustar os PV dos níveis ganhos?'}
		</p>
		<div>
			<button onclick={actions.max}
				>{locale === 'en' ? 'Use maximum value' : 'Usar valor máximo'}</button
			>
			<button onclick={actions.roll}
				>{locale === 'en' ? 'Roll hit dice' : 'Rolar dados de vida'}</button
			>
			<button onclick={actions.keep}
				>{locale === 'en' ? 'Keep current HP' : 'Manter PV atuais'}</button
			>
		</div>
	</div>
</div>

<style>
	.level-modal {
		position: fixed;
		z-index: 40;
		inset: 0;
		display: grid;
		place-items: center;
		background: #080608c9;
	}
	.level-modal [role='dialog'] {
		width: min(92vw, 380px);
		border: 1px solid #765d3d;
		border-radius: 12px;
		padding: 1.2rem;
		color: #eee4d6;
		background: #1b171a;
	}
	.level-modal h3 {
		margin: 0;
	}
	.level-modal p {
		color: #b9aa9d;
	}
	.level-modal div {
		display: grid;
		gap: 0.5rem;
	}
	.level-modal button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.6rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
</style>
