import * as PIXI from 'pixi.js';
import { Camera } from './Camera';
import { Token } from './Token';
import { MapManager } from './MapManager';
import { RulerManager } from './RulerManager';
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

	constructor(
		private readonly onTokenClick?: (tokenId: number) => void,
		private readonly onTokenMove?: (tokenId: number, x: number, y: number) => void
	) {
		this.app = new PIXI.Application();
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

		this.rulerManager = new RulerManager(this.camera.mundo, this.app.stage, this.tamanhoGrid);
	}

	resize(width: number, height: number) {
		this.app.renderer.resize(Math.max(width, 320), Math.max(height, 320));
	}

	destroy() {
		this.unsubscribers.forEach((unsubscribe) => unsubscribe());
		this.unsubscribers = [];
		this.tokens.forEach((token) => token.destroy());
		this.tokens.clear();
		this.rulerManager?.destroy();
		this.mapManager?.destroy();
		this.camera?.destroy();
		this.app.destroy(true, { children: true, texture: false, textureSource: false });
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
