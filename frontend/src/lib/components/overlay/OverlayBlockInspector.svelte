<script lang="ts">
	import type { OverlayBlock, OverlayBlockProperty } from '$lib/utils/overlay/overlayLayoutRules';
	let {
		selected,
		blocks,
		onUpdate
	}: {
		selected: OverlayBlock | undefined;
		blocks: OverlayBlock[];
		onUpdate: (id: string, property: OverlayBlockProperty, value: string | boolean) => void;
	} = $props();
</script>

{#if selected}<div class="properties">
		<strong>Elemento: {selected.label}</strong>
		<label
			>X (%)<input
				type="number"
				min="0"
				max="94"
				value={selected.x}
				onchange={(event) => onUpdate(selected.id, 'x', event.currentTarget.value)}
			/></label
		>
		<label
			>Y (%)<input
				type="number"
				min="0"
				max="94"
				value={selected.y}
				onchange={(event) => onUpdate(selected.id, 'y', event.currentTarget.value)}
			/></label
		>
		<label
			>Largura (%)<input
				type="number"
				min="1"
				max="100"
				value={selected.width}
				onchange={(event) => onUpdate(selected.id, 'width', event.currentTarget.value)}
			/></label
		>
		<label
			>Altura (%)<input
				type="number"
				min="1"
				max="100"
				value={selected.height}
				onchange={(event) => onUpdate(selected.id, 'height', event.currentTarget.value)}
			/></label
		>
		<label
			>Fonte (rem)<input
				type="number"
				min="0.5"
				max="3"
				step="0.1"
				value={selected.fontSize}
				onchange={(event) => onUpdate(selected.id, 'fontSize', event.currentTarget.value)}
			/></label
		>
		<label
			>Opacidade (%)<input
				type="number"
				min="0"
				max="100"
				value={selected.opacity}
				onchange={(event) => onUpdate(selected.id, 'opacity', event.currentTarget.value)}
			/></label
		>
		<label
			>Cor<input
				type="color"
				value={selected.color}
				onchange={(event) => onUpdate(selected.id, 'color', event.currentTarget.value)}
			/></label
		>
		<label
			>Borda (px)<input
				type="number"
				min="0"
				max="8"
				value={selected.borderWidth}
				onchange={(event) => onUpdate(selected.id, 'borderWidth', event.currentTarget.value)}
			/></label
		>
		<label
			>Cor da borda<input
				type="color"
				value={selected.borderColor}
				onchange={(event) => onUpdate(selected.id, 'borderColor', event.currentTarget.value)}
			/></label
		>
		<label class="lock"
			><input
				type="checkbox"
				checked={selected.shadow}
				onchange={(event) => onUpdate(selected.id, 'shadow', event.currentTarget.checked)}
			/> Sombra</label
		>
		<label class="lock"
			><input
				type="checkbox"
				checked={selected.locked}
				onchange={(event) => onUpdate(selected.id, 'locked', event.currentTarget.checked)}
			/> Bloquear posição</label
		>
	</div>{/if}
<div class="visibility">
	{#each blocks as block (block.id)}<label
			><input
				type="checkbox"
				checked={block.visible}
				onchange={(event) => onUpdate(block.id, 'visible', event.currentTarget.checked)}
			/>
			{block.label}</label
		>{/each}
</div>

<style>
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
		box-sizing: border-box;
		max-width: 100%;
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
	.visibility {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 0.7rem;
		color: #c4b6a5;
		font-size: 0.72rem;
	}
</style>
