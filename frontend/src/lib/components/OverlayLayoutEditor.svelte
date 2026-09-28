<script lang="ts">
	import { onMount } from 'svelte';

	import { optimizeImage } from '$lib/services/imageProcessing';
	import type { Session } from '@supabase/supabase-js';
	import { supabase } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { request } from '$lib/services/httpClient';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	let {
		campaignId,
		sceneId,
		session
	}: { campaignId: string; sceneId: string; session: Session | null } = $props();
	type Block = {
		id: string;
		label: string;
		x: number;
		y: number;
		width: number;
		height: number;
		fontSize: number;
		color: string;
		opacity: number;
		borderColor: string;
		borderWidth: number;
		shadow: boolean;
		visible: boolean;
		locked: boolean;
	};
	type Layout = {
		background: string;
		blocks: Block[];
		livekitUrl: string;
		livekitRoom: string;
		livekitToken: string;
	};
	const defaults = (): Layout => ({
		background: '',
		livekitUrl: '',
		livekitRoom: '',
		livekitToken: '',
		blocks: [
			{
				id: 'initiative',
				label: 'Barra de iniciativa',
				x: 50,
				y: 7,
				width: 94,
				height: 15,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'host-camera',
				label: 'Câmera do narrador',
				x: 11,
				y: 17,
				width: 20,
				height: 23,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'active-character',
				label: 'Ficha do turno',
				x: 87,
				y: 49,
				width: 23,
				height: 43,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			{
				id: 'dice',
				label: 'Dados 3D',
				x: 50,
				y: 57,
				width: 36,
				height: 52,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			},
			...Array.from({ length: 5 }, (_, index) => ({
				id: 'camera-' + (index + 1),
				label: 'Câmera de jogador ' + (index + 1),
				x: 10 + index * 20,
				y: 88,
				width: 18,
				height: 19,
				fontSize: 0.8,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			}))
		]
	});
	let layout = $state<Layout>(defaults());
	let profiles = $state<Record<string, Layout>>({ Principal: defaults() });
	let activeProfile = $state('Principal');
	let snapToGrid = $state(true);
	let selectedId = $state('map');
	let status = $state('');
	let saving = $state(false);
	let backgroundPreview = $state('');
	let layoutSocket: SceneSocket | null = null;
	const key = () => `maismorras:overlay-layout:${campaignId}:${sceneId}`;
	function normalize(value: Partial<Layout>): Layout {
		const base = defaults();
		return {
			...base,
			...value,
			blocks: base.blocks.map((fallback) => ({
				...fallback,
				...(value.blocks ?? []).find((item) => item.id === fallback.id)
			}))
		};
	}
	function loadDocument(value: unknown) {
		const document = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		if (document.profiles && typeof document.profiles === 'object') {
			profiles = Object.fromEntries(
				Object.entries(document.profiles).map(([name, item]) => [
					name,
					normalize(item as Partial<Layout>)
				])
			);
			activeProfile = profiles[String(document.activeProfile)]
				? String(document.activeProfile)
				: (Object.keys(profiles)[0] ?? 'Principal');
			layout = profiles[activeProfile] ?? defaults();
		} else {
			layout = normalize(document as Partial<Layout>);
			profiles = { Principal: layout };
			activeProfile = 'Principal';
		}
	}
	function selectProfile(name: string) {
		profiles[activeProfile] = layout;
		activeProfile = name;
		layout = profiles[name] ?? defaults();
	}
	function createProfile() {
		const name = window
			.prompt('Nome do novo layout', `Layout ${Object.keys(profiles).length + 1}`)
			?.trim();
		if (!name || profiles[name]) return;
		profiles[activeProfile] = layout;
		profiles[name] = structuredClone(layout);
		activeProfile = name;
		layout = profiles[name];
	}
	function renameProfile() {
		const name = window.prompt('Novo nome do layout', activeProfile)?.trim();
		if (!name || name === activeProfile || profiles[name]) return;
		profiles[name] = profiles[activeProfile];
		delete profiles[activeProfile];
		activeProfile = name;
	}
	function deleteProfile() {
		if (
			Object.keys(profiles).length <= 1 ||
			!window.confirm(`Excluir o layout “${activeProfile}”?`)
		)
			return;
		delete profiles[activeProfile];
		activeProfile = Object.keys(profiles)[0];
		layout = profiles[activeProfile];
	}
	onMount(() => {
		if (!campaignId || !sceneId || typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem(key());
			loadDocument(saved ? JSON.parse(saved) : {});
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
			layout = defaults();
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
				loadDocument(body.layout);
				void resolveBackground(layout.background);
				localStorage.setItem(key(), JSON.stringify({ activeProfile, profiles }));
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
		loadDocument(document);
		await resolveBackground(layout.background);
		localStorage.setItem(key(), JSON.stringify({ activeProfile, profiles }));
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
	function snapPosition(id: string | undefined, x: number, y: number) {
		const item = layout.blocks.find((block) => block.id === id);
		if (!item) return { x, y };
		const others = layout.blocks.filter((block) => block.id !== id);
		const halfW = item.width / 2;
		const halfH = item.height / 2;
		const xs = [halfW, 50, 100 - halfW];
		const ys = [halfH, 50, 100 - halfH];
		for (const other of others) {
			xs.push(other.x - other.width / 2, other.x + other.width / 2, other.x);
			ys.push(other.y - other.height / 2, other.y + other.height / 2, other.y);
		}
		const nearest = (value: number, values: number[]) => {
			const candidate = values.reduce((best, current) =>
				Math.abs(current - value) < Math.abs(best - value) ? current : best
			);
			return Math.abs(candidate - value) <= 1.5 ? candidate : value;
		};
		return {
			x: Math.max(halfW, Math.min(100 - halfW, nearest(x, xs))),
			y: Math.max(halfH, Math.min(100 - halfH, nearest(y, ys)))
		};
	}
	function drop(event: DragEvent) {
		event.preventDefault();
		const id = event.dataTransfer?.getData('text/plain');
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const rawX = ((event.clientX - rect.left) / rect.width) * 100;
		const rawY = ((event.clientY - rect.top) / rect.height) * 100;
		const x = snapToGrid ? Math.round(rawX / 2) * 2 : rawX;
		const y = snapToGrid ? Math.round(rawY / 2) * 2 : rawY;
		const snapped = snapPosition(id, x, y);
		layout.blocks = layout.blocks.map((block) =>
			block.id === id && !block.locked ? { ...block, x: snapped.x, y: snapped.y } : block
		);
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
			const itemLeft = item.x - item.width / 2;
			const itemTop = item.y - item.height / 2;
			item.width = Math.max(
				8,
				Math.min(96, ((moveEvent.clientX - rect.left) / rect.width) * 100 - itemLeft)
			);
			item.height = Math.max(
				6,
				Math.min(96, ((moveEvent.clientY - rect.top) / rect.height) * 100 - itemTop)
			);
			layout.blocks = [...layout.blocks];
		};
		const stop = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop, { once: true });
	}
	const selected = () => layout.blocks.find((item) => item.id === selectedId);
	function updateSelected(
		field: 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'opacity',
		value: string
	) {
		const item = selected();
		const number = Number(value);
		if (!item || !Number.isFinite(number)) return;
		const max =
			field === 'fontSize'
				? 3
				: field === 'opacity'
					? 100
					: field === 'width' || field === 'height'
						? 100
						: field === 'x'
							? 100 - item.width / 2
							: field === 'y'
								? 100 - item.height / 2
								: 100;
		const min =
			field === 'fontSize'
				? 0.5
				: field === 'width'
					? 8
					: field === 'height'
						? 6
						: field === 'x'
							? item.width / 2
							: field === 'y'
								? item.height / 2
								: 0;
		item[field] = Math.max(min, Math.min(max, number));
		layout.blocks = [...layout.blocks];
	}
	async function save() {
		if (saving) return;
		saving = true;
		profiles[activeProfile] = layout;
		const document = { activeProfile, profiles };
		localStorage.setItem(key(), JSON.stringify(document));
		try {
			if (session?.access_token) {
				await request(
					session,
					`/api/v1/scenes/${sceneId}/overlay-layout`,
					{ method: 'PUT', body: JSON.stringify(document) },
					'Não foi possível salvar a overlay no servidor.'
				);
			}
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
		layout = defaults();
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
	<div class="profile-bar" aria-label="Perfis de layout">
		<label
			>Perfil ativo<select
				value={activeProfile}
				onchange={(event) => selectProfile(event.currentTarget.value)}
				>{#each Object.keys(profiles) as name (name)}<option value={name}>{name}</option
					>{/each}</select
			></label
		>
		<button class="secondary-button" onclick={createProfile}>Duplicar</button>
		<button class="secondary-button" onclick={renameProfile}>Renomear</button>
		<button
			class="secondary-button danger"
			onclick={deleteProfile}
			disabled={Object.keys(profiles).length <= 1}>Excluir</button
		>
	</div>
	<p class="hint">
		Arraste e redimensione os elementos. A câmera do narrador fica sobre a iniciativa; as câmeras
		dos jogadores ficam na base, à frente dos dados. Sem imagem de fundo, a overlay fica
		transparente para usar o cenário do OBS.
	</p>
	<label class="snap-toggle"
		><input type="checkbox" bind:checked={snapToGrid} /> Alinhar à grade</label
	>
	<div class="background-controls">
		<strong>Fundo da overlay</strong>
		<span>{layout.background ? 'Imagem da campanha' : 'Transparente — usar o fundo do OBS'}</span>
		<label class="upload"
			>Escolher imagem <input type="file" accept="image/*" onchange={upload} /></label
		>
		<button class="secondary-button" onclick={useTransparentBackground}>Usar transparente</button>
	</div>
	<div class="livekit-fields">
		<label>LiveKit URL<input bind:value={layout.livekitUrl} placeholder="wss://..." /></label><label
			>Sala<input bind:value={layout.livekitRoom} placeholder="mesa-1" /></label
		><label
			>Token temporário<input
				bind:value={layout.livekitToken}
				type="password"
				placeholder="JWT de curta duração"
			/></label
		>
	</div>
	<div
		class="workspace"
		role="application"
		aria-label="Área para posicionar os blocos da overlay"
		ondragover={(event) => event.preventDefault()}
		ondrop={drop}
		style:background-image={backgroundPreview ? `url(${backgroundPreview})` : undefined}
	>
		{#if !backgroundPreview}<span class="transparent-hint"
				>TRANSPARÊNCIA · FUNDO DEFINIDO NO OBS</span
			>{/if}
		{#each layout.blocks as block (block.id)}<button
				class="block"
				class:selected={selectedId === block.id}
				class:hidden={!block.visible}
				draggable="true"
				onclick={() => (selectedId = block.id)}
				ondragstart={(event) => dragStart(event, block.id)}
				style={`left:${block.x}%;top:${block.y}%;width:${block.width}%;height:${block.height}%;font-size:${block.fontSize}rem;color:${block.color};opacity:${block.opacity / 100};border-color:${block.borderColor};border-width:${block.borderWidth}px;box-shadow:${block.shadow ? '0 10px 24px #0008' : 'none'}`}
			>
				{block.label}
				<span
					class="resize-handle"
					aria-label="Redimensionar"
					role="slider"
					tabindex="0"
					aria-valuenow={block.width}
					aria-valuemin="8"
					aria-valuemax="96"
					onpointerdown={(event) => resizeStart(event, block.id)}
				></span>
			</button>{/each}
	</div>
	{#if selected()}<div class="properties">
			<strong>Elemento: {selected()?.label}</strong><label
				>X (%)<input
					type="number"
					min="0"
					max="94"
					value={selected()?.x}
					onchange={(event) => updateSelected('x', event.currentTarget.value)}
				/></label
			><label
				>Y (%)<input
					type="number"
					min="0"
					max="94"
					value={selected()?.y}
					onchange={(event) => updateSelected('y', event.currentTarget.value)}
				/></label
			><label>
				Largura (%)<input
					type="number"
					min="1"
					max="100"
					value={selected()?.width}
					onchange={(event) => updateSelected('width', event.currentTarget.value)}
				/></label
			><label>
				Altura (%)<input
					type="number"
					min="1"
					max="100"
					value={selected()?.height}
					onchange={(event) => updateSelected('height', event.currentTarget.value)}
				/></label
			><label>
				Fonte (rem)<input
					type="number"
					min="0.5"
					max="3"
					step="0.1"
					value={selected()?.fontSize}
					onchange={(event) => updateSelected('fontSize', event.currentTarget.value)}
				/></label
			><label>
				Opacidade (%)<input
					type="number"
					min="0"
					max="100"
					value={selected()?.opacity}
					onchange={(event) => updateSelected('opacity', event.currentTarget.value)}
				/></label
			><label>
				Cor<input
					type="color"
					value={selected()?.color}
					onchange={(event) => {
						const item = selected();
						if (item) {
							item.color = event.currentTarget.value;
							layout.blocks = [...layout.blocks];
						}
					}}
				/></label
			><label>
				Borda (px)<input
					type="number"
					min="0"
					max="8"
					value={selected()?.borderWidth}
					onchange={(event) => {
						const item = selected();
						if (item) {
							item.borderWidth = Number(event.currentTarget.value);
							layout.blocks = [...layout.blocks];
						}
					}}
				/>
			</label><label>
				Cor da borda<input
					type="color"
					value={selected()?.borderColor}
					onchange={(event) => {
						const item = selected();
						if (item) {
							item.borderColor = event.currentTarget.value;
							layout.blocks = [...layout.blocks];
						}
					}}
				/>
			</label><label class="lock">
				<input
					type="checkbox"
					checked={selected()?.shadow}
					onchange={(event) => {
						const item = selected();
						if (item) {
							item.shadow = event.currentTarget.checked;
							layout.blocks = [...layout.blocks];
						}
					}}
				/> Sombra
			</label><label class="lock"
				><input
					type="checkbox"
					checked={selected()?.locked}
					onchange={(event) => {
						const item = selected();
						if (item) {
							item.locked = event.currentTarget.checked;
							layout.blocks = [...layout.blocks];
						}
					}}
				/> Bloquear posição</label
			>
		</div>{/if}
	<div class="visibility">
		{#each layout.blocks as block (block.id)}<label
				><input type="checkbox" bind:checked={block.visible} /> {block.label}</label
			>{/each}
	</div>
	{#if status}<small class="status">{status}</small>{/if}
</section>

<style>
	.overlay-editor button,
	.overlay-editor input,
	.overlay-editor select {
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
	.overlay-editor .secondary-button.danger {
		border-color: #8f5049;
		color: #efaaa0;
		background: rgba(105, 45, 34, 0.22);
	}
	.overlay-editor .secondary-button.danger:hover:not(:disabled) {
		border-color: #d77c6f;
		background: rgba(105, 45, 34, 0.42);
	}
	.overlay-editor {
		min-width: 0;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
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
	.snap-toggle {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: #c4b6a5;
		font-size: 0.72rem;
		margin-bottom: 0.5rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.profile-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.45rem;
		margin: 0.8rem 0;
	}
	.profile-bar label {
		display: grid;
		gap: 0.2rem;
		color: #b9aa9b;
		font-size: 0.68rem;
	}
	.profile-bar select {
		min-width: 10rem;
		border: 1px solid #51443a;
		border-radius: 6px;
		padding: 0.4rem;
		color: #eee4d6;
		background: #211c1e;
	}
	.profile-bar .danger {
		color: #efaaa0;
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0 0.8rem;
		color: #d8c9b9;
		font-size: 0.75rem;
	}
	.background-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin: 0.35rem 0 0.8rem;
		color: #c4b6a5;
		font-size: 0.72rem;
	}
	.background-controls strong {
		color: #f0e0c8;
	}
	.background-controls .upload {
		margin: 0;
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
	.workspace {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		height: auto;
		min-height: 0;
		max-height: none;
		overflow: hidden;
		border: 1px dashed #806039;
		border-radius: 10px;
		background-color: #151019;
		background-image:
			linear-gradient(45deg, #201a23 25%, transparent 25%),
			linear-gradient(-45deg, #201a23 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #201a23 75%),
			linear-gradient(-45deg, transparent 75%, #201a23 75%);
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
		background-size: 16px 16px;
		background-position: center;
		background-size: cover;
	}
	.transparent-hint {
		position: absolute;
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		color: #a99c91;
		font-size: clamp(0.55rem, 1vw, 0.8rem);
		font-weight: 800;
		letter-spacing: 0.13em;
		pointer-events: none;
	}
	.block {
		position: absolute;
		min-width: 7rem;
		border: 1px solid #d8ad67;
		border-radius: 7px;
		padding: 0.45rem 0.6rem;
		color: #f7eedf;
		background: #171219dd;
		font-size: 0.7rem;
		cursor: grab;
		transform: translate(-50%, -50%);
		box-sizing: border-box;
	}
	.resize-handle {
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 10px;
		height: 10px;
		border-right: 2px solid #f0cb85;
		border-bottom: 2px solid #f0cb85;
		cursor: nwse-resize;
	}
	.block.selected {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	.properties {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		align-items: center;
		gap: 0.55rem;
		margin-top: 0.7rem;
		color: #c4b6a5;
		font-size: 0.72rem;
	}
	.properties strong {
		grid-column: 1 / -1;
	}
	.properties label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #b9aa9b;
		font-size: 0.68rem;
	}
	.properties input {
		width: 4.5rem;
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 5px;
		padding: 0.3rem;
		color: #eee4d6;
		background: #211c1e;
	}
	.properties .lock {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.block.hidden {
		opacity: 0.3;
	}
	.visibility {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 0.7rem;
		color: #c4b6a5;
		font-size: 0.72rem;
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
