import { Assets, Container, Sprite } from 'pixi.js';

export class MapManager {
	private spriteMapa: Sprite | null = null;
	private boardWidth = 30 * 70;
	private boardHeight = 20 * 70;

	constructor(private mundo: Container) {}

	async carregarMapa(url: string) {
		// Se já existir um mapa antigo na mesa, nós o destruímos para liberar memória
		if (this.spriteMapa) {
			this.spriteMapa.destroy();
			this.spriteMapa = null;
		}

		// Carrega a imagem e transforma em uma textura compreensível pela placa de vídeo
		const textura = await Assets.load(url);
		this.spriteMapa = new Sprite(textura);

		// Posiciona a imagem alinhada no ponto Zero do nosso cenário
		this.spriteMapa.x = 0;
		this.spriteMapa.y = 0;
		this.applyBoardSize();

		// O Segredo das Camadas: O índice 0 é o nosso fundo de clicar e arrastar a câmera.
		// Ao usar addChildAt no índice 1, empurramos o mapa para ficar DEBAIXO do grid e dos tokens.
		this.mundo.addChildAt(this.spriteMapa, 1);
	}

	setBoardSize(widthCells: number, heightCells: number, gridSize: number) {
		this.boardWidth = widthCells * gridSize;
		this.boardHeight = heightCells * gridSize;
		this.applyBoardSize();
	}

	private applyBoardSize() {
		if (!this.spriteMapa) return;
		this.spriteMapa.width = this.boardWidth;
		this.spriteMapa.height = this.boardHeight;
	}

	destroy() {
		this.spriteMapa?.destroy({ texture: false, textureSource: false });
		this.spriteMapa = null;
	}
}
