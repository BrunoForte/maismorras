<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { GameEngine } from '$lib/engine/GameEngine';
	import {
		personagens,
		statusDisponiveis,
		urlMapa,
		type Personagem,
		type StatusToken,
		type TokenVisibility
	} from '$lib/stores/gameStore';
	import {
		createToken,
		loadScene,
		updateToken,
		type PersistedToken,
		type Scene
	} from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { rollDice } from '$lib/services/eventApi';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';

	let { scene, session, isGM }: { scene: Scene; session: Session; isGM: boolean } = $props();

	let canvasMesa: HTMLCanvasElement;
	let container: HTMLDivElement;
	let tokenSelecionadoId = $state<number | null>(null);
	let novoStatus = $state<StatusToken>('Envenenado');
	let personagemSelecionado = $derived(
		$personagens.find((personagem) => personagem.id === tokenSelecionadoId)
	);
	let persistenceError = $state('');
	const pendingCreates = new Set<number>();
	const savedSnapshots = new Map<string, string>();
	let sceneSocket: SceneSocket | null = null;

	function asPersonagem(token: PersistedToken, index: number): Personagem {
		return {
			id: index + 1,
			persistedId: token.id,
			nome: token.name,
			cor: token.color,
			x: token.x,
			y: token.y,
			hpAtual: token.hpCurrent,
			hpMax: token.hpMax,
			ca: token.armorClass,
			proficiencia: 2,
			atributos: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
			armas: [],
			iniciativa: token.initiative,
			fotoUrl: token.imageUrl ?? undefined,
			tamanho: token.size,
			fotoEscala: 1,
			fotoOffsetX: 0,
			fotoOffsetY: 0,
			status: token.statuses as StatusToken[],
			visibility: token.visibility
		};
	}

	function asPersisted(personagem: Personagem): Omit<PersistedToken, 'id' | 'actorId'> {
		return {
			name: personagem.nome,
			imageUrl: personagem.fotoUrl ?? null,
			color: personagem.cor,
			x: personagem.x,
			y: personagem.y,
			size: personagem.tamanho,
			hpCurrent: personagem.hpAtual,
			hpMax: personagem.hpMax,
			armorClass: personagem.ca,
			initiative: personagem.iniciativa,
			statuses: personagem.status ?? [],
			hidden: false,
			visibility: personagem.visibility
		};
	}

	async function persistir(personagem: Personagem) {
		if (!isGM || !personagem.persistedId) return;
		try {
			await updateToken(session, scene.id, {
				id: personagem.persistedId,
				...asPersisted(personagem)
			});
			savedSnapshots.set(personagem.persistedId, JSON.stringify(asPersisted(personagem)));
			sceneSocket?.publishRefresh();
			persistenceError = '';
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível salvar o token.';
		}
	}

	function atualizarSelecionado(transform: (p: Personagem) => Personagem) {
		if (!personagemSelecionado || !isGM) return;
		const atualizado = transform(personagemSelecionado);
		personagens.update((lista) => lista.map((p) => (p.id === atualizado.id ? atualizado : p)));
	}

	async function carregarTokens() {
		try {
			const response = await loadScene(session, scene.id);
			urlMapa.set(response.scene.backgroundUrl);
			const carregados = response.tokens.map(asPersonagem);
			savedSnapshots.clear();
			carregados.forEach((personagem) => {
				if (personagem.persistedId)
					savedSnapshots.set(personagem.persistedId, JSON.stringify(asPersisted(personagem)));
			});
			personagens.set(carregados);
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível carregar os tokens.';
		}
	}

	onMount(() => {
		const motor = new GameEngine(
			(tokenId) => (tokenSelecionadoId = tokenId),
			(tokenId, x, y) => {
				if (!isGM) return;
				personagens.update((lista) =>
					lista.map((personagem) =>
						personagem.id === tokenId ? { ...personagem, x, y } : personagem
					)
				);
			}
		);
		const observer = new ResizeObserver(([entry]) => {
			motor.resize(entry.contentRect.width, entry.contentRect.height);
		});
		void motor.init(canvasMesa).then(async () => {
			observer.observe(container);
			await carregarTokens();
		});
		sceneSocket = connectSceneSocket(session, scene.id, () => void carregarTokens());

		const unsubscribe = personagens.subscribe((lista) => {
			if (!isGM) return;
			for (const personagem of lista) {
				if (personagem.persistedId) {
					const snapshot = JSON.stringify(asPersisted(personagem));
					if (savedSnapshots.get(personagem.persistedId) !== snapshot) void persistir(personagem);
					continue;
				}
				if (pendingCreates.has(personagem.id)) continue;
				pendingCreates.add(personagem.id);
				void createToken(session, scene.id, asPersisted(personagem))
					.then((token) => {
						const salvo = { ...personagem, persistedId: token.id };
						savedSnapshots.set(token.id, JSON.stringify(asPersisted(salvo)));
						personagens.update((atual) =>
							atual.map((p) => (p.id === personagem.id ? { ...p, persistedId: token.id } : p))
						);
						sceneSocket?.publishRefresh();
					})
					.catch((error) => {
						persistenceError =
							error instanceof Error ? error.message : 'Não foi possível criar o token.';
					})
					.finally(() => pendingCreates.delete(personagem.id));
			}
		});

		return () => {
			sceneSocket?.close();
			sceneSocket = null;
			unsubscribe();
			observer.disconnect();
			motor.destroy();
		};
	});

	function alterarHp(delta: number) {
		if (!personagemSelecionado) return;
		atualizarSelecionado((personagem) => ({
			...personagem,
			hpAtual: Math.min(personagem.hpMax, Math.max(0, personagem.hpAtual + delta))
		}));
	}

	function definirHp(valor: string) {
		if (!personagemSelecionado) return;
		const hp = Number(valor);
		if (!Number.isFinite(hp)) return;
		atualizarSelecionado((personagem) => ({
			...personagem,
			hpAtual: Math.min(personagem.hpMax, Math.max(0, hp))
		}));
	}

	function alternarStatus(status: StatusToken) {
		if (!personagemSelecionado) return;
		atualizarSelecionado((personagem) => {
			const atuais = personagem.status ?? [];
			return {
				...personagem,
				status: atuais.includes(status)
					? atuais.filter((item) => item !== status)
					: [...atuais, status]
			};
		});
	}

	function alterarVisibilidade(campo: keyof TokenVisibility, marcado: boolean) {
		atualizarSelecionado((personagem) => ({
			...personagem,
			visibility: { ...personagem.visibility, [campo]: marcado }
		}));
	}
	async function rollToken(expression: string) {
		if (!personagemSelecionado) return;
		try { const event = await rollDice(session, scene.campaignId, expression); const result = event.payload as { expressao: string; total: number; dados: number[] }; $diceOverlay = { expression: `${personagemSelecionado.nome} · ${result.expressao}`, total: result.total, dice: result.dados }; $chatMensagens = [...$chatMensagens, { id: String(event.id), autor: event.author, texto: `${personagemSelecionado.nome} · ${result.expressao}`, tipo: 'rolagem', detalhesRolagem: { ...result, modificador: result.total - result.dados.reduce((sum, die) => sum + die, 0) } }]; } catch { persistenceError = 'Não foi possível rolar o dado.'; }
	}
