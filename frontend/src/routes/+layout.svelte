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
	:global(:root) {
		color-scheme: dark;
		--mm-bg: #100e11;
		--mm-surface: #171316;
		--mm-surface-raised: #211b1e;
		--mm-surface-soft: #2b2224;
		--mm-border: #403536;
		--mm-border-strong: #765d3d;
		--mm-accent: #d8ad67;
		--mm-accent-bright: #e0b86f;
		--mm-text: #f4eee4;
		--mm-text-muted: #b6a89b;
		--mm-danger: #8f5049;
		--mm-space-1: 0.25rem;
		--mm-space-2: 0.5rem;
		--mm-space-3: 0.75rem;
		--mm-space-4: 1rem;
		--mm-space-5: 1.5rem;
		--mm-space-6: 2rem;
		--mm-content-gutter: clamp(1rem, 2.5vw, 2rem);
		--mm-radius-control: 7px;
		--mm-radius-card: 10px;
		--mm-radius-dialog: 14px;
		--mm-shadow-panel: 0 18px 48px #0008;
		--mm-shadow-dialog: 0 30px 90px #000;
	}
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		color: var(--mm-text);
		background: var(--mm-bg);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}
	:global(button),
	:global(input),
	:global(select),
	:global(textarea) {
		font: inherit;
	}
	:global(button) {
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			color 140ms ease,
			box-shadow 140ms ease;
	}
	:global(button:disabled) {
		cursor: not-allowed;
	}
	:global(
		input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='color']):not(
				[type='file']
			)
	),
	:global(select),
	:global(textarea) {
		border-radius: var(--mm-radius-control);
	}
	:global(input),
	:global(select),
	:global(textarea) {
		accent-color: var(--mm-accent);
	}
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
	:global(button:focus-visible),
	:global(input:focus-visible),
	:global(select:focus-visible),
	:global(textarea:focus-visible),
	:global([role='button']:focus-visible) {
		outline: 2px solid var(--mm-accent);
		outline-offset: 2px;
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
	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
</style>
