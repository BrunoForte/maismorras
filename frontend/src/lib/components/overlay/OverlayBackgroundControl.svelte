<script lang="ts">
	let {
		background,
		onUpload,
		onTransparent
	}: {
		background: string;
		onUpload: (event: Event) => void;
		onTransparent: () => void;
	} = $props();
</script>

<div class="background-controls">
	<strong>Fundo da overlay</strong>
	<span>{background ? 'Imagem da campanha' : 'Transparente — usar o fundo do OBS'}</span>
	<label class="upload"
		>Escolher imagem <input type="file" accept="image/*" onchange={onUpload} /></label
	>
	<button class="secondary-button" onclick={onTransparent}>Usar transparente</button>
</div>

<style>
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
	.upload {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0 0.8rem;
		color: #d8c9b9;
		font-size: 0.75rem;
	}
	.upload input {
		box-sizing: border-box;
		max-width: 100%;
	}
	.background-controls .upload {
		margin: 0;
	}
	.background-controls button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.75rem;
		color: #edc77f;
		background: #2b211e;
		font: inherit;
		font-size: 0.74rem;
		font-weight: 750;
		cursor: pointer;
	}
	.background-controls button:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #3a2920;
	}
	.background-controls button:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
</style>
