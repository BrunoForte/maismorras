<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { apiBase } from '$lib/services/apiBase';
	import { supabase } from '$lib/services/supabase';
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
				id: 'header',
				label: 'Cabeçalho',
				x: 4,
				y: 4,
				width: 42,
				height: 10,
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
				id: 'map',
				label: 'Mapa e tokens',
				x: 4,
				y: 16,
				width: 68,
				height: 58,
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
				id: 'cameras',
				label: 'Câmeras',
				x: 4,
				y: 78,
				width: 68,
				height: 18,
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
				id: 'rolls',
				label: 'Rolagens',
				x: 76,
				y: 16,
				width: 20,
				height: 58,
				fontSize: 1,
				color: '#f0e0c8',
				opacity: 100,
				borderColor: '#d8ad67',
				borderWidth: 1,
				shadow: true,
				visible: true,
				locked: false
			}
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
		} catch {
			layout = defaults();
		}
	});
	async function loadRemote() {
		if (!session?.access_token) return;
		try {
			const response = await fetch(`${apiBase}/api/v1/scenes/${sceneId}/overlay-layout`, {
				headers: { Authorization: `Bearer ${session.access_token}` }
			});
			if (!response.ok) return;
			const body = await response.json();
			if (body.layout && Object.keys(body.layout).length) {
				loadDocument(body.layout);
				void resolveBackground(layout.background);
				localStorage.setItem(key(), JSON.stringify({ activeProfile, profiles }));
			}
		} catch {
			/* local layout remains available offline */
		}
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
		if (!supabase) return;
		const { data } = await supabase.storage.from('campaign-assets').createSignedUrl(path, 3600);
		backgroundPreview = data?.signedUrl ?? '';
	}
	function dragStart(event: DragEvent, id: string) {
		event.dataTransfer?.setData('text/plain', id);
	}
	function drop(event: DragEvent) {
		event.preventDefault();
		const id = event.dataTransfer?.getData('text/plain');
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = Math.max(0, Math.min(94, ((event.clientX - rect.left) / rect.width) * 100));
		const y = Math.max(0, Math.min(94, ((event.clientY - rect.top) / rect.height) * 100));
		const snappedX = snapToGrid ? Math.round(x / 2) * 2 : x;
		const snappedY = snapToGrid ? Math.round(y / 2) * 2 : y;
		layout.blocks = layout.blocks.map((block) =>
			block.id === id && !block.locked ? { ...block, x: snappedX, y: snappedY } : block
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
			item.width = Math.max(
				8,
				Math.min(96, ((moveEvent.clientX - rect.left) / rect.width) * 100 - item.x)
			);
			item.height = Math.max(
				6,
				Math.min(96, ((moveEvent.clientY - rect.top) / rect.height) * 100 - item.y)
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
						: 94;
		item[field] = Math.max(field === 'fontSize' ? 0.5 : 0, Math.min(max, number));
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
				const response = await fetch(`${apiBase}/api/v1/scenes/${sceneId}/overlay-layout`, {
					method: 'PUT',
					headers: {
						Authorization: `Bearer ${session.access_token}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(document)
				});
				if (!response.ok)
					throw new Error(
						response.status === 403
							? 'Você não tem permissão para editar esta overlay.'
							: 'Não foi possível salvar a overlay no servidor.'
					);
			}
			if ('BroadcastChannel' in window) {
				const channel = new BroadcastChannel(`maismorras:overlay:${campaignId}`);
				channel.postMessage({ type: 'layout-change', sceneId });
				channel.close();
			}
			status = 'Layout da overlay salvo para esta cena.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Não foi possível salvar a overlay.';
		} finally {
			saving = false;
		}
	}
	function reset() {
		layout = defaults();
		profiles = { Principal: layout };
		activeProfile = 'Principal';
		localStorage.removeItem(key());
		status = 'Layout restaurado.';
	}
	async function upload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || file.type !== 'image/png') {
			status = 'Escolha um arquivo PNG.';
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			status = 'O fundo deve ter no máximo 8 MB.';
			return;
		}
		if (supabase && session?.user.id) {
			status = 'Enviando fundo…';
			const path = `campaigns/${campaignId}/overlays/${sceneId}/${crypto.randomUUID()}.png`;
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(path, file, { contentType: 'image/png', upsert: false });
			if (error) {
				status = 'Não foi possível enviar o fundo.';
				return;
			}
			layout.background = path;
			backgroundPreview = URL.createObjectURL(file);
			status = 'Fundo enviado. Salve para aplicar.';
			return;
		}
		status = 'Faça login para enviar o fundo da overlay.';
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
	<p class="hint">Arraste os blocos no quadro. Cada cena possui uma configuração independente.</p>
	<label class="snap-toggle"
		><input type="checkbox" bind:checked={snapToGrid} /> Alinhar à grade</label
	>
	<label class="upload">Fundo PNG <input type="file" accept="image/png" onchange={upload} /></label>
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
		min-height: 270px;
		overflow: hidden;
		border: 1px dashed #806039;
		border-radius: 10px;
		background-color: #151019;
		background-position: center;
		background-size: cover;
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
		display: grid;
		gap: 0.2rem;
		color: #b9aa9b;
		font-size: 0.68rem;
	}
	.properties input {
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 6px;
		padding: 0.3rem;
		color: #eee4d6;
		background: #211c1e;
	}
	.properties .lock {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.properties label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.properties input {
		width: 4.5rem;
		border: 1px solid #51443a;
		border-radius: 5px;
		padding: 0.3rem;
		color: #eee4d6;
		background: #211c1e;
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
