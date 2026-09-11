<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { updateScene, type Scene } from '$lib/services/sceneApi';
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	let {
		scene,
		session,
		onclose,
		onsaved
	}: { scene: Scene; session: Session; onclose: () => void; onsaved: (scene: Scene) => void } =
		$props();
	let draft = $state<Scene>({} as Scene),
		saving = $state(false),
		message = $state('');
	let audioFiles = $state<{ path: string; name: string }[]>([]);
	let imageFiles = $state<{ path: string; name: string }[]>([]);
	let mapPrompt = $state('');
	let generating = $state(false);
	$effect(() => {
		draft = { ...scene };
	});
	onMount(async () => {
		if (!supabase) return;
		const folder = `campaigns/${scene.campaignId}/media`;
		const { data, error } = await supabase.storage
			.from('campaign-assets')
			.list(folder, { limit: 100 });
		if (error) {
			message = error.message;
			return;
		}
		audioFiles = (data ?? [])
			.filter((file) => file.metadata?.mimetype?.startsWith('audio/'))
			.map((file) => ({
				path: `${folder}/${file.name}`,
				name: file.name.replace(/^[a-f0-9-]+-/, '')
			}));
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
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not save the scene.' : 'Não foi possível salvar a cena.');
		} finally {
			saving = false;
		}
	}
	async function generateMap() {
		if (!mapPrompt.trim() || !supabase || generating) return;
		generating = true;
		message = '';
		try {
			const response = await fetch(
				`${import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8080'}/api/v1/scenes/generate-background?prompt=${encodeURIComponent(mapPrompt.trim())}`,
				{ headers: { Authorization: `Bearer ${session.access_token}` } }
			);
			const data = await response.json();
			if (!response.ok) throw new Error(data.error?.message ?? ($appLocale === 'en' ? 'Could not generate the map.' : 'Não foi possível gerar o mapa.'));
			const blob = await (await fetch(data.fotoUrl)).blob();
			const path = `campaigns/${scene.campaignId}/media/${crypto.randomUUID()}-mapa-gerado.png`;
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(path, blob, { contentType: 'image/png' });
			if (error) throw error;
			imageFiles = [{ path, name: `Mapa gerado · ${mapPrompt.slice(0, 40)}` }, ...imageFiles];
			draft.backgroundUrl = path;
			message = $appLocale === 'en' ? 'Map generated and selected. Save the scene to apply it.' : 'Mapa gerado e selecionado. Salve a cena para aplicá-lo.';
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not generate the map.' : 'Não foi possível gerar o mapa.');
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
			<label>Nome<input bind:value={draft.name} maxlength="120" /></label><label
				>{$appLocale === 'en' ? 'Background image' : 'Imagem de fundo'}<input
					bind:value={draft.backgroundUrl}
					placeholder={$appLocale === 'en' ? 'Public image URL' : 'URL pública da imagem'}
				/></label
			><label
				>{$appLocale === 'en' ? 'Choose image from Library' : 'Escolher imagem da Biblioteca'}<select bind:value={draft.backgroundUrl}
					><option value="">{$appLocale === 'en' ? 'No background image' : 'Sem imagem de fundo'}</option
					>{#each imageFiles as image (image.path)}<option value={image.path}>{image.name}</option
						>{/each}</select
				></label
			>
			<div class="map-ai">
				<strong>{$appLocale === 'en' ? 'Generate map with AI' : 'Gerar mapa com IA'}</strong><textarea
					bind:value={mapPrompt}
					maxlength="1500"
					placeholder="Ex.: ruínas élficas subterrâneas, ponte quebrada sobre rio de lava, espaço para combate"
				></textarea><button
					type="button"
					onclick={() => void generateMap()}
					disabled={generating || !mapPrompt.trim()}
					>{generating ? ($appLocale === 'en' ? 'Generating map…' : 'Gerando mapa…') : ($appLocale === 'en' ? 'Generate and select map' : 'Gerar e selecionar mapa')}</button
				>
			</div>
			<label
				>{$appLocale === 'en' ? 'Scene soundtrack' : 'Trilha da cena'}<select bind:value={draft.ambientAudioPath}
					><option value="">{$appLocale === 'en' ? 'No soundtrack' : 'Sem trilha'}</option>{#each audioFiles as audio (audio.path)}<option
							value={audio.path}>{audio.name}</option
						>{/each}</select
				></label
			><label
				>{$appLocale === 'en' ? 'Soundtrack volume' : 'Volume da trilha'}<input
					bind:value={draft.ambientAudioVolume}
					type="number"
					min="0"
					max="100"
				/></label
			><label class="toggle"
				><input
					type="checkbox"
					bind:checked={draft.ambientAudioEnabled}
					disabled={!draft.ambientAudioPath}
				/> {$appLocale === 'en' ? 'Play soundtrack for players' : 'Reproduzir trilha para participantes'}</label
			><label
				>{$appLocale === 'en' ? 'Grid in pixels' : 'Grid em pixels'}<input bind:value={draft.gridSize} type="number" min="20" max="200" /></label
			><label
				>{$appLocale === 'en' ? 'Player visibility' : 'Visibilidade para jogadores'}<select bind:value={draft.playerAccess}
					><option value="hidden">{$appLocale === 'en' ? 'Hidden — nobody can see it' : 'Oculta — ninguém vê'}</option><option value="available"
						>{$appLocale === 'en' ? 'Available — players can open it' : 'Disponível — jogadores podem abrir'}</option
					><option value="active">{$appLocale === 'en' ? 'Active — group scene' : 'Ativa — cena do grupo'}</option></select
				></label
			><label
				>{$appLocale === 'en' ? 'Fog of war' : 'Névoa de guerra'}<select bind:value={draft.fogEnabled}
					><option value={false}>{$appLocale === 'en' ? 'Disabled' : 'Desativada'}</option><option value={true}>{$appLocale === 'en' ? 'Enabled' : 'Ativada'}</option></select
				></label
			><label
				>{$appLocale === 'en' ? 'Vision mode' : 'Modo de visão'}<select bind:value={draft.visionMode}
					><option value="manual">Manual</option><option value="shared">{$appLocale === 'en' ? 'Shared' : 'Compartilhada'}</option
					><option value="token">{$appLocale === 'en' ? 'By token' : 'Por token'}</option></select
				></label
			><label class="toggle"
				><input type="checkbox" bind:checked={draft.allowPlayerMovement} /> {$appLocale === 'en' ? 'Players can move only their own tokens' : 'Jogadores podem mover apenas seus próprios tokens'}</label
			><label class="toggle"
				><input type="checkbox" bind:checked={draft.allowPlayerDoorInteraction} /> {$appLocale === 'en' ? 'Players can interact with nearby doors' : 'Jogadores podem interagir com portas próximas'}</label
			>
			<p>
				{$appLocale === 'en'
					? 'Upload images and audio in the Library. Private media gets a temporary browser URL without exposing the bucket publicly.'
					: 'Envie imagens e áudios na Biblioteca. Mídias privadas recebem uma URL temporária no navegador, sem expor o bucket publicamente.'}
			</p>
			{#if message}<small>{message}</small>{/if}
			<footer>
				<button type="button" onclick={onclose}>{$appLocale === 'en' ? 'Cancel' : 'Cancelar'}</button><button
					class="primary"
					disabled={saving}>{saving ? ($appLocale === 'en' ? 'Saving…' : 'Salvando…') : ($appLocale === 'en' ? 'Save scene' : 'Salvar cena')}</button
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
		display: flex;
		justify-content: flex-end;
		gap: 0.7rem;
		margin-top: 0.4rem;
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
