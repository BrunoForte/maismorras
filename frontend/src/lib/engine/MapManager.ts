import * as PIXI from 'pixi.js';

export class MapManager {
	private spriteMapa: PIXI.Sprite | null = null;

	constructor(private mundo: PIXI.Container) {}

	async carregarMapa(url: string) {
		// Se já existir um mapa antigo na mesa, nós o destruímos para liberar memória
		if (this.spriteMapa) {
			this.spriteMapa.destroy();
			this.spriteMapa = null;
		}

		// Carrega a imagem e transforma em uma textura compreensível pela placa de vídeo
		const textura = await PIXI.Assets.load(url);
		this.spriteMapa = new PIXI.Sprite(textura);

		// Posiciona a imagem alinhada no ponto Zero do nosso cenário
		this.spriteMapa.x = 0;
		this.spriteMapa.y = 0;

		// O Segredo das Camadas: O índice 0 é o nosso fundo de clicar e arrastar a câmera.
		// Ao usar addChildAt no índice 1, empurramos o mapa para ficar DEBAIXO do grid e dos tokens.
		this.mundo.addChildAt(this.spriteMapa, 1);
	}

	destroy() {
		this.spriteMapa?.destroy({ texture: false, textureSource: false });
		this.spriteMapa = null;
	}
}
