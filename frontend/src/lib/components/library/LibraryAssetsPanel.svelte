<!-- eslint-disable svelte/no-navigation-without-resolve -- signed Storage URLs are external. -->
<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { appLocale } from '$lib/stores/locale';
	import type { LibraryAsset } from './libraryTypes';

	type AssetFilter = 'all' | 'image' | 'map' | 'audio' | 'document';
	type AudioSettings = { kind?: 'music' | 'effect'; looping?: boolean };
	let {
		assets,
		isGM,
		filter,
		uploading,
		deletingAsset,
		changingAudioKind,
		actions
	}: {
		assets: readonly LibraryAsset[];
		isGM: boolean;
		filter: AssetFilter;
		uploading: boolean;
		deletingAsset: string | null;
		changingAudioKind: string | null;
		actions: {
			changeFilter: (filter: AssetFilter) => void;
			upload: (files: FileList | File[]) => void;
			changeAudioSettings: (asset: LibraryAsset, settings: AudioSettings) => void;
			delete: (asset: LibraryAsset) => void;
			manageAccess: (asset: LibraryAsset) => void;
			present: (asset: LibraryAsset) => void;
		};
	} = $props();
	let draggingFiles = $state(false);
	let preview = $state<LibraryAsset | null>(null);
	type AssetGroup = {
		key: 'audio' | 'visual' | 'document' | AssetFilter;
		assets: readonly LibraryAsset[];
	};
	const visibleAssetGroups = $derived.by((): AssetGroup[] => {
		if (filter !== 'all') {
			const filtered = assets.filter((asset) => asset.type === filter);
			return filtered.length ? [{ key: filter, assets: filtered }] : [];
		}
		const groups: AssetGroup[] = [
			{ key: 'audio', assets: assets.filter((asset) => asset.type === 'audio') },
			{
				key: 'visual',
				assets: assets.filter((asset) => asset.type === 'image' || asset.type === 'map')
			},
			{ key: 'document', assets: assets.filter((asset) => asset.type === 'document') }
		];
		return groups.filter((group) => group.assets.length > 0);
	});
	const groupLabel = (key: AssetGroup['key']) => {
		if (key === 'audio') return $appLocale === 'en' ? 'Music and effects' : 'Músicas e efeitos';
		if (key === 'visual') return $appLocale === 'en' ? 'Images and maps' : 'Imagens e mapas';
		if (key === 'document') return $appLocale === 'en' ? 'Documents' : 'Documentos';
		return '';
	};
	$effect(() => {
		const previewPath = preview?.path;
		if (previewPath && !assets.some((asset) => asset.path === previewPath)) preview = null;
	});
	const filters: { value: AssetFilter; pt: string; en: string }[] = [
		{ value: 'all', pt: 'Todas', en: 'All' },
		{ value: 'image', pt: 'Imagens', en: 'Images' },
		{ value: 'map', pt: 'Mapas', en: 'Maps' },
		{ value: 'audio', pt: 'Áudios', en: 'Audio' },
		{ value: 'document', pt: 'Documentos', en: 'Documents' }
	];
	function uploadFromInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files?.length) actions.upload(input.files);
		input.value = '';
	}
	function dropFiles(event: DragEvent) {
		event.preventDefault();
		draggingFiles = false;
		if (event.dataTransfer?.files.length) actions.upload(event.dataTransfer.files);
	}
	function audioLoops(asset: LibraryAsset) {
		return asset.audioLooping ?? asset.audioKind !== 'effect';
	}
</script>

<section
	class="assets-panel"
	aria-label={$appLocale === 'en' ? 'Campaign media' : 'Mídias da campanha'}
