<script lang="ts">
	let { campaignId, sceneId }: { campaignId: string; sceneId: string } = $props();
	type Block = { id: string; label: string; x: number; y: number; visible: boolean };
	type Layout = { background: string; blocks: Block[] };
	const defaults = (): Layout => ({
		background: '',
		blocks: [
			{ id: 'header', label: 'Cabeçalho', x: 4, y: 4, visible: true },
			{ id: 'map', label: 'Mapa e tokens', x: 4, y: 16, visible: true },
			{ id: 'cameras', label: 'Câmeras', x: 4, y: 78, visible: true },
			{ id: 'rolls', label: 'Rolagens', x: 76, y: 16, visible: true }
		]
	});
	let layout = $state<Layout>(defaults());
	let status = $state('');
	const key = () => `maismorras:overlay-layout:${campaignId}:${sceneId}`;
	$effect(() => {
		if (!campaignId || !sceneId || typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem(key());
			layout = saved ? { ...defaults(), ...JSON.parse(saved) } : defaults();
		} catch {
			layout = defaults();
		}
	});
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
		layout.blocks = layout.blocks.map((block) => (block.id === id ? { ...block, x, y } : block));
	}
	function save() {
		localStorage.setItem(key(), JSON.stringify(layout));
		status = 'Layout da overlay salvo para esta cena.';
	}
	function reset() {
		layout = defaults();
		localStorage.removeItem(key());
		status = 'Layout restaurado.';
	}
	function upload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file || !file.type.startsWith('image/png')) {
			status = 'Escolha um arquivo PNG.';
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			layout.background = String(reader.result);
			status = 'Fundo carregado. Salve para aplicar.';
		};
		reader.readAsDataURL(file);
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
				onclick={save}>Salvar layout</button
			>
		</div>
	</header>
	<p class="hint">Arraste os blocos no quadro. Cada cena possui uma configuração independente.</p>
	<label class="upload">Fundo PNG <input type="file" accept="image/png" onchange={upload} /></label>
	<div
		class="workspace"
		role="application"
		aria-label="Área para posicionar os blocos da overlay"
		ondragover={(event) => event.preventDefault()}
		ondrop={drop}
		style:background-image={layout.background ? `url(${layout.background})` : undefined}
	>
		{#each layout.blocks as block (block.id)}<button
				class="block"
				class:hidden={!block.visible}
				draggable="true"
				ondragstart={(event) => dragStart(event, block.id)}
				style={`left:${block.x}%;top:${block.y}%`}
			>
				{block.label}
			</button>{/each}
	</div>
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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.upload {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0 0.8rem;
		color: #d8c9b9;
		font-size: 0.75rem;
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
