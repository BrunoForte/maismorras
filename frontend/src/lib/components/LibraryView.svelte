<script lang="ts">
	let { isGM, onnotes }: { isGM: boolean; onnotes: () => void } = $props();
</script>

<section class="library-view" aria-label="Biblioteca da campanha">
	<header>
		<div>
			<p>BIBLIOTECA DA CAMPANHA</p>
			<h2>Handouts e mídias</h2>
			<span>Imagens, mapas, documentos e trilhas que pertencem a esta mesa.</span>
		</div>
		{#if isGM}<div class="library-actions">
				<button class="primary" disabled title="O armazenamento será conectado na próxima entrega"
					>Adicionar mídia</button
				><button onclick={onnotes}>Notas da campanha</button>
			</div>{/if}
	</header>
	<div class="library-grid">
		<article>
			<span>▧</span><strong>Handouts</strong>
			<p>Imagens e documentos revelados pelo narrador durante a sessão.</p>
		</article>
		<article>
			<span>♫</span><strong>Trilhas</strong>
			<p>Músicas ambiente com controle individual de volume para cada jogador.</p>
		</article>
		<article>
			<span>◈</span><strong>Acervo privado</strong>
			<p>Arquivos protegidos por campanha; apenas conteúdos liberados serão exibidos.</p>
		</article>
	</div>
	<aside>
		<strong>Em breve: apresentação de handouts.</strong><span
			>O narrador enviará uma imagem e poderá revelá-la para todos em uma janela de foco, com o mapa
			escurecido ao fundo. A base desta aba já é exclusiva para esse fluxo.</span
		>
	</aside>
</section>

<style>
	.library-view {
		min-height: 510px;
		padding: clamp(1.25rem, 3vw, 2.5rem);
		color: #eee4d6;
	}
	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
		padding-bottom: 1.4rem;
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
	.library-actions {
		display: flex;
		gap: 0.55rem;
	}
	.library-actions button {
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
	.library-actions button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.library-actions .primary {
		border: 0;
		color: #26190e;
		background: #e0b86f;
	}
	.library-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
	}
	.library-grid article {
		display: grid;
		gap: 0.55rem;
		min-height: 180px;
		padding: 1rem;
		border: 1px solid #493c39;
		border-radius: 11px;
		background: linear-gradient(145deg, #251e20, #1b1719);
	}
	.library-grid article span {
		color: #d8ad67;
		font-size: 1.5rem;
	}
	.library-grid strong {
		font:
			600 1.08rem Georgia,
			serif;
	}
	.library-grid p,
	aside span {
		color: #a99c91;
		font-size: 0.8rem;
		line-height: 1.55;
	}
	aside {
		display: grid;
		gap: 0.3rem;
		margin-top: 1rem;
		padding: 1rem;
		border-left: 2px solid #b58445;
		background: rgba(81, 49, 27, 0.2);
	}
	aside strong {
		color: #f0cb85;
		font:
			600 1rem Georgia,
			serif;
	}
	@media (max-width: 650px) {
		header {
			flex-direction: column;
		}
		.library-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