>
	{#if isGM}
		<div class="asset-upload-actions">
			<label class="upload-button">
				{uploading
					? $appLocale === 'en'
						? 'Uploading…'
						: 'Enviando…'
					: $appLocale === 'en'
						? 'Add media'
						: 'Adicionar mídia'}
				<input
					type="file"
					multiple
					accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav,application/pdf,text/plain"
					onchange={uploadFromInput}
					disabled={uploading}
				/>
			</label>
		</div>
		<button
			class="drop-zone"
			class:dragging={draggingFiles}
			onclick={() => document.querySelector<HTMLInputElement>('.upload-button input')?.click()}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ')
					document.querySelector<HTMLInputElement>('.upload-button input')?.click();
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
			<strong>
				{uploading
					? $appLocale === 'en'
						? 'Uploading media…'
						: 'Enviando mídias…'
					: $appLocale === 'en'
						? 'Drop media files here'
						: 'Arraste mídias para cá'}
			</strong>
			<small>
				{$appLocale === 'en'
					? 'or click to choose · images, audio, PDF and text up to 20 MB each'
					: 'ou clique para escolher · imagens, áudio, PDF e texto até 20 MB por arquivo'}
			</small>
		</button>
	{/if}

	{#if assets.length}
		<nav
			class="asset-filters"
			aria-label={$appLocale === 'en' ? 'Media filters' : 'Filtros de mídia'}
		>
			{#each filters as item (item.value)}
				<button
					class:active={filter === item.value}
					onclick={() => actions.changeFilter(item.value)}
					>{$appLocale === 'en' ? item.en : item.pt}</button
				>
			{/each}
		</nav>
	{/if}

	{#if assets.length}
		{#if visibleAssetGroups.length}
			{#each visibleAssetGroups as group (group.key)}
				<section class="media-group">
					{#if filter === 'all'}<h3>{groupLabel(group.key)}</h3>{/if}
					<div class="asset-grid" class:audio-list={group.key === 'audio'}>
						{#each group.assets as asset (asset.path)}
							<article class="asset-card">
								{#if asset.type === 'image' || asset.type === 'map'}
									<button class="asset-image" onclick={() => (preview = asset)}>
										<img
											src={asset.thumbnailUrl ?? asset.url}
											alt={asset.name}
											loading="lazy"
											decoding="async"
										/>
									</button>
								{:else if asset.type === 'audio'}
									<span class="audio-mark">♫</span>
									<audio controls loop={audioLoops(asset)} src={asset.url}></audio>
								{:else}
									<span class="document-mark">▤</span>
									<a class="document-link" href={asset.url} target="_blank" rel="noreferrer">
										{$appLocale === 'en' ? 'Open document' : 'Abrir documento'}
									</a>
								{/if}
								<div class="asset-footer">
									<small>
										{asset.name}
										{#if asset.audioKind}
											<span class="audio-kind-badge">
												· {asset.audioKind === 'music'
													? $appLocale === 'en'
														? 'Music'
														: 'Música'
													: $appLocale === 'en'
														? 'Sound effect'
														: 'Efeito sonoro'}
											</span>
											<span class="audio-loop-badge">
												{audioLoops(asset)
													? $appLocale === 'en'
														? '· loops'
														: '· em loop'
													: $appLocale === 'en'
														? '· plays once'
														: '· sem loop'}
											</span>
										{/if}
									</small>
									{#if isGM}
										<div class="asset-actions">
											{#if asset.type === 'audio'}
												<label class="asset-audio-kind">
													<select
														aria-label={($appLocale === 'en'
															? 'Audio type for '
															: 'Tipo do áudio: ') + asset.name}
														value={asset.audioKind ?? 'music'}
														disabled={changingAudioKind === asset.path}
														onchange={(event) =>
															actions.changeAudioSettings(asset, {
																kind: event.currentTarget.value as 'music' | 'effect'
															})}
													>
														<option value="music">{$appLocale === 'en' ? 'Music' : 'Música'}</option
														>
														<option value="effect"
															>{$appLocale === 'en' ? 'Sound effect' : 'Efeito sonoro'}</option
														>
													</select>
												</label>
												<label class="asset-audio-loop">
													<input
														type="checkbox"
														checked={audioLoops(asset)}
														aria-label={($appLocale === 'en' ? 'Loop ' : 'Repetir em loop: ') +
															asset.name}
														disabled={changingAudioKind === asset.path}
														onchange={(event) =>
															actions.changeAudioSettings(asset, {
																looping: event.currentTarget.checked
															})}
													/>
													{$appLocale === 'en' ? 'Loop' : 'Loop'}
												</label>
											{/if}
											<button
												class="asset-delete"
												aria-label={$appLocale === 'en'
													? `Delete ${asset.name}`
													: `Excluir ${asset.name}`}
												title={$appLocale === 'en' ? 'Delete media' : 'Excluir mídia'}
												onclick={() => actions.delete(asset)}
												disabled={deletingAsset === asset.path}>×</button
											>
											<button
												class="asset-present"
												aria-label={$appLocale === 'en'
													? `Manage access to ${asset.name}`
													: `Gerenciar acesso a ${asset.name}`}
												onclick={() => actions.manageAccess(asset)}
												>{$appLocale === 'en' ? 'Access' : 'Acesso'}</button
											>
											{#if asset.type === 'image' || asset.type === 'map'}
												<button
													class="asset-present"
													aria-label={$appLocale === 'en'
														? `Show ${asset.name} to the table`
														: `Exibir ${asset.name} para a mesa`}
													onclick={() => actions.present(asset)}>👁</button
												>
											{/if}
										</div>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/each}
		{:else}
			<p class="empty-filter">
				{$appLocale === 'en'
					? 'No media matches this filter.'
					: 'Nenhuma mídia corresponde a este filtro.'}
			</p>
		{/if}
	{:else}
		<div class="empty">
			<strong>
				{isGM
					? $appLocale === 'en'
						? 'Add the first media item.'
						: 'Adicione a primeira mídia.'
					: $appLocale === 'en'
						? 'The library is still empty.'
						: 'Ainda não há mídias nesta mesa.'}
			</strong>
			<span
				>{$appLocale === 'en'
					? 'Handouts and music for this campaign will appear here.'
					: 'Handouts e trilhas desta campanha aparecerão aqui.'}</span
			>
		</div>
	{/if}
</section>

{#if preview}
	<div
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
			>
			<img src={preview.url} alt={preview.name} />
			<p>{preview.name}</p>
		</section>
	</div>
{/if}

<style>
	.asset-upload-actions {
		display: flex;
		justify-content: flex-end;
		margin: 0 0 0.65rem;
	}
	.upload-button {
		display: inline-flex;
		align-items: center;
		min-height: 2.15rem;
		padding: 0.32rem 0.65rem;
		border-radius: 7px;
		color: #26190e;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 750;
		cursor: pointer;
	}
	.upload-button input {
		display: none;
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
	.asset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.8rem;
	}
	.media-group {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.9rem;
	}
	.media-group h3 {
		margin: 0;
		color: #e0b86f;
		font-size: 0.9rem;
	}
	.asset-grid.audio-list {
		grid-template-columns: minmax(0, 1fr);
	}
	.asset-grid.audio-list article {
		grid-template-columns: auto minmax(150px, 0.8fr) minmax(240px, 1.7fr);
		align-items: center;
		gap: 0.4rem 0.75rem;
		padding: 0.42rem 0.7rem;
	}
	.asset-grid.audio-list .asset-footer {
		grid-column: 2 / -1;
	}
	.asset-grid.audio-list audio {
		grid-column: 3;
		grid-row: 1;
		width: 100%;
		height: 34px;
	}
	.asset-grid.audio-list .asset-footer {
		grid-row: 1;
		flex-wrap: nowrap;
	}
	.asset-grid.audio-list small {
		flex: 1 1 auto;
		font-size: 0.76rem;
		white-space: normal;
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
	.audio-loop-badge {
		color: #a99c91;
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
	.asset-audio-loop {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid #5a493b;
		border-radius: 5px;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.asset-audio-loop input {
		margin: 0;
		accent-color: #d8ad67;
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
	.asset-present:hover {
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
	@media (max-width: 600px) {
		.asset-grid.audio-list article {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.asset-grid.audio-list audio {
			grid-column: 1 / -1;
			grid-row: auto;
		}
		.asset-grid.audio-list .asset-footer {
			grid-column: 1 / -1;
			grid-row: auto;
			flex-wrap: wrap;
		}
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
	.empty-filter,
	.empty {
		margin: 0;
		padding: 1rem;
		border: 1px dashed #5a493b;
		border-radius: 8px;
		color: #a99c91;
		text-align: center;
	}
	.empty {
		display: grid;
		gap: 0.35rem;
		padding: 2rem;
	}
	.empty strong {
		color: #e9dcc9;
		font:
			600 1.1rem Georgia,
			serif;
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
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
</style>