</script>

<div class="borda-mesa" bind:this={container}>
	<canvas bind:this={canvasMesa}></canvas>
	{#if personagemSelecionado}
		<section class="token-inspector" aria-label={`Informações de ${personagemSelecionado.nome}`}>
			<header>
				<div>
					<span class="inspector-eyebrow">TOKEN SELECIONADO</span>
					<h2>{personagemSelecionado.nome}</h2>
				</div>
				<button
					class="close-button"
					onclick={() => (tokenSelecionadoId = null)}
					aria-label="Fechar inspector">×</button
				>
			</header>
			<div class="quick-stats">
				<span><b>CA</b>{personagemSelecionado.ca}</span><span
					><b>INI</b>{personagemSelecionado.iniciativa}</span
				><span><b>TAM</b>{personagemSelecionado.tamanho}×{personagemSelecionado.tamanho}</span>
			</div>
			<div class="token-rolls"><span>Rolagens rápidas</span><button onclick={() => rollToken('1d20')}>🎲 d20</button><button onclick={() => rollToken('1d20+2')}>Iniciativa</button><button onclick={() => rollToken('1d4')}>d4</button><button onclick={() => rollToken('1d6')}>d6</button><button onclick={() => rollToken('1d8')}>d8</button><button onclick={() => rollToken('1d10')}>d10</button><button onclick={() => rollToken('1d12')}>d12</button></div>
			<div class="hp-control">
				<div>
					<span>Pontos de vida</span><strong
						>{personagemSelecionado.hpAtual} <small>/ {personagemSelecionado.hpMax}</small></strong
					>
				</div>
				<div class="hp-actions">
					<button onclick={() => alterarHp(-1)} aria-label="Reduzir 1 ponto de vida">−</button
					><input
						aria-label="Pontos de vida atuais"
						type="number"
						min="0"
						max={personagemSelecionado.hpMax}
						value={personagemSelecionado.hpAtual}
						onchange={(event) => definirHp(event.currentTarget.value)}
					/><button onclick={() => alterarHp(1)} aria-label="Aumentar 1 ponto de vida">+</button>
				</div>
			</div>
			<div class="status-control">
				<div class="status-heading">
					<span>Condições</span><select bind:value={novoStatus} aria-label="Condição para alternar"
						>{#each statusDisponiveis as status}<option value={status}>{status}</option
							>{/each}</select
					>
				</div>
				<button
					class:active={personagemSelecionado.status?.includes(novoStatus)}
					class="status-toggle"
					onclick={() => alternarStatus(novoStatus)}
					>{personagemSelecionado.status?.includes(novoStatus)
						? `Remover ${novoStatus}`
						: `Aplicar ${novoStatus}`}</button
				>{#if personagemSelecionado.status?.length}<div class="status-list">
						{#each personagemSelecionado.status as status}<button
								onclick={() => alternarStatus(status)}
								title="Remover condição">{status} ×</button
							>{/each}
					</div>{/if}
			</div>
			{#if isGM}
				<div class="visibility-control">
					<div>
						<span class="inspector-eyebrow">VISIBILIDADE PARA OUTROS JOGADORES</span>
						<p>
							O narrador sempre vê os dados completos. Estas opções regulam os outros jogadores.
						</p>
					</div>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showName}
							onchange={(event) => alterarVisibilidade('showName', event.currentTarget.checked)}
						/> Nome</label
					>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showHP}
							onchange={(event) => alterarVisibilidade('showHP', event.currentTarget.checked)}
						/> HP</label
					>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showAC}
							onchange={(event) => alterarVisibilidade('showAC', event.currentTarget.checked)}
						/> CA</label
					>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showStatuses}
							onchange={(event) => alterarVisibilidade('showStatuses', event.currentTarget.checked)}
						/> Condições</label
					>
				</div>
			{/if}
		</section>
	{/if}
	{#if persistenceError}<p class="persistence-error" role="alert">{persistenceError}</p>{/if}
</div>

<style>
	.borda-mesa {
		position: relative;
		border: 4px solid #444;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 10px 20px rgba(0, 0, 0, 0.5);
		width: 100%;
		height: min(calc(100dvh - 210px), 900px);
		min-height: 560px;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	@media (max-width: 760px) {
		.borda-mesa {
			height: calc(100dvh - 142px);
			min-height: 420px;
			border-width: 2px;
		}
		.token-inspector {
			top: auto;
			right: 0.45rem;
			bottom: 0.45rem;
			width: calc(100% - 0.9rem);
			max-height: 52%;
			overflow: auto;
		}
	}
	.token-inspector {
		position: absolute;
		z-index: 2;
		top: 1rem;
		right: 1rem;
		width: min(300px, calc(100% - 2rem));
		padding: 1rem;
		border: 1px solid rgba(216, 173, 103, 0.42);
		border-radius: 12px;
		color: #f4eee4;
		background: rgba(27, 22, 27, 0.95);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(12px);
	}
	.token-inspector header {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: start;
		margin-bottom: 0.9rem;
	}
	.inspector-eyebrow {
		color: #d8ad67;
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}
	.token-inspector h2 {
		margin: 0.2rem 0 0;
		font:
			600 1.2rem Georgia,
			serif;
	}
	.token-rolls { display:flex; flex-wrap:wrap; gap:.35rem; padding:.7rem 1rem; border-top:1px solid #493c39; }.token-rolls>span{width:100%;color:#b9aa9d;font-size:.66rem;text-transform:uppercase;letter-spacing:.08em}.token-rolls button{border:1px solid #765d3d;border-radius:6px;padding:.36rem .48rem;color:#f0d29d;background:#2b211c;font-size:.68rem;cursor:pointer}
	.close-button {
		border: 0;
		padding: 0 0.2rem;
		color: #aa9e94;
		background: transparent;
		font-size: 1.4rem;
		line-height: 1;
	}
	.close-button:hover {
		color: #fff;
	}
	.quick-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin-bottom: 0.8rem;
		border: 1px solid #423839;
		border-radius: 8px;
		overflow: hidden;
	}
	.quick-stats span {
		display: grid;
		place-items: center;
		gap: 0.16rem;
		padding: 0.45rem;
		border-right: 1px solid #423839;
		color: #e6d9ca;
		font-size: 0.88rem;
	}
	.quick-stats span:last-child {
		border: 0;
	}
	.quick-stats b {
		color: #92857b;
		font-size: 0.58rem;
		letter-spacing: 0.07em;
	}
	.hp-control,
	.status-control {
		padding: 0.75rem 0;
		border-top: 1px solid #423839;
	}
	.hp-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.hp-control > div:first-child {
		display: grid;
		gap: 0.2rem;
		color: #a99c91;
		font-size: 0.72rem;
	}
	.hp-control strong {
		color: #f4eee4;
		font-size: 1rem;
	}
	.hp-control small {
		color: #95887f;
		font-size: 0.72rem;
		font-weight: 500;
	}
	.hp-actions {
		display: flex;
		align-items: center;
		border: 1px solid #5a4841;
		border-radius: 7px;
		overflow: hidden;
	}
	.hp-actions button,
	.hp-actions input {
		width: 2rem;
		height: 2rem;
		border: 0;
		color: #f0debf;
		background: #302629;
		text-align: center;
	}
	.hp-actions button:hover {
		background: #4a382d;
	}
	.hp-actions input {
		width: 2.5rem;
		border-inline: 1px solid #5a4841;
		color: #fff;
	}
	.hp-actions input::-webkit-inner-spin-button {
		appearance: none;
	}
	.status-control {
		padding-bottom: 0;
	}
	.status-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		color: #a99c91;
		font-size: 0.72rem;
	}
	.status-heading select {
		max-width: 150px;
		border: 1px solid #5a4841;
		border-radius: 6px;
		padding: 0.32rem;
		color: #e7dacc;
		background: #282125;
		font-size: 0.72rem;
	}
	.status-toggle {
		width: 100%;
		margin-top: 0.55rem;
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.45rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.76rem;
		font-weight: 700;
	}
	.status-toggle:hover,
	.status-toggle.active {
		color: #ffe3a8;
		border-color: #c29754;
		background: #493323;
	}
	.status-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.65rem;
	}
	.status-list button {
		border: 1px solid #5e4964;
		border-radius: 999px;
		padding: 0.22rem 0.45rem;
		color: #d7c0e6;
		background: #2c2233;
		font-size: 0.67rem;
	}
	.visibility-control {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		margin-top: 0.8rem;
		padding-top: 0.8rem;
		border-top: 1px solid #423839;
		color: #c7b8a7;
		font-size: 0.72rem;
	}
	.visibility-control > div {
		grid-column: 1 / -1;
	}
	.visibility-control p {
		margin: 0.25rem 0 0;
		color: #8f8378;
		line-height: 1.35;
	}
	.visibility-control label {
		display: flex;
		align-items: center;
		gap: 0.38rem;
	}
	.visibility-control input {
		accent-color: #d8ad67;
	}
	.persistence-error {
		position: absolute;
		z-index: 3;
		bottom: 1rem;
		left: 1rem;
		max-width: min(400px, calc(100% - 2rem));
		margin: 0;
		padding: 0.65rem 0.8rem;
		border: 1px solid #944a4a;
		border-radius: 7px;
		color: #ffb2aa;
		background: rgba(52, 18, 18, 0.94);
		font-size: 0.76rem;
	}
	@media (max-width: 760px) {
		.token-inspector {
			top: auto;
			right: 0.45rem;
			bottom: 0.45rem;
			width: calc(100% - 0.9rem);
			max-height: 52%;
			overflow: auto;
		}
	}
</style>
