import * as PIXI from 'pixi.js';
import { Camera } from './Camera';
import { Token } from './Token';
import { MapManager } from './MapManager';
import { RulerManager } from './RulerManager';
import type { MeasuredArea } from './RulerManager';
import type { SceneArea } from '$lib/services/sceneApi';
import { personagens, urlMapa, type Personagem } from '$lib/stores/gameStore';
import type { Unsubscriber } from 'svelte/store';

export class GameEngine {
	public app: PIXI.Application;
	public camera!: Camera;
	public mapManager!: MapManager;
	public rulerManager!: RulerManager;
	public tamanhoGrid = 70;
	private tokens: Map<number, Token> = new Map();
	private unsubscribers: Unsubscriber[] = [];
	private fogLayer: PIXI.Graphics | null = null;
	private areaLayer: PIXI.Graphics | null = null;

	constructor(
		private readonly onTokenClick?: (tokenId: number) => void,
		private readonly onTokenMove?: (tokenId: number, x: number, y: number) => boolean | void,
		private readonly onFogPaint?: (x: number, y: number) => void,
		private readonly onAreaComplete?: (area: MeasuredArea) => void,
		gridSize = 70
	) {
		this.app = new PIXI.Application();
		this.tamanhoGrid = Math.min(200, Math.max(20, gridSize));
	}

	async init(canvas: HTMLCanvasElement) {
		await this.app.init({
			canvas: canvas,
			width: Math.max(canvas.clientWidth, 320),
			height: Math.max(canvas.clientHeight, 320),
			backgroundColor: 0x222222,
			antialias: true
		});

		this.camera = new Camera(this.app);

		// Instancia o gerenciador de mapa passando o container "mundo"
		this.mapManager = new MapManager(this.camera.mundo);

		this.desenharGrid();

		// Escuta as alterações na lista de personagens
		this.unsubscribers.push(
			personagens.subscribe((listaAtual: Personagem[]) => {
				const idsAtuais = new Set(listaAtual.map((personagem) => personagem.id));
				for (const [id, token] of this.tokens) {
					if (!idsAtuais.has(id)) {
						token.destroy();
						this.tokens.delete(id);
					}
				}
				listaAtual.forEach((p) => {
					if (!this.tokens.has(p.id)) {
						// Nasce um token novo
						const novoToken = new Token(
							p.id,
							p,
							this.tamanhoGrid,
							this.camera.mundo,
							this.app.stage,
							this.onTokenClick,
							this.onTokenMove
						);
						this.tokens.set(p.id, novoToken);

						// Atenção aqui: Agora adicionamos o containerPrincipal, não o graphics!
						this.camera.mundo.addChild(novoToken.containerPrincipal);
					} else {
						// Se o token já existe, apenas avisamos ele que os dados mudaram!
						const tokenExistente = this.tokens.get(p.id);
						if (tokenExistente) {
							tokenExistente.atualizarDados(p);
						}
					}
				});
			})
		);

		this.unsubscribers.push(
			urlMapa.subscribe((novaUrl: string | null) => {
				if (novaUrl) {
					this.mapManager.carregarMapa(novaUrl);
				}
			})
		);

		this.rulerManager = new RulerManager(this.camera.mundo, this.app.stage, this.tamanhoGrid, this.onAreaComplete);
		this.app.stage.on('pointertap', (event) => this.onFogPaint?.(this.camera.mundo.toLocal(event.global).x, this.camera.mundo.toLocal(event.global).y));
	}

	resize(width: number, height: number) {
		this.app.renderer.resize(Math.max(width, 320), Math.max(height, 320));
	}

	destroy() {
		this.unsubscribers.forEach((unsubscribe) => unsubscribe());
		this.unsubscribers = [];
		this.tokens.forEach((token) => token.destroy());
		this.tokens.clear();
		this.fogLayer?.destroy();
		this.areaLayer?.destroy();
		this.rulerManager?.destroy();
		this.mapManager?.destroy();
		this.camera?.destroy();
		this.app.destroy(true, { children: true, texture: false, textureSource: false });
	}
	setAreas(areas: SceneArea[]) {
		if (!this.areaLayer) { this.areaLayer = new PIXI.Graphics(); this.camera.mundo.addChild(this.areaLayer); }
		this.areaLayer.clear();
		for (const area of areas) {
			const color = area.color;
			if (area.shape === 'line') this.areaLayer.moveTo(area.startX,area.startY).lineTo(area.endX,area.endY).stroke({width:5,color,alpha:.85});
			else if (area.shape === 'circle') { const radius=Math.hypot(area.endX-area.startX,area.endY-area.startY); this.areaLayer.circle(area.startX,area.startY,radius).fill({color,alpha:.18}).stroke({width:3,color,alpha:.9}); }
			else { const angle=Math.atan2(area.endY-area.startY,area.endX-area.startX),radius=Math.hypot(area.endX-area.startX,area.endY-area.startY),spread=Math.PI/6; this.areaLayer.moveTo(area.startX,area.startY).arc(area.startX,area.startY,radius,angle-spread,angle+spread).closePath().fill({color,alpha:.2}).stroke({width:3,color,alpha:.9}); }
		}
	}

	setFog(enabled: boolean, isGM: boolean, visibleCells: string[], revealedCells: string[], hiddenCells: string[] = []) {
		if (!this.fogLayer) {
			this.fogLayer = new PIXI.Graphics();
			this.camera.mundo.addChild(this.fogLayer);
		}
		this.fogLayer.clear();
		if (!enabled || isGM) return;
		const visible = new Set(visibleCells);
		const explored = new Set(revealedCells);
		const hidden = new Set(hiddenCells);
		// The existing grid spans ±2520px. Rendering one batched Graphics layer
		// is inexpensive and keeps the mask aligned while camera zooms/pans.
		for (let x = -36; x <= 36; x++) for (let y = -36; y <= 36; y++) {
			const key = `${x}:${y}`;
			if (visible.has(key) && !hidden.has(key)) continue;
			this.fogLayer.rect(x * this.tamanhoGrid, y * this.tamanhoGrid, this.tamanhoGrid, this.tamanhoGrid)
				.fill({ color: 0x0a080c, alpha: explored.has(key) ? 0.58 : 0.94 });
		}
	}

	private desenharGrid() {
		const grid = new PIXI.Graphics();
		const LIMITE = 2520;
		for (let i = -LIMITE; i <= LIMITE; i += this.tamanhoGrid) {
			grid.moveTo(i, -LIMITE);
			grid.lineTo(i, LIMITE);
			grid.moveTo(-LIMITE, i);
			grid.lineTo(LIMITE, i);
		}
		grid.stroke({ width: 1, color: 0x555555 });
		this.camera.mundo.addChild(grid);
	}
}
