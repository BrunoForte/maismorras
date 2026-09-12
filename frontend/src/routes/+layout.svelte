<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	let { children } = $props();
	let installPrompt = $state<InstallPromptEvent | null>(null);

	onMount(() => {
		const rememberInstallPrompt = (event: Event) => {
			event.preventDefault();
			installPrompt = event as InstallPromptEvent;
		};
		const clearInstallPrompt = () => (installPrompt = null);
		window.addEventListener('beforeinstallprompt', rememberInstallPrompt);
		window.addEventListener('appinstalled', clearInstallPrompt);
		if ('serviceWorker' in navigator)
			void navigator.serviceWorker
				.register('/sw.js')
				.catch((error) => console.warn('PWA indisponível:', error));
		return () => {
			window.removeEventListener('beforeinstallprompt', rememberInstallPrompt);
			window.removeEventListener('appinstalled', clearInstallPrompt);
		};
	});

	async function installApp() {
		if (!installPrompt) return;
		await installPrompt.prompt();
		const choice = await installPrompt.userChoice;
		if (choice.outcome === 'accepted') installPrompt = null;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

{#if installPrompt}
	<button class="install-app" onclick={() => void installApp()}> ⊕ Instalar MaisMorras </button>
{/if}

<style>
	.install-app {
		position: fixed;
		z-index: 50;
		right: max(1rem, env(safe-area-inset-right));
		bottom: max(1rem, env(safe-area-inset-bottom));
		border: 1px solid #d8ad67;
		border-radius: 999px;
		padding: 0.62rem 0.85rem;
		color: #2a1b0e;
		background: #f0cb85;
		box-shadow: 0 10px 28px #0008;
		font:
			700 0.76rem Inter,
			ui-sans-serif,
			system-ui,
			sans-serif;
		cursor: pointer;
	}
</style>
