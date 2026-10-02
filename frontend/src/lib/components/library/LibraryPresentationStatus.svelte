<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	let {
		active,
		name,
		audience,
		overlayVisible,
		onhide
	}: {
		active: boolean;
		name: string;
		audience: string;
		overlayVisible: boolean;
		onhide: () => void;
	} = $props();
</script>

<section class="presentation-status" aria-live="polite" data-testid="presentation-status">
	{#if active}
		<div>
			<strong>{name}</strong>
			<span>{audience}</span>
			<span
				>Overlay · {overlayVisible
					? $appLocale === 'en'
						? 'visible'
						: 'visível'
					: $appLocale === 'en'
						? 'hidden'
						: 'oculta'}</span
			>
		</div>
		<button onclick={onhide}>{$appLocale === 'en' ? 'Hide media' : 'Ocultar mídia'}</button>
	{:else}
		<p>{$appLocale === 'en' ? 'No media is being presented' : 'Nenhuma mídia em exibição'}</p>
	{/if}
</section>

<style>
	.presentation-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		margin: 0 0 1rem;
		border: 1px solid #51443e;
		border-radius: 8px;
		padding: 0.65rem 0.8rem;
		color: #d8c5aa;
		background: #171417;
	}
	.presentation-status > div {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		min-width: 0;
	}
	.presentation-status strong {
		color: #f0d29d;
	}
	.presentation-status span,
	.presentation-status p {
		margin: 0;
		color: #a99c91;
		font-size: 0.75rem;
	}
	.presentation-status button {
		flex: 0 0 auto;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.7rem;
		cursor: pointer;
	}
	@media (max-width: 650px) {
		.presentation-status {
			align-items: flex-start;
		}
	}
</style>
