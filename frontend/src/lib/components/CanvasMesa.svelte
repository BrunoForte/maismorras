<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { GameEngine } from '$lib/engine/GameEngine';
	import {
		personagens,
		urlMapa,
		type Personagem,
		type StatusToken,
		type TokenVisibility
	} from '$lib/stores/gameStore';
	import {
		addSceneEffect,
		createToken,
		createSceneArea,
		createSceneWall,
		deleteSceneArea,
		deleteSceneWall,
		interactWithNearbyDoor,
		setSceneDoorOpen,
		listEffectDefinitions,
		listSceneEffects,
		loadScene,
		moveToken,
		removeSceneEffect,
		rollTokenInitiative,
		updateFog,
		updateToken,
		type EffectDefinition,
		type PersistedToken,
		type SceneEffect,
		type SceneArea,
		type SceneWall,
		type Scene
	} from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { listNPCs, type NPC } from '$lib/services/npcApi';
	import { rollDice } from '$lib/services/eventApi';

	let { scene, session, isGM, onopensheet = (_actorId: string) => {} }: { scene: Scene; session: Session; isGM: boolean; onopensheet?: (actorId: string) => void } = $props();

	let canvasMesa: HTMLCanvasElement;
	let container: HTMLDivElement;
	let tokenSelecionadoId = $state<number | null>(null);
	let definicoesDeEfeito = $state<EffectDefinition[]>([]);
	let efeitosAtivos = $state<SceneEffect[]>([]);
	let definicaoSelecionada = $state('');
	let duracaoEfeito = $state('');
	let personagemSelecionado = $derived(
		$personagens.find((personagem) => personagem.id === tokenSelecionadoId)
	);
	let atoresNPC = $state<NPC[]>([]);
	let npcSelecionado = $derived(
		personagemSelecionado?.actorId
			? atoresNPC.find((npc) => npc.id === personagemSelecionado.actorId)
			: undefined
	);
	let persistenceError = $state('');
	const pendingCreates = new Set<number>();
	const savedSnapshots = new Map<string, string>();
	let sceneSocket: SceneSocket | null = null;
	let motor: GameEngine | null = null;
	let fogMode = $state<'reveal' | 'hide' | null>(null);
	let fogBrush = $state(1);
	let areas = $state<SceneArea[]>([]);
	let saveAreaArmed = $state(false);
	let areaLabel = $state('Área de efeito');
	let areaVisible = $state(true);
	let areaToolsOpen = $state(false);
	let walls = $state<SceneWall[]>([]);
	let wallDrawing = $state(false);
	let wallKind = $state<'wall' | 'door'>('wall');
	let pingArmed = $state(false);
	let efeitoSelecionado = $derived(definicoesDeEfeito.find((item) => item.slug === definicaoSelecionada));
	let efeitosDoToken = $derived(
		personagemSelecionado?.persistedId
			? efeitosAtivos.filter((item) => item.tokenId === personagemSelecionado.persistedId)
			: []
	);

	function asPersonagem(token: PersistedToken, index: number): Personagem {
		return {
			id: index + 1,
			persistedId: token.id,
			actorId: token.actorId ?? undefined,
			isOwned: token.isOwner,
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
			visionRange: token.visionRange,
			lightRange: token.lightRange,
			fotoUrl: token.imageUrl ?? undefined,
			tamanho: token.size,
			fotoEscala: 1,
			fotoOffsetX: 0,
			fotoOffsetY: 0,
			status: token.statuses as StatusToken[],
			visibility: token.visibility
		};
	}

	function asPersisted(personagem: Personagem): Omit<PersistedToken, 'id' | 'actorId' | 'isOwner'> {
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
			visionRange: personagem.visionRange,
			lightRange: personagem.lightRange,
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
	async function persistirMovimentoDoJogador(personagem: Personagem, x: number, y: number) {
		if (!personagem.persistedId) return;
		try {
			await moveToken(session, scene.id, personagem.persistedId, x, y);
			sceneSocket?.publishRefresh();
			persistenceError = '';
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível mover o token.';
			await carregarTokens();
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
			motor?.setFog(response.scene.fogEnabled, isGM, response.fog.visibleCells, response.fog.revealedCells, response.fog.hiddenCells);
			areas = response.areas;
			motor?.setAreas(response.areas);
			walls = response.walls;
			motor?.setWalls(response.walls);
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

	async function carregarEfeitos() {
		try {
			const [catalogo, aplicados] = await Promise.all([
				listEffectDefinitions(session, scene.id),
				listSceneEffects(session, scene.id)
			]);
			definicoesDeEfeito = catalogo.definitions;
			efeitosAtivos = aplicados.effects;
			if (!definicaoSelecionada && catalogo.definitions[0])
				definicaoSelecionada = catalogo.definitions[0].slug;
		} catch (error) {
			// The board remains usable while a deployment/migration is in progress.
			persistenceError = error instanceof Error ? error.message : 'Não foi possível carregar condições.';
		}
	}

	async function carregarNPCs() {
		if (!isGM) return;
		try {
			atoresNPC = (await listNPCs(session, scene.campaignId)).npcs;
		} catch (error) {
			// NPC action cards are supplemental; the map continues usable if a
			// deployment is temporarily behind the current frontend revision.
			persistenceError = error instanceof Error ? error.message : 'Não foi possível carregar ações do NPC.';
		}
	}

	async function aplicarCondicaoOficial() {
		if (!isGM || !personagemSelecionado?.persistedId || !efeitoSelecionado) return;
		const parsedDuration = Number(duracaoEfeito);
		const remainingTurns = duracaoEfeito.trim() && Number.isInteger(parsedDuration) && parsedDuration > 0
			? parsedDuration
			: null;
		try {
			const effect = await addSceneEffect(session, scene.id, {
				tokenId: personagemSelecionado.persistedId,
				name: efeitoSelecionado.name,
				source: efeitoSelecionado.source,
				remainingTurns,
				tickAt: 'turn_end'
			});
			efeitosAtivos = [...efeitosAtivos, effect];
			persistenceError = '';
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível aplicar a condição.';
		}
	}

	async function removerEfeito(effect: SceneEffect) {
		if (!isGM) return;
		try {
			await removeSceneEffect(session, scene.id, effect.id);
			efeitosAtivos = efeitosAtivos.filter((item) => item.id !== effect.id);
			persistenceError = '';
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível remover a condição.';
		}
	}

	function impedeMovimento(personagem: Personagem) {
		const tokenID = personagem.persistedId;
		if (!tokenID) return false;
		return efeitosAtivos.some(
			(effect) =>
				effect.tokenId === tokenID &&
				['Agarrado', 'Impedido', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(effect.name)
		);
	}
	async function paintFog(worldX: number, worldY: number) {
		if (!isGM || !fogMode || !scene.fogEnabled) return;
		const centerX = Math.floor(worldX / scene.gridSize), centerY = Math.floor(worldY / scene.gridSize);
		const radius = Math.floor(fogBrush / 2);
		const cells: [number, number][] = [];
		for (let x = centerX - radius; x <= centerX + radius; x++) for (let y = centerY - radius; y <= centerY + radius; y++) cells.push([x, y]);
		try { await updateFog(session, scene.id, fogMode, cells); sceneSocket?.publishRefresh(); await carregarTokens(); } catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível pintar a névoa.'; }
	}
	function handleMapTap(worldX: number, worldY: number) {
		if (pingArmed) {
			pingArmed = false;
			motor?.showPing(worldX, worldY);
			sceneSocket?.publishPing(worldX, worldY);
			return;
		}
		void paintFog(worldX, worldY);
	}
	async function saveMeasuredArea(area: { shape: 'line' | 'circle' | 'cone'; startX: number; startY: number; endX: number; endY: number }) {
		if (!isGM || !saveAreaArmed) return;
		saveAreaArmed = false;
		try { const created = await createSceneArea(session, scene.id, { ...area, startX: Math.round(area.startX), startY: Math.round(area.startY), endX: Math.round(area.endX), endY: Math.round(area.endY), color: area.shape === 'circle' ? 0x8bc4ff : area.shape === 'cone' ? 0xf0a8e1 : 0xffaa00, label: areaLabel.trim() || 'Área de efeito', visibleToPlayers: areaVisible }); areas = [...areas,created]; motor?.setAreas(areas); sceneSocket?.publishRefresh(); } catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível salvar a área.'; }
	}
	async function removeArea(area: SceneArea) { try { await deleteSceneArea(session,scene.id,area.id); areas=areas.filter((item)=>item.id!==area.id);motor?.setAreas(areas);sceneSocket?.publishRefresh(); } catch(error){persistenceError=error instanceof Error?error.message:'Não foi possível remover a área.';} }
	async function saveWall(wall: Omit<SceneWall, 'id' | 'kind' | 'open'>) {
		if (!isGM) return;
		wallDrawing = false;
		try {
			const created = await createSceneWall(session, scene.id, { ...wall, kind: wallKind, open: false });
			walls = [...walls, created];
			motor?.setWalls(walls);
			sceneSocket?.publishRefresh();
		} catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível salvar a parede.'; }
	}
	async function removeWall(wall: SceneWall) {
		try { await deleteSceneWall(session, scene.id, wall.id); walls = walls.filter((item) => item.id !== wall.id); motor?.setWalls(walls); sceneSocket?.publishRefresh(); }
		catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível remover a parede.'; }
	}
	async function toggleDoor(wall: SceneWall) {
		try { const updated = await setSceneDoorOpen(session, scene.id, wall.id, !wall.open); walls = walls.map((item) => item.id === updated.id ? updated : item); motor?.setWalls(walls); sceneSocket?.publishRefresh(); }
		catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível alterar a porta.'; }
	}
	function toggleWallDrawing() {
		wallDrawing = !wallDrawing;
		motor?.setWallDrawing(wallDrawing);
	}

	onMount(() => {
		motor = new GameEngine(
			(tokenId) => (tokenSelecionadoId = tokenId),
			(tokenId, x, y) => {
				const personagem = $personagens.find((item) => item.id === tokenId);
				if (!personagem || (!isGM && (!scene.allowPlayerMovement || !personagem.isOwned))) return false;
				if (impedeMovimento(personagem)) {
					persistenceError = `${personagem.nome} não pode se mover enquanto estiver sob esta condição.`;
					return false;
				}
				personagens.update((lista) =>
					lista.map((personagem) =>
						personagem.id === tokenId ? { ...personagem, x, y } : personagem
					)
				);
				if (!isGM) void persistirMovimentoDoJogador(personagem, x, y);
				return true;
			},
			(x, y) => handleMapTap(x, y),
			(area) => void saveMeasuredArea(area),
			(wall) => void saveWall(wall),
			scene.gridSize
		);
		const observer = new ResizeObserver(([entry]) => {
			motor?.resize(entry.contentRect.width, entry.contentRect.height);
		});
		void motor.init(canvasMesa).then(async () => {
			observer.observe(container);
			await carregarTokens();
			await carregarEfeitos();
			await carregarNPCs();
		});
		sceneSocket = connectSceneSocket(session, scene.id, () => {
			void carregarTokens();
			void carregarEfeitos();
		}, (ping) => motor?.showPing(ping.x, ping.y, ping.color));

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
			motor?.destroy();
			motor = null;
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

	function alterarVisibilidade(campo: keyof TokenVisibility, marcado: boolean) {
		atualizarSelecionado((personagem) => ({
			...personagem,
			visibility: { ...personagem.visibility, [campo]: marcado }
		}));
	}
	function alterarVisao(valor: string) {
		const visionRange = Math.max(0, Math.min(30, Math.round(Number(valor))));
		if (!Number.isFinite(visionRange)) return;
		atualizarSelecionado((personagem) => ({ ...personagem, visionRange }));
	}
	function alterarLuz(valor: string) {
		const lightRange = Math.max(0, Math.min(30, Math.round(Number(valor))));
		if (!Number.isFinite(lightRange)) return;
		atualizarSelecionado((personagem) => ({ ...personagem, lightRange }));
	}
	async function interagirComPorta() {
		try {
			const result = await interactWithNearbyDoor(session, scene.id);
			persistenceError = result.open ? 'Você abriu uma porta próxima.' : 'Você fechou uma porta próxima.';
			sceneSocket?.publishRefresh();
			await carregarTokens();
		} catch (error) { persistenceError = error instanceof Error ? error.message : 'Não há porta próxima para interagir.'; }
	}
	async function rollSelectedInitiative() {
		if (!personagemSelecionado?.persistedId || (!isGM && !personagemSelecionado.isOwned)) return;
		try {
			const result = await rollTokenInitiative(session, scene.id, personagemSelecionado.persistedId);
			personagens.update((tokens) => tokens.map((token) => token.persistedId === result.tokenId ? { ...token, iniciativa: result.initiative } : token));
			$diceOverlay = { expression: `${personagemSelecionado.nome} · iniciativa`, total: result.initiative, dice: [result.roll] };
			$chatMensagens = [...$chatMensagens, { id: crypto.randomUUID(), autor: personagemSelecionado.nome, texto: `Iniciativa: ${result.roll} ${result.bonus >= 0 ? '+' : ''}${result.bonus} = ${result.initiative}`, tipo: 'rolagem', canal: 'combat', detalhesRolagem: { expressao: `1d20${result.bonus >= 0 ? '+' : ''}${result.bonus}`, dados: [result.roll], modificador: result.bonus, total: result.initiative } }];
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.';
		}
	}
	async function rolarAcaoDeNPC(action: NPC['sheet']['actions'][number]) {
		if (!isGM || !npcSelecionado || action.toHit === undefined) return;
		try {
			const attackEvent = await rollDice(session, scene.campaignId, `1d20${action.toHit >= 0 ? '+' : ''}${action.toHit}`, undefined, 'combat');
			const attack = attackEvent.payload as { expressao: string; dados: number[]; total: number };
			const critical = attack.dados[0] === 20;
			$chatMensagens = [...$chatMensagens, {
				id: String(attackEvent.id), autor: npcSelecionado.name,
				texto: `${action.name} · ataque${critical ? ' · CRÍTICO!' : ''}`, tipo: 'rolagem', canal: 'combat',
				detalhesRolagem: { ...attack, modificador: attack.total - attack.dados.reduce((sum, die) => sum + die, 0) }
			}];
			$diceOverlay = { expression: `${npcSelecionado.name} · ${action.name}`, total: attack.total, dice: attack.dados };
			const match = action.damage.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
			if (!match) return;
			const count = Number(match[1]) * (critical ? 2 : 1);
			const modifier = match[3] === '-' ? -Number(match[4] ?? 0) : Number(match[4] ?? 0);
			const expression = `${count}d${match[2]}${modifier ? `${modifier >= 0 ? '+' : ''}${modifier}` : ''}`;
			const damageEvent = await rollDice(session, scene.campaignId, expression, undefined, 'combat');
			const damage = damageEvent.payload as { expressao: string; dados: number[]; total: number };
			$chatMensagens = [...$chatMensagens, {
				id: String(damageEvent.id), autor: npcSelecionado.name,
				texto: `${action.name} · dano${critical ? ' crítico' : ''}`, tipo: 'rolagem', canal: 'combat',
				detalhesRolagem: { ...damage, modificador: damage.total - damage.dados.reduce((sum, die) => sum + die, 0) }
			}];
			$diceOverlay = { expression: `${npcSelecionado.name} · ${action.name} · dano`, total: damage.total, dice: damage.dados };
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível rolar a ação do NPC.';
		}
	}
</script>

<div class="borda-mesa" bind:this={container}>
	<canvas bind:this={canvasMesa}></canvas>
	<div class="scene-hud"><strong>{scene.name}</strong>{#if scene.fogEnabled}<span>◒ Névoa de guerra ativa</span>{/if}{#if isGM}<small>{scene.playerAccess === 'active' ? 'Visível para jogadores' : scene.playerAccess === 'available' ? 'Disponível para jogadores' : 'Oculta para jogadores'}</small>{/if}</div>
	<div class="ping-tool"><button class:active={pingArmed} onclick={() => pingArmed = !pingArmed}>{pingArmed ? 'Clique no mapa' : '📍 Sinalizar'}</button></div>
	{#if isGM && scene.fogEnabled}<div class="fog-tools"><strong>🌫 Névoa</strong><div><button class:active={fogMode === 'reveal'} onclick={() => fogMode = fogMode === 'reveal' ? null : 'reveal'}>Revelar</button><button class:active={fogMode === 'hide'} onclick={() => fogMode = fogMode === 'hide' ? null : 'hide'}>Ocultar</button></div><select bind:value={fogBrush} aria-label="Tamanho do pincel"><option value={1}>1×1</option><option value={3}>3×3</option><option value={5}>5×5</option></select>{#if fogMode}<small>Clique no mapa para {fogMode === 'reveal' ? 'revelar' : 'ocultar'}.</small>{/if}</div>{/if}
	{#if isGM}<div class="area-tool-trigger"><button class:active={areaToolsOpen || saveAreaArmed} onclick={() => areaToolsOpen = !areaToolsOpen}>✦ Áreas</button>{#if areaToolsOpen}<div class="area-tools"><strong>Área persistente</strong><small>Escolha a régua e arraste com Shift para salvar a área.</small><input bind:value={areaLabel} maxlength="80" aria-label="Rótulo da área"/><label><input type="checkbox" bind:checked={areaVisible}/> jogadores veem</label><button class:active={saveAreaArmed} onclick={() => saveAreaArmed=!saveAreaArmed}>{saveAreaArmed ? 'Desenhe com Shift' : 'Salvar próxima régua'}</button>{#if areas.length}<div class="area-list">{#each areas as area}<span>{area.label}<button onclick={() => void removeArea(area)}>×</button></span>{/each}</div>{/if}</div>{/if}</div>{/if}
	{#if isGM && scene.fogEnabled}<div class="wall-tools"><strong>▰ Barreiras</strong><select bind:value={wallKind} aria-label="Tipo de barreira"><option value="wall">Parede</option><option value="door">Porta</option></select><button class:active={wallDrawing} onclick={toggleWallDrawing}>{wallDrawing ? 'Arraste no mapa…' : `Desenhar ${wallKind === 'door' ? 'porta' : 'parede'}`}</button><small>Fechadas bloqueiam visão e movimento.</small>{#if walls.length}<div class="wall-list">{#each walls as wall}<span>{wall.kind === 'door' ? (wall.open ? 'Porta aberta' : 'Porta fechada') : 'Parede'}<span>{#if wall.kind === 'door'}<button onclick={() => void toggleDoor(wall)}>{wall.open ? 'Fechar' : 'Abrir'}</button>{/if}<button onclick={() => void removeWall(wall)} aria-label="Remover barreira">×</button></span></span>{/each}</div>{/if}</div>{/if}
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
			{#if isGM && scene.fogEnabled}<div class="vision-control"><span>Visão na névoa <small>(quadrados)</small></span><input type="number" min="0" max="30" value={personagemSelecionado.visionRange} onchange={(event) => alterarVisao(event.currentTarget.value)} aria-label="Raio de visão em quadrados"/></div><div class="vision-control"><span>Fonte de luz <small>(quadrados)</small></span><input type="number" min="0" max="30" value={personagemSelecionado.lightRange} onchange={(event) => alterarLuz(event.currentTarget.value)} aria-label="Raio de luz em quadrados"/></div>{/if}
			{#if !isGM && personagemSelecionado.isOwned && scene.allowPlayerDoorInteraction}<button class="door-interaction" onclick={() => void interagirComPorta()}>🚪 Interagir com porta próxima</button>{/if}
			{#if personagemSelecionado.actorId && (isGM || personagemSelecionado.isOwned)}<button class="open-sheet" onclick={() => onopensheet(personagemSelecionado.actorId!)}>Abrir ficha vinculada</button>{/if}
			{#if isGM || personagemSelecionado.isOwned}<div class="token-rolls"><span>Rolagem do token</span><button onclick={() => void rollSelectedInitiative()}>⚔️ Rolar iniciativa</button></div>{/if}
			{#if isGM && npcSelecionado?.sheet.actions.length}
				<div class="npc-actions">
					<span>Ações da criatura</span>
					{#each npcSelecionado.sheet.actions as action (action.name)}
						<button onclick={() => void rolarAcaoDeNPC(action)} title={action.description || action.damage}>
							<strong>{action.name}</strong>
							<small>{action.toHit >= 0 ? `+${action.toHit}` : action.toHit} · {action.damage || action.range || 'Ação'}</small>
						</button>
					{/each}
				</div>
			{/if}
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
			{#if isGM}
				<div class="official-effects">
					<div class="status-heading"><span>Condições oficiais (SRD)</span></div>
					{#if definicoesDeEfeito.length}
						<select bind:value={definicaoSelecionada} aria-label="Condição oficial">
							{#each definicoesDeEfeito as definition}<option value={definition.slug}>{definition.name}</option>{/each}
						</select>
						{#if efeitoSelecionado}<p>{efeitoSelecionado.summary}</p>{/if}
						<div class="effect-actions">
							<input bind:value={duracaoEfeito} inputmode="numeric" type="number" min="1" placeholder="Turnos (opcional)" aria-label="Duração em turnos" />
							<button onclick={aplicarCondicaoOficial}>Aplicar</button>
						</div>
					{:else}<p class="effect-empty">Execute a migração 0017 para carregar o catálogo SRD.</p>{/if}
					{#if efeitosDoToken.length}
						<div class="official-effect-list">
							{#each efeitosDoToken as effect}<span title={effect.source}>{effect.name}{effect.remainingTurns ? ` · ${effect.remainingTurns} turnos` : ''}{#if isGM}<button onclick={() => void removerEfeito(effect)} aria-label={`Remover ${effect.name}`}>×</button>{/if}</span>{/each}
						</div>
					{/if}
				</div>
			{/if}
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
	.scene-hud { position:absolute; z-index:2; top:.8rem; left:.9rem; display:grid; gap:.13rem; max-width:calc(100% - 6rem); padding:.45rem .65rem; border:1px solid rgba(216,173,103,.3); border-radius:7px; color:#f2e6d7; background:rgba(25,19,23,.78); box-shadow:0 5px 14px #0004; pointer-events:none; backdrop-filter:blur(8px); }
	.scene-hud strong { font:600 .8rem Georgia,serif; }.scene-hud span,.scene-hud small { color:#d8b779; font-size:.59rem; letter-spacing:.04em; }
	.ping-tool{position:absolute;z-index:4;bottom:.9rem;left:.9rem}.ping-tool button{border:1px solid #765d3d;border-radius:7px;padding:.42rem .6rem;color:#ecd8a8;background:rgba(25,19,23,.92);font-size:.67rem;cursor:pointer}.ping-tool button.active{color:#291b10;background:#e0b86f}
	.fog-tools { position:absolute; z-index:4; top:.8rem; right:.8rem; display:grid; gap:.35rem; padding:.55rem; border:1px solid #765d3d; border-radius:8px; color:#ebddca; background:rgba(25,19,23,.92); font-size:.65rem; }.fog-tools div{display:flex;gap:.25rem}.fog-tools button,.fog-tools select{border:1px solid #5d493b;border-radius:5px;padding:.3rem;color:#e8d3aa;background:#241c1e;font-size:.63rem}.fog-tools button.active{color:#271b10;background:#e0b86f}.fog-tools small{color:#baaa98;font-size:.58rem}
	.area-tool-trigger{position:absolute;z-index:4;top:8.6rem;right:.8rem}.area-tool-trigger>button{border:1px solid #765d3d;border-radius:7px;padding:.42rem .6rem;color:#ecd8a8;background:rgba(25,19,23,.92);font-size:.67rem;cursor:pointer}.area-tool-trigger>button.active{color:#291b10;background:#e0b86f}.area-tools{position:absolute;z-index:1;top:0;right:2.8rem;display:grid;gap:.3rem;width:180px;padding:.55rem;border:1px solid #765d3d;border-radius:8px;color:#ebddca;background:rgba(25,19,23,.96);font-size:.62rem;box-shadow:0 10px 24px #0006}.area-tools small{color:#b9aa9d;line-height:1.35}.area-tools input{min-width:0;border:1px solid #5d493b;border-radius:4px;padding:.3rem;color:#e8d3aa;background:#241c1e;font-size:.62rem}.area-tools label{color:#b9aa9d}.area-tools button{border:1px solid #765d3d;border-radius:5px;padding:.35rem;color:#e8d3aa;background:#2b211e;font-size:.62rem}.area-tools button.active{color:#281a0f;background:#e0b86f}.area-list{display:grid;gap:.2rem;max-height:92px;overflow:auto}.area-list span{display:flex;justify-content:space-between;gap:.25rem;color:#d8c5aa}.area-list button{border:0;padding:0;color:#dfa797;background:transparent}
	.wall-tools{position:absolute;z-index:4;top:12rem;right:.8rem;display:grid;gap:.3rem;width:145px;padding:.55rem;border:1px solid #765d3d;border-radius:8px;color:#ebddca;background:rgba(25,19,23,.92);font-size:.62rem}.wall-tools button,.wall-tools select{border:1px solid #765d3d;border-radius:5px;padding:.35rem;color:#e8d3aa;background:#2b211e;font-size:.62rem}.wall-tools button.active{color:#281a0f;background:#e0b86f}.wall-tools small{color:#b9aa9d;font-size:.58rem}.wall-list{display:grid;gap:.2rem;max-height:70px;overflow:auto}.wall-list>span,.wall-list>span>span{display:flex;justify-content:space-between;gap:.25rem;color:#d8c5aa}.wall-list button{border:0;padding:0;color:#dfa797;background:transparent}
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
	.npc-actions { display:grid; gap:.38rem; padding:.7rem 1rem; border-top:1px solid #493c39; }.npc-actions>span { color:#b9aa9d; font-size:.66rem; text-transform:uppercase; letter-spacing:.08em; }.npc-actions button { display:flex; align-items:center; justify-content:space-between; gap:.55rem; border:1px solid #765d3d; border-radius:7px; padding:.48rem .55rem; color:#f1dfbd; background:#2b211c; text-align:left; cursor:pointer; }.npc-actions button:hover { background:#403027; }.npc-actions button strong { font-size:.73rem; }.npc-actions button small { color:#bba994; font-size:.65rem; }
	.open-sheet{margin:0 1rem .5rem;border:1px solid #765d3d;border-radius:6px;padding:.42rem .55rem;color:#f0d29d;background:#2b211c;font-size:.7rem;cursor:pointer}
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
	.vision-control { display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin-bottom:.8rem; padding:.55rem .65rem; border:1px solid #423839; border-radius:8px; color:#cdbda9; font-size:.7rem; }.vision-control small { color:#8f8378; font-size:.61rem; }.vision-control input { width:3rem; border:1px solid #5a4841; border-radius:5px; padding:.3rem; color:#f4eee4; background:#282125; text-align:center; }
	.door-interaction { width:calc(100% - 2rem); margin:0 1rem .7rem; border:1px solid #927449; border-radius:6px; padding:.46rem .55rem; color:#f0d29d; background:#2b211c; font-size:.7rem; cursor:pointer; }
	.hp-control {
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
	.status-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		color: #a99c91;
		font-size: 0.72rem;
	}
	.official-effects {
		padding: .75rem 0;
		border-top: 1px solid #423839;
	}
	.official-effects select,
	.effect-actions input {
		box-sizing: border-box;
		width: 100%;
		margin-top: .45rem;
		border: 1px solid #5a4841;
		border-radius: 6px;
		padding: .42rem;
		color: #e7dacc;
		background: #282125;
		font-size: .72rem;
	}
	.official-effects p {
		margin: .45rem 0;
		color: #b9aa9d;
		font-size: .7rem;
		line-height: 1.35;
	}
	.effect-actions { display: flex; gap: .4rem; align-items: end; }
	.effect-actions input { margin: 0; }
	.effect-actions button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: .45rem .62rem;
		color: #e8c786;
		background: #2a211e;
		font-size: .72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.official-effect-list { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .55rem; }
	.official-effect-list span { display: inline-flex; align-items: center; gap: .25rem; border: 1px solid #624d42; border-radius: 999px; padding: .23rem .42rem; color: #e9d5ad; font-size: .64rem; }
	.official-effect-list button { border: 0; padding: 0; color: #e9d5ad; background: transparent; cursor: pointer; font-size: .85rem; line-height: .65rem; }
	.effect-empty { color: #c69072 !important; }
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
