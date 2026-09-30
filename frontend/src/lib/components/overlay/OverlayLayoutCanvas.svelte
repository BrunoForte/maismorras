<script lang="ts">
	import type { OverlayBlock } from '$lib/utils/overlay/overlayLayoutRules';
	let {
		blocks,
		selectedId,
		backgroundPreview,
		snapToGrid,
		onSnapChange,
		onSelect,
		onDragStart,
		onDropPosition,
		onResizeStart
	}: {
		blocks: OverlayBlock[];
		selectedId: string;
		backgroundPreview: string;
		snapToGrid: boolean;
		onSnapChange: (enabled: boolean) => void;
		onSelect: (id: string) => void;
		onDragStart: (event: DragEvent, id: string) => void;
		onDropPosition: (id: string | undefined, x: number, y: number) => void;
		onResizeStart: (event: PointerEvent, id: string) => void;
	} = $props();
	function drop(event: DragEvent) {
		event.preventDefault();
		const rect =
			event.currentTarget instanceof HTMLElement
				? event.currentTarget.getBoundingClientRect()
				: null;
		if (!rect?.width || !rect.height) return;
		const x = ((event.clientX - rect.left) / rect.width) * 100;
		const y = ((event.clientY - rect.top) / rect.height) * 100;
		onDropPosition(event.dataTransfer?.getData('text/plain'), x, y);
	}
</script>

<label class="snap-toggle"
	><input
		type="checkbox"
		checked={snapToGrid}
		onchange={(event) => onSnapChange(event.currentTarget.checked)}
	/> Alinhar à grade</label
>
<div
	class="workspace"
	role="application"
	aria-label="Área para posicionar os blocos da overlay"
	ondragover={(event) => event.preventDefault()}
	ondrop={drop}
	style:background-image={backgroundPreview ? `url(${backgroundPreview})` : undefined}
>
	{#if !backgroundPreview}<span class="transparent-hint">TRANSPARÊNCIA · FUNDO DEFINIDO NO OBS</span
		>{/if}
	{#each blocks as block (block.id)}<button
			class="block"
			class:selected={selectedId === block.id}
			class:hidden={!block.visible}
			draggable="true"
			onclick={() => onSelect(block.id)}
			ondragstart={(event) => onDragStart(event, block.id)}
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
				aria-disabled={block.locked}
				onpointerdown={(event) => onResizeStart(event, block.id)}
			></span>
		</button>{/each}
</div>

<style>
	.snap-toggle {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		margin-bottom: 0.5rem;
		color: #c4b6a5;
		font-size: 0.72rem;
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
	.block:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	.block.hidden {
		opacity: 0.3;
	}
</style>
