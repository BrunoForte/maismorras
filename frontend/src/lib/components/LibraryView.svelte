<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	let {
		campaignId,
		isGM,
		onnotes
	}: { campaignId: string; session: Session; isGM: boolean; onnotes: () => void } = $props();
	type Asset = { name: string; url: string; type: 'image' | 'audio' };
	let assets = $state<Asset[]>([]);
	let uploading = $state(false);
	let message = $state('');
	let preview = $state<Asset | null>(null);
	const folder = () => `campaigns/${campaignId}/media`;
	onMount(() => void loadAssets());
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
				const signed = await client.storage
					.from('campaign-assets')
					.createSignedUrl(`${folder()}/${file.name}`, 3600);
				return signed.data?.signedUrl
					? {
							name: file.name.replace(/^[a-f0-9-]+-/, ''),
							url: signed.data.signedUrl,
							type: file.metadata?.mimetype?.startsWith('audio/')
								? ('audio' as const)
								: ('image' as const)
						}
					: null;
			})
		);
		assets = listed.filter((asset): asset is Asset => asset !== null);
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !supabase) return;
		if (
			(!file.type.startsWith('image/') && !file.type.startsWith('audio/')) ||
			file.size > 20 * 1024 * 1024
		) {
			message = 'Envie imagem ou áudio de até 20 MB.';
			return;
		}
		uploading = true;
		message = '';
		try {
			const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(`${folder()}/${crypto.randomUUID()}-${name}`, file, { contentType: file.type });
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

<section class="library-view" aria-label="Biblioteca da campanha">
	<header>
		<div>
			<p>BIBLIOTECA DA CAMPANHA</p>
			<h2>Handouts e mídias</h2>
			<span>Imagens, mapas, documentos e trilhas desta mesa.</span>
		</div>
		{#if isGM}<div class="actions">
				<label
					>{uploading ? 'Enviando…' : 'Adicionar mídia'}<input
						type="file"
						accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav"
						onchange={upload}
						disabled={uploading}
					/></label
				><button onclick={onnotes}>Notas da campanha</button>
			</div>{/if}
	</header>
	{#if message}<p class="message">{message}</p>{/if}
	{#if assets.length}<section class="asset-grid">
			{#each assets as asset (asset.url)}<article>
					{#if asset.type === 'image'}<button class="asset-image" onclick={() => (preview = asset)}
							><img src={asset.url} alt={asset.name} /></button
						>{:else}<span class="audio-mark">♫</span><audio controls src={asset.url}
						></audio>{/if}<small>{asset.name}</small>
				</article>{/each}
		</section>{:else}<div class="empty">
			<strong>{isGM ? 'Adicione a primeira mídia.' : 'A biblioteca ainda está vazia.'}</strong><span
				>Handouts e trilhas desta campanha aparecerão aqui.</span
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
			<button onclick={() => (preview = null)} aria-label="Fechar imagem">×</button><img
				src={preview.url}
				alt={preview.name}
			/>
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
		overflow: hidden;
		color: #c8b8a8;
		font-size: 0.7rem;
		text-overflow: ellipsis;
		white-space: nowrap;
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
