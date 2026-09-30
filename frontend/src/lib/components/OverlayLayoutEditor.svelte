<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { request } from '$lib/services/httpClient';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import OverlayProfileBar from '$lib/components/overlay/OverlayProfileBar.svelte';
	import OverlayLayoutCanvas from '$lib/components/overlay/OverlayLayoutCanvas.svelte';
	import OverlayBlockInspector from '$lib/components/overlay/OverlayBlockInspector.svelte';
	import OverlayBackgroundControl from '$lib/components/overlay/OverlayBackgroundControl.svelte';
	import {
		createDefaultOverlayDocument,
		createDefaultOverlayLayout,
		createOverlayProfile,
		deleteOverlayProfile,
		moveOverlayBlock,
		normalizeOverlayDocument,
		normalizeOverlayLayout,
		renameOverlayProfile,
		resizeOverlayBlock,
		selectOverlayProfile,
		snapOverlayPosition,
		updateOverlayBlockProperty,
		type OverlayBlockProperty,
		type OverlayLayout,
		type OverlayLayoutDocument
	} from '$lib/utils/overlay/overlayLayoutRules';

	let {
		campaignId,
		sceneId,
		session
	}: { campaignId: string; sceneId: string; session: Session | null } = $props();
	let layout = $state<OverlayLayout>(createDefaultOverlayLayout());
	let profiles = $state<Record<string, OverlayLayout>>({ Principal: createDefaultOverlayLayout() });
	let activeProfile = $state('Principal');
	let snapToGrid = $state(true);
	let selectedId = $state('map');
	let status = $state('');
	let saving = $state(false);
	let backgroundPreview = $state('');
	let layoutSocket: SceneSocket | null = null;
	const key = () => `maismorras:overlay-layout:${campaignId}:${sceneId}`;
	const selectedBlock = $derived(layout.blocks.find((block) => block.id === selectedId));
	const currentDocument = (): OverlayLayoutDocument => ({
		activeProfile,
		profiles: { ...profiles, [activeProfile]: layout }
	});

	function applyDocument(value: unknown) {
		const document = normalizeOverlayDocument(value);
		profiles = document.profiles;
		activeProfile = document.activeProfile;
		layout = profiles[activeProfile] ?? createDefaultOverlayLayout();
	}
	function selectProfile(name: string) {
		const result = selectOverlayProfile(currentDocument(), layout, name);
		profiles = result.document.profiles;
		activeProfile = result.document.activeProfile;
		layout = result.layout;
	}
	function createProfile() {
		const name = window
			.prompt('Nome do novo layout', `Layout ${Object.keys(profiles).length + 1}`)
			?.trim();
		if (!name) return;
		const result = createOverlayProfile(currentDocument(), layout, name);
		if (!result) return;
		profiles = result.document.profiles;
		activeProfile = result.document.activeProfile;
		layout = result.layout;
	}
	function renameProfile() {
		const name = window.prompt('Novo nome do layout', activeProfile)?.trim();
		if (!name) return;
		const document = renameOverlayProfile(currentDocument(), name);
		if (!document) return;
		profiles = document.profiles;
		activeProfile = document.activeProfile;
	}
	function deleteProfile() {
		if (
			Object.keys(profiles).length <= 1 ||
			!window.confirm(`Excluir o layout “${activeProfile}”?`)
		)
			return;
		const document = deleteOverlayProfile(currentDocument());
		if (!document) return;
		profiles = document.profiles;
		activeProfile = document.activeProfile;
		layout = profiles[activeProfile];
	}

	onMount(() => {
		if (!campaignId || !sceneId || typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem(key());
			applyDocument(saved ? JSON.parse(saved) : {});
			void resolveBackground(layout.background);
			void loadRemote();
			if (session)
				layoutSocket = connectSceneSocket(
					session,
					sceneId,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					(data) => void applyRealtimeLayout(data)
				);
		} catch {
			applyDocument(createDefaultOverlayDocument());
		}
		return () => layoutSocket?.close();
	});

	async function loadRemote() {
		if (!session?.access_token) return;
		try {
			const body = await request<{ layout?: Record<string, unknown> }>(
				session,
				`/api/v1/scenes/${sceneId}/overlay-layout`
			);
			if (body.layout && Object.keys(body.layout).length) {
				applyDocument(body.layout);
				void resolveBackground(layout.background);
				localStorage.setItem(key(), JSON.stringify(currentDocument()));
			}
		} catch {
			/* local layout remains available offline */
		}
	}
	async function applyRealtimeLayout(value?: unknown) {
		if (!value || typeof value !== 'object' || !('document' in value)) {
			await loadRemote();
			return;
		}
		const document = (value as { document?: unknown }).document;
		if (!document || typeof document !== 'object') {
			await loadRemote();
			return;
		}
		applyDocument(document);
		await resolveBackground(layout.background);
		localStorage.setItem(key(), JSON.stringify(currentDocument()));
	}
	async function resolveBackground(path: string) {
		if (!path) {
			backgroundPreview = '';
			return;
		}
		if (path.startsWith('data:') || path.startsWith('http')) {
			backgroundPreview = path;
			return;
		}
		if (!session) return;
		backgroundPreview = (await getSignedAssetUrl(session, campaignId, path)) ?? '';
	}

	function dragStart(event: DragEvent, id: string) {
		event.dataTransfer?.setData('text/plain', id);
	}
	function dropPosition(id: string | undefined, x: number, y: number) {
		const snapped = snapOverlayPosition(layout, id, x, y, snapToGrid);
		layout = moveOverlayBlock(layout, id, snapped.x, snapped.y);
		selectedId = id ?? selectedId;
	}
	function resizeStart(event: PointerEvent, id: string) {
		event.preventDefault();
		event.stopPropagation();
		const item = layout.blocks.find((block) => block.id === id);
		const workspace = (event.target as HTMLElement | null)?.closest(
			'.workspace'
		) as HTMLElement | null;
		if (!item || item.locked || !workspace) return;
		const rect = workspace.getBoundingClientRect();
		const move = (moveEvent: PointerEvent) => {
			layout = resizeOverlayBlock(
				layout,
				id,
				((moveEvent.clientX - rect.left) / rect.width) * 100,
				((moveEvent.clientY - rect.top) / rect.height) * 100
			);
		};
		const stop = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop, { once: true });
	}
	function updateBlock(id: string, property: OverlayBlockProperty, value: string | boolean) {
		layout = updateOverlayBlockProperty(layout, id, property, value);
	}

	async function save() {
		if (saving) return;
		saving = true;
		profiles = { ...profiles, [activeProfile]: normalizeOverlayLayout(layout) };
		const document: OverlayLayoutDocument = { activeProfile, profiles };
		localStorage.setItem(key(), JSON.stringify(document));
		try {
			if (session?.access_token)
				await request(
					session,
					`/api/v1/scenes/${sceneId}/overlay-layout`,
					{ method: 'PUT', body: JSON.stringify(document) },
					'Não foi possível salvar a overlay no servidor.'
				);
			if ('BroadcastChannel' in window) {
				const channel = new BroadcastChannel(`maismorras:overlay:${campaignId}`);
				channel.postMessage({ type: 'layout-change', sceneId });
				channel.close();
			}
			layoutSocket?.publishLayoutUpdated({ document });
			status = 'Layout da overlay salvo para esta cena.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Não foi possível salvar a overlay.';
		} finally {
			saving = false;
		}
	}
	async function reset() {
		layout = createDefaultOverlayLayout();
		profiles = { Principal: layout };
		activeProfile = 'Principal';
		await save();
		status = 'Layout restaurado e salvo para a overlay.';
	}
	async function upload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !file.type.startsWith('image/')) {
			status = 'Escolha uma imagem.';
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			status = 'O fundo deve ter no máximo 8 MB.';
			return;
		}
		const supabase = await getSupabaseClient();
		if (supabase && session?.user.id) {
			status = 'Enviando fundo…';
			const optimized = await optimizeImage(file);
			const path = `campaigns/${campaignId}/overlays/${sceneId}/${crypto.randomUUID()}.webp`;
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(path, optimized.file, {
					contentType: 'image/webp',
					cacheControl: '3600',
					upsert: false
				});
			if (error) {
				status = 'Não foi possível enviar o fundo.';
				return;
			}
			layout.background = path;
			backgroundPreview = URL.createObjectURL(optimized.file);
			status = 'Fundo enviado. Salve para aplicar.';
			return;
		}
		status = 'Faça login para enviar o fundo da overlay.';
	}
	function useTransparentBackground() {
		layout.background = '';
		backgroundPreview = '';
		status = 'Fundo transparente selecionado. Salve para aplicar.';
	}
