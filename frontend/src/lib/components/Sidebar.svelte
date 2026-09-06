<script lang="ts">
	import { onMount } from 'svelte';
	import {
		personagens,
		urlMapa,
		personagemSelecionadoId,
		turnoAtualId,
		type Arma
	} from '$lib/stores/gameStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { rolarDados } from '$lib/utils/diceRoller';
	import {
		buscarTodasMagias,
		obterDetalhesMagia,
		type SpellListItem,
		type SpellDetails
	} from '$lib/services/dndApi';
	import { gerarImagemToken } from '$lib/services/tokenImageApi';
	import { loadMessages, saveMessage, saveRoll } from '$lib/services/eventApi';
	import type { Session } from '@supabase/supabase-js';

	let {
		isGM = false,
		campaignId,
		session
	}: { isGM?: boolean; campaignId: string; session: Session } = $props();

	// --- ESTADO LOCAL (Svelte 5) ---
	let abaAtiva = $state('mesa'); // 'mesa', 'chat' ou 'compendio'
	let promptIA = $state('');
	let gerandoMapa = $state(false);

	// Estado do Compêndio
	let termoPesquisa = $state('');
	let listaMagias = $state<SpellListItem[]>([]);
	let magiaSelecionada = $state<SpellDetails | null>(null);
	let carregandoLista = $state(false);
	let carregandoDetalhes = $state(false);

	let personagemAtivo = $derived($personagens.find((p) => p.id === $personagemSelecionadoId));

	// Filtro reativo usando Rune do Svelte 5
	let magiasFiltradas = $derived(
		listaMagias.filter((m) => m.name.toLowerCase().includes(termoPesquisa.toLowerCase()))
	);

	let personagensOrdenados = $derived(
		[...$personagens].sort((a, b) => b.iniciativa - a.iniciativa)
	);
	// LÓGICA DO TRACKER
	function rolarIniciativaGrupo() {
		const atualizados = $personagens.map((p) => {
			const modDes = calcularModificador(p.atributos.des);
			const roll = Math.floor(Math.random() * 20) + 1;
			const total = roll + modDes;

			// Joga o resultado de cada um no chat
			$chatMensagens = [
				...$chatMensagens,
				{
					id: crypto.randomUUID(),
					autor: p.nome,
					texto: `Iniciativa: ${total} (Dado: ${roll} + Des: ${modDes})`,
					tipo: 'texto'
				}
			];

			return { ...p, iniciativa: total };
		});

		$personagens = atualizados;

		// Define o primeiro da lista como o turno ativo
		const ordenados = [...atualizados].sort((a, b) => b.iniciativa - a.iniciativa);
		if (ordenados.length > 0) $turnoAtualId = ordenados[0].id;
	}

	function proximoTurno() {
		if (personagensOrdenados.length === 0) return;

		const indexAtual = personagensOrdenados.findIndex((p) => p.id === $turnoAtualId);
		let proximoIndex = indexAtual + 1;

		// Se chegou no final da lista ou ninguém tem o turno, volta para o primeiro
		if (proximoIndex >= personagensOrdenados.length || indexAtual === -1) {
			proximoIndex = 0;
		}

		$turnoAtualId = personagensOrdenados[proximoIndex].id;
	}

	function alterarIniciativaManual(id: number, valor: number) {
		$personagens = $personagens.map((p) => (p.id === id ? { ...p, iniciativa: valor } : p));
	}

	// --- CICLO DE VIDA ---
	onMount(async () => {
		try {
			$chatMensagens = await loadMessages(session, campaignId);
		} catch (err) {
			console.error('Falha ao carregar histórico:', err);
		}
		carregandoLista = true;
		try {
			listaMagias = await buscarTodasMagias();
		} catch (err) {
			console.error('Falha ao carregar compêndio:', err);
		} finally {
			carregandoLista = false;
		}
	});

	// --- MÉTODOS ---
	function adicionarNovoPersonagem() {
		const novoId = $personagens.length + 1;
		$personagens = [
			...$personagens,
			{
				id: novoId,
				nome: `Herói ${novoId}`,
				cor: 0x33ff33,
				x: 70,
				y: 70,
				hpAtual: 10,
				hpMax: 10,
				ca: 10,
				proficiencia: 2,
				atributos: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
				armas: [],
				iniciativa: 0,
				tamanho: 1,
				fotoEscala: 1.0,
				fotoOffsetX: 0,
				fotoOffsetY: 0,
				visibility: { showName: true, showHP: false, showAC: false, showStatuses: false }
			}
		];
	}

	function abrirFicha(id: number) {
		$personagemSelecionadoId = id;
	}
	function fecharFicha() {
		$personagemSelecionadoId = null;
	}

	function editarAtributo<K extends keyof (typeof $personagens)[0]>(
		campo: K,
		valor: (typeof $personagens)[0][K]
	) {
		if (!$personagemSelecionadoId) return;
		$personagens = $personagens.map((p) =>
			p.id === $personagemSelecionadoId ? { ...p, [campo]: valor } : p
		);
	}

	function calcularModificador(valor: number): number {
		return Math.floor((valor - 10) / 2);
	}

	function rolarAtributo(nomeAtributo: string, valor: number) {
		if (!personagemAtivo) return;
		const mod = calcularModificador(valor);
		const expressao = `1d20${mod >= 0 ? '+' : ''}${mod}`;
		const resultado = rolarDados(expressao);

		if (resultado) {
			$chatMensagens = [
				...$chatMensagens,
				{
					id: crypto.randomUUID(),
					autor: personagemAtivo.nome,
					texto: `Teste de ${nomeAtributo.toUpperCase()}`,
					tipo: 'rolagem',
					detalhesRolagem: resultado
				}
			];
			abaAtiva = 'chat';
		}
	}

	// --- LÓGICA DE COMBATE ---
	function adicionarArma() {
		if (!personagemAtivo) return;
		const novaArma = { id: crypto.randomUUID(), nome: 'Nova Arma', bonusAtaque: 0, dano: '1d6' };
		editarAtributo('armas', [...personagemAtivo.armas, novaArma]);
	}

	function removerArma(idArma: string) {
		if (!personagemAtivo) return;
		editarAtributo(
			'armas',
			personagemAtivo.armas.filter((a) => a.id !== idArma)
		);
	}

	function editarArma(idArma: string, campo: keyof Arma, valor: string | number) {
		if (!personagemAtivo) return;
		const armasAtualizadas = personagemAtivo.armas.map((a) =>
			a.id === idArma ? { ...a, [campo]: valor } : a
		);
		editarAtributo('armas', armasAtualizadas);
	}

	function rolarCombate(nomeArma: string, expressao: string, tipo: 'Ataque' | 'Dano') {
		if (!personagemAtivo) return;

		// Se for ataque, monta a string 1d20+Bonus. Se for dano, usa a string direta (ex: 1d8+3)
		const expressaoFinal =
			tipo === 'Ataque' ? `1d20${Number(expressao) >= 0 ? '+' : ''}${expressao}` : expressao;
		const resultado = rolarDados(expressaoFinal);

		if (resultado) {
			$chatMensagens = [
				...$chatMensagens,
				{
					id: crypto.randomUUID(),
					autor: personagemAtivo.nome,
					texto: `${tipo} com ${nomeArma}`,
					tipo: 'rolagem',
					detalhesRolagem: resultado
				}
			];
			abaAtiva = 'chat';
		}
	}

	async function abrirDetalhesMagia(index: string) {
		carregandoDetalhes = true;
		magiaSelecionada = null;
		try {
			magiaSelecionada = await obterDetalhesMagia(index);
		} catch (err) {
			console.error(err);
		} finally {
			carregandoDetalhes = false;
		}
	}

	// --- MAPA ---
	function lidarComUploadImagem(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const reader = new FileReader();
			reader.onload = (e) => ($urlMapa = e.target?.result as string);
			reader.readAsDataURL(input.files[0]);
		}
	}

	async function gerarMapaIA() {
		if (!promptIA.trim()) return;
		gerandoMapa = true;
		await new Promise((resolve) => setTimeout(resolve, 2000));
		$urlMapa =
			'https://images.unsplash.com/photo-1543157145-f78c636d023d?q=80&w=1000&auto=format&fit=crop';
		gerandoMapa = false;
		promptIA = '';
	}

	function processarChat(evento: KeyboardEvent) {
		if (evento.key !== 'Enter') return;
		const input = evento.currentTarget as HTMLInputElement;
		const texto = input.value.trim();
		if (!texto) return;

		const nomeAutor = personagemAtivo ? personagemAtivo.nome : 'Mestre';

		if (texto.startsWith('/r ') || texto.startsWith('/roll ')) {
			const expressao = texto.replace(/^\/(r|roll)\s+/i, '');
			const resultado = rolarDados(expressao);

			if (resultado) {
				void saveRoll(session, campaignId, resultado);
				$chatMensagens = [
					...$chatMensagens,
					{
						id: crypto.randomUUID(),
						autor: nomeAutor,
						texto: '',
						tipo: 'rolagem',
						detalhesRolagem: resultado
					}
				];
			} else {
				$chatMensagens = [
					...$chatMensagens,
					{
						id: crypto.randomUUID(),
						autor: 'Sistema',
						texto: 'Formato inválido. Use XdY+Z',
						tipo: 'texto'
					}
				];
			}
		} else {
			void saveMessage(session, campaignId, texto);
			$chatMensagens = [
				...$chatMensagens,
				{ id: crypto.randomUUID(), autor: nomeAutor, texto: texto, tipo: 'texto' }
			];
		}

		input.value = '';
		setTimeout(() => {
			const divMensagens = document.querySelector('.mensagens');
			if (divMensagens) divMensagens.scrollTop = divMensagens.scrollHeight;
		}, 10);
	}
	// Controle da IA do Token
	let promptToken = $state('');
	let gerandoToken = $state(false);

	function uploadFotoToken(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const reader = new FileReader();
			reader.onload = (e) => {
				editarAtributo('fotoUrl', e.target?.result as string);
			};
			reader.readAsDataURL(input.files[0]);
		}
	}

	async function gerarTokenIA() {
		if (!promptToken.trim()) return;
		gerandoToken = true;
		try {
			editarAtributo('fotoUrl', await gerarImagemToken(promptToken));
			promptToken = '';
		} catch (erro) {
			console.error('Erro na geração do token:', erro);
			alert(erro instanceof Error ? erro.message : 'Não foi possível gerar o token.');
		} finally {
			gerandoToken = false;
		}
	}
