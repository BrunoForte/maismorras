<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	let requestError = $state('');
	let requestErrorTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		const onRequestError = (event: Event) => {
			const message = (event as CustomEvent<{ message?: string }>).detail?.message;
			if (!message) return;
			if (requestErrorTimer) clearTimeout(requestErrorTimer);
			requestError = message;
			requestErrorTimer = setTimeout(() => (requestError = ''), 6500);
		};
		window.addEventListener('maismorras:request-error', onRequestError);
		if ('serviceWorker' in navigator)
			void navigator.serviceWorker
				.register('/sw.js')
				.catch((error) => console.warn('PWA indisponível:', error));
		return () => {
			window.removeEventListener('maismorras:request-error', onRequestError);
			if (requestErrorTimer) clearTimeout(requestErrorTimer);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
{#if requestError}<div class="request-error-toast" role="alert" aria-live="assertive">
		<span>{requestError}</span>
		<button onclick={() => (requestError = '')} aria-label="Fechar aviso">×</button>
	</div>{/if}

<style>
	:global(*) {
		scrollbar-color: #765d3d #171316;
		scrollbar-width: thin;
	}
	:global(*::-webkit-scrollbar) {
		width: 10px;
		height: 10px;
	}
	:global(*::-webkit-scrollbar-track) {
		border: 1px solid #30272a;
		border-radius: 999px;
		background: #171316;
	}
	:global(*::-webkit-scrollbar-thumb) {
		border: 2px solid #171316;
		border-radius: 999px;
		background: #765d3d;
	}
	:global(*::-webkit-scrollbar-thumb:hover) {
		background: #d8ad67;
	}
	.request-error-toast {
		position: fixed;
		z-index: 3000;
		top: max(1rem, env(safe-area-inset-top));
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		width: min(calc(100vw - 2rem), 560px);
		padding: 0.7rem 0.8rem 0.7rem 1rem;
		transform: translateX(-50%);
		border: 1px solid #8f5049;
		border-radius: 9px;
		color: #f5e4d7;
		background: #2b1c1d;
		box-shadow: 0 12px 36px #0009;
		font:
			500 0.84rem/1.4 system-ui,
			sans-serif;
	}
	.request-error-toast span {
		flex: 1;
	}
	.request-error-toast button {
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		color: #f4d796;
		background: #211b1e;
		font-size: 1.15rem;
		cursor: pointer;
	}
</style>
