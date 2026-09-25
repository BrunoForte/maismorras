<!-- eslint-disable svelte/require-each-key, svelte/no-navigation-without-resolve -- media URLs are external storage URLs. -->
<script lang="ts">
	/* eslint-disable svelte/require-each-key, svelte/no-navigation-without-resolve */
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { clearSignedAssetCache, getSignedAssetUrl } from '$lib/services/assetApi';
	import { notifyUserRequestError, request } from '$lib/services/httpClient';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import { audioAssetKind } from '$lib/services/audioPlayback';
	import { listParticipants, type Participant } from '$lib/services/characterApi';
	import {
		currentPlayerIds,
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
		audioKind?: 'music' | 'effect';
	};
	type Handout = { id: string; title: string; body: string; visibility: 'gm' | 'players' };
	let assets = $state<Asset[]>([]);
	let handouts = $state<Handout[]>([]);
	let uploading = $state(false);
	let deletingAsset = $state<string | null>(null);
	let changingAudioKind = $state<string | null>(null);
	let savingHandout = $state(false);
	let handoutOpen = $state(false);
	let editingHandoutId = $state<string | null>(null);
	let assetFilter = $state<'all' | 'image' | 'map' | 'audio' | 'document'>('all');
	let handoutTitle = $state('');
	let handoutBody = $state('');
	let handoutAudience = $state<'gm' | 'all' | 'selected'>('all');
	let handoutUserIds = $state<string[]>([]);
	let message = $state('');
	let preview = $state<Asset | null>(null);
	let draggingFiles = $state(false);
	let audioUploadKind = $state<'music' | 'effect'>('music');
	let permissionDialog = $state<{ type: 'asset' | 'note'; key: string; label: string } | null>(
		null
	);
	let participants = $state<Participant[]>([]);
	let permissionUsers = $state<string[]>([]);
	let permissionRestricted = $state(false);
	let loadingPermissions = $state(false);
	let savingPermissions = $state(false);
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
			message = error instanceof Error ? error.message : 'Não foi possível carregar os handouts.';
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
						visibility: 'gm'
					})
				}
			);
			if (handoutAudience !== 'gm') {
				await saveLibraryPermissions(
					session,
					campaignId,
					'note',
					handout.id,
					handoutAudience === 'selected'
						? currentPlayerIds(
								handoutUserIds,
								participants.map((participant) => participant.userId)
							)
						: [],
					handoutAudience === 'selected'
				);
				handout.visibility = 'players';
			}
			handouts = editingHandoutId
				? handouts.map((item) => (item.id === handout.id ? handout : item))
				: [handout, ...handouts];
			handoutTitle = '';
			handoutBody = '';
			handoutAudience = 'all';
			handoutUserIds = [];
			editingHandoutId = null;
			handoutOpen = false;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível salvar o handout.';
			await loadHandouts();
		} finally {
			savingHandout = false;
		}
	}
	async function editHandout(handout: Handout) {
		editingHandoutId = handout.id;
		handoutTitle = handout.title;
		handoutBody = handout.body;
		handoutAudience = handout.visibility === 'gm' ? 'gm' : 'all';
		handoutUserIds = [];
		try {
			const [roster, access] = await Promise.all([
				listParticipants(session, campaignId),
				handout.visibility === 'players'
					? loadLibraryPermissions(session, campaignId, 'note', handout.id)
					: Promise.resolve(null)
			]);
			participants = roster.participants.filter((participant) => participant.role === 'player');
			if (access?.restricted) {
				handoutAudience = 'selected';
				handoutUserIds = currentPlayerIds(
					access.userIds,
					participants.map((participant) => participant.userId)
				);
			}
			handoutOpen = true;
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível carregar jogadores da mesa.';
		}
	}
	async function openNewHandout() {
		editingHandoutId = null;
		handoutTitle = '';
		handoutBody = '';
		handoutAudience = 'all';
		handoutUserIds = [];
		try {
			const roster = await listParticipants(session, campaignId);
			participants = roster.participants.filter((participant) => participant.role === 'player');
			handoutOpen = true;
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível carregar jogadores da mesa.';
		}
	}
	async function editPermissions(itemType: 'asset' | 'note', itemKey: string, label: string) {
		if (!isGM) return;
		loadingPermissions = true;
		permissionDialog = { type: itemType, key: itemKey, label };
		try {
			const [current, roster] = await Promise.all([
				loadLibraryPermissions(session, campaignId, itemType, itemKey),
				listParticipants(session, campaignId)
			]);
			participants = roster.participants.filter((participant) => participant.role === 'player');
			permissionUsers = currentPlayerIds(
				current.userIds,
				participants.map((participant) => participant.userId)
			);
			permissionRestricted = current.restricted;
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível carregar as permissões do item.';
			permissionDialog = null;
		} finally {
			loadingPermissions = false;
		}
	}
	function togglePermissionUser(userId: string) {
		permissionUsers = permissionUsers.includes(userId)
			? permissionUsers.filter((id) => id !== userId)
			: [...permissionUsers, userId];
	}
	function toggleHandoutUser(userId: string) {
		handoutUserIds = handoutUserIds.includes(userId)
			? handoutUserIds.filter((id) => id !== userId)
			: [...handoutUserIds, userId];
	}
	async function savePermissionSelection() {
		if (!permissionDialog || savingPermissions) return;
		savingPermissions = true;
		try {
			await saveLibraryPermissions(
				session,
				campaignId,
				permissionDialog.type,
				permissionDialog.key,
				currentPlayerIds(
					permissionUsers,
					participants.map((participant) => participant.userId)
				),
				permissionRestricted
			);
			if (permissionDialog.type === 'note')
				handouts = handouts.map((item) =>
					item.id === permissionDialog?.key ? { ...item, visibility: 'players' } : item
				);
			permissionDialog = null;
			message = 'Acesso atualizado.';
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível salvar as permissões do item.';
		} finally {
			savingPermissions = false;
		}
	}
	async function deleteHandout(handout: Handout) {
		try {
			await request<void>(session, `/api/v1/campaigns/${campaignId}/notes/${handout.id}`, {
				method: 'DELETE'
			});
			handouts = handouts.filter((item) => item.id !== handout.id);
		} catch {
			message = '';
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
		} catch {
			message = '';
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not delete this media.'
					: 'Não foi possível excluir esta mídia.'
			);
		} finally {
			deletingAsset = null;
		}
	}
	async function changeAudioKind(asset: Asset, event: Event) {
		if (changingAudioKind) return;
		const kind = (event.currentTarget as HTMLSelectElement).value as 'music' | 'effect';
		if (kind === asset.audioKind) return;
		changingAudioKind = asset.path;
		try {
			await request<{ path: string; kind: 'music' | 'effect' }>(
				session,
				`/api/v1/campaigns/${campaignId}/assets/audio-kind`,
				{ method: 'PUT', body: JSON.stringify({ path: asset.path, kind }) },
				'Não foi possível alterar o tipo do áudio.'
			);
			await loadAssets();
			message =
				kind === 'music'
					? 'Áudio classificado como música.'
					: 'Áudio classificado como efeito sonoro.';
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível alterar o tipo do áudio.';
			await loadAssets();
		} finally {
			changingAudioKind = null;
		}
	}
	async function loadAssets() {
		if (!supabase) return;
		const client = supabase;
		const { data, error } = await client.storage
			.from('campaign-assets')
			.list(folder(), { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
		if (error) {
			message = '';
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not load campaign media.'
					: 'Não foi possível carregar as mídias da campanha.'
			);
			return;
		}
		const listed = await Promise.all(
			(data ?? []).map(async (file) => {
				if (!isGM && file.metadata?.mimetype?.startsWith('audio/')) return null;
				const signed = await getSignedAssetUrl(session, campaignId, `${folder()}/${file.name}`);
				return signed
					? {
							name: file.name.replace(/^[a-f0-9-]+-/, '').replace(/^(?:effect|sfx|music)__/, ''),
							path: `${folder()}/${file.name}`,
							url: signed,
							type: file.metadata?.mimetype?.startsWith('audio/')
								? ('audio' as const)
								: file.metadata?.mimetype === 'application/pdf' ||
									  file.metadata?.mimetype?.startsWith('text/')
									? ('document' as const)
									: /map|scene|battle|mapa|cena/i.test(file.name)
										? ('map' as const)
										: ('image' as const),
							...(file.metadata?.mimetype?.startsWith('audio/')
								? { audioKind: audioAssetKind(file.name) }
								: {})
						}
					: null;
			})
		);
		assets = listed.filter(
			(asset): asset is Asset => asset !== null && (isGM || asset.type !== 'audio')
		);
	}
	function isSupportedFile(file: File) {
		return (
			(file.type.startsWith('image/') ||
				file.type.startsWith('audio/') ||
				file.type === 'application/pdf' ||
				file.type.startsWith('text/')) &&
			file.size <= 20 * 1024 * 1024
		);
	}
	async function uploadFiles(files: FileList | File[]) {
		if (!supabase || uploading) return;
		const selected = Array.from(files);
		if (!selected.length) return;
		const rejected = selected.filter((file) => !isSupportedFile(file));
		const accepted = selected.filter(isSupportedFile);
		if (!accepted.length) {
			message =
				$appLocale === 'en'
					? 'Choose supported media files up to 20 MB each.'
					: 'Escolha imagens, áudios ou documentos compatíveis de até 20 MB cada.';
			return;
		}
		uploading = true;
		message = rejected.length
			? $appLocale === 'en'
				? `${rejected.length} unsupported file(s) skipped.`
				: `${rejected.length} arquivo(s) incompatível(is) ignorado(s).`
			: '';
		let uploaded = 0;
		try {
			for (const file of accepted) {
				const optimized = await optimizeImage(file);
				const name = optimized.file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
				const audioPrefix = optimized.file.type.startsWith('audio/')
					? audioUploadKind === 'effect'
						? 'effect__'
						: 'music__'
					: '';
				const { error } = await supabase.storage
					.from('campaign-assets')
					.upload(`${folder()}/${crypto.randomUUID()}-${audioPrefix}${name}`, optimized.file, {
						contentType: optimized.file.type,
						cacheControl: '3600'
					});
				if (error) throw error;
				uploaded++;
			}
			await loadAssets();
			if (!rejected.length)
				message =
					$appLocale === 'en'
						? `${uploaded} media item(s) added.`
						: `${uploaded} mídia(s) adicionada(s).`;
		} catch {
			message = '';
			notifyUserRequestError(
				$appLocale === 'en'
					? 'Could not upload the selected media.'
					: 'Não foi possível enviar as mídias selecionadas.'
			);
		} finally {
			uploading = false;
		}
	}
	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files) await uploadFiles(input.files);
		input.value = '';
	}
	function dropFiles(event: DragEvent) {
		event.preventDefault();
		draggingFiles = false;
		if (event.dataTransfer?.files) void uploadFiles(event.dataTransfer.files);
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
				<label class="audio-kind-picker">
					{$appLocale === 'en' ? 'Audio type' : 'Tipo de áudio'}
					<select bind:value={audioUploadKind} aria-label="Tipo de áudio para novos arquivos">
						<option value="music">{$appLocale === 'en' ? 'Music' : 'Música'}</option>
						<option value="effect">{$appLocale === 'en' ? 'Sound effect' : 'Efeito sonoro'}</option>
					</select>
				</label>
				<label
					>{uploading
						? $appLocale === 'en'
							? 'Uploading…'
							: 'Enviando…'
						: $appLocale === 'en'
							? 'Add media'
							: 'Adicionar mídia'}<input
						id="campaign-media-upload"
						type="file"
						multiple
						accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain"
						onchange={upload}
						disabled={uploading}
					/></label
				><button onclick={() => void openNewHandout()}
					>{$appLocale === 'en' ? 'New handout' : 'Novo handout'}</button
				><button onclick={onnotes}
					>{$appLocale === 'en' ? 'Private notes' : 'Notas internas'}</button
				>
				{#if isGM}<button onclick={onhide}
						>{$appLocale === 'en' ? 'Hide presentation' : 'Ocultar imagem exibida'}</button
					>{/if}
			</div>{/if}
	</header>
	{#if message}<p class="message">{message}</p>{/if}
	{#if isGM}<button
			class="drop-zone"
			class:dragging={draggingFiles}
			onclick={() => document.getElementById('campaign-media-upload')?.click()}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ')
					document.getElementById('campaign-media-upload')?.click();
			}}
			ondragover={(event) => {
				event.preventDefault();
				draggingFiles = true;
			}}
			ondragleave={(event) => {
				if (event.currentTarget === event.target) draggingFiles = false;
			}}
			ondrop={dropFiles}
			disabled={uploading}
			aria-label={$appLocale === 'en'
				? 'Drop files to upload media'
				: 'Solte arquivos para adicionar mídias'}
		>
			<span aria-hidden="true">{uploading ? '◌' : '↥'}</span>
			<strong
				>{uploading
					? $appLocale === 'en'
						? 'Uploading media…'
						: 'Enviando mídias…'
					: $appLocale === 'en'
						? 'Drop media files here'
						: 'Arraste mídias para cá'}</strong
			>
			<small
				>{$appLocale === 'en'
					? 'or click to choose · images, audio, PDF and text up to 20 MB each'
					: 'ou clique para escolher · imagens, áudio, PDF e texto até 20 MB por arquivo'}</small
			>
		</button>{/if}
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
			<fieldset class="handout-audience">
				<legend
					>{$appLocale === 'en'
						? 'Who can see this handout?'
						: 'Quem pode ver este handout?'}</legend
				>
				<label
					><input
						type="radio"
						name="handout-audience"
						value="all"
						bind:group={handoutAudience}
					/>{$appLocale === 'en' ? 'All players' : 'Todos os jogadores'}</label
				>
				<label
					><input
						type="radio"
						name="handout-audience"
						value="selected"
						bind:group={handoutAudience}
					/>{$appLocale === 'en' ? 'Selected players' : 'Jogadores selecionados'}</label
				>
				<label
					><input
						type="radio"
						name="handout-audience"
						value="gm"
						bind:group={handoutAudience}
					/>{$appLocale === 'en' ? 'Game master only' : 'Somente narrador'}</label
				>
				{#if handoutAudience === 'selected'}<div class="handout-player-list">
						{#each participants as participant (participant.userId)}<label>
								<input
									type="checkbox"
									checked={handoutUserIds.includes(participant.userId)}
									onchange={() => toggleHandoutUser(participant.userId)}
								/>
								<span
									><strong
										>{participant.displayName ||
											($appLocale === 'en' ? 'Player' : 'Jogador')}</strong
									>{#if participant.character?.sheet?.name}<small
											>{participant.character.sheet.name}</small
										>{/if}</span
								>
							</label>{:else}<small
								>{$appLocale === 'en'
									? 'No players have joined this campaign yet.'
									: 'Nenhum jogador entrou nesta mesa ainda.'}</small
							>{/each}
					</div>{/if}
			</fieldset>
			<div>
				<button disabled={savingHandout}
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
									>{$appLocale === 'en' ? 'Players' : 'Acesso'}</button
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
			{#each [['all', $appLocale === 'en' ? 'All' : 'Todas'], ['image', $appLocale === 'en' ? 'Images' : 'Imagens'], ['map', $appLocale === 'en' ? 'Maps' : 'Mapas'], ['audio', $appLocale === 'en' ? 'Audio' : 'Áudios'], ['document', $appLocale === 'en' ? 'Documents' : 'Documentos']] as [value, label]}<button
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
							onclick={() => (preview = asset)}
							><img
								src={asset.thumbnailUrl ?? asset.url}
								alt={asset.name}
								loading="lazy"
								decoding="async"
							/></button
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
						<small
							>{asset.name}{#if asset.audioKind}<span class="audio-kind-badge">
									· {asset.audioKind === 'music'
										? $appLocale === 'en'
											? 'Music'
											: 'Música'
										: $appLocale === 'en'
											? 'Sound effect'
											: 'Efeito sonoro'}</span
								>{/if}</small
						>
						{#if isGM}<div class="asset-actions">
								{#if asset.type === 'audio'}<label class="asset-audio-kind">
										<select
											aria-label={($appLocale === 'en' ? 'Audio type for ' : 'Tipo do áudio: ') +
												asset.name}
											value={asset.audioKind ?? 'music'}
											disabled={changingAudioKind === asset.path}
											onchange={(event) => void changeAudioKind(asset, event)}
										>
											<option value="music">{$appLocale === 'en' ? 'Music' : 'Música'}</option>
											<option value="effect"
												>{$appLocale === 'en' ? 'Sound effect' : 'Efeito sonoro'}</option
											>
										</select>
									</label>{/if}
								<button
									class="asset-delete"
									aria-label={$appLocale === 'en'
										? `Delete ${asset.name}`
										: `Excluir ${asset.name}`}
									title={$appLocale === 'en' ? 'Delete media' : 'Excluir mídia'}
									onclick={() => void deleteAsset(asset)}
									disabled={deletingAsset === asset.path}>×</button
								><button
									class="asset-present"
									aria-label={$appLocale === 'en'
										? `Manage access to ${asset.name}`
										: `Gerenciar acesso a ${asset.name}`}
									onclick={() => void editPermissions('asset', asset.path, asset.name)}
									>{$appLocale === 'en' ? 'Access' : 'Acesso'}</button
								>{#if asset.type === 'image' || asset.type === 'map'}<button
										class="asset-present"
										aria-label={$appLocale === 'en'
											? `Show ${asset.name} to the table`
											: `Exibir ${asset.name} para a mesa`}
										onclick={() => onpresent({ path: asset.path, name: asset.name })}>👁</button
									>{/if}
							</div>{/if}
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
{#if permissionDialog}<div
		class="permission-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget && !savingPermissions) permissionDialog = null;
		}}
	>
		<dialog open class="permission-dialog" aria-modal="true" aria-labelledby="permission-title">
			<header>
				<div>
					<p>{$appLocale === 'en' ? 'CAMPAIGN ACCESS' : 'ACESSO DA MESA'}</p>
					<h3 id="permission-title">
						{$appLocale === 'en' ? 'Who can see this item?' : 'Quem pode ver este item?'}
					</h3>
					<span>{permissionDialog.label}</span>
				</div>
				<button
					class="dialog-close"
					onclick={() => (permissionDialog = null)}
					disabled={savingPermissions}
					aria-label={$appLocale === 'en' ? 'Close' : 'Fechar'}>×</button
				>
			</header>
			{#if loadingPermissions}<p class="permission-empty">
					{$appLocale === 'en' ? 'Loading campaign players…' : 'Carregando jogadores da mesa…'}
				</p>{:else}
				<div class="permission-modes">
					<label
						><input
							type="radio"
							name="access-mode"
							checked={!permissionRestricted}
							onchange={() => (permissionRestricted = false)}
						/>{$appLocale === 'en' ? 'All players' : 'Todos os jogadores'}</label
					>
					<label
						><input
							type="radio"
							name="access-mode"
							checked={permissionRestricted}
							onchange={() => (permissionRestricted = true)}
						/>{$appLocale === 'en' ? 'Selected players' : 'Jogadores selecionados'}</label
					>
				</div>
				{#if permissionRestricted}<div class="permission-roster">
						{#each participants as participant (participant.userId)}<label class="player-option">
								<input
									type="checkbox"
									checked={permissionUsers.includes(participant.userId)}
									onchange={() => togglePermissionUser(participant.userId)}
								/>
								<span class="player-color" aria-hidden="true"></span>
								<span
									><strong
										>{participant.displayName ||
											($appLocale === 'en' ? 'Player' : 'Jogador')}</strong
									>{#if participant.character?.sheet?.name}<small
											>{participant.character.sheet.name}</small
										>{/if}</span
								>
							</label>{:else}<p class="permission-empty">
								{$appLocale === 'en'
									? 'No players have joined this campaign yet.'
									: 'Nenhum jogador entrou nesta mesa ainda.'}
							</p>{/each}
					</div>
					<p class="permission-hint">
						{permissionUsers.length === 0
							? $appLocale === 'en'
								? 'No selected players means only the GM can see it.'
								: 'Sem jogadores selecionados, somente o narrador verá.'
							: $appLocale === 'en'
								? `${permissionUsers.length} player(s) selected.`
								: `${permissionUsers.length} jogador(es) selecionado(s).`}
					</p>{:else}<p class="permission-hint">
						{$appLocale === 'en'
							? 'Every current and future player in this campaign can see it.'
							: 'Todos os jogadores atuais e futuros desta mesa poderão ver.'}
					</p>{/if}
			{/if}
			<footer>
				<button
					class="secondary-button"
					onclick={() => (permissionDialog = null)}
					disabled={savingPermissions}>{$appLocale === 'en' ? 'Cancel' : 'Cancelar'}</button
				><button
					class="primary-button"
					onclick={() => void savePermissionSelection()}
					disabled={loadingPermissions || savingPermissions}
					>{savingPermissions
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: $appLocale === 'en'
							? 'Save access'
							: 'Salvar acesso'}</button
				>
			</footer>
		</dialog>
	</div>{/if}

<style>
	.library-view {
		min-height: 510px;
		padding: var(--mm-content-gutter, clamp(1rem, 2.5vw, 2rem));
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
	.actions .audio-kind-picker {
		display: grid;
		gap: 0.2rem;
		border: 1px solid #765d3d;
		color: #eee4d6;
		background: #211b1e;
		font-weight: 600;
	}
	.audio-kind-picker select {
		max-width: 9rem;
		border: 1px solid #554841;
		border-radius: 5px;
		padding: 0.28rem 0.4rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.drop-zone {
		display: grid;
		place-items: center;
		gap: 0.35rem;
		width: 100%;
		min-height: 118px;
		margin: 0 0 1.2rem;
		padding: 1rem;
		border: 1px dashed #806039;
		border-radius: 10px;
		color: #eee4d6;
		background: #211b1e;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease,
			transform 140ms ease;
	}
	.drop-zone:hover,
	.drop-zone.dragging {
		border-color: #e0b86f;
		background: #30241f;
	}
	.drop-zone.dragging {
		transform: scale(1.005);
	}
	.drop-zone > span {
		color: #e0b86f;
		font-size: 1.7rem;
	}
	.drop-zone strong {
		font:
			600 1rem Georgia,
			serif;
	}
	.drop-zone small {
		color: #a99c91;
		font-size: 0.75rem;
		text-align: center;
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
	.handout-form input:not([type='checkbox']):not([type='radio']),
	.handout-form textarea {
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
	.handout-audience {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 8px;
	}
	.handout-audience legend {
		padding: 0 0.25rem;
		color: #d8ad67;
		font-size: 0.8rem;
	}
	.handout-audience > label,
	.handout-player-list > label {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.handout-audience input[type='checkbox'],
	.handout-audience input[type='radio'] {
		width: auto;
		margin: 0;
		accent-color: #d8ad67;
	}
	.handout-player-list {
		display: grid;
		gap: 0.4rem;
		max-height: 9rem;
		overflow: auto;
		padding: 0.55rem;
		border-left: 2px solid #80603b;
	}
	.handout-player-list span {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.handout-player-list small {
		color: #ad9e91;
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
	.asset-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		flex: 0 0 auto;
	}
	.asset-audio-kind select {
		max-width: 8.5rem;
		border: 1px solid #5a493b;
		border-radius: 5px;
		padding: 0.28rem 0.35rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.66rem;
	}
	.asset-audio-kind select:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.asset-present {
		border: 1px solid #5a493b;
		border-radius: 5px;
		padding: 0.3rem 0.45rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.asset-present:hover,
	.handout-actions button:hover,
	.actions button:hover {
		border-color: #d8ad67;
		background: #3a2920;
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
	.permission-backdrop {
		position: fixed;
		z-index: 1100;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #080608cc;
		backdrop-filter: blur(5px);
	}
	.permission-dialog {
		position: relative;
		inset: auto;
		margin: 0;
		width: min(100%, 480px);
		max-height: min(80dvh, 680px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow: hidden;
		padding: 1.1rem;
		border: 1px solid #5a493b;
		border-radius: 12px;
		color: #eee4d6;
		background: #211b1e;
		box-shadow: 0 22px 70px #000a;
	}
	.permission-dialog header {
		align-items: flex-start;
		margin: 0;
		padding: 0 0 0.8rem;
	}
	.permission-dialog header p {
		margin: 0 0 0.3rem;
	}
	.permission-dialog h3 {
		margin: 0;
		font:
			600 1.25rem Georgia,
			serif;
	}
	.permission-dialog header span {
		display: block;
		max-width: 370px;
		margin-top: 0.35rem;
		overflow: hidden;
		color: #b9aa9d;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dialog-close {
		width: 2rem;
		height: 2rem;
		border: 1px solid #5a493b;
		border-radius: 6px;
		color: #edc77f;
		background: #171316;
		font-size: 1.2rem;
		cursor: pointer;
	}
	.permission-modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.permission-modes label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.7rem;
		padding: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		color: #d8c9b9;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.permission-roster {
		display: grid;
		gap: 0.35rem;
		max-height: 36dvh;
		overflow: auto;
		padding-right: 0.2rem;
	}
	.player-option {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
		padding: 0.6rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		background: #171316;
		cursor: pointer;
	}
	.player-option span:last-child {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.player-option strong,
	.player-option small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.player-option small {
		color: #a99c91;
	}
	.player-color {
		width: 0.65rem;
		height: 0.65rem;
		flex: 0 0 auto;
		border-radius: 50%;
		background: #d8ad67;
	}
	.permission-empty,
	.permission-hint {
		margin: 0;
		color: #b9aa9d;
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.permission-dialog footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.7rem;
		border-top: 1px solid #493c39;
	}
	.permission-dialog footer button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}
	.secondary-button {
		color: #edc77f;
		background: #2b211e;
	}
	.primary-button {
		border-color: #e0b86f !important;
		color: #26190e;
		background: #e0b86f;
	}
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	@media (max-width: 650px) {
		header {
			flex-direction: column;
		}
		.actions {
			flex-wrap: wrap;
		}
		.permission-modes {
			grid-template-columns: 1fr;
		}
	}
</style>
