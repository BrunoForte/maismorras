<!-- eslint-disable svelte/no-navigation-without-resolve -- media URLs are external storage URLs. -->
<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';
	import { clearSignedAssetCache, getSignedAssetUrl } from '$lib/services/assetApi';
	import { notifyUserRequestError, request } from '$lib/services/httpClient';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import { audioAssetKind, audioAssetLooping } from '$lib/services/audioPlayback';
	import { listParticipants, type Participant } from '$lib/services/characterApi';
	import {
		currentPlayerIds,
		loadLibraryPermissions,
		saveLibraryPermissions
	} from '$lib/services/libraryPermissionsApi';
	import { libraryAccessMode } from '$lib/utils/libraryRules';
	import { getPresentation, type Presentation } from '$lib/services/presentationApi';
	import LibraryAssetsPanel from '$lib/components/library/LibraryAssetsPanel.svelte';
	import LibraryHandoutsPanel from '$lib/components/library/LibraryHandoutsPanel.svelte';
	import LibraryAccessDialog from '$lib/components/library/LibraryAccessDialog.svelte';
	import LibraryPresentationStatus from '$lib/components/library/LibraryPresentationStatus.svelte';
	import type {
		LibraryAccessDialogActions,
		LibraryAccessDialogModel,
		LibraryAsset,
		LibraryHandout,
		LibraryHandoutActions
	} from '$lib/components/library/libraryTypes';

	let {
		campaignId,
		sceneId,
		session,
		isGM,
		onpresent,
		onhide
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		isGM: boolean;
		onpresent: (
			asset: { path: string; name: string },
			userIds: string[],
			restricted: boolean,
			overlayVisible: boolean
		) => void;
		onhide: () => void;
	} = $props();

	let assets = $state<LibraryAsset[]>([]);
	let handouts = $state<LibraryHandout[]>([]);
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
	let presentationTarget = $state<LibraryAsset | null>(null);
	let presentationUserIds = $state<string[]>([]);
	let presentationRestricted = $state(false);
	let presentationOverlayVisible = $state(true);
	let scenePresentation = $state<Presentation | null>(null);
	let loadingPresentationTargets = $state(false);
	let permissionDialog = $state<{ type: 'asset' | 'note'; key: string; label: string } | null>(
		null
	);
	let participants = $state<Participant[]>([]);
	let permissionUsers = $state<string[]>([]);
	let permissionRestricted = $state(false);
	let loadingPermissions = $state(false);
	let savingPermissions = $state(false);
	const folder = () => `campaigns/${campaignId}/media`;
	let presentationGeneration = 0;
	$effect(() => {
		const currentSceneId = sceneId;
		const currentSession = session;
		const generation = ++presentationGeneration;
		if (!currentSceneId) {
			scenePresentation = null;
			return;
		}
		void getPresentation(currentSession, currentSceneId)
			.then((presentation) => {
				if (generation === presentationGeneration) scenePresentation = presentation;
			})
			.catch(() => {
				if (generation === presentationGeneration) scenePresentation = null;
			});
		return () => {
			presentationGeneration++;
		};
	});
	const hasActivePresentation = $derived(
		scenePresentation?.visible === true &&
			Boolean(
				scenePresentation.assetPath || scenePresentation.title || scenePresentation.description
			)
	);
	const presentationAudience = $derived.by(() => {
		if (!scenePresentation?.audienceRestricted)
			return $appLocale === 'en' ? 'All players' : 'Todos os jogadores';
		const count = scenePresentation.visibleUserIds.length;
		return $appLocale === 'en'
			? `${count} selected player${count === 1 ? '' : 's'}`
			: `${count} jogador${count === 1 ? '' : 'es'} selecionado${count === 1 ? '' : 's'}`;
	});
	const presentationName = $derived(
		scenePresentation?.title || scenePresentation?.assetPath.split('/').at(-1) || ''
	);
	onMount(() => {
		const onPresentationChanged = (event: Event) => {
			const detail = (event as CustomEvent<{ sceneId?: string }>).detail;
			if (detail?.sceneId === sceneId) {
				const currentSceneId = sceneId;
				const generation = ++presentationGeneration;
				void getPresentation(session, currentSceneId)
					.then((presentation) => {
						if (generation === presentationGeneration) scenePresentation = presentation;
					})
					.catch(() => {
						if (generation === presentationGeneration) scenePresentation = null;
					});
			}
		};
		const onPresentationState = (event: Event) => {
			const detail = (event as CustomEvent<{ sceneId?: string; presentation?: Presentation }>)
				.detail;
			if (detail?.sceneId !== sceneId || !detail.presentation) return;
			presentationGeneration++;
			const next = detail.presentation;
			const currentTime = Date.parse(scenePresentation?.updatedAt ?? '');
			const nextTime = Date.parse(next.updatedAt ?? '');
			if (Number.isFinite(currentTime) && Number.isFinite(nextTime) && nextTime < currentTime)
				return;
			scenePresentation = next;
		};
		window.addEventListener('maismorras:presentation-changed', onPresentationChanged);
		window.addEventListener('maismorras:presentation-state', onPresentationState);
		return () => {
			window.removeEventListener('maismorras:presentation-changed', onPresentationChanged);
			window.removeEventListener('maismorras:presentation-state', onPresentationState);
		};
	});

	onMount(() => {
		void loadAssets();
		void loadHandouts();
	});

	async function loadHandouts() {
		try {
			handouts = (
				await request<{ notes: LibraryHandout[] }>(session, `/api/v1/campaigns/${campaignId}/notes`)
			).notes;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível carregar os handouts.';
		}
	}

	async function saveHandout() {
		if (!isGM || !handoutTitle.trim() || savingHandout) return;
		savingHandout = true;
		message = '';
		try {
			const handout = await request<LibraryHandout>(
				session,
				editingHandoutId
					? `/api/v1/campaigns/${campaignId}/notes/${editingHandoutId}`
					: `/api/v1/campaigns/${campaignId}/notes`,
				{
					method: editingHandoutId ? 'PUT' : 'POST',
					body: JSON.stringify({ title: handoutTitle.trim(), body: handoutBody, visibility: 'gm' })
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

	async function editHandout(handout: LibraryHandout) {
		if (!isGM) return;
		editingHandoutId = handout.id;
		handoutTitle = handout.title;
		handoutBody = handout.body;
		handoutUserIds = [];
		try {
			const [roster, access] = await Promise.all([
				listParticipants(session, campaignId),
				handout.visibility === 'players'
					? loadLibraryPermissions(session, campaignId, 'note', handout.id)
					: Promise.resolve(null)
			]);
			participants = roster.participants.filter((participant) => participant.role === 'player');
			const mode = libraryAccessMode(handout.visibility === 'players', access?.restricted ?? false);
			handoutAudience = mode === 'private' ? 'gm' : mode === 'restricted' ? 'selected' : 'all';
			if (access?.restricted) {
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
		if (!isGM) return;
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

	async function openPresentationOptions(asset: LibraryAsset) {
		if (!isGM) return;
		presentationTarget = asset;
		presentationUserIds = [];
		presentationRestricted = false;
		presentationOverlayVisible = true;
		loadingPresentationTargets = true;
		try {
			const roster = await listParticipants(session, campaignId);
			participants = roster.participants.filter((participant) => participant.role === 'player');
		} catch (error) {
			presentationTarget = null;
			message = error instanceof Error ? error.message : 'Não foi possível carregar jogadores.';
		} finally {
			loadingPresentationTargets = false;
		}
	}

	function togglePresentationUser(userId: string) {
		presentationUserIds = presentationUserIds.includes(userId)
			? presentationUserIds.filter((id) => id !== userId)
			: [...presentationUserIds, userId];
	}
	function confirmPresentation() {
		if (!isGM || !presentationTarget) return;
		onpresent(
			{ path: presentationTarget.path, name: presentationTarget.name },
			currentPlayerIds(
				presentationUserIds,
				participants.map((participant) => participant.userId)
			),
			presentationRestricted,
			presentationOverlayVisible
		);
		presentationTarget = null;
	}

	async function savePermissionSelection() {
		if (!isGM || !permissionDialog || savingPermissions) return;
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
			if (permissionDialog.type === 'note') {
				handouts = handouts.map((item) =>
					item.id === permissionDialog?.key ? { ...item, visibility: 'players' } : item
				);
			}
			permissionDialog = null;
			message = 'Acesso atualizado.';
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível salvar as permissões do item.';
		} finally {
			savingPermissions = false;
		}
	}

	async function deleteHandout(handout: LibraryHandout) {
		if (!isGM) return;
		try {
			await request<void>(session, `/api/v1/campaigns/${campaignId}/notes/${handout.id}`, {
				method: 'DELETE'
			});
			handouts = handouts.filter((item) => item.id !== handout.id);
		} catch {
			message = '';
		}
	}

	async function deleteAsset(asset: LibraryAsset) {
		if (!isGM || deletingAsset) return;
		const confirmed = window.confirm(
			$appLocale === 'en'
				? `Delete “${asset.name}” from this campaign?`
				: `Excluir “${asset.name}” desta campanha?`
		);
		if (!confirmed) return;
		deletingAsset = asset.path;
		message = '';
		try {
			const supabase = await getSupabaseClient();
			if (!supabase) return;
			const { error } = await supabase.storage.from('campaign-assets').remove([asset.path]);
			if (error) throw error;
			clearSignedAssetCache(campaignId, asset.path);
			assets = assets.filter((item) => item.path !== asset.path);
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

	async function changeAudioSettings(
		asset: LibraryAsset,
		settings: { kind?: 'music' | 'effect'; looping?: boolean }
	) {
		if (!isGM || changingAudioKind) return;
		const kind = settings.kind ?? asset.audioKind ?? 'music';
		const looping =
			settings.looping ??
			(kind === (asset.audioKind ?? 'music')
				? (asset.audioLooping ?? kind === 'music')
				: kind === 'music');
		if (kind === asset.audioKind && looping === asset.audioLooping) return;
		changingAudioKind = asset.path;
		try {
			await request<{ path: string; kind: 'music' | 'effect'; looping: boolean }>(
				session,
				`/api/v1/campaigns/${campaignId}/assets/audio-kind`,
				{ method: 'PUT', body: JSON.stringify({ path: asset.path, kind, looping }) },
				'Não foi possível alterar as configurações do áudio.'
			);
			await loadAssets();
			message = `${kind === 'music' ? 'Música' : 'Efeito sonoro'} ${looping ? 'em loop' : 'sem loop'}.`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível alterar o áudio.';
			await loadAssets();
		} finally {
			changingAudioKind = null;
		}
	}

	async function loadAssets() {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { data, error } = await supabase.storage.from('campaign-assets').list(folder(), {
			limit: 100,
			sortBy: { column: 'created_at', order: 'desc' }
		});
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
							name: file.name
								.replace(/^[a-f0-9-]+-/, '')
								.replace(/^(?:effect|sfx|music)(?:_(?:loop|once))?__/, ''),
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
								? {
										audioKind: audioAssetKind(file.name),
										audioLooping: audioAssetLooping(file.name)
									}
								: {})
						}
					: null;
			})
		);
		assets = listed.filter(
			(asset): asset is LibraryAsset => asset !== null && (isGM || asset.type !== 'audio')
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
		if (!isGM || uploading) return;
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
			const supabase = await getSupabaseClient();
			if (!supabase) throw new Error('Supabase não está configurado.');
			for (const file of accepted) {
				const optimized = await optimizeImage(file);
				const name = optimized.file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
				const audioPrefix = optimized.file.type.startsWith('audio/') ? 'music_loop__' : '';
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

	const accessDialogModel = $derived.by((): LibraryAccessDialogModel | null => {
		if (presentationTarget) {
			return {
				kind: 'presentation',
				assetName: presentationTarget.name,
				loading: loadingPresentationTargets,
				restricted: presentationRestricted,
				selectedUserIds: presentationUserIds,
				participants,
				overlayVisible: presentationOverlayVisible
			};
		}
		if (permissionDialog) {
			return {
				kind: 'access',
				label: permissionDialog.label,
				loading: loadingPermissions,
				saving: savingPermissions,
				restricted: permissionRestricted,
				selectedUserIds: permissionUsers,
				participants
			};
		}
		return null;
	});
	const accessDialogActions: LibraryAccessDialogActions = {
		close: () => {
			if (presentationTarget) presentationTarget = null;
			else if (!savingPermissions) permissionDialog = null;
		},
		setRestricted: (restricted) => {
			if (presentationTarget) presentationRestricted = restricted;
			else permissionRestricted = restricted;
		},
		toggleUser: (userId) => {
			if (presentationTarget) togglePresentationUser(userId);
			else togglePermissionUser(userId);
		},
		setOverlayVisible: (visible) => (presentationOverlayVisible = visible),
		saveAccess: () => void savePermissionSelection(),
		confirmPresentation
	};
	const handoutActions: LibraryHandoutActions = {
		edit: (handout) => void editHandout(handout),
		delete: (handout) => void deleteHandout(handout),
		manageAccess: (handout) => void editPermissions('note', handout.id, handout.title),
		save: () => void saveHandout(),
		changeTitle: (value) => (handoutTitle = value),
		changeBody: (value) => (handoutBody = value),
		changeAudience: (value) => (handoutAudience = value),
		toggleUser: toggleHandoutUser
	};
</script>

<section
	class="library-view"
	aria-label={$appLocale === 'en' ? 'Campaign media' : 'Mídias da campanha'}
>
	<header>
		<div>
			<p>{$appLocale === 'en' ? 'CAMPAIGN MEDIA' : 'MÍDIAS DA CAMPANHA'}</p>
			<h2>{$appLocale === 'en' ? 'Handouts and media' : 'Handouts e mídias'}</h2>
			<span
				>{$appLocale === 'en'
					? 'Images, maps, documents, and music for this table.'
					: 'Imagens, mapas, documentos e trilhas desta mesa.'}</span
			>
			<a class="icon-catalog-link" href="/icons">Catálogo de ícones do projeto</a>
		</div>
		{#if isGM}
			<div class="actions">
				<button onclick={() => void openNewHandout()}
					>{$appLocale === 'en' ? 'New handout' : 'Novo handout'}</button
				>
			</div>
		{/if}
	</header>
	{#if isGM}
		<LibraryPresentationStatus
			active={hasActivePresentation}
			name={presentationName}
			audience={presentationAudience}
			overlayVisible={scenePresentation?.overlayVisible === true}
			{onhide}
		/>
	{/if}
	{#if message}<p class="message">{message}</p>{/if}
	<LibraryHandoutsPanel
		{handouts}
		{isGM}
		editor={{
			open: handoutOpen,
			title: handoutTitle,
			body: handoutBody,
			audience: handoutAudience,
			userIds: handoutUserIds,
			saving: savingHandout,
			participants
		}}
		actions={handoutActions}
	/>
	<LibraryAssetsPanel
		{assets}
		{isGM}
		filter={assetFilter}
		{uploading}
		{deletingAsset}
		{changingAudioKind}
		actions={{
			changeFilter: (filter) => (assetFilter = filter),
			upload: uploadFiles,
			changeAudioSettings: (asset, settings) => void changeAudioSettings(asset, settings),
			delete: (asset) => void deleteAsset(asset),
			manageAccess: (asset) => void editPermissions('asset', asset.path, asset.name),
			present: (asset) => void openPresentationOptions(asset)
		}}
	/>
</section>

{#if accessDialogModel}
	<LibraryAccessDialog model={accessDialogModel} actions={accessDialogActions} {isGM} />
{/if}

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
		align-items: center;
		flex-wrap: wrap;
	}
	.actions button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		min-height: 2.15rem;
		padding: 0.32rem 0.55rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.72rem;
		font-weight: 750;
		cursor: pointer;
		white-space: nowrap;
	}
	.icon-catalog-link {
		display: inline-block;
		margin-top: 0.45rem;
		color: #edc77f;
		font-size: 0.75rem;
		text-decoration: none;
	}
	.icon-catalog-link:hover {
		color: #fff0cd;
		text-decoration: underline;
	}
	.message {
		margin: 0 0 1rem;
		color: #f0cb85;
		font-size: 0.8rem;
	}
	.actions button:hover {
		border-color: #d8ad67;
		background: #3a2920;
	}
	@media (max-width: 650px) {
		header {
			flex-direction: column;
		}
		.actions {
			flex-wrap: wrap;
		}
	}
</style>
