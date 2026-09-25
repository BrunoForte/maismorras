<!-- eslint-disable svelte/no-navigation-without-resolve -- the catalog returns to the app root using a literal same-origin route. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	const groups = [
		{
			title: 'Dados',
			icons: [
				['d4', 'D4'],
				['d6', 'D6'],
				['d8', 'D8'],
				['d10', 'D10'],
				['d12', 'D12'],
				['d20', 'D20'],
				['d100', 'D100']
			]
		},
		{
			title: 'Ficha e rolagens',
			icons: [
				['character', 'Personagem'],
				['skill', 'Perícia'],
				['save', 'Salvaguarda'],
				['initiative', 'Iniciativa'],
				['attack', 'Ataque'],
				['spell', 'Magia'],
				['inventory', 'Inventário']
			]
		},
		{
			title: 'Mesa e campanha',
			icons: [
				['campaign', 'Campanha'],
				['map', 'Mapa'],
				['token', 'Token'],
				['combat', 'Combate'],
				['chat', 'Chat'],
				['notes', 'Notas'],
				['settings', 'Configurações']
			]
		},
		{
			title: 'Biblioteca e transmissão',
			icons: [
				['compendium', 'Compêndio'],
				['bestiary', 'Bestiário'],
				['handout', 'Handout'],
				['music', 'Música'],
				['effect', 'Efeito sonoro'],
				['camera', 'Câmera'],
				['overlay', 'Overlay']
			]
		}
	] as const;
</script>

<svelte:head>
	<title>Biblioteca de ícones · MaisMorras</title>
	<meta name="description" content="Biblioteca visual de ícones SVG do MaisMorras." />
</svelte:head>

<main>
	<header>
		<a href={resolve('/')} aria-label="Voltar ao MaisMorras">MaisMorras</a>
		<p>IDENTIDADE VISUAL · SVG ORIGINAL</p>
		<h1>Biblioteca de ícones</h1>
		<p class="intro">
			Ícones vetoriais leves, escaláveis e desenhados para as ferramentas e categorias do projeto.
			Os símbolos de dados estão separados para facilitar sua escolha futura nas rolagens.
		</p>
	</header>
	{#each groups as group (group.title)}<section>
			<h2>{group.title}</h2>
			<div class="icon-grid">
				{#each group.icons as [name, label] (name)}<article>
						<div class="icon-preview"><RpgIcon {name} size={40} /></div>
						<strong>{label}</strong>
						<code>{name}</code>
					</article>{/each}
			</div>
		</section>{/each}
	<footer>
		Formato SVG inline · sem dependências externas · pronto para uso em botões, abas e categorias.
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #141114;
		color: #eee4d6;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	main {
		width: min(1100px, 100% - 2rem);
		margin: 0 auto;
		padding: clamp(1.5rem, 5vw, 4rem) 0;
	}
	header {
		max-width: 760px;
		margin-bottom: 3rem;
	}
	header a {
		color: #e0b86f;
		text-decoration: none;
	}
	header > p:first-of-type {
		margin: 2.4rem 0 0.5rem;
		color: #d8ad67;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}
	h1,
	h2 {
		font-family: Georgia, serif;
	}
	h1 {
		margin: 0;
		font-size: clamp(2.2rem, 6vw, 4rem);
	}
	.intro {
		color: #b9aa9d;
		line-height: 1.65;
	}
	section {
		margin: 2.5rem 0;
	}
	h2 {
		margin: 0 0 1rem;
		color: #edc77f;
		font-size: 1.5rem;
	}
	.icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
		gap: 0.7rem;
	}
	article {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		padding: 1rem 0.5rem;
		border: 1px solid #493c39;
		border-radius: 10px;
		background: #211b1e;
		text-align: center;
	}
	.icon-preview {
		display: grid;
		place-items: center;
		width: 4rem;
		height: 4rem;
		margin-bottom: 0.25rem;
		border-radius: 12px;
		color: #edc77f;
		background: #171316;
	}
	article strong {
		font-size: 0.85rem;
	}
	code {
		color: #a99c91;
		font-size: 0.7rem;
	}
	footer {
		padding: 1rem 0;
		border-top: 1px solid #493c39;
		color: #a99c91;
		font-size: 0.8rem;
	}
</style>
