<script lang="ts">
	import type { AppLocale } from '$lib/utils/speciesRules';

	let {
		locale,
		characterName,
		portraitPreview,
		portraitBusy,
		portraitPrompt = $bindable(''),
		uploadPortrait,
		generatePortrait
	}: {
		locale: AppLocale;
		characterName: string;
		portraitPreview: string | null;
		portraitBusy: boolean;
		portraitPrompt?: string;
		uploadPortrait: (event: Event) => void;
		generatePortrait: () => void | Promise<void>;
	} = $props();
</script>

<section
	class="portrait-editor"
	aria-label={locale === 'en' ? 'Character portrait' : 'Retrato do personagem'}
>
	<div class="portrait-preview">
		{#if portraitPreview}<img
				src={portraitPreview}
				alt={`Retrato de ${characterName || 'personagem'}`}
			/>{:else}<span>◈</span>{/if}
	</div>
	<div>
		<h3>{locale === 'en' ? 'Portrait and token' : 'Retrato e token'}</h3>
		<p>
			{locale === 'en'
				? 'Use your own image or create an AI portrait. Saving the sheet updates the linked token image.'
				: 'Use uma imagem própria ou crie um retrato por IA. Ao salvar a ficha, o token vinculado recebe a nova imagem.'}
		</p>
		<label class="portrait-upload">
			{portraitBusy
				? locale === 'en'
					? 'Processing…'
					: 'Processando…'
				: locale === 'en'
					? 'Upload image'
					: 'Enviar imagem'}
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				onchange={uploadPortrait}
				disabled={portraitBusy}
			/>
		</label>
		<div class="portrait-ai">
			<input
				bind:value={portraitPrompt}
				maxlength="600"
				placeholder={locale === 'en'
					? 'E.g. drow sorceress, white hair, violet eyes'
					: 'Ex.: elfa drow feiticeira, cabelos brancos, olhos violeta'}
			/>
			<button
				type="button"
				onclick={() => void generatePortrait()}
				disabled={portraitBusy || portraitPrompt.trim().length < 3}
			>
				{portraitBusy
					? locale === 'en'
						? 'Generating…'
						: 'Gerando…'
					: locale === 'en'
						? 'Generate with AI'
						: 'Gerar com IA'}
			</button>
		</div>
		<small
			>{locale === 'en'
				? 'JPG, PNG, or WebP up to 5 MB. The portrait is private in storage and visible only to campaign members.'
				: 'JPG, PNG ou WebP de até 5 MB. O retrato é privado no armazenamento e exibido somente para membros da campanha.'}</small
		>
	</div>
</section>

<style>
	.portrait-editor {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.85rem;
		align-items: start;
		border: 1px solid #493c39;
		border-radius: 10px;
		padding: 0.8rem;
		background: #211b1e;
	}
	.portrait-preview {
		display: grid;
		place-items: center;
		width: 92px;
		height: 92px;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 50%;
		color: #e0b86f;
		background: #171216;
		font-size: 2rem;
	}
	.portrait-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.portrait-editor h3 {
		margin: 0 0 0.3rem;
		color: #f0d29d;
		font:
			600 1rem Georgia,
			serif;
	}
	.portrait-editor p,
	.portrait-editor small {
		margin: 0;
		color: #aa9d91;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.portrait-upload {
		display: inline-flex;
		margin: 0.55rem 0.4rem 0.55rem 0;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-upload input {
		display: none;
	}
	.portrait-ai {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.45rem;
	}
	.portrait-ai input {
		min-width: 0;
		flex: 1;
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.42rem;
		color: #eee4d6;
		background: #161216;
		font: inherit;
		font-size: 0.68rem;
	}
	.portrait-ai button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #291b10;
		background: #e0b86f;
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}
	.portrait-ai button:disabled,
	.portrait-upload:has(input:disabled) {
		opacity: 0.6;
		cursor: wait;
	}
</style>
