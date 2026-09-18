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
</style>
