<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		if ('serviceWorker' in navigator)
			void navigator.serviceWorker
				.register('/sw.js')
				.catch((error) => console.warn('PWA indisponível:', error));
		return () => {};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

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
</style>
