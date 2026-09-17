<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Session } from '@supabase/supabase-js';
	import { getPresentation, savePresentation } from '$lib/services/presentationApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { supabase } from '$lib/services/supabase';
	let {
		sceneId,
		session,
		isGM = false
	}: { sceneId: string; session: Session; isGM?: boolean } = $props();
	let item = $state({ assetPath: '', title: '', visible: false });
	let url = $state('');
	let dismissedPath = $state('');
	let socket: SceneSocket | null = null;
	async function closePresentation(event: Event) {
		if (!isGM || event.target !== event.currentTarget) return;
		// Hide immediately so a transient API error cannot trap the narrator
		// behind the presentation modal.
		item = { ...item, visible: false };
		dismissedPath = item.assetPath;
		url = '';
		try {
			await savePresentation(session, sceneId, { assetPath: '', title: '', visible: false });
			socket?.publishRefresh();
		} catch {
			/* Keep the current presentation if the server is temporarily unavailable. */
		}
	}
	async function load() {
		try {
			item = await getPresentation(session, sceneId);
			if (item.assetPath !== dismissedPath) dismissedPath = '';
			if (item.visible && item.assetPath === dismissedPath) {
				url = '';
				return;
			}
			if (item.visible && item.assetPath && supabase) {
				const { data } = await supabase.storage
					.from('campaign-assets')
					.createSignedUrl(item.assetPath, 3600);
				url = data?.signedUrl ?? '';
			} else url = '';
		} catch {
			/* presentation is optional */
		}
	}
	onMount(() => {
		void load();
		socket = connectSceneSocket(session, sceneId, () => void load());
		const timer = window.setInterval(() => void load(), 3000);
		return () => {
			socket?.close();
			window.clearInterval(timer);
		};
	});
</script>

{#if item.visible && url}<div
		transition:fade={{ duration: 350 }}
		class="presentation-backdrop"
		onclick={(event) => void closePresentation(event)}
		onkeydown={(event) => {
			if (event.key === 'Escape') void closePresentation(event);
		}}
		tabindex="0"
		role="dialog"
		aria-modal="true"
		aria-label={item.title || 'Imagem apresentada'}
	>
		<figure>
			<img src={url} alt={item.title || 'Imagem apresentada'} />
			<figcaption>{item.title}</figcaption>
		</figure>
	</div>{/if}

<style>
	.presentation-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, 0.82);
		animation: presentation-in 0.35s ease both;
		backdrop-filter: blur(3px);
	}
	figure {
		margin: 0;
		max-width: min(92vw, 1400px);
		max-height: 92vh;
		text-align: center;
		animation: presentation-image-in 0.35s ease both;
	}
	img {
		display: block;
		max-width: 92vw;
		max-height: 84vh;
		object-fit: contain;
		border-radius: 12px;
		box-shadow: 0 20px 80px #000;
	}
	figcaption {
		color: #f4e5ca;
		margin-top: 0.7rem;
		font-size: 1.1rem;
	}
	@keyframes presentation-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes presentation-image-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
