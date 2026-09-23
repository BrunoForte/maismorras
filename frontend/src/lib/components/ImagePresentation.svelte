<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { Session } from '@supabase/supabase-js';
	import { getPresentation, savePresentation } from '$lib/services/presentationApi';
	import {
		connectSceneSocket,
		type RealtimeStatus,
		type SceneSocket
	} from '$lib/services/sceneRealtime';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { appLocale } from '$lib/stores/locale';
	let { sceneId, campaignId, session }: { sceneId: string; campaignId: string; session: Session } =
		$props();
	let item = $state({ assetPath: '', title: '', description: '', visible: false });
	let url = $state('');
	let presentationGeneration = 0;
	let socket: SceneSocket | null = null;
	async function dismissPresentation() {
		// Hide immediately so a transient API error cannot trap the narrator
		// behind the presentation modal.
		item = { ...item, visible: false };
		url = '';
		try {
			await savePresentation(session, sceneId, {
				assetPath: '',
				title: '',
				description: '',
				visible: false
			});
			socket?.publishPresentationUpdated();
		} catch {
			// The local dismissal stays immediate; the shared request handler reports
			// a concise error and a later refresh reconciles state with the server.
		}
	}
	async function applyPresentation(next: {
		assetPath: string;
		title: string;
		description: string;
		visible: boolean;
	}) {
		const generation = ++presentationGeneration;
		item = next;
		if (!next.visible || !next.assetPath) {
			url = '';
			return;
		}
		const signed = await getSignedAssetUrl(session, campaignId, next.assetPath);
		if (generation === presentationGeneration) url = signed ?? '';
	}
	async function applyRealtimePresentation(data?: unknown) {
		if (!data || typeof data !== 'object') {
			await load();
			return;
		}
		const payload = data as { presentation?: unknown };
		if (!payload.presentation || typeof payload.presentation !== 'object') {
			await load();
			return;
		}
		const next = payload.presentation as Partial<typeof item>;
		if (
			typeof next.assetPath !== 'string' ||
			typeof next.title !== 'string' ||
			typeof next.description !== 'string' ||
			typeof next.visible !== 'boolean'
		) {
			await load();
			return;
		}
		await applyPresentation(next as typeof item);
	}
	async function load() {
		try {
			await applyPresentation(await getPresentation(session, sceneId));
		} catch {
			/* presentation is optional */
		}
	}
	onMount(() => {
		void load();
		const onLocalPresentationChange = (event: Event) => {
			const detail = (event as CustomEvent<{ sceneId?: string }>).detail;
			if (detail?.sceneId === sceneId) socket?.publishPresentationUpdated();
		};
		window.addEventListener('maismorras:presentation-changed', onLocalPresentationChange);
		let fallbackTimer: number | undefined;
		const updateFallback = (status: RealtimeStatus) => {
			if (status === 'connected') {
				if (fallbackTimer) window.clearInterval(fallbackTimer);
				fallbackTimer = undefined;
				return;
			}
			if (!fallbackTimer) fallbackTimer = window.setInterval(() => void load(), 60_000);
		};
		socket = connectSceneSocket(
			session,
			sceneId,
			() => void load(),
			undefined,
			updateFallback,
			undefined,
			(data) => void applyRealtimePresentation(data)
		);
		return () => {
			window.removeEventListener('maismorras:presentation-changed', onLocalPresentationChange);
			socket?.close();
			if (fallbackTimer) window.clearInterval(fallbackTimer);
		};
	});
</script>

{#if item.visible && (url || item.description)}<div
		transition:fade={{ duration: 350 }}
		class="presentation-backdrop"
		onclick={(event) => {
			if (event.target === event.currentTarget) void dismissPresentation();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') void dismissPresentation();
		}}
		tabindex="0"
		role="dialog"
		aria-modal="true"
		aria-label={item.title || 'Imagem apresentada'}
	>
		<button
			class="presentation-close"
			onclick={() => void dismissPresentation()}
			aria-label={$appLocale === 'en' ? 'Dismiss image for everyone' : 'Fechar imagem para todos'}
			>×</button
		>
		<figure>
			{#if url}<img src={url} alt={item.title || 'Imagem apresentada'} />{:else}<div
					class="presentation-text"
				>
					<h2>{item.title}</h2>
					<p>{item.description}</p>
				</div>{/if}
			{#if url && item.title}<figcaption>{item.title}</figcaption>{/if}
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
	.presentation-close {
		position: fixed;
		z-index: 1;
		top: max(1rem, env(safe-area-inset-top));
		right: max(1rem, env(safe-area-inset-right));
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid #d8ad67;
		border-radius: 50%;
		color: #f4e5ca;
		background: #171417dd;
		font-size: 1.7rem;
		cursor: pointer;
	}
	.presentation-close:hover {
		color: #26190e;
		background: #e0b86f;
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
	.presentation-text {
		width: min(88vw, 900px);
		max-height: 82vh;
		overflow: auto;
		border: 1px solid rgba(240, 203, 133, 0.42);
		border-radius: 14px;
		padding: clamp(1.5rem, 5vw, 4rem);
		color: #f4e5ca;
		background: #171417;
		box-shadow: 0 20px 80px #000;
		text-align: left;
	}
	.presentation-text h2 {
		margin: 0 0 1.25rem;
		font:
			600 clamp(1.5rem, 3vw, 2.5rem) Georgia,
			serif;
	}
	.presentation-text p {
		margin: 0;
		font-size: clamp(1rem, 1.5vw, 1.3rem);
		line-height: 1.7;
		white-space: pre-wrap;
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

	@media (max-width: 600px) {
		.presentation-backdrop {
			padding: 0.5rem;
		}
		figure {
			max-width: 96vw;
			max-height: calc(100dvh - 1rem);
		}
		img {
			max-width: 96vw;
			max-height: 78vh;
			border-radius: 8px;
		}
		figcaption {
			max-width: 96vw;
			overflow: hidden;
			font-size: 0.9rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
