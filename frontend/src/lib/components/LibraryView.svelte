<!-- eslint-disable svelte/require-each-key, svelte/no-navigation-without-resolve -- media URLs are external storage URLs. -->
<script lang="ts">
	/* eslint-disable svelte/require-each-key, svelte/no-navigation-without-resolve */
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { clearSignedAssetCache, getSignedAssetUrl } from '$lib/services/assetApi';
	import { request } from '$lib/services/httpClient';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import {
		loadLibraryPermissions,
		saveLibraryPermissions
	} from '$lib/services/libraryPermissionsApi';
	let {
		campaignId,
		session,
		isGM,
		onnotes,
		onpresent,
		onhide
	}: {
		campaignId: string;
		session: Session;
		isGM: boolean;
		onnotes: () => void;
		onpresent: (asset: { path: string; name: string }) => void;
		onhide: () => void;
	} = $props();
	type Asset = {
		name: string;
		path: string;
		url: string;
        thumbnailUrl?: string;
		type: 'image' | 'audio' | 'document' | 'map';
	};
	type Handout = { id: string; title: string; body: string; visibility: 'gm' | 'players' };
	let assets = $state<Asset[]>([]);
	let handouts = $state<Handout[]>([]);
	let uploading = $state(false);
	let deletingAsset = $state<string | null>(null);
	let savingHandout = $state(false);
	let handoutOpen = $state(false);
	let editingHandoutId = $state<string | null>(null);
	let assetFilter = $state<'all' | 'image' | 'map' | 'audio' | 'document'>('all');
	let handoutTitle = $state('');
	let handoutBody = $state('');
	let handoutVisibility = $state<'gm' | 'players'>('players');
	let message = $state('');
	let preview = $state<Asset | null>(null);
	const folder = () => `campaigns/${campaignId}/media`;
	onMount(() => {
		void loadAssets();
		void loadHandouts();
	});
	async function loadHandouts() {
		try {
			handouts = (
				await request<{ notes: Handout[] }>(session, `/api/v1/campaigns/${campaignId}/notes`)
			).notes;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not load handouts.'
						: 'Não foi possível carregar os handouts.';
		}
	}
	async function saveHandout() {
		if (!handoutTitle.trim() || savingHandout) return;
		savingHandout = true;
		message = '';
		try {
			const handout = await request<Handout>(
				session,
				editingHandoutId
					? `/api/v1/campaigns/${campaignId}/notes/${editingHandoutId}`
					: `/api/v1/campaigns/${campaignId}/notes`,
				{
					method: editingHandoutId ? 'PUT' : 'POST',
					body: JSON.stringify({
						title: handoutTitle.trim(),
						body: handoutBody,
						visibility: handoutVisibility
					})
				}
			);
			handouts = editingHandoutId
				? handouts.map((item) => (item.id === handout.id ? handout : item))
				: [handout, ...handouts];
			handoutTitle = '';
			handoutBody = '';
			handoutVisibility = 'players';
			editingHandoutId = null;
			handoutOpen = false;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not save the handout.'
						: 'Não foi possível salvar o handout.';
		} finally {
			savingHandout = false;
		}
	}
	function editHandout(handout: Handout) {
		editingHandoutId = handout.id;
		handoutTitle = handout.title;
		handoutBody = handout.body;
		handoutVisibility = handout.visibility;
		handoutOpen = true;
	}
	async function editPermissions(itemType: 'asset' | 'note', itemKey: string, label: string) {
		if (!isGM) return;
		try {
			const current = await loadLibraryPermissions(session, campaignId, itemType, itemKey);
			const entered = window.prompt(
				`Usuários autorizados para ${label} (UUIDs separados por vírgula):`,
				current.userIds.join(', ')
			);
			if (entered === null) return;
			const userIds = entered
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			await saveLibraryPermissions(session, campaignId, itemType, itemKey, userIds);
			message = 'Permissões atualizadas.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível salvar as permissões.';
		}
	}
	async function deleteHandout(handout: Handout) {
		try {
			await request<void>(session, `/api/v1/campaigns/${campaignId}/notes/${handout.id}`, {
				method: 'DELETE'
			});
			handouts = handouts.filter((item) => item.id !== handout.id);
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not delete the handout.'
						: 'Não foi possível excluir o handout.';
		}
	}
	async function deleteAsset(asset: Asset) {
		if (!supabase || deletingAsset) return;
		const confirmed = window.confirm(
			$appLocale === 'en'
				? `Delete “${asset.name}” from this campaign?`
				: `Excluir “${asset.name}” desta campanha?`
		);
		if (!confirmed) return;
		deletingAsset = asset.path;
		message = '';
		try {
			const { error } = await supabase.storage.from('campaign-assets').remove([asset.path]);
			if (error) throw error;
			clearSignedAssetCache(campaignId, asset.path);
			assets = assets.filter((item) => item.path !== asset.path);
			if (preview?.path === asset.path) preview = null;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not delete the media.'
						: 'Não foi possível excluir a mídia.';
		} finally {
			deletingAsset = null;
		}
	}
	async function loadAssets() {
		if (!supabase) return;
		const client = supabase;
		const { data, error } = await client.storage
			.from('campaign-assets')
			.list(folder(), { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
		if (error) {
			message = error.message;
			return;
		}
		const listed = await Promise.all(
			(data ?? []).map(async (file) => {
				if (!isGM && file.metadata?.mimetype?.startsWith('audio/')) return null;
				const signed = await getSignedAssetUrl(session, campaignId, `${folder()}/${file.name}`);
				return signed
					? {
							name: file.name.replace(/^[a-f0-9-]+-/, ''),
							path: `${folder()}/${file.name}`,
							url: signed,
							type: file.metadata?.mimetype?.startsWith('audio/')
								? ('audio' as const)
								: file.metadata?.mimetype === 'application/pdf' ||
									  file.metadata?.mimetype?.startsWith('text/')
									? ('document' as const)
									: /map|scene|battle|mapa|cena/i.test(file.name)
										? ('map' as const)
										: ('image' as const)
						}
					: null;
			})
		);
		assets = listed.filter(
			(asset): asset is Asset => asset !== null && (isGM || asset.type !== 'audio')
		);
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !supabase) return;
		if (
			(!file.type.startsWith('image/') &&
				!file.type.startsWith('audio/') &&
				file.type !== 'application/pdf' &&
				!file.type.startsWith('text/')) ||
			file.size > 20 * 1024 * 1024
		) {
			message =
				$appLocale === 'en'
					? 'Upload an image, audio, or document up to 20 MB.'
					: 'Envie imagem, áudio ou documento de até 20 MB.';
			return;
		}
		uploading = true;
		message = '';
		try {
			const optimized = await optimizeImage(file);
			const name = optimized.file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(`${folder()}/${crypto.randomUUID()}-${name}`, optimized.file, {
					contentType: optimized.file.type,
					cacheControl: '3600'
				});
			if (error) throw error;
			await loadAssets();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível enviar a mídia.';
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<section
	class="library-view"
	aria-label={$appLocale === 'en' ? 'Campaign library' : 'Biblioteca da campanha'}
>
	<header>
		<div>
			<p>{$appLocale === 'en' ? 'CAMPAIGN LIBRARY' : 'BIBLIOTECA DA CAMPANHA'}</p>
			<h2>{$appLocale === 'en' ? 'Handouts and media' : 'Handouts e mídias'}</h2>
			<span
				>{$appLocale === 'en'
					? 'Images, maps, documents, and music for this table.'
					: 'Imagens, mapas, documentos e trilhas desta mesa.'}</span
			>
		</div>
		{#if isGM}<div class="actions">
				<label
					>{uploading
						? $appLocale === 'en'
							? 'Uploading…'
							: 'Enviando…'
						: $appLocale === 'en'
							? 'Add media'
							: 'Adicionar mídia'}<input
						type="file"
						accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain"
						onchange={upload}
						disabled={uploading}
					/></label
				><button
					onclick={() => {
						editingHandoutId = null;
						handoutTitle = '';
						handoutBody = '';
						handoutOpen = !handoutOpen;
					}}>{$appLocale === 'en' ? 'New handout' : 'Novo handout'}</button
				><button onclick={onnotes}
					>{$appLocale === 'en' ? 'Private notes' : 'Notas internas'}</button
				>
				{#if isGM}<button onclick={onhide}
						>{$appLocale === 'en' ? 'Hide presentation' : 'Ocultar imagem exibida'}</button
					>{/if}
			</div>{/if}
	</header>
	{#if message}<p class="message">{message}</p>{/if}
	{#if handoutOpen && isGM}<form
			class="handout-form"
			onsubmit={(event) => {
				event.preventDefault();
				void saveHandout();
			}}
		>
			<input
				bind:value={handoutTitle}
				maxlength="120"
				placeholder={$appLocale === 'en' ? 'Handout title' : 'Título do handout'}
			/>
			<textarea
				bind:value={handoutBody}
				maxlength="32000"
				placeholder={$appLocale === 'en'
					? 'Text, links, and guidance for the table'
					: 'Texto, links e orientações para a mesa'}></textarea>
			<div>
				<select bind:value={handoutVisibility}
					><option value="players"
						>{$appLocale === 'en' ? 'Visible to players' : 'Visível aos jogadores'}</option
					><option value="gm"
						>{$appLocale === 'en' ? 'Game master only' : 'Somente narrador'}</option
					></select
				><button disabled={savingHandout}
					>{savingHandout
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: $appLocale === 'en'
							? 'Save handout'
							: 'Salvar handout'}</button
				>
			</div>
		</form>{/if}
	<section
		class="handouts"
		aria-label={$appLocale === 'en' ? 'Campaign handouts' : 'Handouts da campanha'}
	>
		<h3>Handouts</h3>
		{#if handouts.length}<div class="handout-grid">
				{#each handouts as handout (handout.id)}<article>
						<small
							>{handout.visibility === 'players'
								? $appLocale === 'en'
									? 'Shared'
									: 'Compartilhado'
								: $appLocale === 'en'
									? 'Private'
									: 'Privado'}</small
						>
						<h4>{handout.title}</h4>
						<p>{handout.body || ($appLocale === 'en' ? 'No text.' : 'Sem texto.')}</p>
						{#if isGM}<div class="handout-actions">
								<button onclick={() => editHandout(handout)}
									>{$appLocale === 'en' ? 'Edit' : 'Editar'}</button
								><button onclick={() => void editPermissions('note', handout.id, handout.title)}
									>{$appLocale === 'en' ? 'Access' : 'Acesso'}</button
								><button onclick={() => void deleteHandout(handout)}
									>{$appLocale === 'en' ? 'Delete' : 'Excluir'}</button
								>
							</div>{/if}
					</article>{/each}
			</div>{:else}<p class="empty-handouts">
				{$appLocale === 'en'
					? 'No handouts have been saved for this campaign.'
					: 'Nenhum handout salvo nesta campanha.'}
			</p>{/if}
	</section>
	{#if assets.length}<nav
			class="asset-filters"
			aria-label={$appLocale === 'en' ? 'Media filters' : 'Filtros de mídia'}
		>
			{#each [['all', $appLocale === 'en' ? 'All' : 'Todas'], ['image', $appLocale === 'en' ? 'Images' : 'Imagens'], ['map', $appLocale === 'en' ? 'Maps' : 'Mapas'], ['audio', $appLocale === 'en' ? 'Music' : 'Músicas'], ['document', $appLocale === 'en' ? 'Documents' : 'Documentos']] as [value, label]}<button
					class:active={assetFilter === value}
					onclick={() => (assetFilter = value as typeof assetFilter)}>{label}</button
				>{/each}
		</nav>{/if}
	{#if assets.length}<section class="asset-grid">
			{#each assets.filter((asset) => assetFilter === 'all' || asset.type === assetFilter) as asset (asset.path)}<article
					class="asset-card"
				>
					{#if asset.type === 'image' || asset.type === 'map'}<button
							class="asset-image"
							onclick={() => (preview = asset)}><img src={asset.thumbnailUrl ?? asset.url} alt={asset.name} loading="lazy" decoding="async" /></button
						>
					{:else if asset.type === 'audio'}<span class="audio-mark">♫</span><audio
							controls
							src={asset.url}
						></audio>
					{:else}<span class="document-mark">▤</span><a
							class="document-link"
							href={asset.url}
							target="_blank"
							rel="noreferrer">{$appLocale === 'en' ? 'Open document' : 'Abrir documento'}</a
						>{/if}
					<div class="asset-footer">
						<small>{asset.name}</small>{#if isGM}<button
								class="asset-delete"
								aria-label={$appLocale === 'en' ? `Delete ${asset.name}` : `Excluir ${asset.name}`}
								title={$appLocale === 'en' ? 'Delete media' : 'Excluir mídia'}
								onclick={() => void deleteAsset(asset)}
								disabled={deletingAsset === asset.path}>×</button
							>{#if isGM}<button
									class="asset-present"
									onclick={() => void editPermissions('asset', asset.path, asset.name)}
									>{$appLocale === 'en' ? 'Access' : 'Acesso'}</button
								>{/if}
							>{#if asset.type === 'image' || asset.type === 'map'}<button
									class="asset-present"
									onclick={() => onpresent({ path: asset.path, name: asset.name })}>👁</button
								>{/if}{/if}
					</div>
				</article>{/each}
		</section>{:else}<div class="empty">
			<strong
				>{isGM
					? $appLocale === 'en'
						? 'Add the first media item.'
						: 'Adicione a primeira mídia.'
					: $appLocale === 'en'
						? 'The library is still empty.'
						: 'A biblioteca ainda está vazia.'}</strong
			><span
				>{$appLocale === 'en'
					? 'Handouts and music for this campaign will appear here.'
					: 'Handouts e trilhas desta campanha aparecerão aqui.'}</span
			>
		</div>{/if}
</section>
{#if preview}<div
		class="preview-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.currentTarget === event.target) preview = null;
		}}
	>
		<section>
			<button
				onclick={() => (preview = null)}
				aria-label={$appLocale === 'en' ? 'Close image' : 'Fechar imagem'}>×</button
			><img src={preview.url} alt={preview.name} />
			<p>{preview.name}</p>
		</section>
	</div>{/if}

<style>
	.library-view {
		min-height: 510px;
		padding: clamp(1.25rem, 3vw, 2.5rem);
		color: #eee4d6;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.2rem;
		border-bottom: 1px solid #3b3030;
	}
	p {
		margin: 0;
	}
	header p {
		margin-bottom: 0.5rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}
	h2 {
		margin: 0 0 0.5rem;
		font:
			500 clamp(1.8rem, 4vw, 2.7rem) Georgia,
			serif;
	}
	header span {
		color: #a99c91;
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		gap: 0.55rem;
	}
	.actions label,
	.actions button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.65rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.72rem;
		font-weight: 750;
		cursor: pointer;
		white-space: nowrap;
	}
	.actions label {
		border: 0;
		color: #26190e;
		background: #e0b86f;
	}
	.actions input {
		display: none;
	}
	.handout-form {
		display: grid;
		gap: 0.6rem;
		margin: 0 0 1.2rem;
		padding: 1rem;
		border: 1px solid #5a493b;
		border-radius: 10px;
		background: #211b1e;
	}
	.handout-form input,
	.handout-form textarea,
	.handout-form select {
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eee4d6;
		background: #121012;
		font: inherit;
	}
	.handout-form textarea {
		min-height: 100px;
		resize: vertical;
	}
	.handout-form div {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.handout-form button {
		border: 0;
		border-radius: 7px;
		padding: 0.52rem 0.7rem;
		color: #26190e;
		background: #e0b86f;
		font-weight: 750;
		cursor: pointer;
	}
	.handouts {
		margin: 0 0 1.4rem;
	}
	.handouts h3 {
		margin: 0 0 0.7rem;
		color: #d8ad67;
		font:
			0.8rem Georgia,
			serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.handout-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.7rem;
	}
	.handout-grid article {
		min-width: 0;
		padding: 0.85rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		background: #211b1e;
	}
	.handout-grid small {
		color: #d8ad67;
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.handout-grid h4 {
		margin: 0.35rem 0;
		color: #eee4d6;
		font:
			600 1rem Georgia,
			serif;
	}
	.handout-grid p {
		color: #b9aa9d;
		white-space: pre-wrap;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.handout-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.7rem;
	}
	.handout-actions button {
		border: 1px solid #5a493b;
		border-radius: 5px;
		padding: 0.35rem 0.5rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.empty-handouts {
		padding: 0.9rem;
		border: 1px dashed #5a493b;
		border-radius: 8px;
		color: #a99c91;
		font-size: 0.82rem;
	}
	.asset-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0 0 0.75rem;
	}
	.asset-filters button {
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #b9aa9d;
		background: #211b1e;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.asset-filters button.active {
		border-color: #c89655;
		color: #26190e;
		background: #e0b86f;
	}
	.document-mark {
		display: grid;
		place-items: center;
		height: 125px;
		color: #d8ad67;
		background: #120f11;
		font-size: 2rem;
	}
	.document-link {
		color: #edc77f;
		font-size: 0.75rem;
		text-decoration: none;
	}
	.message {
		margin: 0 0 1rem;
		color: #f0cb85;
		font-size: 0.8rem;
	}
	.empty {
		display: grid;
		gap: 0.35rem;
		padding: 2rem;
		border: 1px dashed #5a493b;
		border-radius: 10px;
		color: #a99c91;
		text-align: center;
	}
	.empty strong {
		color: #e9dcc9;
		font:
			600 1.1rem Georgia,
			serif;
	}
	.asset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.8rem;
	}
	.asset-grid article {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
		padding: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		background: #211b1e;
	}
	.asset-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.45rem;
		min-width: 0;
	}
	.asset-image {
		height: 125px;
		overflow: hidden;
		border: 0;
		border-radius: 6px;
		padding: 0;
		background: #120f11;
		cursor: zoom-in;
	}
	.asset-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.asset-grid small {
		min-width: 0;
		overflow: hidden;
		color: #c8b8a8;
		font-size: 0.7rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.asset-delete {
		flex: 0 0 auto;
		width: 1.45rem;
		height: 1.45rem;
		border: 1px solid #5a493b;
		border-radius: 50%;
		color: #d9a3a0;
		background: #2b211e;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}
	.asset-delete:hover:not(:disabled) {
		border-color: #b96d68;
		color: #fff0ed;
		background: #6b302e;
	}
	.asset-delete:disabled {
		opacity: 0.55;
		cursor: wait;
	}
	.audio-mark {
		color: #e0b86f;
		font-size: 1.5rem;
	}
	.asset-grid audio {
		width: 100%;
		height: 30px;
	}
	.preview-backdrop {
		position: fixed;
		z-index: 30;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: rgba(7, 5, 7, 0.82);
		backdrop-filter: blur(7px);
	}
	.preview-backdrop section {
		position: relative;
		max-width: min(100%, 1100px);
		max-height: 90vh;
	}
	.preview-backdrop img {
		display: block;
		max-width: 100%;
		max-height: 82vh;
		object-fit: contain;
	}
	.preview-backdrop button {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 50%;
		color: white;
		background: rgba(0, 0, 0, 0.6);
		font-size: 1.3rem;
		cursor: pointer;
	}
	.preview-backdrop p {
		margin: 0.55rem 0 0;
		color: #e9dcc9;
		text-align: center;
	}
	@media (max-width: 650px) {
		header {
			flex-direction: column;
		}
	}
</style>



