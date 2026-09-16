<!-- eslint-disable svelte/require-each-key -- transient map controls use positional collections. -->
<script lang="ts">
	/* eslint-disable svelte/require-each-key */
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
		deleteSceneToken,
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
		updateTokenAppearance,
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
	import { supabase } from '$lib/services/supabase';
	import { appLocale } from '$lib/stores/locale';

	let {
		scene,
		session,
		isGM,
		onopensheet = () => {}
	}: {
		scene: Scene;
		session: Session;
		isGM: boolean;
		onopensheet?: (actorId: string) => void;
	} = $props();

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
	// These collections are mutation-only persistence guards, not UI state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingCreates = new Set<number>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
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
	let wallToolsOpen = $state(false);
	let pingArmed = $state(false);
	let cameraZoom = $state(1);
	let gridVisible = $state(true);
	let wallsVisible = $state(true);
	let areasVisible = $state(true);
	let layerToolsOpen = $state(false);
	let ambientAudioA = $state<HTMLAudioElement>();
	let ambientAudioB = $state<HTMLAudioElement>();
	let ambientAudioURL = $state<string | null>(null);
	let ambientPlaying = $state(false);
	let activeDeck = $state<'a' | 'b'>('a');
	const fadeDuration = 900;
	const activeAudio = () => (activeDeck === 'a' ? ambientAudioA : ambientAudioB);
	const inactiveAudio = () => (activeDeck === 'a' ? ambientAudioB : ambientAudioA);
	const targetVolume = () => Math.max(0, Math.min(1, scene.ambientAudioVolume / 100));
	$effect(() => {
		if (scene.ambientAudioEnabled && scene.ambientAudioPath) void carregarTrilha();
	});
	let efeitoSelecionado = $derived(
		definicoesDeEfeito.find((item) => item.slug === definicaoSelecionada)
	);
	let efeitosDoToken = $derived(
		personagemSelecionado?.persistedId
			? efeitosAtivos.filter((item) => item.tokenId === personagemSelecionado.persistedId)
			: []
	);

	function asPersonagem(
		token: PersistedToken,
		index: number,
		imageUrl = token.imageUrl
	): Personagem {
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
			fotoUrl: imageUrl ?? undefined,
			tamanho: token.size,
			fotoEscala: token.visibility.imageScale ?? 1,
			fotoOffsetX: token.visibility.imageOffsetX ?? 0,
			fotoOffsetY: token.visibility.imageOffsetY ?? 0,
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
			visibility: {
				...personagem.visibility,
				imageScale: personagem.fotoEscala,
				imageOffsetX: personagem.fotoOffsetX,
				imageOffsetY: personagem.fotoOffsetY
			}
		};
	}

	async function persistir(personagem: Personagem) {
		if (!personagem.persistedId) return;
		if (!isGM) {
			if (!personagem.isOwned) return;
			try { await updateTokenAppearance(session, scene.id, personagem.persistedId, personagem.fotoUrl ?? null, personagem.cor, {
				...personagem.visibility,
				imageScale: personagem.fotoEscala,
				imageOffsetX: personagem.fotoOffsetX,
				imageOffsetY: personagem.fotoOffsetY
			}); } catch (error) { persistenceError = error instanceof Error ? error.message : 'Não foi possível salvar a aparência.'; return; }
			sceneSocket?.publishRefresh();
			return;
		}
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
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not save the token.'
						: 'Não foi possível salvar o token.';
		}
	}
	async function persistirMovimentoDoJogador(personagem: Personagem, x: number, y: number) {
		if (!personagem.persistedId) return;
		try {
			await moveToken(session, scene.id, personagem.persistedId, x, y);
			sceneSocket?.publishRefresh();
			persistenceError = '';
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not move the token.'
						: 'Não foi possível mover o token.';
			await carregarTokens();
		}
	}

	function atualizarSelecionado(transform: (p: Personagem) => Personagem) {
		if (!personagemSelecionado || !isGM) return;
		const atualizado = transform(personagemSelecionado);
		personagens.update((lista) => lista.map((p) => (p.id === atualizado.id ? atualizado : p)));
	}
	function alterarAparencia(campo: 'fotoEscala' | 'fotoOffsetX' | 'fotoOffsetY', valor: string) {
		const numero = Number(valor);
		if (!Number.isFinite(numero)) return;
		atualizarSelecionado((p) => ({ ...p, [campo]: numero }));
		if (personagemSelecionado) void persistir({ ...personagemSelecionado, [campo]: numero });
	}
	function alternarFundoTransparente() {
		if (!personagemSelecionado) return;
		const visibility = {
			...personagemSelecionado.visibility,
			transparentBackground: !personagemSelecionado.visibility.transparentBackground
		};
		atualizarSelecionado((p) => ({ ...p, visibility }));
		void persistir({ ...personagemSelecionado, visibility });
	}
	function alterarCor(valor: string) {
		const color = Number.parseInt(valor.replace('#', ''), 16);
		if (!Number.isFinite(color)) return;
		atualizarSelecionado((p) => ({ ...p, cor: color }));
		if (personagemSelecionado) void persistir({ ...personagemSelecionado, cor: color });
	}

	async function removerTokenSelecionado() {
		if (!isGM || !personagemSelecionado?.persistedId) return;
		const token = personagemSelecionado;
		const persistedId = token.persistedId!;
		if (!confirm(`Remover ${token.nome} desta cena? A ficha ou NPC continuará na campanha.`))
			return;
		try {
			await deleteSceneToken(session, scene.id, persistedId);
			personagens.update((lista) => lista.filter((item) => item.persistedId !== persistedId));
			efeitosAtivos = efeitosAtivos.filter((item) => item.tokenId !== persistedId);
			savedSnapshots.delete(persistedId);
			tokenSelecionadoId = null;
			persistenceError = '';
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not remove the token.'
						: 'Não foi possível remover o token.';
		}
	}

	async function carregarTokens() {
		try {
			const response = await loadScene(session, scene.id);
			urlMapa.set(await resolverImagemDeFundo(response.scene.backgroundUrl));
			motor?.setFog(
				response.scene.fogEnabled,
				isGM,
				response.fog.visibleCells,
				response.fog.revealedCells,
				response.fog.hiddenCells
			);
			areas = response.areas;
			motor?.setAreas(response.areas);
			motor?.setAreasVisible(areasVisible);
			walls = response.walls;
			motor?.setWalls(response.walls);
			motor?.setWallsVisible(wallsVisible);
			const carregados = await Promise.all(
				response.tokens.map(async (token, index) =>
					asPersonagem(token, index, await resolverImagemToken(token.imageUrl))
				)
			);
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
	async function resolverImagemDeFundo(value: string | null) {
		if (!value || !value.startsWith(`campaigns/${scene.campaignId}/media/`) || !supabase)
			return value;
		const { data } = await supabase.storage.from('campaign-assets').createSignedUrl(value, 3600);
		return data?.signedUrl ?? null;
	}
	async function resolverImagemToken(value: string | null) {
		if (!value || !value.startsWith(`campaigns/${scene.campaignId}/`) || !supabase) return value;
		const { data } = await supabase.storage.from('campaign-assets').createSignedUrl(value, 3600);
		return data?.signedUrl ?? null;
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
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível carregar condições.';
		}
	}

	async function carregarNPCs() {
		if (!isGM) return;
		try {
			atoresNPC = (await listNPCs(session, scene.campaignId)).npcs;
		} catch (error) {
			// NPC action cards are supplemental; the map continues usable if a
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível carregar ações do NPC.';
		}
	}
	async function carregarTrilha() {
		if (!scene.ambientAudioEnabled || !scene.ambientAudioPath || !supabase) return;
		const { data, error } = await supabase.storage
			.from('campaign-assets')
			.createSignedUrl(scene.ambientAudioPath, 3600);
		if (error || !data?.signedUrl) {
			persistenceError = error?.message ?? 'Não foi possível carregar a trilha da cena.';
			return;
		}
		const nextURL = data.signedUrl;
		if (!ambientAudioURL) {
			ambientAudioURL = nextURL;
			return;
		}
		if (ambientAudioURL !== nextURL && ambientPlaying) await crossfade(nextURL);
		ambientAudioURL = nextURL;
	}
	function fade(audio: HTMLAudioElement, to: number, duration = fadeDuration) {
		const from = audio.volume,
			started = performance.now();
		return new Promise<void>((resolve) => {
			const step = (now: number) => {
				const progress = Math.min(1, (now - started) / duration);
				audio.volume = from + (to - from) * progress;
				if (progress < 1) requestAnimationFrame(step);
				else resolve();
			};
			requestAnimationFrame(step);
		});
	}
	async function crossfade(nextURL: string) {
		const outgoing = activeAudio(),
			incoming = inactiveAudio();
		if (!outgoing || !incoming) return;
		incoming.src = nextURL;
		incoming.currentTime = 0;
		incoming.volume = 0;
		try {
			await incoming.play();
			await Promise.all([fade(outgoing, 0), fade(incoming, targetVolume())]);
			outgoing.pause();
			outgoing.currentTime = 0;
			activeDeck = activeDeck === 'a' ? 'b' : 'a';
		} catch {
			persistenceError = 'Clique em tocar trilha para autorizar áudio neste navegador.';
		}
	}
	async function toggleTrilha() {
		const audio = activeAudio();
		if (!audio || !ambientAudioURL) return;
		try {
			if (audio.paused) {
				if (!audio.src) audio.src = ambientAudioURL;
				audio.volume = 0;
				await audio.play();
				await fade(audio, targetVolume());
				ambientPlaying = true;
			} else {
				await fade(audio, 0);
				audio.pause();
				ambientPlaying = false;
			}
		} catch {
			persistenceError =
				'O navegador bloqueou a reprodução automática. Clique novamente para iniciar a trilha.';
		}
	}

	async function aplicarCondicaoOficial() {
		if (!isGM || !personagemSelecionado?.persistedId || !efeitoSelecionado) return;
		const parsedDuration = Number(duracaoEfeito);
		const remainingTurns =
			duracaoEfeito.trim() && Number.isInteger(parsedDuration) && parsedDuration > 0
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
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível aplicar a condição.';
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
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not remove the condition.'
						: 'Não foi possível remover a condição.';
		}
	}

	function impedeMovimento(personagem: Personagem) {
		const tokenID = personagem.persistedId;
		if (!tokenID) return false;
		return efeitosAtivos.some(
			(effect) =>
				effect.tokenId === tokenID &&
				['Agarrado', 'Impedido', 'Paralisado', 'Atordoado', 'Petrificado', 'Inconsciente'].includes(
					effect.name
				)
		);
	}
	async function paintFog(worldX: number, worldY: number) {
		if (!isGM || !fogMode || !scene.fogEnabled) return;
		const centerX = Math.floor(worldX / scene.gridSize),
			centerY = Math.floor(worldY / scene.gridSize);
		const radius = Math.floor(fogBrush / 2);
		const cells: [number, number][] = [];
		for (let x = centerX - radius; x <= centerX + radius; x++)
			for (let y = centerY - radius; y <= centerY + radius; y++) cells.push([x, y]);
		try {
			await updateFog(session, scene.id, fogMode, cells);
			sceneSocket?.publishRefresh();
			await carregarTokens();
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not update the fog.'
						: 'Não foi possível pintar a névoa.';
		}
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
	async function saveMeasuredArea(area: {
		shape: 'line' | 'circle' | 'cone';
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	}) {
		if (!isGM || !saveAreaArmed) return;
		saveAreaArmed = false;
		try {
			const created = await createSceneArea(session, scene.id, {
				...area,
				startX: Math.round(area.startX),
				startY: Math.round(area.startY),
				endX: Math.round(area.endX),
				endY: Math.round(area.endY),
				color: area.shape === 'circle' ? 0x8bc4ff : area.shape === 'cone' ? 0xf0a8e1 : 0xffaa00,
				label: areaLabel.trim() || 'Área de efeito',
				visibleToPlayers: areaVisible
			});
			areas = [...areas, created];
			motor?.setAreas(areas);
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível salvar a área.';
		}
	}
	async function removeArea(area: SceneArea) {
		try {
			await deleteSceneArea(session, scene.id, area.id);
			areas = areas.filter((item) => item.id !== area.id);
			motor?.setAreas(areas);
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not remove the area.'
						: 'Não foi possível remover a área.';
		}
	}
	async function saveWall(wall: Omit<SceneWall, 'id' | 'kind' | 'open'>) {
		if (!isGM) return;
		wallDrawing = false;
		try {
			const created = await createSceneWall(session, scene.id, {
				...wall,
				kind: wallKind,
				open: false
			});
			walls = [...walls, created];
			motor?.setWalls(walls);
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível salvar a parede.';
		}
	}
	async function removeWall(wall: SceneWall) {
		try {
			await deleteSceneWall(session, scene.id, wall.id);
			walls = walls.filter((item) => item.id !== wall.id);
			motor?.setWalls(walls);
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not remove the wall.'
						: 'Não foi possível remover a parede.';
		}
	}
	async function toggleDoor(wall: SceneWall) {
		try {
			const updated = await setSceneDoorOpen(session, scene.id, wall.id, !wall.open);
			walls = walls.map((item) => (item.id === updated.id ? updated : item));
			motor?.setWalls(walls);
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not change the door.'
						: 'Não foi possível alterar a porta.';
		}
	}
	function toggleWallDrawing() {
		wallDrawing = !wallDrawing;
		motor?.setWallDrawing(wallDrawing);
	}
	function ajustarZoom(delta: number) {
		motor?.camera?.zoomBy(delta);
		cameraZoom = motor?.camera?.zoom ?? cameraZoom;
		persistirVisaoDaCamera();
	}
	function recentralizarMapa() {
		motor?.camera?.resetView();
		cameraZoom = motor?.camera?.zoom ?? 1;
		persistirVisaoDaCamera();
	}
	function alternarGrade() {
		gridVisible = !gridVisible;
		motor?.setGridVisible(gridVisible);
	}
	function alternarCamada(camada: 'walls' | 'areas') {
		if (camada === 'walls') {
			wallsVisible = !wallsVisible;
			motor?.setWallsVisible(wallsVisible);
		} else {
			areasVisible = !areasVisible;
			motor?.setAreasVisible(areasVisible);
		}
	}
	type MapTool = 'layers' | 'areas' | 'barriers';
	function toggleMapTool(tool: MapTool) {
		const wasOpen =
			tool === 'layers' ? layerToolsOpen : tool === 'areas' ? areaToolsOpen : wallToolsOpen;
		layerToolsOpen = false;
		areaToolsOpen = false;
		wallToolsOpen = false;
		if (wasOpen) return;
		window.dispatchEvent(new CustomEvent('maismorras:close-table-tools'));
		if (tool === 'layers') layerToolsOpen = true;
		if (tool === 'areas') areaToolsOpen = true;
		if (tool === 'barriers') wallToolsOpen = true;
	}
	function persistirVisaoDaCamera() {
		if (!motor?.camera) return;
		cameraZoom = motor.camera.zoom;
		try {
			sessionStorage.setItem(`maismorras:camera:${scene.id}`, JSON.stringify(motor.camera.view));
		} catch {
			/* storage may be unavailable in private mode */
		}
	}

	onMount(() => {
		const mapToolHandler = (event: Event) => {
			const tool = (event as CustomEvent<'layers' | 'areas' | 'barriers'>).detail;
			toggleMapTool(tool);
		};
		const closeHandler = () => {
			layerToolsOpen = false;
			areaToolsOpen = false;
			wallToolsOpen = false;
		};
		window.addEventListener('maismorras:map-tool', mapToolHandler);
		window.addEventListener('maismorras:close-map-tools', closeHandler);
		motor = new GameEngine(
			(tokenId) => (tokenSelecionadoId = tokenId),
			(tokenId, x, y) => {
				const personagem = $personagens.find((item) => item.id === tokenId);
				if (!personagem || (!isGM && (!scene.allowPlayerMovement || !personagem.isOwned)))
					return false;
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
			try {
				const saved = sessionStorage.getItem(`maismorras:camera:${scene.id}`);
				if (saved) motor?.camera.setView(JSON.parse(saved));
				cameraZoom = motor?.camera.zoom ?? 1;
			} catch {
				/* ignore malformed or unavailable local state */
			}
			await carregarTokens();
			await carregarEfeitos();
			await carregarNPCs();
			await carregarTrilha();
		});
		const cameraPersistenceTimer = window.setInterval(persistirVisaoDaCamera, 700);
		sceneSocket = connectSceneSocket(
			session,
			scene.id,
			() => {
				void carregarTokens();
				void carregarEfeitos();
			},
			(ping) => motor?.showPing(ping.x, ping.y, ping.color),
			() => {}
		);

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
			window.removeEventListener('maismorras:map-tool', mapToolHandler);
			window.removeEventListener('maismorras:close-map-tools', closeHandler);
			sceneSocket?.close();
			sceneSocket = null;
			unsubscribe();
			observer.disconnect();
			window.clearInterval(cameraPersistenceTimer);
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
			persistenceError = result.open
				? 'Você abriu uma porta próxima.'
				: 'Você fechou uma porta próxima.';
			sceneSocket?.publishRefresh();
			await carregarTokens();
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não há porta próxima para interagir.';
		}
	}
	async function rollSelectedInitiative() {
		if (!personagemSelecionado?.persistedId || (!isGM && !personagemSelecionado.isOwned)) return;
		try {
			const result = await rollTokenInitiative(
				session,
				scene.id,
				personagemSelecionado.persistedId
			);
			personagens.update((tokens) =>
				tokens.map((token) =>
					token.persistedId === result.tokenId ? { ...token, iniciativa: result.initiative } : token
				)
			);
			$diceOverlay = {
				expression: `${personagemSelecionado.nome} · iniciativa`,
				total: result.initiative,
				dice: [result.roll]
			};
			$chatMensagens = [
				...$chatMensagens,
				{
					id: crypto.randomUUID(),
					autor: personagemSelecionado.nome,
					texto: `Iniciativa: ${result.roll} ${result.bonus >= 0 ? '+' : ''}${result.bonus} = ${result.initiative}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						expressao: `1d20${result.bonus >= 0 ? '+' : ''}${result.bonus}`,
						dados: [result.roll],
						modificador: result.bonus,
						total: result.initiative
					}
				}
			];
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.';
		}
	}
	async function rolarAcaoDeNPC(action: NPC['sheet']['actions'][number]) {
		if (!isGM || !npcSelecionado || action.toHit === undefined) return;
		try {
			const attackEvent = await rollDice(
				session,
				scene.campaignId,
				`1d20${action.toHit >= 0 ? '+' : ''}${action.toHit}`,
				undefined,
				'combat'
			);
			const attack = attackEvent.payload as { expressao: string; dados: number[]; total: number };
			const critical = attack.dados[0] === 20;
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(attackEvent.id),
					autor: npcSelecionado.name,
					texto: `${action.name} · ataque${critical ? ' · CRÍTICO!' : ''}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...attack,
						modificador: attack.total - attack.dados.reduce((sum, die) => sum + die, 0)
					}
				}
			];
			$diceOverlay = {
				expression: `${npcSelecionado.name} · ${action.name}`,
				total: attack.total,
				dice: attack.dados
			};
			const match = action.damage.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
			if (!match) return;
			const count = Number(match[1]) * (critical ? 2 : 1);
			const modifier = match[3] === '-' ? -Number(match[4] ?? 0) : Number(match[4] ?? 0);
			const expression = `${count}d${match[2]}${modifier ? `${modifier >= 0 ? '+' : ''}${modifier}` : ''}`;
			const damageEvent = await rollDice(
				session,
				scene.campaignId,
				expression,
				undefined,
				'combat'
			);
			const damage = damageEvent.payload as { expressao: string; dados: number[]; total: number };
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(damageEvent.id),
					autor: npcSelecionado.name,
					texto: `${action.name} · dano${critical ? ' crítico' : ''}`,
					tipo: 'rolagem',
					canal: 'combat',
					detalhesRolagem: {
						...damage,
						modificador: damage.total - damage.dados.reduce((sum, die) => sum + die, 0)
					}
				}
			];
			$diceOverlay = {
				expression: `${npcSelecionado.name} · ${action.name} · dano`,
				total: damage.total,
				dice: damage.dados
			};
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível rolar a ação do NPC.';
		}
	}