</script>

{#snippet AbaMesa()}
	<div class="conteudo-scroll">
		{#if !personagemAtivo}
			<div class="sessao-painel">
				<h3>Cenário</h3>
				<div class="ia-box">
					<textarea bind:value={promptIA} placeholder="Ex: Acampamento no deserto..." rows="2"
					></textarea>
					<button class="btn-acao" onclick={gerarMapaIA} disabled={gerandoMapa}>Gerar IA</button>
				</div>
				<label class="btn-upload" style="margin-top: 10px;">
					<input
						type="file"
						accept="image/*"
						style="display: none;"
						onchange={lidarComUploadImagem}
					/>
					Subir Mapa Local
				</label>
			</div>

			<div class="sessao-painel">
				<div class="cabecalho-iniciativa">
					<h3>Ordem de Turnos</h3>
					<div class="botoes-iniciativa">
						<button class="btn-acao pequeno" onclick={rolarIniciativaGrupo} title="Rolar de Todos"
							>🎲</button
						>
						<button class="btn-acao pequeno verde" onclick={proximoTurno} title="Próximo Turno"
							>▶️</button
						>
					</div>
				</div>

				{#if isGM}<button class="btn-acao outline" onclick={adicionarNovoPersonagem}
						>+ Novo Personagem</button
					>{/if}

				<ul class="lista-tracker">
					{#each personagensOrdenados as personagem (personagem.id)}
						<li class="item-tracker {$turnoAtualId === personagem.id ? 'turno-ativo' : ''}">
							<div class="info-personagem">
								<span
									class="cor-indicador"
									style="background-color: #{personagem.cor.toString(16).padStart(6, '0')}"
								></span>
								<button class="btn-nome-personagem" onclick={() => abrirFicha(personagem.id)}>
									{personagem.nome}
								</button>
							</div>
							<div class="input-iniciativa-box" title="Iniciativa (Edite manualmente se precisar)">
								<input
									type="number"
									class="input-iniciativa"
									value={personagem.iniciativa}
									oninput={(e) =>
										alterarIniciativaManual(personagem.id, Number(e.currentTarget.value))}
								/>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="cabecalho-ficha">
				<button class="btn-voltar" onclick={fecharFicha}>← Voltar</button>
				<input
					type="text"
					class="input-nome-ficha"
					value={personagemAtivo.nome}
					oninput={(e) => editarAtributo('nome', e.currentTarget.value)}
				/>
			</div>

			<div class="sessao-painel card-ficha-dnd">
				<div class="status-topo">
					<div class="caixa-dnd escudo">
						<span>CA</span>
						<input
							type="number"
							value={personagemAtivo.ca}
							oninput={(e) => editarAtributo('ca', Number(e.currentTarget.value))}
						/>
					</div>
					<div class="caixa-dnd">
						<span>HP</span>
						<div class="hp-inputs">
							<input
								type="number"
								value={personagemAtivo.hpAtual}
								oninput={(e) => editarAtributo('hpAtual', Number(e.currentTarget.value))}
							/>
							/
							<input
								type="number"
								value={personagemAtivo.hpMax}
								oninput={(e) => editarAtributo('hpMax', Number(e.currentTarget.value))}
							/>
						</div>
					</div>
					<div class="caixa-dnd proficiencia">
						<span>Prof</span>
						<input
							type="number"
							value={personagemAtivo.proficiencia}
							oninput={(e) => editarAtributo('proficiencia', Number(e.currentTarget.value))}
						/>
					</div>
				</div>

				<hr class="divisor-ficha" />

				<!-- SEÇÃO DE ARMAS E ATAQUES -->
				<div class="sessao-armas">
					<div class="cabecalho-armas">
						<h3>Ataques & Magias</h3>
						<button class="btn-add-arma" onclick={adicionarArma} title="Adicionar Arma">+</button>
					</div>

					{#if personagemAtivo.armas.length === 0}
						<p class="aviso-vazio">Nenhuma arma equipada.</p>
					{/if}

					<div class="lista-armas">
						{#each personagemAtivo.armas as arma (arma.id)}
							<div class="card-arma">
								<div class="linha-arma-topo">
									<input
										type="text"
										class="input-nome-arma"
										value={arma.nome}
										oninput={(e) => editarArma(arma.id, 'nome', e.currentTarget.value)}
									/>
									<button
										class="btn-remover-arma"
										onclick={() => removerArma(arma.id)}
										title="Remover Arma">✖</button
									>
								</div>
								<div class="linha-arma-dados">
									<label>
										Atk Bônus
										<input
											type="number"
											value={arma.bonusAtaque}
											oninput={(e) =>
												editarArma(arma.id, 'bonusAtaque', Number(e.currentTarget.value))}
										/>
									</label>
									<label>
										Dano
										<input
											type="text"
											value={arma.dano}
											oninput={(e) => editarArma(arma.id, 'dano', e.currentTarget.value)}
										/>
									</label>
								</div>
								<div class="linha-arma-botoes">
									<button
										class="btn-rolar-atk"
										onclick={() => rolarCombate(arma.nome, arma.bonusAtaque.toString(), 'Ataque')}
										>🎯 Atacar</button
									>
									<button
										class="btn-rolar-dano"
										onclick={() => rolarCombate(arma.nome, arma.dano, 'Dano')}>🩸 Dano</button
									>
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="sessao-painel">
					<h3>Aparência do Token</h3>
					<div class="aparencia-box">
						{#if personagemAtivo.fotoUrl}
							<div class="preview-container">
								<img src={personagemAtivo.fotoUrl} alt="Preview do Token" class="preview-foto" />
								<button
									class="btn-remover-foto"
									onclick={() => editarAtributo('fotoUrl', undefined)}>✖ Remover Imagem</button
								>
							</div>

							<div class="controles-foto-token">
								<label class="slider-label">
									Zoom da Imagem: {personagemAtivo.fotoEscala.toFixed(1)}x
									<input
										type="range"
										min="0.5"
										max="3"
										step="0.1"
										value={personagemAtivo.fotoEscala}
										oninput={(e) => editarAtributo('fotoEscala', Number(e.currentTarget.value))}
									/>
								</label>
								<div class="linha-controles-posicao">
									<label class="slider-label">
										Ajuste X: {personagemAtivo.fotoOffsetX}px
										<input
											type="range"
											min="-40"
											max="40"
											step="1"
											value={personagemAtivo.fotoOffsetX}
											oninput={(e) => editarAtributo('fotoOffsetX', Number(e.currentTarget.value))}
										/>
									</label>
									<label class="slider-label">
										Ajuste Y: {personagemAtivo.fotoOffsetY}px
										<input
											type="range"
											min="-40"
											max="40"
											step="1"
											value={personagemAtivo.fotoOffsetY}
											oninput={(e) => editarAtributo('fotoOffsetY', Number(e.currentTarget.value))}
										/>
									</label>
								</div>
							</div>
						{:else}
							<div
								class="avatar-vazio"
								style="background-color: #{personagemAtivo.cor.toString(16).padStart(6, '0')}"
							></div>
						{/if}

						<label class="slider-label" style="width: 100%; margin-top: 5px;">
							Tamanho na Grade:
							<select
								class="select-tamanho"
								value={personagemAtivo.tamanho}
								onchange={(e) => {
									editarAtributo('tamanho', Number(e.currentTarget.value));
									// Reseta os ajustes da imagem para o tamanho novo
									editarAtributo('fotoEscala', 1.0);
									editarAtributo('fotoOffsetX', 0);
									editarAtributo('fotoOffsetY', 0);
								}}
							>
								<option value={1}>Médio (1x1)</option>
								<option value={2}>Grande (2x2)</option>
								<option value={3}>Imenso (3x3)</option>
							</select>
						</label>

						<div class="ia-token-box" style="margin-top: 10px;">
							<input
								type="text"
								placeholder="IA: Retrato de guerreiro gordo..."
								bind:value={promptToken}
								class="input-busca"
								style="margin-bottom: 5px; height: 35px;"
							/>
							<button class="btn-acao" onclick={gerarTokenIA} disabled={gerandoToken}>
								{gerandoToken ? 'Magia em andamento...' : 'Gerar com IA'}
							</button>
						</div>

						<label class="btn-upload" style="margin-top: 5px; padding: 6px;">
							<input
								type="file"
								accept="image/*"
								style="display: none;"
								onchange={uploadFotoToken}
							/>
							Subir Imagem Local
						</label>
					</div>
				</div>

				<div class="grid-atributos-dnd">
					{#each Object.entries(personagemAtivo.atributos) as [sigla, valor] (sigla)}
						<div class="caixa-atributo">
							<span class="sigla">{sigla.toUpperCase()}</span>
							<input
								type="number"
								value={valor}
								oninput={(e) => {
									const novosAtributos = {
										...personagemAtivo.atributos,
										[sigla]: Number(e.currentTarget.value)
									};
									editarAtributo('atributos', novosAtributos);
								}}
							/>

							<button
								class="btn-modificador"
								onclick={() => rolarAtributo(sigla, valor)}
								title="Rolar Teste"
							>
								{calcularModificador(valor) >= 0 ? '+' : ''}{calcularModificador(valor)}
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet AbaChat()}
	<div class="chat-container">
		<div class="mensagens">
			{#if $chatMensagens.length === 0}
				<p class="chat-vazio">Digite /r 1d20+2 para rolar um dado.</p>
			{/if}
			{#each $chatMensagens as msg (msg.id)}
				<div class="msg-box">
					<strong class="autor">{msg.autor}</strong>
					{#if msg.tipo === 'texto'}
						<span class="texto">{msg.texto}</span>
					{:else if msg.detalhesRolagem}
						<div class="rolagem-box">
							<span class="dados-expressao">{msg.detalhesRolagem.expressao}</span>
							<span class="dados-roll"
								>[{msg.detalhesRolagem.dados.join(', ')}] {msg.detalhesRolagem.modificador !== 0
									? (msg.detalhesRolagem.modificador > 0 ? '+' : '') +
										msg.detalhesRolagem.modificador
									: ''}</span
							>
							<span class="total-roll">➔ {msg.detalhesRolagem.total}</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<input
			type="text"
			class="input-chat"
			placeholder="/r 1d20+5 ou digite..."
			onkeydown={processarChat}
		/>
	</div>
{/snippet}

{#snippet AbaCompendio()}
	<div class="compendio-container">
		{#if !magiaSelecionada}
			<div class="busca-compendio">
				<input
					type="text"
					class="input-busca"
					placeholder="Pesquisar magia (em inglês)..."
					bind:value={termoPesquisa}
				/>
			</div>

			<div class="lista-compendio">
				{#if carregandoLista}
					<p class="aviso-carregamento">A carregar livros oficiais...</p>
				{:else}
					<ul>
						{#each magiasFiltradas.slice(0, 30) as magia (magia.index)}
							<li>
								<button class="btn-magia-lista" onclick={() => abrirDetalhesMagia(magia.index)}>
									{magia.name} <span>➔</span>
								</button>
							</li>
						{/each}
						{#if magiasFiltradas.length > 30}
							<li class="aviso-limite">
								Escreva mais para filtrar ({magiasFiltradas.length} encontradas)
							</li>
						{/if}
					</ul>
				{/if}
			</div>
		{:else}
			<div class="detalhes-magia-box">
				<button class="btn-voltar-compendio" onclick={() => (magiaSelecionada = null)}>
					← Voltar para a pesquisa
				</button>

				{#if carregandoDetalhes}
					<p class="aviso-carregamento">A ler runas arcanas...</p>
				{:else}
					<h2>{magiaSelecionada.name}</h2>
					<p class="subtitulo-magia">
						Nível {magiaSelecionada.level} • {magiaSelecionada.school?.name || 'Magia'}
					</p>

					<div class="dados-rapidos-grid">
						<div class="dado-item">
							<strong>Conjuração:</strong>
							<span>{magiaSelecionada.casting_time}</span>
						</div>
						<div class="dado-item">
							<strong>Alcance:</strong>
							<span>{magiaSelecionada.range}</span>
						</div>
						<div class="dado-item">
							<strong>Duração:</strong>
							<span>{magiaSelecionada.duration}</span>
						</div>
						<div class="dado-item">
							<strong>Componentes:</strong>
							<span>{magiaSelecionada.components.join(', ')}</span>
						</div>
					</div>

					<div class="descricao-texto">
						{#each magiaSelecionada.desc as paragrafo, i (i)}
							<p>{paragrafo}</p>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<aside class="painel-lateral">
	<header class="painel-cabecalho">
		<div>
			<p>{isGM ? 'CONTROLE DA MESA' : 'SUA SESSÃO'}</p>
			<strong>Console da aventura</strong>
		</div>
		<span class="painel-selo">{isGM ? 'GM' : 'PJ'}</span>
	</header>
	<nav class="navegacao-abas">
		<button
			class="btn-aba {abaAtiva === 'mesa' ? 'ativa' : ''}"
			onclick={() => (abaAtiva = 'mesa')}
		>
			<span aria-hidden="true">◇</span> Mesa
		</button>
		<button
			class="btn-aba {abaAtiva === 'chat' ? 'ativa' : ''}"
			onclick={() => (abaAtiva = 'chat')}
		>
			<span aria-hidden="true">◌</span> Chat
		</button>
		<button
			class="btn-aba {abaAtiva === 'compendio' ? 'ativa' : ''}"
			onclick={() => (abaAtiva = 'compendio')}
		>
			<span aria-hidden="true">✦</span> Livros
		</button>
	</nav>

	<div class="area-renderizacao">
		{#if abaAtiva === 'mesa'}
			{@render AbaMesa()}
		{:else if abaAtiva === 'chat'}
			{@render AbaChat()}
		{:else if abaAtiva === 'compendio'}
			{@render AbaCompendio()}
		{/if}
	</div>
</aside>

<style>
	/* RESET E LAYOUT BASE */
	.painel-lateral {
		width: 320px;
		height: 600px;
		background-color: #1e1e1e;
		border: 1px solid #333;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.5);
		font-family: inherit;
	}

	/* ABAS (TABS) */
	.navegacao-abas {
		display: flex;
		background-color: #111;
		border-bottom: 2px solid #333;
	}
	.btn-aba {
		flex: 1;
		padding: 12px 5px;
		background: none;
		border: none;
		color: #888;
		font-weight: bold;
		cursor: pointer;
		transition: 0.2s;
		font-size: 0.85rem;
	}
	.btn-aba:hover {
		background-color: #222;
		color: #bbb;
	}
	.btn-aba.ativa {
		color: #fff;
		background-color: #1e1e1e;
		border-bottom: 2px solid #4caf50;
	}

	/* ÁREA DE CONTEÚDO */
	.area-renderizacao {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.conteudo-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 15px;
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	/* COMPONENTES GENÉRICOS */
	h3 {
		margin: 0 0 10px 0;
		font-size: 0.85rem;
		color: #aaa;
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.sessao-painel {
		background-color: #252525;
		padding: 15px;
		border-radius: 6px;
		border: 1px solid #333;
	}
	.btn-acao {
		width: 100%;
		padding: 8px;
		background-color: #9c27b0;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		transition: 0.2s;
	}
	.btn-acao.verde {
		background-color: #4caf50;
		margin-bottom: 10px;
	}
	.btn-acao:hover {
		filter: brightness(1.2);
	}
	.btn-acao:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	/* INPUTS E LISTAS */
	.ia-box textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 8px;
		background: #151515;
		border: 1px solid #444;
		color: white;
		border-radius: 4px;
		resize: none;
		margin-bottom: 8px;
		font-family: inherit;
	}
	.btn-upload {
		display: block;
		text-align: center;
		width: 100%;
		box-sizing: border-box;
		padding: 8px;
		background-color: #333;
		color: white;
		border: 1px dashed #666;
		border-radius: 4px;
		cursor: pointer;
		font-weight: bold;
		font-size: 0.9rem;
	}
	/* TRACKER DE INICIATIVA */
	.cabecalho-iniciativa {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
	}
	.cabecalho-iniciativa h3 {
		margin: 0;
	}
	.botoes-iniciativa {
		display: flex;
		gap: 5px;
	}
	.btn-acao.pequeno {
		padding: 4px 8px;
		width: auto;
		font-size: 1rem;
		margin: 0;
	}
	.btn-acao.outline {
		background: transparent;
		border: 1px dashed #666;
		color: #ccc;
		margin-bottom: 15px;
	}
	.btn-acao.outline:hover {
		background: #333;
		color: white;
		border-color: #888;
	}

	.lista-tracker {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.item-tracker {
		background-color: #2e2e2e;
		padding: 8px 10px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border: 1px solid #3c3c3c;
		transition: all 0.3s ease;
	}

	/* Destaque visual brilhante para quem está jogando agora */
	.item-tracker.turno-ativo {
		border-color: #4caf50;
		background-color: #1e3520;
		box-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
		transform: scale(1.02);
	}

	.info-personagem {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
	}
	.btn-nome-personagem {
		background: none;
		border: none;
		color: white;
		font-family: inherit;
		font-size: 0.95rem;
		cursor: pointer;
		padding: 0;
		text-align: left;
		transition: 0.2s;
		font-weight: bold;
	}
	.btn-nome-personagem:hover {
		color: #4caf50;
	}

	.input-iniciativa-box {
		display: flex;
		align-items: center;
		background: #151515;
		border-radius: 4px;
		border: 1px solid #444;
		padding: 2px 4px;
	}
	.input-iniciativa {
		width: 32px;
		background: transparent;
		border: none;
		color: #ffeb3b;
		font-weight: bold;
		font-family: inherit;
		font-size: 1.1rem;
		text-align: center;
		outline: none;
	}
	/* Esconde as setinhas feias de input number */
	.input-iniciativa::-webkit-inner-spin-button,
	.input-iniciativa::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.cor-indicador {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		display: inline-block;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
	}

	/* FICHA */
	.cabecalho-ficha {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid #333;
	}
	.btn-voltar {
		background: transparent;
		border: 1px solid #555;
		color: #ccc;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.btn-voltar:hover {
		background: #444;
		color: white;
	}
	.input-nome-ficha {
		flex: 1;
		background: transparent;
		border: none;
		border-bottom: 2px solid #555;
		color: white;
		font-size: 1.1rem;
		font-weight: bold;
		padding: 4px;
		outline: none;
		font-family: inherit;
	}
	.input-nome-ficha:focus {
		border-bottom-color: #4caf50;
	}

	.card-ficha-dnd {
		display: flex;
		flex-direction: column;
		gap: 15px;
	}
	.status-topo {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.caixa-dnd {
		flex: 1;
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px;
	}
	.caixa-dnd span {
		font-size: 0.75rem;
		color: #aaa;
		font-weight: bold;
		margin-bottom: 4px;
	}
	.caixa-dnd input {
		width: 100%;
		background: transparent;
		border: none;
		color: white;
		text-align: center;
		font-size: 1.2rem;
		outline: none;
	}
	.hp-inputs {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #666;
	}
	.hp-inputs input {
		width: 40px;
	}
	.escudo {
		border-color: #777;
		background: #222;
	}
	.proficiencia input {
		color: #4caf50;
		font-weight: bold;
	}

	.divisor-ficha {
		width: 100%;
		border: none;
		border-top: 1px dashed #444;
		margin: 0;
	}

	.grid-atributos-dnd {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.caixa-atributo {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 5px;
		position: relative;
	}
	.caixa-atributo .sigla {
		font-size: 0.7rem;
		font-weight: bold;
		color: #888;
		margin-bottom: 2px;
	}
	.caixa-atributo input {
		width: 100%;
		background: transparent;
		border: none;
		color: white;
		text-align: center;
		font-size: 1.3rem;
		font-weight: bold;
		outline: none;
		margin-bottom: 12px;
	}

	.btn-modificador {
		position: absolute;
		bottom: -8px;
		background: #2a2a2a;
		border: 1px solid #555;
		border-radius: 12px;
		color: white;
		font-weight: bold;
		font-size: 0.9rem;
		padding: 2px 12px;
		cursor: pointer;
		transition: 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
	.btn-modificador:hover {
		background: #4caf50;
		border-color: #4caf50;
		transform: scale(1.1);
	}

	/* CHAT */
	.chat-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 15px;
		overflow: hidden;
		background-color: #1a1a1a;
	}
	.mensagens {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 15px;
		padding-right: 5px;
	}
	.chat-vazio {
		color: #555;
		font-size: 0.85rem;
		text-align: center;
		margin: auto;
	}
	.msg-box {
		background: #252525;
		padding: 10px;
		border-radius: 6px;
		font-size: 0.9rem;
		border-left: 3px solid #4caf50;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
	.autor {
		color: #4caf50;
		display: block;
		font-size: 0.8rem;
		margin-bottom: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.texto {
		color: #ddd;
		line-height: 1.4;
		word-break: break-word;
	}
	.rolagem-box {
		background: #111;
		padding: 8px 12px;
		border-radius: 4px;
		margin-top: 6px;
		border: 1px solid #333;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.dados-expressao {
		color: #888;
		font-size: 0.75rem;
		display: block;
		margin-bottom: 2px;
	}
	.dados-roll {
		color: #aaa;
		font-family: monospace;
		font-size: 0.85rem;
	}
	.total-roll {
		color: #ffeb3b;
		font-weight: bold;
		font-size: 1.2rem;
	}
	.input-chat {
		width: 100%;
		box-sizing: border-box;
		padding: 12px;
		border-radius: 6px;
		border: 1px solid #444;
		background: #222;
		color: white;
		font-family: inherit;
		font-size: 0.95rem;
	}
	.input-chat:focus {
		outline: none;
		border-color: #4caf50;
		background: #2a2a2a;
	}

	/* COMPÊNDIO */
	.compendio-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background-color: #1a1a1a;
	}
	.busca-compendio {
		padding: 15px;
		border-bottom: 1px solid #333;
		background: #222;
	}
	.input-busca {
		width: 100%;
		box-sizing: border-box;
		padding: 10px;
		border-radius: 6px;
		border: 1px solid #444;
		background: #151515;
		color: white;
		font-family: inherit;
	}
	.input-busca:focus {
		outline: none;
		border-color: #9c27b0;
	}

	.lista-compendio {
		flex: 1;
		overflow-y: auto;
		padding: 15px;
	}
	.lista-compendio ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.lista-compendio li {
		margin-bottom: 8px;
	}

	.btn-magia-lista {
		width: 100%;
		padding: 12px;
		background: #252525;
		border: 1px solid #333;
		border-radius: 6px;
		color: #ddd;
		text-align: left;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: bold;
		font-size: 0.9rem;
		transition: 0.2s;
	}
	.btn-magia-lista:hover {
		background: #333;
		border-color: #555;
		color: white;
		padding-left: 16px;
	}
	.btn-magia-lista span {
		color: #9c27b0;
	}

	.aviso-carregamento {
		color: #888;
		text-align: center;
		margin-top: 40px;
		font-style: italic;
	}
	.aviso-limite {
		text-align: center;
		color: #555;
		font-size: 0.8rem;
		margin-top: 15px;
		font-style: italic;
		list-style: none;
	}

	/* DETALHES DA MAGIA */
	.detalhes-magia-box {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
	}
	.btn-voltar-compendio {
		width: 100%;
		padding: 8px;
		background: transparent;
		border: 1px solid #444;
		color: #aaa;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
		margin-bottom: 20px;
	}
	.btn-voltar-compendio:hover {
		background: #333;
		color: white;
	}

	.detalhes-magia-box h2 {
		margin: 0 0 5px 0;
		font-size: 1.5rem;
		color: #9c27b0;
		border-bottom: 1px solid #333;
		padding-bottom: 8px;
	}
	.subtitulo-magia {
		font-size: 0.85rem;
		color: #888;
		font-style: italic;
		margin-top: 0;
		margin-bottom: 20px;
	}

	.dados-rapidos-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 15px;
		margin-bottom: 20px;
		background: #222;
		padding: 15px;
		border-radius: 8px;
		border: 1px solid #333;
	}
	.dado-item {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.dado-item strong {
		font-size: 0.75rem;
		color: #aaa;
		text-transform: uppercase;
	}
	.dado-item span {
		font-size: 0.9rem;
		color: #fff;
	}

	.descricao-texto {
		color: #ccc;
		font-size: 0.9rem;
		line-height: 1.6;
	}
	.descricao-texto p {
		margin-bottom: 12px;
	}

	/* ÁREA DE COMBATE E ARMAS */
	.sessao-armas {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.cabecalho-armas {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.btn-add-arma {
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		font-weight: bold;
		cursor: pointer;
		transition: 0.2s;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.btn-add-arma:hover {
		background: #45a049;
		transform: scale(1.1);
	}
	.aviso-vazio {
		font-size: 0.8rem;
		color: #666;
		font-style: italic;
		margin: 0;
	}

	.lista-armas {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card-arma {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.linha-arma-topo {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}
	.input-nome-arma {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		border-bottom: 1px solid #555;
		color: #4caf50;
		font-weight: bold;
		font-family: inherit;
		font-size: 0.95rem;
		outline: none;
	}
	.btn-remover-arma {
		background: transparent;
		border: none;
		color: #777;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
		transition: 0.2s;
	}
	.btn-remover-arma:hover {
		color: #f44336;
	}

	.linha-arma-dados {
		display: flex;
		gap: 10px;
	}
	.linha-arma-dados label {
		flex: 1;
		display: flex;
		flex-direction: column;
		font-size: 0.7rem;
		color: #888;
		gap: 2px;
		text-transform: uppercase;
	}
	.linha-arma-dados input {
		width: 100%;
		box-sizing: border-box;
		background: #222;
		border: 1px solid #444;
		color: white;
		border-radius: 4px;
		padding: 4px 8px;
		font-family: inherit;
		font-size: 0.9rem;
		outline: none;
	}

	.linha-arma-botoes {
		display: flex;
		gap: 10px;
		margin-top: 4px;
	}
	.btn-rolar-atk,
	.btn-rolar-dano {
		flex: 1;
		padding: 6px;
		border: none;
		border-radius: 4px;
		font-weight: bold;
		cursor: pointer;
		font-size: 0.8rem;
		transition: 0.2s;
	}
	.btn-rolar-atk {
		background: #333;
		color: white;
		border: 1px solid #555;
	}
	.btn-rolar-atk:hover {
		background: #444;
	}
	.btn-rolar-dano {
		background: #8b0000;
		color: white;
	}
	.btn-rolar-dano:hover {
		background: #a50000;
	}
	/* CUSTOMIZAÇÃO DE TOKENS VISUAIS */
	.aparencia-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		width: 100%;
	}
	.preview-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}
	.preview-foto {
		width: 55px;
		height: 55px;
		border-radius: 50%;
		border: 2px solid #4caf50;
		object-fit: cover;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
	}
	.avatar-vazio {
		width: 55px;
		height: 55px;
		border-radius: 50%;
		border: 2px dashed #666;
	}
	.btn-remover-foto {
		background: transparent;
		border: none;
		color: #f44336;
		cursor: pointer;
		font-size: 0.75rem;
		text-decoration: underline;
		font-family: inherit;
	}
	.ia-token-box {
		width: 100%;
		display: flex;
		flex-direction: column;
	}
	/* CONTROLES DE POSICIONAMENTO E ZOOM DO TOKEN */
	.controles-foto-token {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: #1a1a1a;
		padding: 10px;
		border-radius: 6px;
		border: 1px solid #333;
		margin-top: 8px;
		box-sizing: border-box;
	}
	.slider-label {
		font-size: 0.75rem;
		color: #aaa;
		font-weight: bold;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.slider-label input[type='range'] {
		width: 100%;
		margin: 0;
		cursor: pointer;
	}
	.linha-controles-posicao {
		display: flex;
		gap: 10px;
	}
	.linha-controles-posicao .slider-label {
		flex: 1;
	}
	.select-tamanho {
		width: 100%;
		background: #111;
		border: 1px solid #444;
		color: white;
		padding: 6px;
		border-radius: 4px;
		font-family: inherit;
		font-size: 0.85rem;
		outline: none;
		margin-top: 4px;
	}

	/* Camada visual MaisMorras: substitui o painel técnico por uma extensão da mesa. */
	.painel-lateral {
		width: min(360px, 100%);
		height: min(70vh, 720px);
		border: 1px solid rgba(216, 173, 103, 0.32);
		border-radius: 14px;
		background: linear-gradient(180deg, rgba(49, 38, 38, 0.97), rgba(24, 19, 23, 0.98)), #1a1519;
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
		color: #eee4d7;
	}
	.painel-cabecalho {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1rem 0.85rem;
		border-bottom: 1px solid rgba(216, 173, 103, 0.16);
		background: linear-gradient(90deg, rgba(75, 47, 31, 0.24), transparent);
	}
	.painel-cabecalho p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.15em;
	}
	.painel-cabecalho strong {
		font:
			600 1.05rem Georgia,
			serif;
		letter-spacing: 0.01em;
	}
	.painel-selo {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid #85613c;
		color: #f0cb85;
		background: #281d1d;
		clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
		font:
			700 0.67rem Georgia,
			serif;
	}
	.navegacao-abas {
		gap: 0.35rem;
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid rgba(216, 173, 103, 0.13);
		background: transparent;
	}
	.btn-aba {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border: 1px solid transparent;
		border-radius: 7px;
		padding: 0.5rem 0.25rem;
		color: #9e9186;
		font-size: 0.7rem;
		font-weight: 750;
		letter-spacing: 0.02em;
	}
	.btn-aba span {
		color: #b38b55;
		font-size: 0.9rem;
	}
	.btn-aba:hover {
		color: #f1dfc2;
		background: rgba(216, 173, 103, 0.08);
	}
	.btn-aba.ativa {
		border-color: rgba(216, 173, 103, 0.42);
		border-bottom: 1px solid rgba(216, 173, 103, 0.42);
		color: #f2d092;
		background: rgba(96, 61, 35, 0.3);
	}
	.area-renderizacao {
		background: rgba(12, 10, 13, 0.2);
	}
	.conteudo-scroll {
		gap: 0.8rem;
		padding: 0.85rem;
	}
	.conteudo-scroll::-webkit-scrollbar,
	.mensagens::-webkit-scrollbar,
	.lista-compendio::-webkit-scrollbar,
	.detalhes-magia-box::-webkit-scrollbar {
		width: 6px;
	}
	.conteudo-scroll::-webkit-scrollbar-thumb,
	.mensagens::-webkit-scrollbar-thumb,
	.lista-compendio::-webkit-scrollbar-thumb,
	.detalhes-magia-box::-webkit-scrollbar-thumb {
		border-radius: 8px;
		background: #5c493b;
	}
	.painel-lateral h3 {
		margin: 0;
		color: #d8ad67;
		font-size: 0.62rem;
		letter-spacing: 0.13em;
	}
	.sessao-painel {
		padding: 0.85rem;
		border: 1px solid rgba(183, 147, 105, 0.2);
		border-radius: 10px;
		background: linear-gradient(145deg, rgba(50, 39, 39, 0.9), rgba(31, 25, 29, 0.95));
	}
	.btn-acao,
	.btn-upload {
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.55rem 0.65rem;
		color: #26190e;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}
	.btn-acao:hover,
	.btn-upload:hover {
		filter: none;
		color: #1c130d;
		background: #f0ce91;
	}
	.btn-acao.verde {
		color: #171510;
		background: #9abf83;
	}
	.btn-acao.outline,
	.btn-upload {
		border-style: solid;
		color: #d8c1a0;
		background: rgba(24, 19, 22, 0.56);
	}
	.btn-acao.outline:hover,
	.btn-upload:hover {
		border-color: #c99857;
		color: #f5dfba;
		background: rgba(111, 71, 39, 0.3);
	}
	.ia-box textarea,
	.input-chat,
	.input-busca,
	.select-tamanho {
		border-color: #54433d;
		border-radius: 7px;
		color: #eee4d7;
		background: rgba(14, 12, 15, 0.74);
	}
	.ia-box textarea:focus,
	.input-chat:focus,
	.input-busca:focus,
	.select-tamanho:focus {
		border-color: #c99857;
		background: #181216;
	}
	.cabecalho-iniciativa {
		margin-bottom: 0.75rem;
	}
	.lista-tracker {
		gap: 0.4rem;
	}
	.item-tracker {
		border-color: rgba(177, 141, 99, 0.17);
		border-radius: 7px;
		padding: 0.55rem 0.65rem;
		background: rgba(14, 12, 15, 0.42);
	}
	.item-tracker:hover {
		border-color: rgba(216, 173, 103, 0.42);
	}
	.item-tracker.turno-ativo {
		border-color: #c59655;
		background: linear-gradient(90deg, rgba(113, 72, 35, 0.45), rgba(38, 29, 29, 0.7));
		box-shadow: inset 3px 0 #e0b86f;
		transform: none;
	}
	.btn-nome-personagem {
		color: #e9dfd2;
		font:
			600 0.86rem Georgia,
			serif;
	}
	.btn-nome-personagem:hover {
		color: #f0cb85;
	}
	.cor-indicador {
		width: 9px;
		height: 9px;
		box-shadow: 0 0 0 2px #282023;
	}
	.input-iniciativa-box {
		border-color: #5c493b;
		background: #181216;
	}
	.input-iniciativa {
		color: #f0cb85;
		font-size: 0.9rem;
	}
	.chat-container,
	.compendio-container {
		padding: 0.85rem;
		background: transparent;
	}
	.msg-box {
		border: 1px solid rgba(177, 141, 99, 0.2);
		border-left: 3px solid #c59655;
		border-radius: 8px;
		background: rgba(44, 34, 36, 0.78);
	}
	.autor {
		color: #e0b86f;
		font-size: 0.65rem;
	}
	.texto {
		color: #dbd0c3;
	}
	.rolagem-box {
		border-color: #5b483b;
		background: #181216;
	}
	.total-roll {
		color: #f0cb85;
	}
	.busca-compendio {
		padding: 0 0 0.75rem;
		border: 0;
		background: transparent;
	}
	.lista-compendio {
		padding: 0;
	}
	.btn-magia-lista {
		border-color: rgba(177, 141, 99, 0.2);
		border-radius: 8px;
		padding: 0.7rem;
		color: #ded2c4;
		background: rgba(44, 34, 36, 0.75);
		font:
			600 0.82rem Georgia,
			serif;
	}
	.btn-magia-lista:hover {
		border-color: #b98b50;
		color: #f5dfba;
		background: rgba(92, 56, 34, 0.35);
		padding-left: 0.85rem;
	}
	.btn-magia-lista span,
	.detalhes-magia-box h2 {
		color: #e0b86f;
	}
	.detalhes-magia-box {
		padding: 0.85rem;
	}
	.dados-rapidos-grid {
		gap: 0.7rem;
		margin-bottom: 1rem;
		border-color: rgba(177, 141, 99, 0.2);
		background: rgba(44, 34, 36, 0.7);
	}
	.dado-item strong {
		color: #bca98e;
	}
	.dado-item span,
	.descricao-texto {
		color: #e0d5c8;
	}
	.card-ficha-dnd,
	.card-arma,
	.controles-foto-token {
		border-color: rgba(177, 141, 99, 0.22);
		background: rgba(17, 14, 17, 0.5);
	}
	.caixa-dnd,
	.caixa-atributo {
		border-color: rgba(177, 141, 99, 0.25);
		background: rgba(17, 14, 17, 0.65);
	}
	.caixa-dnd input,
	.caixa-atributo input,
	.input-nome-ficha,
	.input-nome-arma {
		color: #f0e5d6;
	}
	.proficiencia input,
	.input-nome-arma {
		color: #e0b86f;
	}
	.btn-modificador {
		border-color: #806039;
		color: #f0cb85;
		background: #2b201e;
	}
	.btn-modificador:hover,
	.btn-add-arma {
		border-color: #d8ad67;
		background: #76512e;
	}
	.btn-rolar-dano {
		background: #703634;
	}
	.preview-foto {
		border-color: #d8ad67;
	}
	@media (max-width: 760px) {
		.painel-lateral {
			width: 100%;
			height: min(68vh, 650px);
		}
	}
</style>