</script>

<section class="overlay-editor" aria-label="Editor visual da overlay">
	<header>
		<div>
			<p class="eyebrow">OVERLAY DA LIVE</p>
			<h3>Layout desta cena</h3>
		</div>
		<div class="actions">
			<button class="secondary-button" onclick={reset}>Restaurar</button><button
				class="primary-button"
				onclick={() => void save()}
				disabled={saving}>{saving ? 'Salvando…' : 'Salvar layout'}</button
			>
		</div>
	</header>
	<OverlayProfileBar
		profiles={Object.keys(profiles)}
		{activeProfile}
		canDelete={Object.keys(profiles).length > 1}
		onSelect={selectProfile}
		onDuplicate={createProfile}
		onRename={renameProfile}
		onDelete={deleteProfile}
	/>
	<p class="hint">
		Arraste e redimensione os elementos. A câmera do narrador fica sobre a iniciativa; as câmeras
		dos jogadores ficam na base, à frente dos dados. Sem imagem de fundo, a overlay fica
		transparente para usar o cenário do OBS.
	</p>
	<OverlayBackgroundControl
		background={layout.background}
		onUpload={upload}
		onTransparent={useTransparentBackground}
	/>
	<div class="livekit-fields">
		<label>LiveKit URL<input bind:value={layout.livekitUrl} placeholder="wss://..." /></label>
		<label>Sala<input bind:value={layout.livekitRoom} placeholder="mesa-1" /></label>
		<label
			>Token temporário<input
				bind:value={layout.livekitToken}
				type="password"
				placeholder="JWT de curta duração"
			/></label
		>
	</div>
	<OverlayLayoutCanvas
		blocks={layout.blocks}
		{selectedId}
		{backgroundPreview}
		{snapToGrid}
		onSnapChange={(enabled) => (snapToGrid = enabled)}
		onSelect={(id) => (selectedId = id)}
		onDragStart={dragStart}
		onDropPosition={dropPosition}
		onResizeStart={resizeStart}
	/>
	<OverlayBlockInspector selected={selectedBlock} blocks={layout.blocks} onUpdate={updateBlock} />
	{#if status}<small class="status">{status}</small>{/if}
</section>

<style>
	.overlay-editor {
		min-width: 0;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
	}
	.overlay-editor button,
	.overlay-editor input {
		box-sizing: border-box;
		max-width: 100%;
	}
	.overlay-editor button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.75rem;
		color: #edc77f;
		background: #2b211e;
		font: inherit;
		font-size: 0.74rem;
		font-weight: 750;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			opacity 0.16s ease;
	}
	.overlay-editor button:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #3a2920;
	}
	.overlay-editor button:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	.overlay-editor button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.overlay-editor .primary-button {
		border-color: #e0b86f;
		color: #26190e;
		background: #e0b86f;
	}
	.overlay-editor .primary-button:hover:not(:disabled) {
		border-color: #f4d796;
		background: #f4d796;
	}
	.overlay-editor .secondary-button {
		background: #2b211e;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h3 {
		margin: 0;
		color: #f0e0c8;
		font:
			600 1.3rem Georgia,
			serif;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	.hint {
		color: #a99c91;
		font-size: 0.78rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.livekit-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.8rem;
	}
	.livekit-fields label {
		display: grid;
		gap: 0.25rem;
		color: #b9aa9b;
		font-size: 0.68rem;
	}
	.livekit-fields input {
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 7px;
		padding: 0.45rem 0.55rem;
		color: #eee4d6;
		background: #211c1e;
		font: inherit;
	}
	.status {
		display: block;
		margin-top: 0.6rem;
		color: #d8ad67;
	}
	@media (max-width: 600px) {
		header {
			align-items: flex-start;
			flex-direction: column;
		}
		.actions {
			width: 100%;
		}
		.actions button {
			flex: 1;
		}
	}
</style>