</script>

<div class="borda-mesa" bind:this={container}>
	<canvas
		bind:this={canvasMesa}
		tabindex="0"
		aria-label={$appLocale === 'en'
			? 'Interactive game map. Focus it to use keyboard shortcuts.'
			: 'Mapa interativo da mesa. Foque nele para usar atalhos do teclado.'}
	></canvas>
	{#if ambientAudioURL}<audio bind:this={ambientAudioA} loop onplay={() => (ambientPlaying = true)}
		></audio><audio bind:this={ambientAudioB} loop></audio>
		<div class="ambient-audio">
			<button onclick={() => void toggleTrilha()}
				>{ambientPlaying ? '❚❚ Pausar trilha' : '♫ Tocar trilha'}</button
			><span>{scene.ambientAudioVolume}%</span>
		</div>{/if}
	<div class="ping-tool">
		<button class:active={pingArmed} onclick={() => (pingArmed = !pingArmed)}
			>{pingArmed ? 'Clique no mapa' : '📍 Sinalizar'}</button
		>
	</div>
	<div class="camera-tools" aria-label={$appLocale === 'en' ? 'Map camera' : 'Câmera do mapa'}>
		<button
			onclick={() => ajustarZoom(-0.1)}
			aria-label={$appLocale === 'en' ? 'Zoom out' : 'Diminuir zoom'}
			title={$appLocale === 'en' ? 'Zoom out' : 'Diminuir zoom'}>−</button
		>
		<span>{`${Math.round(cameraZoom * 100)}%`}</span>
		<button
			onclick={() => ajustarZoom(0.1)}
			aria-label={$appLocale === 'en' ? 'Zoom in' : 'Aumentar zoom'}
			title={$appLocale === 'en' ? 'Zoom in' : 'Aumentar zoom'}>+</button
		>
		<button
			class="camera-reset"
			onclick={recentralizarMapa}
			aria-label={$appLocale === 'en' ? 'Center map' : 'Recentralizar mapa'}
			title={$appLocale === 'en' ? 'Center map' : 'Recentralizar mapa'}>⌖</button
		>
		<button
			class:active={!gridVisible}
			onclick={alternarGrade}
			aria-label={$appLocale === 'en' ? 'Toggle grid' : 'Alternar grade'}
			title={$appLocale === 'en' ? 'Toggle grid' : 'Alternar grade'}>#</button
		>
	</div>
	{#if isGM}<div
			class="table-tools-gm"
			aria-label={$appLocale === 'en' ? 'Table tools' : 'Ferramentas da mesa'}
		>
			<div class="table-tools-gm-buttons">
				<div class="layer-tool-trigger">
					<button
						class:active={layerToolsOpen}
						onclick={() => toggleMapTool('layers')}
						aria-label={$appLocale === 'en' ? 'Map layers' : 'Camadas do mapa'}
						title={$appLocale === 'en' ? 'Map layers' : 'Camadas do mapa'}>🗺️</button
					>{#if layerToolsOpen}<div class="layer-tools">
							<strong>{$appLocale === 'en' ? 'Map layers' : 'Camadas do mapa'}</strong><label
								><input type="checkbox" checked={gridVisible} onchange={alternarGrade} />
								{$appLocale === 'en' ? 'Grid' : 'Grade'}</label
							><label
								><input
									type="checkbox"
									checked={wallsVisible}
									onchange={() => alternarCamada('walls')}
								/>
								{$appLocale === 'en' ? 'Walls and doors' : 'Paredes e portas'}</label
							><label
								><input
									type="checkbox"
									checked={areasVisible}
									onchange={() => alternarCamada('areas')}
								/>
								{$appLocale === 'en' ? 'Persistent areas' : 'Áreas persistentes'}</label
							><small
								>{$appLocale === 'en'
									? 'Visual only; scene data is preserved.'
									: 'Apenas visual; os dados da cena são preservados.'}</small
							>
						</div>{/if}
				</div>
				<div class="area-tool-trigger">
					<button
						class:active={areaToolsOpen || saveAreaArmed}
						onclick={() => toggleMapTool('areas')}
						aria-label={$appLocale === 'en' ? 'Persistent areas' : 'Áreas persistentes'}
						title={$appLocale === 'en' ? 'Persistent areas' : 'Áreas persistentes'}>📐</button
					>{#if areaToolsOpen}<div class="area-tools">
							<strong>{$appLocale === 'en' ? 'Persistent area' : 'Área persistente'}</strong><small
								>{$appLocale === 'en'
									? 'Choose the ruler and drag with Shift to save an area.'
									: 'Escolha a régua e arraste com Shift para salvar a área.'}</small
							><input
								bind:value={areaLabel}
								maxlength="80"
								aria-label={$appLocale === 'en' ? 'Area label' : 'Rótulo da área'}
							/><label
								><input type="checkbox" bind:checked={areaVisible} />
								{$appLocale === 'en' ? 'players can see' : 'jogadores veem'}</label
							><button class:active={saveAreaArmed} onclick={() => (saveAreaArmed = !saveAreaArmed)}
								>{saveAreaArmed
									? $appLocale === 'en'
										? 'Draw with Shift'
										: 'Desenhe com Shift'
									: $appLocale === 'en'
										? 'Save next ruler'
										: 'Salvar próxima régua'}</button
							>{#if areas.length}<div class="area-list">
									{#each areas as area}<span
											>{area.label}<button onclick={() => void removeArea(area)}>×</button></span
										>{/each}
								</div>{/if}
						</div>{/if}
				</div>
				<div class="wall-tool-trigger">
					<button
						class:active={wallToolsOpen || wallDrawing}
						onclick={() => toggleMapTool('barriers')}
						aria-label={$appLocale === 'en' ? 'Walls and doors' : 'Paredes e portas'}
						title={$appLocale === 'en' ? 'Walls and doors' : 'Paredes e portas'}>🧱</button
					>{#if wallToolsOpen}<div class="wall-tools">
							<strong>{$appLocale === 'en' ? 'Barriers' : 'Barreiras'}</strong><select
								bind:value={wallKind}
								aria-label="Tipo de barreira"
								><option value="wall">{$appLocale === 'en' ? 'Wall' : 'Parede'}</option><option
									value="door">{$appLocale === 'en' ? 'Door' : 'Porta'}</option
								></select
							><button class:active={wallDrawing} onclick={toggleWallDrawing}
								>{wallDrawing
									? $appLocale === 'en'
										? 'Drag on map…'
										: 'Arraste no mapa…'
									: $appLocale === 'en'
										? `Draw ${wallKind === 'door' ? 'door' : 'wall'}`
										: `Desenhar ${wallKind === 'door' ? 'porta' : 'parede'}`}</button
							><small
								>{$appLocale === 'en'
									? 'Closed barriers block vision and movement.'
									: 'Fechadas bloqueiam visão e movimento.'}</small
							>{#if walls.length}<div class="wall-list">
									{#each walls as wall}<span
											>{wall.kind === 'door'
												? wall.open
													? $appLocale === 'en'
														? 'Open door'
														: 'Porta aberta'
													: $appLocale === 'en'
														? 'Closed door'
														: 'Porta fechada'
												: $appLocale === 'en'
													? 'Wall'
													: 'Parede'}<span
												>{#if wall.kind === 'door'}<button onclick={() => void toggleDoor(wall)}
														>{wall.open
															? $appLocale === 'en'
																? 'Close'
																: 'Fechar'
															: $appLocale === 'en'
																? 'Open'
																: 'Abrir'}</button
													>{/if}<button
													onclick={() => void removeWall(wall)}
													aria-label={$appLocale === 'en' ? 'Remove barrier' : 'Remover barreira'}
													>×</button
												></span
											></span
										>{/each}
								</div>{/if}
						</div>{/if}
				</div>
			</div>
		</div>{/if}
	{#if isGM && scene.fogEnabled}<div class="fog-tools">
			<strong>🌫 Névoa</strong>
			<div>
				<button
					class:active={fogMode === 'reveal'}
					onclick={() => (fogMode = fogMode === 'reveal' ? null : 'reveal')}>Revelar</button
				><button
					class:active={fogMode === 'hide'}
					onclick={() => (fogMode = fogMode === 'hide' ? null : 'hide')}>Ocultar</button
				>
			</div>
			<select bind:value={fogBrush} aria-label="Tamanho do pincel"
				><option value={1}>1×1</option><option value={3}>3×3</option><option value={5}>5×5</option
				></select
			>{#if fogMode}<small
					>Clique no mapa para {fogMode === 'reveal' ? 'revelar' : 'ocultar'}.</small
				>{/if}
		</div>{/if}
	{#if personagemSelecionado}
		<section class="token-inspector" aria-label={`Informações de ${personagemSelecionado.nome}`}>
			<header>
				<div>
					<span class="inspector-eyebrow"
						>{$appLocale === 'en' ? 'SELECTED TOKEN' : 'TOKEN SELECIONADO'}</span
					>
					<h2>{personagemSelecionado.nome}</h2>
				</div>
				<button
					class="close-button"
					onclick={() => (tokenSelecionadoId = null)}
					aria-label={$appLocale === 'en' ? 'Close inspector' : 'Fechar inspector'}>×</button
				>
			</header>
			<div class="quick-stats">
				<span><b>CA</b>{personagemSelecionado.ca}</span><span
					><b>INI</b>{personagemSelecionado.iniciativa}</span
				><span><b>TAM</b>{personagemSelecionado.tamanho}×{personagemSelecionado.tamanho}</span>
			</div>
			{#if isGM || personagemSelecionado.isOwned}<div class="token-appearance">
					<strong>Aparência do token</strong>
					<label
						>Zoom <input
							type="range"
							min="0.5"
							max="3"
							step="0.05"
							value={personagemSelecionado.fotoEscala}
							onchange={(event) => alterarAparencia('fotoEscala', event.currentTarget.value)}
						/></label
					>
					<label
						>Horizontal <input
							type="range"
							min="-100"
							max="100"
							step="1"
							value={personagemSelecionado.fotoOffsetX}
							onchange={(event) => alterarAparencia('fotoOffsetX', event.currentTarget.value)}
						/></label
					>
					<label
						>Vertical <input
							type="range"
							min="-100"
							max="100"
							step="1"
							value={personagemSelecionado.fotoOffsetY}
							onchange={(event) => alterarAparencia('fotoOffsetY', event.currentTarget.value)}
						/></label
					>
					<label class="color-control"
						>Cor <input type="color" value={`#${personagemSelecionado.cor.toString(16).padStart(6, '0')}`} onchange={(event) => alterarCor(event.currentTarget.value)} /></label
					>
					<button onclick={alternarFundoTransparente}
						>{personagemSelecionado.visibility.transparentBackground
							? 'Usar fundo colorido'
							: 'Remover fundo colorido'}</button
					>
				</div>{/if}
			{#if isGM && scene.fogEnabled}<div class="vision-control">
					<span
						>{$appLocale === 'en' ? 'Fog vision' : 'Visão na névoa'}
						<small>({$appLocale === 'en' ? 'squares' : 'quadrados'})</small></span
					><input
						type="number"
						min="0"
						max="30"
						value={personagemSelecionado.visionRange}
						onchange={(event) => alterarVisao(event.currentTarget.value)}
						aria-label={$appLocale === 'en'
							? 'Vision range in squares'
							: 'Raio de visão em quadrados'}
					/>
				</div>
				<div class="vision-control">
					<span
						>{$appLocale === 'en' ? 'Light source' : 'Fonte de luz'}
						<small>({$appLocale === 'en' ? 'squares' : 'quadrados'})</small></span
					><input
						type="number"
						min="0"
						max="30"
						value={personagemSelecionado.lightRange}
						onchange={(event) => alterarLuz(event.currentTarget.value)}
						aria-label={$appLocale === 'en' ? 'Light range in squares' : 'Raio de luz em quadrados'}
					/>
				</div>{/if}
			{#if !isGM && personagemSelecionado.isOwned && scene.allowPlayerDoorInteraction}<button
					class="door-interaction"
					onclick={() => void interagirComPorta()}
					>🚪 {$appLocale === 'en'
						? 'Interact with nearby door'
						: 'Interagir com porta próxima'}</button
				>{/if}
			{#if personagemSelecionado.actorId && (isGM || personagemSelecionado.isOwned)}<button
					class="open-sheet"
					onclick={() => onopensheet(personagemSelecionado.actorId!)}
					>{$appLocale === 'en' ? 'Open linked sheet' : 'Abrir ficha vinculada'}</button
				>{/if}
			{#if isGM && personagemSelecionado.persistedId}<button
					class="remove-token"
					onclick={() => void removerTokenSelecionado()}
					>{$appLocale === 'en' ? 'Remove token from scene' : 'Remover token da cena'}</button
				>{/if}
			{#if isGM || personagemSelecionado.isOwned}<div class="token-rolls">
					<span>{$appLocale === 'en' ? 'Token rolls' : 'Rolagem do token'}</span><button
						onclick={() => void rollSelectedInitiative()}
						>⚔️ {$appLocale === 'en' ? 'Roll initiative' : 'Rolar iniciativa'}</button
					>
				</div>{/if}
			{#if isGM && npcSelecionado?.sheet.actions.length}
				<div class="npc-actions">
					<span>{$appLocale === 'en' ? 'Creature actions' : 'Ações da criatura'}</span>
					{#each npcSelecionado.sheet.actions as action (action.name)}
						<button
							onclick={() => void rolarAcaoDeNPC(action)}
							title={action.description || action.damage}
						>
							<strong>{action.name}</strong>
							<small
								>{action.toHit >= 0 ? `+${action.toHit}` : action.toHit} · {action.damage ||
									action.range ||
									($appLocale === 'en' ? 'Action' : 'Ação')}</small
							>
						</button>
					{/each}
				</div>
			{/if}
			<div class="hp-control">
				<div>
					<span>{$appLocale === 'en' ? 'Hit points' : 'Pontos de vida'}</span><strong
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
					<div class="status-heading">
						<span
							>{$appLocale === 'en'
								? 'Official conditions (SRD)'
								: 'Condições oficiais (SRD)'}</span
						>
					</div>
					{#if definicoesDeEfeito.length}
						<select bind:value={definicaoSelecionada} aria-label="Condição oficial">
							{#each definicoesDeEfeito as definition}<option value={definition.slug}
									>{definition.name}</option
								>{/each}
						</select>
						{#if efeitoSelecionado}<p>{efeitoSelecionado.summary}</p>{/if}
						<div class="effect-actions">
							<input
								bind:value={duracaoEfeito}
								inputmode="numeric"
								type="number"
								min="1"
								placeholder="Turnos (opcional)"
								aria-label="Duração em turnos"
							/>
							<button onclick={aplicarCondicaoOficial}
								>{$appLocale === 'en' ? 'Apply' : 'Aplicar'}</button
							>
						</div>
					{:else}<p class="effect-empty">
							{$appLocale === 'en'
								? 'Run migration 0017 to load the SRD catalog.'
								: 'Execute a migração 0017 para carregar o catálogo SRD.'}
						</p>{/if}
					{#if efeitosDoToken.length}
						<div class="official-effect-list">
							{#each efeitosDoToken as effect}<span title={effect.source}
									>{effect.name}{effect.remainingTurns
										? ` · ${effect.remainingTurns} turnos`
										: ''}{#if isGM}<button
											onclick={() => void removerEfeito(effect)}
											aria-label={`Remover ${effect.name}`}>×</button
										>{/if}</span
								>{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if isGM}
				<div class="visibility-control">
					<div>
						<span class="inspector-eyebrow"
							>{$appLocale === 'en'
								? 'VISIBILITY FOR OTHER PLAYERS'
								: 'VISIBILIDADE PARA OUTROS JOGADORES'}</span
						>
						<p>
							{$appLocale === 'en'
								? 'The Game Master always sees complete data. These options control what other players see.'
								: 'O narrador sempre vê os dados completos. Estas opções regulam os outros jogadores.'}
						</p>
					</div>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showName}
							onchange={(event) => alterarVisibilidade('showName', event.currentTarget.checked)}
						/>
						{$appLocale === 'en' ? 'Name' : 'Nome'}</label
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
						/>
						{$appLocale === 'en' ? 'AC' : 'CA'}</label
					>
					<label
						><input
							type="checkbox"
							checked={personagemSelecionado.visibility.showStatuses}
							onchange={(event) => alterarVisibilidade('showStatuses', event.currentTarget.checked)}
						/>
						{$appLocale === 'en' ? 'Conditions' : 'Condições'}</label
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
		height: min(calc(100dvh - 165px), 900px);
		min-height: 500px;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.ping-tool {
		position: absolute;
		z-index: 4;
		bottom: 0.9rem;
		left: 0.9rem;
	}
	.ping-tool button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.42rem 0.6rem;
		color: #ecd8a8;
		background: rgba(25, 19, 23, 0.92);
		font-size: 0.67rem;
		cursor: pointer;
	}
	.ping-tool button.active {
		color: #291b10;
		background: #e0b86f;
	}
	.camera-tools {
		position: absolute;
		z-index: 4;
		top: 0.8rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.25rem;
		border: 1px solid rgba(216, 173, 103, 0.45);
		border-radius: 8px;
		color: #ead8b7;
		background: rgba(25, 19, 23, 0.92);
		box-shadow: 0 8px 18px #0004;
		backdrop-filter: blur(8px);
	}
	.camera-tools button {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border: 0;
		border-radius: 5px;
		color: #f0cb85;
		background: transparent;
		font-size: 1rem;
		cursor: pointer;
	}
	.camera-tools button:hover {
		background: #453329;
	}
	.camera-tools span {
		min-width: 3.1rem;
		text-align: center;
		font-size: 0.63rem;
		font-variant-numeric: tabular-nums;
	}
	.camera-tools .camera-reset {
		border-left: 1px solid #5c4b40;
		border-radius: 0 5px 5px 0;
		margin-left: 0.1rem;
		padding-left: 0.35rem;
	}
	.fog-tools {
		position: absolute;
		z-index: 4;
		top: 0.8rem;
		right: 0.8rem;
		display: grid;
		gap: 0.35rem;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.92);
		font-size: 0.65rem;
	}
	.fog-tools div {
		display: flex;
		gap: 0.25rem;
	}
	.fog-tools button,
	.fog-tools select {
		border: 1px solid #5d493b;
		border-radius: 5px;
		padding: 0.3rem;
		color: #e8d3aa;
		background: #241c1e;
		font-size: 0.63rem;
	}
	.fog-tools button.active {
		color: #271b10;
		background: #e0b86f;
	}
	.fog-tools small {
		color: #baaa98;
		font-size: 0.58rem;
	}
	.area-tool-trigger {
		position: absolute;
		z-index: 5;
		top: 8.8rem;
		left: 0.9rem;
	}
	.area-tool-trigger > button {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.2rem;
		color: #ecd8a8;
		background: rgba(25, 19, 23, 0.92);
		font-size: 1.05rem;
		cursor: pointer;
	}
	.area-tool-trigger > button.active {
		color: #291b10;
		background: #e0b86f;
	}
	.area-tools {
		position: absolute;
		z-index: 1;
		top: 0;
		left: 3.45rem;
		display: grid;
		gap: 0.3rem;
		width: 180px;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.96);
		font-size: 0.62rem;
		box-shadow: 0 10px 24px #0006;
	}
	.area-tools small {
		color: #b9aa9d;
		line-height: 1.35;
	}
	.area-tools input {
		min-width: 0;
		border: 1px solid #5d493b;
		border-radius: 4px;
		padding: 0.3rem;
		color: #e8d3aa;
		background: #241c1e;
		font-size: 0.62rem;
	}
	.area-tools label {
		color: #b9aa9d;
	}
	.area-tools button {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.62rem;
	}
	.area-tools button.active {
		color: #281a0f;
		background: #e0b86f;
	}
	.area-list {
		display: grid;
		gap: 0.2rem;
		max-height: 92px;
		overflow: auto;
	}
	.area-list span {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: #d8c5aa;
	}
	.area-list button {
		border: 0;
		padding: 0;
		color: #dfa797;
		background: transparent;
	}
	.layer-tool-trigger {
		position: absolute;
		z-index: 5;
		top: 0.8rem;
		left: 0.8rem;
	}
	.layer-tool-trigger > button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		color: #ecd8a8;
		background: rgba(25, 19, 23, 0.92);
		font-size: 1rem;
		cursor: pointer;
	}
	.layer-tool-trigger > button.active {
		color: #291b10;
		background: #e0b86f;
	}
	.layer-tools {
		position: absolute;
		top: 2.7rem;
		left: 0;
		display: grid;
		gap: 0.42rem;
		width: 190px;
		padding: 0.6rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.97);
		font-size: 0.65rem;
		box-shadow: 0 10px 24px #0006;
	}
	.layer-tools label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #cdbda9;
	}
	.layer-tools input {
		accent-color: #d8ad67;
	}
	.layer-tools small {
		color: #9f9186;
		font-size: 0.58rem;
		line-height: 1.3;
	}
	.wall-tools {
		position: absolute;
		z-index: 4;
		top: 12rem;
		right: 0.8rem;
		display: grid;
		gap: 0.3rem;
		width: 145px;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.92);
		font-size: 0.62rem;
	}
	.wall-tools button,
	.wall-tools select {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.62rem;
	}
	.wall-tools button.active {
		color: #281a0f;
		background: #e0b86f;
	}
	.wall-tools small {
		color: #b9aa9d;
		font-size: 0.58rem;
	}
	.wall-list {
		display: grid;
		gap: 0.2rem;
		max-height: 70px;
		overflow: auto;
	}
	.wall-list > span,
	.wall-list > span > span {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: #d8c5aa;
	}
	.wall-list button {
		border: 0;
		padding: 0;
		color: #dfa797;
		background: transparent;
	}
	.table-tools-gm {
		position: absolute;
		z-index: 6;
		top: 0.8rem;
		left: 0.9rem;
		width: 0;
		height: 0;
	}
	.table-tools-gm-buttons {
		display: block;
	}
	.table-tools-gm-buttons > div {
		position: relative;
		width: 0;
		height: 0;
	}
	.table-tools-gm-buttons .layer-tool-trigger,
	.table-tools-gm-buttons .area-tool-trigger,
	.table-tools-gm-buttons .wall-tool-trigger {
		position: relative;
		top: auto;
		left: auto;
		right: auto;
		transform: none;
	}
	.table-tools-gm-buttons > div > button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 0;
		border-radius: 6px;
		color: #f0cb85;
		background: transparent;
		font-size: 1.05rem;
		cursor: pointer;
	}
	.table-tools-gm-buttons > div > button {
		display: none;
	}
	.table-tools-gm-buttons > div > button:hover,
	.table-tools-gm-buttons > div > button.active {
		background: #453329;
	}
	.table-tools-gm .layer-tools,
	.table-tools-gm .area-tools,
	.table-tools-gm .wall-tools {
		box-sizing: border-box;
		display: grid;
		gap: 0.5rem;
		top: 0;
		left: 3rem;
		right: auto;
		width: min(300px, calc(100vw - 5rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: 0.85rem;
		border: 1px solid rgba(216, 173, 103, 0.38);
		border-radius: 10px;
		color: #eee4d6;
		background: rgba(25, 19, 23, 0.96);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(12px);
		z-index: 20;
		font-family: inherit;
		font-size: 0.72rem;
		line-height: 1.35;
		text-align: left;
	}
	.table-tools-gm .area-tools {
		top: 3rem;
	}
	.table-tools-gm .wall-tools {
		top: 6rem;
	}
	.table-tools-gm .layer-tools label,
	.table-tools-gm .area-tools label,
	.table-tools-gm .layer-tools small,
	.table-tools-gm .area-tools small,
	.table-tools-gm .wall-tools small,
	.table-tools-gm .layer-tools strong,
	.table-tools-gm .area-tools strong,
	.table-tools-gm .wall-tools strong {
		width: 100%;
		text-align: left;
	}
	.table-tools-gm .area-tools input,
	.table-tools-gm .wall-tools select,
	.table-tools-gm .area-tools button,
	.table-tools-gm .wall-tools button {
		width: 100%;
		font: inherit;
		font-size: 0.72rem;
		text-align: left;
	}
	.remove-token {
		border: 1px solid #9b5b4d;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		color: #ffd5ca;
		background: #3b211f;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.remove-token:hover {
		background: #572923;
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
		/* Four compact controls in one row: ruler, initiative, dice, and areas. */
		.table-tools-gm {
			top: 0.75rem;
			left: 50%;
			transform: translateX(-50%);
		}
		.table-tools-gm-buttons > div > button {
			width: 2.35rem;
			height: 2.35rem;
			font-size: 1rem;
		}
		.table-tools-gm .layer-tools,
		.table-tools-gm .area-tools,
		.table-tools-gm .wall-tools {
			top: 3.55rem;
			left: 50%;
			transform: translateX(-50%);
			z-index: 20;
		}
		.camera-tools {
			top: 0.65rem;
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
	.token-appearance {
		display: grid;
		gap: 0.45rem;
		margin: 0.7rem 0;
		border-top: 1px solid #393034;
		padding-top: 0.65rem;
	}
	.token-appearance strong {
		color: #d8ad67;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.token-appearance label {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
		gap: 0.5rem;
		color: #b9aa9b;
		font-size: 0.7rem;
	}
	.token-appearance input[type='range'] {
		width: 100%;
		accent-color: #d8ad67;
	}
	.token-appearance button {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.68rem;
	}
	.ambient-audio {
		position: absolute;
		z-index: 3;
		bottom: 1rem;
		left: 1rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(216, 173, 103, 0.42);
		border-radius: 8px;
		padding: 0.42rem 0.55rem;
		color: #d6c0a0;
		background: rgba(27, 22, 27, 0.92);
		backdrop-filter: blur(8px);
		font-size: 0.65rem;
	}
	.ambient-audio button {
		border: 0;
		padding: 0;
		color: #f0d29d;
		background: transparent;
		font: inherit;
		font-weight: 750;
		cursor: pointer;
	}
	.ambient-audio span {
		border-left: 1px solid #5c4b40;
		padding-left: 0.45rem;
		color: #a99c91;
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
	.token-rolls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		padding: 0.7rem 1rem;
		border-top: 1px solid #493c39;
	}
	.token-rolls > span {
		width: 100%;
		color: #b9aa9d;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.token-rolls button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.36rem 0.48rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.npc-actions {
		display: grid;
		gap: 0.38rem;
		padding: 0.7rem 1rem;
		border-top: 1px solid #493c39;
	}
	.npc-actions > span {
		color: #b9aa9d;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.npc-actions button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.48rem 0.55rem;
		color: #f1dfbd;
		background: #2b211c;
		text-align: left;
		cursor: pointer;
	}
	.npc-actions button:hover {
		background: #403027;
	}
	.npc-actions button strong {
		font-size: 0.73rem;
	}
	.npc-actions button small {
		color: #bba994;
		font-size: 0.65rem;
	}
	.open-sheet {
		margin: 0 1rem 0.5rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.7rem;
		cursor: pointer;
	}
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
	.vision-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.8rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid #423839;
		border-radius: 8px;
		color: #cdbda9;
		font-size: 0.7rem;
	}
	.vision-control small {
		color: #8f8378;
		font-size: 0.61rem;
	}
	.vision-control input {
		width: 3rem;
		border: 1px solid #5a4841;
		border-radius: 5px;
		padding: 0.3rem;
		color: #f4eee4;
		background: #282125;
		text-align: center;
	}
	.door-interaction {
		width: calc(100% - 2rem);
		margin: 0 1rem 0.7rem;
		border: 1px solid #927449;
		border-radius: 6px;
		padding: 0.46rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.7rem;
		cursor: pointer;
	}
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
		padding: 0.75rem 0;
		border-top: 1px solid #423839;
	}
	.official-effects select,
	.effect-actions input {
		box-sizing: border-box;
		width: 100%;
		margin-top: 0.45rem;
		border: 1px solid #5a4841;
		border-radius: 6px;
		padding: 0.42rem;
		color: #e7dacc;
		background: #282125;
		font-size: 0.72rem;
	}
	.official-effects p {
		margin: 0.45rem 0;
		color: #b9aa9d;
		font-size: 0.7rem;
		line-height: 1.35;
	}
	.effect-actions {
		display: flex;
		gap: 0.4rem;
		align-items: end;
	}
	.effect-actions input {
		margin: 0;
	}
	.effect-actions button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.45rem 0.62rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.official-effect-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.55rem;
	}
	.official-effect-list span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid #624d42;
		border-radius: 999px;
		padding: 0.23rem 0.42rem;
		color: #e9d5ad;
		font-size: 0.64rem;
	}
	.official-effect-list button {
		border: 0;
		padding: 0;
		color: #e9d5ad;
		background: transparent;
		cursor: pointer;
		font-size: 0.85rem;
		line-height: 0.65rem;
	}
	.effect-empty {
		color: #c69072 !important;
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
