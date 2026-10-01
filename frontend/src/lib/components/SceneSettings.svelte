<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { updateScene, type Scene } from '$lib/services/sceneApi';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import { notifyUserRequestError, request } from '$lib/services/httpClient';
	let {
		scene,
		session,
		onclose,
		onsaved
	}: { scene: Scene; session: Session; onclose: () => void; onsaved: (scene: Scene) => void } =
		$props();
	// Draft is intentionally mutable while editing a scene copy.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let draft = $state<Scene>({} as Scene),
		saving = $state(false),
		message = $state('');
	let imageFiles = $state<{ path: string; name: string }[]>([]);
	let mapPrompt = $state('');
	let generating = $state(false);
	$effect(() => {
		draft = { ...scene };
	});
	onMount(async () => {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const folder = `campaigns/${scene.campaignId}/media`;
		const { data, error } = await supabase.storage
			.from('campaign-assets')
			.list(folder, { limit: 100 });
		if (error) {
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not load campaign media.'
					: 'Não foi possível carregar as mídias da campanha.'
			);
			return;
		}
		imageFiles = (data ?? [])
			.filter((file) => file.metadata?.mimetype?.startsWith('image/'))
			.map((file) => ({
				path: `${folder}/${file.name}`,
				name: file.name.replace(/^[a-f0-9-]+-/, '')
			}));
	});
	async function save() {
		saving = true;
		message = '';
		try {
			const result = await updateScene(session, draft);
			onsaved(result);
			onclose();
		} catch (error) {
			message = '';
			if (!(error instanceof Error && error.name === 'ApiError'))
				notifyUserRequestError(
					$appLocale === 'en' ? 'Could not save the scene.' : 'Não foi possível salvar a cena.'
				);
		} finally {
			saving = false;
		}
	}
	async function generateMap() {
		if (!mapPrompt.trim() || generating) return;
		generating = true;
		const supabase = await getSupabaseClient();
		if (!supabase) {
			generating = false;
			return;
		}
		message = '';
		try {
			const data = await request<{ fotoUrl: string }>(
				session,
				`/api/v1/campaigns/${scene.campaignId}/scenes/generate-background?prompt=${encodeURIComponent(mapPrompt.trim())}`
			);
			const blob = await (await fetch(data.fotoUrl)).blob();
			const optimized = await optimizeImage(blob, 2048, 0.82);
			const path = `campaigns/${scene.campaignId}/media/${crypto.randomUUID()}-mapa-gerado.png`;
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(path, optimized.file, {
					contentType: optimized.file.type,
					cacheControl: '31536000'
				});
			if (error) throw error;
			imageFiles = [{ path, name: `Mapa gerado · ${mapPrompt.slice(0, 40)}` }, ...imageFiles];
			draft.backgroundUrl = path;
			message =
				$appLocale === 'en'
					? 'Map generated and selected. Save the scene to apply it.'
					: 'Mapa gerado e selecionado. Salve a cena para aplicá-lo.';
		} catch (error) {
			message = '';
			if (!(error instanceof Error && error.name === 'ApiError'))
				notifyUserRequestError(
					$appLocale === 'en'
						? 'Could not generate or save the map.'
						: 'Não foi possível gerar ou salvar o mapa.'
				);
		} finally {
			generating = false;
		}
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(event) => event.currentTarget === event.target && onclose()}
>
	<section>
		<header>
			<div>
				<p>{$appLocale === 'en' ? 'SCENE' : 'CENA'}</p>
				<h2>{$appLocale === 'en' ? 'Settings' : 'Configurações'}</h2>
			</div>
			<button onclick={onclose}>×</button>
		</header>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<label
				>{$appLocale === 'en' ? 'Name' : 'Nome'}<input
					bind:value={draft.name}
					maxlength="120"
				/></label
			><label
				>{$appLocale === 'en' ? 'Background image' : 'Imagem de fundo'}<input
					bind:value={draft.backgroundUrl}
					placeholder={$appLocale === 'en' ? 'Public image URL' : 'URL pública da imagem'}
				/></label
			><label
				>{$appLocale === 'en'
					? 'Choose image from Library'
					: 'Escolher imagem da Biblioteca'}<select bind:value={draft.backgroundUrl}
					><option value=""
						>{$appLocale === 'en' ? 'No background image' : 'Sem imagem de fundo'}</option
					>{#each imageFiles as image (image.path)}<option value={image.path}>{image.name}</option
						>{/each}</select
				></label
			>
			<div class="map-ai">
				<strong>{$appLocale === 'en' ? 'Generate map with AI' : 'Gerar mapa com IA'}</strong
				><textarea
					bind:value={mapPrompt}
					maxlength="1500"
					placeholder={$appLocale === 'en'
						? 'Describe only the scene flavor, e.g. elven ruins, a broken bridge over lava, scattered bones…'
						: 'Descreva apenas o tema da cena: ruínas élficas, ponte sobre lava, ossadas espalhadas…'}
				></textarea><button
					type="button"
					onclick={() => void generateMap()}
					disabled={generating || !mapPrompt.trim()}
					>{generating
						? $appLocale === 'en'
							? 'Generating map…'
							: 'Gerando mapa…'
						: $appLocale === 'en'
							? 'Generate and select map'
							: 'Gerar e selecionar mapa'}</button
				>
				<small class="map-ai-hint">
					{$appLocale === 'en'
						? 'This tool generates battle maps only: strict 90° top-down orthographic view, no horizon/sky/perspective/isometric view, playable terrain edge-to-edge. Describe only the theme and locations; 1.5 m squares are added by the game grid.'
						: 'Esta ferramenta gera somente mapas de batalha: vista ortográfica estrita de cima (90°), sem horizonte/céu/perspectiva/isométrica, com terreno jogável até as bordas. Descreva apenas o tema e os locais; a grade do jogo usa quadrados de 1,5 m.'}
				</small>
			</div>
			<label
				>{$appLocale === 'en' ? 'Grid in pixels' : 'Grid em pixels'}<input
					bind:value={draft.gridSize}
					type="number"
					min="20"
					max="200"
				/></label
			>
			<div class="map-dimensions">
				<label>
					{$appLocale === 'en' ? 'Map width (squares)' : 'Largura do mapa (quadrados)'}
					<input bind:value={draft.mapWidthCells} type="number" min="5" max="100" />
				</label>
				<label>
					{$appLocale === 'en' ? 'Map height (squares)' : 'Altura do mapa (quadrados)'}
					<input bind:value={draft.mapHeightCells} type="number" min="5" max="100" />
				</label>
			</div>
			<small class="map-size-hint">
				{$appLocale === 'en'
					? 'The background image is fitted to this grid area; a different image ratio may stretch it.'
					: 'A imagem de fundo será ajustada a esta área de grade; proporções diferentes podem esticar a imagem.'}
			</small>
			<label
				>{$appLocale === 'en' ? 'Player visibility' : 'Visibilidade para jogadores'}<select
					bind:value={draft.playerAccess}
					><option value="hidden"
						>{$appLocale === 'en' ? 'Hidden — nobody can see it' : 'Oculta — ninguém vê'}</option
					><option value="available"
						>{$appLocale === 'en'
							? 'Available — players can open it'
							: 'Disponível — jogadores podem abrir'}</option
					><option value="active"
						>{$appLocale === 'en' ? 'Active — group scene' : 'Ativa — cena do grupo'}</option
					></select
				></label
			><label
				>{$appLocale === 'en' ? 'Fog of war' : 'Névoa de guerra'}<select
					bind:value={draft.fogEnabled}
					><option value={false}>{$appLocale === 'en' ? 'Disabled' : 'Desativada'}</option><option
						value={true}>{$appLocale === 'en' ? 'Enabled' : 'Ativada'}</option
					></select
				></label
			><label
				>{$appLocale === 'en' ? 'Vision mode' : 'Modo de visão'}<select
					bind:value={draft.visionMode}
					><option value="manual">Manual</option><option value="shared"
						>{$appLocale === 'en' ? 'Shared' : 'Compartilhada'}</option
					><option value="token">{$appLocale === 'en' ? 'By token' : 'Por token'}</option></select
				></label
			><label class="toggle"
				><input type="checkbox" bind:checked={draft.allowPlayerMovement} />
				{$appLocale === 'en'
					? 'Players can move only their own tokens'
					: 'Jogadores podem mover apenas seus próprios tokens'}</label
			><label class="toggle"
				><input type="checkbox" bind:checked={draft.allowPlayerDoorInteraction} />
				{$appLocale === 'en'
					? 'Players can interact with nearby doors'
					: 'Jogadores podem interagir com portas próximas'}</label
			>
			<p>
				{$appLocale === 'en'
					? 'Upload images and audio in the Library. Private media gets a temporary browser URL without exposing the bucket publicly.'
					: 'Envie imagens e áudios na Biblioteca. Mídias privadas recebem uma URL temporária no navegador, sem expor o bucket publicamente.'}
			</p>
			{#if message}<small>{message}</small>{/if}
			<footer>
				<button type="button" onclick={onclose}
					>{$appLocale === 'en' ? 'Cancel' : 'Cancelar'}</button
				><button class="primary" disabled={saving}
					>{saving
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: $appLocale === 'en'
							? 'Save scene'
							: 'Salvar cena'}</button
				>
			</footer>
		</form>
	</section>
</div>

<style>
	.map-ai {
		display: grid;
		gap: 0.45rem;
		border: 1px solid #59483b;
		border-radius: 7px;
		padding: 0.7rem;
		color: #d8ad67;
		font-size: 0.75rem;
	}
	.map-dimensions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
	}
	.map-size-hint {
		color: #a99c91;
		font-size: 0.68rem;
	}
	.map-ai textarea {
		min-height: 68px;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		resize: vertical;
	}
	.map-ai-hint {
		color: #a99c91;
		font-size: 0.68rem;
		font-weight: 400;
		line-height: 1.4;
	}
	.map-ai button {
		justify-self: start;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		color: #f0d29d;
		background: #2b211c;
		cursor: pointer;
	}
	.map-ai button:disabled {
		opacity: 0.55;
		cursor: wait;
	}
	.backdrop {
		position: fixed;
		z-index: 30;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #080608b8;
	}
	.backdrop section {
		width: min(100%, 540px);
		max-height: calc(100dvh - 2rem);
		display: flex;
		flex-direction: column;
		border: 1px solid #765d3d;
		border-radius: 12px;
		overflow: hidden;
		color: #eee4d6;
		background: #1b171a;
	}
	.backdrop header {
		display: flex;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #493c39;
	}
	.backdrop header p {
		margin: 0;
		color: #d8ad67;
		font-size: 0.65rem;
		letter-spacing: 0.12em;
	}
	.backdrop h2 {
		margin: 0.25rem 0 0;
		font:
			600 1.35rem Georgia,
			serif;
	}
	.backdrop header button,
	footer button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font: inherit;
		cursor: pointer;
	}
	.backdrop header button {
		font-size: 1.4rem;
	}
	.backdrop form {
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		display: grid;
		gap: 0.7rem;
		padding: 1rem;
	}
	.backdrop label {
		display: grid;
		gap: 0.25rem;
		color: #b9aa9d;
		font-size: 0.7rem;
	}
	.backdrop input,
	.backdrop select,
	.backdrop textarea {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
	}
	.backdrop label.toggle {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.65rem;
	}
	.backdrop label.toggle input {
		accent-color: #d8ad67;
	}
	.backdrop p,
	.backdrop small {
		margin: 0;
		color: #a99c91;
		font-size: 0.75rem;
		line-height: 1.45;
	}
	.backdrop footer {
		position: sticky;
		bottom: -1rem;
		z-index: 1;
		display: flex;
		justify-content: flex-end;
		gap: 0.7rem;
		margin-top: 0.4rem;
		padding: 0.75rem 0 0.25rem;
		border-top: 1px solid #493c39;
		background: #1b171a;
	}
	@media (max-width: 600px) {
		.backdrop {
			padding: 0.5rem;
		}
		.backdrop section {
			max-height: calc(100dvh - 1rem);
		}
	}
	.backdrop footer button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.5rem 0.7rem;
	}
	.backdrop footer .primary {
		border: 0;
		color: #26190e;
		background: #e0b86f;
	}
</style>
