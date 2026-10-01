<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Session } from '@supabase/supabase-js';
	import { GameEngine } from '$lib/engine/GameEngine';
	import {
		personagens,
		urlMapa,
		type Personagem,
		type TokenVisibility
	} from '$lib/stores/gameStore';
	import {
		addSceneEffect,
		getSceneToken,
		createSceneArea,
		createSceneWall,
		deleteSceneArea,
		deleteSceneWall,
		interactWithNearbyDoor,
		setSceneDoorOpen,
		listEffectDefinitions,
		listSceneEffects,
		loadScene,
		removeSceneEffect,
		rollTokenInitiative,
		updateFog,
		type EffectDefinition,
		type SceneEffect,
		type SceneArea,
		type SceneWall,
		type Scene
	} from '$lib/services/sceneApi';
	import { SceneTokenController } from '$lib/services/sceneTokenController';
	import SceneMapTools from '$lib/components/scene/SceneMapTools.svelte';
	import TokenInspector from '$lib/components/scene/TokenInspector.svelte';
	import { ApiError } from '$lib/services/httpClient';
	import {
		applySceneDelta,
		fogBrushCells,
		normalizeSceneItemsById,
		normalizeSceneItemsByKey
	} from '$lib/utils/sceneDeltaState';
	import {
		toggleSceneMapTool,
		type SceneMapTool,
		type SceneMapToolsActions,
		type SceneMapToolsState
	} from '$lib/utils/sceneMapTools';
	import {
		removeSceneCharacter,
		normalizeSceneCharacters,
		toSceneCharacter,
		upsertSceneCharacter
	} from '$lib/utils/sceneTokenState';
	import {
		connectSceneSocket,
		type RealtimeStatus,
		type SceneSocket,
		type SceneDelta
	} from '$lib/services/sceneRealtime';
	import { diceOverlay, setDiceColor } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { listNPCs, type NPC } from '$lib/services/npcApi';
	import type { CharacterSheet } from '$lib/services/characterApi';
	import { rollDice } from '$lib/services/eventApi';
	import {
		getCharacterForGM,
		getMyCharacter,
		setCharacterInitiativeAdvantage
	} from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';
	import {
		campaignAssetPath,
		clearSignedAssetCache,
		getSignedAssetUrl
	} from '$lib/services/assetApi';

	let {
		scene,
		session,
		isGM,
		campaignId = scene.campaignId,
		onopensheet = () => {},
		onopennewwindow = () => {}
	}: {
		scene: Scene;
		session: Session;
		isGM: boolean;
		campaignId?: string;
		onopensheet?: (actorId: string) => void;
		onopennewwindow?: (actorId: string) => void;
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
	$effect(() => {
		if (tokenSelecionadoId !== null && !personagemSelecionado) tokenSelecionadoId = null;
	});
	let initiativeAdvantageByActor = $state<Record<string, boolean>>({});
	let characterSummaryByActor = $state<Record<string, CharacterSheet>>({});
	let characterSummaryContext = '';
	$effect(() => {
		const currentContext = `${session.user.id}:${campaignId}:${scene.id}:${isGM}`;
		if (characterSummaryContext && characterSummaryContext !== currentContext) {
			characterSummaryByActor = {};
			initiativeAdvantageByActor = {};
			tokenSelecionadoId = null;
		}
		characterSummaryContext = currentContext;
	});
	$effect(() => {
		const actorId = personagemSelecionado?.actorId;
		if (
			!actorId ||
			npcSelecionado ||
			(!isGM && !personagemSelecionado?.isOwned) ||
			actorId in initiativeAdvantageByActor
		)
			return;
		let cancelled = false;
		const request = isGM
			? getCharacterForGM(session, campaignId, actorId)
			: getMyCharacter(session, campaignId);
		void request
			.then((character) => {
				if (!cancelled) {
					const { sheet } = character;
					characterSummaryByActor = { ...characterSummaryByActor, [actorId]: sheet };
					personagens.update((tokens) =>
						tokens.map((token) =>
							token.actorId === actorId ? { ...token, nome: sheet.name || token.nome } : token
						)
					);
					initiativeAdvantageByActor = {
						...initiativeAdvantageByActor,
						[actorId]: character.sheet.initiativeAdvantage ?? false
					};
				}
			})
			.catch(() => {
				if (!cancelled)
					initiativeAdvantageByActor = { ...initiativeAdvantageByActor, [actorId]: false };
			});
		return () => (cancelled = true);
	});
	$effect(() => setDiceColor(personagemSelecionado?.cor));
	let atoresNPC = $state<NPC[]>([]);
	let npcSelecionado = $derived(
		personagemSelecionado?.actorId
			? atoresNPC.find((npc) => npc.id === personagemSelecionado.actorId)
			: undefined
	);
	let persistenceError = $state('');
	let hitPointsUpdating = $state(false);
	let sceneSocket: SceneSocket | null = null;
	const tokenController = new SceneTokenController({
		session: () => session,
		sceneId: () => scene.id,
		isGM: () => isGM,
		publish: (signal) => sceneSocket?.publishTokenUpdated(signal)
	});
	let motor = $state<GameEngine | null>(null);
	$effect(() => {
		if (motor) motor.setMapSize(scene.mapWidthCells, scene.mapHeightCells, scene.gridSize);
	});
	let fogMode = $state<'reveal' | 'hide' | null>(null);
	let fogBrush = $state(1);
	let areas = $state<SceneArea[]>([]);
	let saveAreaArmed = $state(false);
	let areaLabel = $state('Área de efeito');
	let areaVisible = $state(true);
	let walls = $state<SceneWall[]>([]);
	let wallDrawing = $state(false);
	let wallKind = $state<'wall' | 'door'>('wall');
	let openMapTool = $state<SceneMapTool | null>(null);
	let pingArmed = $state(false);
	let cameraZoom = $state(1);
	let lastCameraView = '';
	let gridVisible = $state(true);
	let wallsVisible = $state(true);
	let areasVisible = $state(true);
	let mapToolsState = $derived<SceneMapToolsState>({
		isGM,
		isEnglish: $appLocale === 'en',
		fogEnabled: scene.fogEnabled,
		fogMode,
		fogBrush,
		areas,
		saveAreaArmed,
		areaLabel,
		areaVisible,
		walls,
		wallDrawing,
		wallKind,
		openTool: openMapTool,
		cameraZoom,
		gridVisible,
		wallsVisible,
		areasVisible
	});
	let tokenRefreshTimer: number | undefined;
	const personagemIdByToken = new SvelteMap<string, number>();
	function personagemIdFor(tokenId: string, fallback: number) {
		const existing = personagemIdByToken.get(tokenId);
		if (existing !== undefined) return existing;
		personagemIdByToken.set(tokenId, fallback);
		return fallback;
	}
	const tokenImageCache = new SvelteMap<
		string,
		{ path: string | null; url: string | null; expiresAt: number }
	>();
	const tokenImageRetries = new SvelteMap<string, number>();
	let efeitoSelecionado = $derived(
		definicoesDeEfeito.find((item) => item.slug === definicaoSelecionada)
	);
	let efeitosDoToken = $derived(
		personagemSelecionado?.persistedId
			? efeitosAtivos.filter((item) => item.tokenId === personagemSelecionado.persistedId)
			: []
	);

	async function persistir(personagem: Personagem): Promise<boolean> {
		if (!personagem.persistedId) return false;
		if (!isGM) {
			if (!personagem.isOwned) return false;
			try {
				await tokenController.save(personagem);
				persistenceError = '';
				return true;
			} catch (error) {
				persistenceError =
					error instanceof Error ? error.message : 'Não foi possível salvar a aparência.';
				return false;
			}
		}
		try {
			await tokenController.save(personagem);
			persistenceError = '';
			return true;
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not save the token.'
						: 'Não foi possível salvar o token.';
			return false;
		}
	}
	async function persistirMovimentoDoJogador(personagem: Personagem, x: number, y: number) {
		if (!personagem.persistedId) return;
		try {
			await tokenController.move(personagem, x, y);
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
		if (!Number.isFinite(color) || !personagemSelecionado) return;
		const selected = personagemSelecionado;
		atualizarSelecionado((p) => ({ ...p, cor: color }));
		void persistir({ ...selected, cor: color }).then((saved) => {
			if (!saved)
				personagens.update((lista) =>
					lista.map((item) =>
						item.id === selected.id && item.cor === color ? { ...item, cor: selected.cor } : item
					)
				);
		});
	}

	async function removerTokenSelecionado() {
		if (!isGM || !personagemSelecionado?.persistedId) return;
		const token = personagemSelecionado;
		const persistedId = token.persistedId!;
		if (!confirm(`Remover ${token.nome} desta cena? A ficha ou NPC continuará na campanha.`))
			return;
		try {
			await tokenController.remove(persistedId);
			personagens.update((lista) => removeSceneCharacter(lista, persistedId));
			personagemIdByToken.delete(persistedId);
			efeitosAtivos = efeitosAtivos.filter((item) => item.tokenId !== persistedId);
			tokenSelecionadoId = null;
			persistenceError = '';
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
			Object.assign(scene, response.scene);
			urlMapa.set(await resolverImagemDeFundo(response.scene.backgroundUrl));
			motor?.setFog(
				response.scene.fogEnabled,
				isGM,
				response.fog.visibleCells,
				response.fog.revealedCells,
				response.fog.hiddenCells
			);
			areas = normalizeSceneItemsById(response.areas);
			motor?.setAreas(areas);
			motor?.setAreasVisible(areasVisible);
			walls = normalizeSceneItemsById(response.walls);
			motor?.setWalls(walls);
			motor?.setWallsVisible(wallsVisible);
			const carregados = await Promise.all(
				normalizeSceneItemsById(response.tokens).map(async (token, index) => {
					const assetPath = token.imageUrl
						? (campaignAssetPath(token.imageUrl) ?? token.imageUrl)
						: null;
					const cached = tokenImageCache.get(token.id);
					const imageUrl =
						cached?.path === assetPath && cached.expiresAt > Date.now()
							? (cached.url ?? undefined)
							: await resolverImagemToken(token.imageUrl);
					tokenImageCache.set(token.id, {
						path: assetPath,
						url: imageUrl ?? null,
						expiresAt: Date.now() + 45 * 60 * 1000
					});
					return toSceneCharacter(token, personagemIdFor(token.id, index + 1), imageUrl);
				})
			);
			tokenController.clearSnapshots();
			carregados.forEach((personagem) => {
				tokenController.remember(personagem);
			});
			const tokensNormalizados = normalizeSceneCharacters(carregados);
			personagens.set(tokensNormalizados);
			if (
				tokenSelecionadoId !== null &&
				!tokensNormalizados.some((token) => token.id === tokenSelecionadoId)
			)
				tokenSelecionadoId = null;
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível carregar os tokens.';
		}
	}
	async function atualizarTokenRecebido(signal?: { tokenId: string; deleted?: boolean }) {
		if (!signal?.tokenId) return;
		try {
			const token = await getSceneToken(session, scene.id, signal.tokenId);
			const assetPath = token.imageUrl
				? (campaignAssetPath(token.imageUrl) ?? token.imageUrl)
				: null;
			const cached = tokenImageCache.get(token.id);
			const imageUrl =
				cached?.path === assetPath && cached.expiresAt > Date.now()
					? (cached.url ?? undefined)
					: await resolverImagemToken(token.imageUrl);
			tokenImageCache.set(token.id, {
				path: assetPath,
				url: imageUrl ?? null,
				expiresAt: Date.now() + 45 * 60 * 1000
			});
			personagens.update((lista) => {
				const existing = lista.find((item) => item.persistedId === token.id);
				const updated = toSceneCharacter(
					token,
					personagemIdFor(token.id, existing?.id ?? Math.max(0, ...lista.map((p) => p.id)) + 1),
					imageUrl
				);
				// Mark the server snapshot before notifying the reactive store. Otherwise
				// the GM persistence subscriber may write a stale local token back.
				tokenController.remember(updated);
				return upsertSceneCharacter(lista, updated);
			});
		} catch (error) {
			if (error instanceof ApiError && error.status === 404) {
				personagens.update((lista) => removeSceneCharacter(lista, signal.tokenId));
				if (personagemSelecionado?.persistedId === signal.tokenId) tokenSelecionadoId = null;
				personagemIdByToken.delete(signal.tokenId);
				efeitosAtivos = efeitosAtivos.filter((item) => item.tokenId !== signal.tokenId);
				tokenController.forget(signal.tokenId);
				return;
			}
			console.warn('Não foi possível sincronizar o token recebido.', error);
		}
	}
	async function atualizarImagemTokenComFalha(tokenId: number) {
		const character = $personagens.find((item) => item.id === tokenId);
		const persistedId = character?.persistedId;
		if (!character || !persistedId) return;
		const cached = tokenImageCache.get(persistedId);
		if (!cached?.path) return;
		const retries = tokenImageRetries.get(persistedId) ?? 0;
		if (retries >= 1) {
			tokenImageCache.set(persistedId, {
				path: cached.path,
				url: null,
				expiresAt: Date.now() + 5 * 60 * 1000
			});
			personagens.update((items) =>
				items.map((item) => (item.id === tokenId ? { ...item, fotoUrl: undefined } : item))
			);
			return;
		}
		tokenImageRetries.set(persistedId, retries + 1);
		clearSignedAssetCache(scene.campaignId, cached.path);
		const freshUrl = await resolverImagemToken(cached.path);
		tokenImageCache.set(persistedId, {
			path: cached.path,
			url: freshUrl ?? null,
			expiresAt: Date.now() + (freshUrl ? 45 * 60 * 1000 : 5 * 60 * 1000)
		});
		personagens.update((items) =>
			items.map((item) =>
				item.id === tokenId ? { ...item, fotoUrl: freshUrl ?? undefined } : item
			)
		);
	}
	async function resolverImagemDeFundo(value: string | null) {
		if (!value) return null;
		return resolverAssetAssinado(value);
	}
	async function resolverImagemToken(value: string | null) {
		if (!value) return null;
		return resolverAssetAssinado(value);
	}
	async function resolverAssetAssinado(path: string) {
		return getSignedAssetUrl(session, scene.campaignId, path);
	}

	async function carregarEfeitos() {
		try {
			const [catalogo, aplicados] = await Promise.all([
				listEffectDefinitions(session, scene.id),
				listSceneEffects(session, scene.id)
			]);
			definicoesDeEfeito = normalizeSceneItemsByKey(catalogo.definitions, (item) => item.slug);
			efeitosAtivos = normalizeSceneItemsById(aplicados.effects);
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
			sceneSocket?.publishSceneDelta({ kind: 'effect', action: 'upsert', item: effect });
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
			sceneSocket?.publishSceneDelta({ kind: 'effect', action: 'delete', id: effect.id });
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
	function aplicarDeltaCena(delta: SceneDelta) {
		const next = applySceneDelta({ areas, paredes: walls, efeitos: efeitosAtivos }, delta);
		areas = next.areas;
		walls = next.paredes;
		efeitosAtivos = next.efeitos;
		if (delta.kind === 'area') motor?.setAreas(areas);
		if (delta.kind === 'wall') motor?.setWalls(walls);
	}
	async function paintFog(worldX: number, worldY: number) {
		if (!isGM || !fogMode || !scene.fogEnabled) return;
		const cells = fogBrushCells(worldX, worldY, scene.gridSize, fogBrush);
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
			const pingColor = personagemSelecionado?.cor ?? 0xf2cf77;
			motor?.showPing(worldX, worldY, pingColor);
			sceneSocket?.publishPing(worldX, worldY, pingColor);
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
			sceneSocket?.publishSceneDelta({ kind: 'area', action: 'upsert', item: created });
		} catch (error) {
			persistenceError = error instanceof Error ? error.message : 'Não foi possível salvar a área.';
		}
	}
	async function removeArea(area: SceneArea) {
		try {
			await deleteSceneArea(session, scene.id, area.id);
			areas = areas.filter((item) => item.id !== area.id);
			motor?.setAreas(areas);
			sceneSocket?.publishSceneDelta({ kind: 'area', action: 'delete', id: area.id });
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
			sceneSocket?.publishSceneDelta({ kind: 'wall', action: 'upsert', item: created });
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
			sceneSocket?.publishSceneDelta({ kind: 'wall', action: 'delete', id: wall.id });
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
			sceneSocket?.publishSceneDelta({ kind: 'wall', action: 'upsert', item: updated });
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
	function toggleMapTool(tool: SceneMapTool) {
		openMapTool = toggleSceneMapTool(openMapTool, tool);
		if (!openMapTool) return;
		window.dispatchEvent(new CustomEvent('maismorras:close-table-tools'));
	}
	const mapToolsActions: SceneMapToolsActions = {
		onFogModeToggle: (mode) => (fogMode = fogMode === mode ? null : mode),
		onFogBrushChange: (brush) => (fogBrush = brush),
		onZoom: ajustarZoom,
		onRecenter: recentralizarMapa,
		onToggleGrid: alternarGrade,
		onToggleLayer: alternarCamada,
		onToolToggle: toggleMapTool,
		onAreaLabelChange: (label) => (areaLabel = label),
		onAreaVisibilityToggle: () => (areaVisible = !areaVisible),
		onSaveAreaToggle: () => (saveAreaArmed = !saveAreaArmed),
		onAreaRemove: (area) => void removeArea(area),
		onWallKindChange: (kind) => (wallKind = kind),
		onWallDrawingToggle: toggleWallDrawing,
		onDoorToggle: (wall) => void toggleDoor(wall),
		onWallRemove: (wall) => void removeWall(wall)
	};
	function persistirVisaoDaCamera() {
		if (!motor?.camera) return;
		cameraZoom = motor.camera.zoom;
		try {
			const serialized = JSON.stringify(motor.camera.view);
			if (serialized === lastCameraView) return;
			lastCameraView = serialized;
			sessionStorage.setItem(`maismorras:camera:${scene.id}`, serialized);
		} catch {
			/* storage may be unavailable in private mode */
		}
	}

	onMount(() => {
		const mapToolHandler = (event: Event) => {
			const tool = (event as CustomEvent<SceneMapTool>).detail;
			toggleMapTool(tool);
		};
		const closeHandler = () => {
			openMapTool = null;
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
			(tokenId) => void atualizarImagemTokenComFalha(tokenId),
			scene.gridSize
		);
		const observer = new ResizeObserver(([entry]) => {
			motor?.resize(entry.contentRect.width, entry.contentRect.height);
		});
		void motor.init(canvasMesa).then(async () => {
			motor?.setMapSize(scene.mapWidthCells, scene.mapHeightCells, scene.gridSize);
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
		});
		const cameraPersistenceTimer = window.setInterval(persistirVisaoDaCamera, 700);
		const updateTokenFallback = (status: RealtimeStatus) => {
			if (status === 'connected') {
				if (tokenRefreshTimer) window.clearInterval(tokenRefreshTimer);
				tokenRefreshTimer = undefined;
				return;
			}
			if (!tokenRefreshTimer)
				tokenRefreshTimer = window.setInterval(() => void carregarTokens(), 60_000);
		};
		sceneSocket = connectSceneSocket(
			session,
			scene.id,
			() => {
				void carregarTokens();
				void carregarEfeitos();
			},
			(ping) => motor?.showPing(ping.x, ping.y, ping.color),
			updateTokenFallback,
			undefined,
			undefined,
			undefined,
			(signal) => void atualizarTokenRecebido(signal),
			undefined,
			undefined,
			(delta) => aplicarDeltaCena(delta)
		);

		const unsubscribe = personagens.subscribe((lista) => {
			if (!isGM) return;
			for (const personagem of lista) {
				if (personagem.persistedId) {
					if (tokenController.shouldPersist(personagem)) void persistir(personagem);
					continue;
				}
				if (!tokenController.beginCreate(personagem.id)) continue;
				void tokenController
					.create(personagem)
					.then((token) => {
						const salvo = { ...personagem, persistedId: token.id };
						tokenController.remember(salvo);
						personagens.update((atual) =>
							atual.map((p) => (p.id === personagem.id ? { ...p, persistedId: token.id } : p))
						);
						sceneSocket?.publishTokenUpdated({ tokenId: token.id });
					})
					.catch((error) => {
						persistenceError =
							error instanceof Error ? error.message : 'Não foi possível criar o token.';
					})
					.finally(() => tokenController.finishCreate(personagem.id));
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
			if (tokenRefreshTimer) window.clearInterval(tokenRefreshTimer);
			motor?.destroy();
			motor = null;
		};
	});

	async function salvarHp(update: { hpCurrent: number } | { delta: number }) {
		const selected = personagemSelecionado;
		if (!selected?.persistedId || (!isGM && !selected.isOwned) || hitPointsUpdating) return;
		const operationSceneId = scene.id;
		const operationUserId = session.user.id;
		hitPointsUpdating = true;
		persistenceError = '';
		try {
			const persisted = await tokenController.updateHitPoints(selected.persistedId, update);
			if (scene.id !== operationSceneId || session.user.id !== operationUserId) return;
			const updated = toSceneCharacter(persisted, selected.id, selected.fotoUrl);
			tokenController.remember(updated);
			personagens.update((items) => upsertSceneCharacter(items, updated));
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not update hit points.'
						: 'Não foi possível atualizar os pontos de vida.';
		} finally {
			hitPointsUpdating = false;
		}
	}

	function alterarHp(delta: number) {
		void salvarHp({ delta });
	}

	function definirHp(valor: string) {
		const trimmed = valor.trim();
		if (!trimmed) return;
		if (/^[+-]\d+$/.test(trimmed)) {
			void salvarHp({ delta: Number(trimmed) });
			return;
		}
		const hp = Number(trimmed);
		if (!Number.isFinite(hp)) return;
		void salvarHp({ hpCurrent: Math.trunc(hp) });
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
			initiativeAdvantageByActor = {
				...initiativeAdvantageByActor,
				[personagemSelecionado.actorId ?? '']: false
			};
			personagens.update((tokens) =>
				tokens.map((token) =>
					token.persistedId === result.tokenId ? { ...token, iniciativa: result.initiative } : token
				)
			);
			const rollMessageId = crypto.randomUUID();
			$diceOverlay = {
				expression: `${personagemSelecionado.nome} · iniciativa${result.advantage ? ' · vantagem' : ''}`,
				notation: `${result.rolls?.length ?? 1}d20${result.bonus ? `${result.bonus >= 0 ? '+' : ''}${result.bonus}` : ''}`,
				total: result.initiative,
				dice: result.rolls?.length ? result.rolls : [result.roll],
				nonce: rollMessageId
			};
			$chatMensagens = [
				...$chatMensagens,
				{
					id: rollMessageId,
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
			sceneSocket?.publishChatUpdated();
			sceneSocket?.publishRefresh();
		} catch (error) {
			persistenceError =
				error instanceof Error ? error.message : 'Não foi possível rolar a iniciativa.';
		}
	}
	async function toggleSelectedInitiativeAdvantage(enabled: boolean) {
		const actorId = personagemSelecionado?.actorId;
		if (!actorId || (!isGM && !personagemSelecionado?.isOwned)) return;
		try {
			const result = await setCharacterInitiativeAdvantage(session, campaignId, actorId, enabled);
			initiativeAdvantageByActor = {
				...initiativeAdvantageByActor,
				[actorId]: result.enabled
			};
		} catch (error) {
			persistenceError =
				error instanceof Error
					? error.message
					: 'Não foi possível atualizar a vantagem da iniciativa.';
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
			sceneSocket?.publishChatUpdated();
			$diceOverlay = {
				expression: `${npcSelecionado.name} · ${action.name}`,
				notation: attack.expressao,
				total: attack.total,
				dice: attack.dados,
				nonce: String(attackEvent.id)
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
			sceneSocket?.publishChatUpdated();
			$diceOverlay = {
				expression: `${npcSelecionado.name} · ${action.name} · dano`,
				notation: damage.expressao,
				total: damage.total,
				dice: damage.dados,
				nonce: String(damageEvent.id)
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
	<div class="ping-tool" class:has-fog={isGM && scene.fogEnabled}>
		<button class:active={pingArmed} onclick={() => (pingArmed = !pingArmed)}
			>{pingArmed ? 'Clique no mapa' : '📍 Sinalizar'}</button
		>
	</div>
	<SceneMapTools state={mapToolsState} actions={mapToolsActions} />
	{#if personagemSelecionado}
		<TokenInspector
			token={personagemSelecionado}
			npc={npcSelecionado}
			characterSheet={isGM || personagemSelecionado.isOwned
				? characterSummaryByActor[personagemSelecionado.actorId ?? '']
				: undefined}
			isEnglish={$appLocale === 'en'}
			permissions={{
				canViewCharacterSummary: Boolean(isGM || personagemSelecionado.isOwned),
				canEditHitPoints: Boolean(isGM || personagemSelecionado.isOwned),
				canEditAppearance: Boolean(isGM || personagemSelecionado.isOwned),
				canEditVision: isGM && scene.fogEnabled,
				canInteractWithDoor: Boolean(
					!isGM && personagemSelecionado.isOwned && scene.allowPlayerDoorInteraction
				),
				canOpenSheet: Boolean(isGM || personagemSelecionado.isOwned),
				canRemoveToken: isGM && Boolean(personagemSelecionado.persistedId),
				canRollInitiative: Boolean(isGM || personagemSelecionado.isOwned),
				canUseNpcActions: isGM && Boolean(npcSelecionado?.sheet.actions.length),
				canManageConditions: isGM,
				canChangeVisibility: isGM
			}}
			initiativeAdvantage={initiativeAdvantageByActor[personagemSelecionado.actorId ?? ''] ?? false}
			effectDefinitions={definicoesDeEfeito}
			selectedEffectSlug={definicaoSelecionada}
			effectDuration={duracaoEfeito}
			activeEffects={efeitosDoToken}
			onClose={() => (tokenSelecionadoId = null)}
			onAppearanceChange={alterarAparencia}
			onColorChange={alterarCor}
			onToggleTransparentBackground={alternarFundoTransparente}
			onVisionChange={alterarVisao}
			onLightChange={alterarLuz}
			onInteractWithDoor={() => void interagirComPorta()}
			onOpenSheet={onopensheet}
			onOpenSheetInNewWindow={onopennewwindow}
			onRemoveToken={() => void removerTokenSelecionado()}
			onRollInitiative={() => void rollSelectedInitiative()}
			onInitiativeAdvantageChange={(checked) => void toggleSelectedInitiativeAdvantage(checked)}
			onNpcAction={(action) => void rolarAcaoDeNPC(action)}
			onHitPointsChange={alterarHp}
			onHitPointsSet={definirHp}
			{hitPointsUpdating}
			onEffectSelectionChange={(slug) => (definicaoSelecionada = slug)}
			onEffectDurationChange={(duration) => (duracaoEfeito = duration)}
			onApplyEffect={aplicarCondicaoOficial}
			onRemoveEffect={(effect) => void removerEfeito(effect)}
			onVisibilityChange={alterarVisibilidade}
		/>
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
		top: 0.8rem;
		right: 0.8rem;
	}
	.ping-tool.has-fog {
		top: 3.65rem;
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
	@media (max-width: 760px) {
		.borda-mesa {
			height: calc(100dvh - 142px);
			min-height: 420px;
			border-width: 2px;
		}
		.ping-tool.has-fog {
			top: 3.55rem;
		}
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
</style>
