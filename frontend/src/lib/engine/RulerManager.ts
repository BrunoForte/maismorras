import * as PIXI from 'pixi.js';

export class RulerManager {
	private graphics: PIXI.Graphics;
	private texto: PIXI.Text;
	private medindo = false;
	private startX = 0;
	private startY = 0;

	constructor(
		private mundo: PIXI.Container,
		private stage: PIXI.Container,
		private tamanhoGrid: number
	) {
		// 1. Criamos a linha da régua
		this.graphics = new PIXI.Graphics();

		// 2. Criamos o texto da distância
		this.texto = new PIXI.Text({
			text: '',
			style: {
				fontFamily: 'Arial',
				fontSize: 18,
				fill: 0xffffff,
				fontWeight: 'bold',
				stroke: { color: 0x000000, width: 4 }
			}
		});
		this.texto.anchor.set(0.5);
		this.texto.visible = false;

		// Adicionamos no "mundo" para que a régua dê zoom junto com o mapa
		this.mundo.addChild(this.graphics);
		this.mundo.addChild(this.texto);

		this.configurarEventos();
	}

	private configurarEventos() {
		this.stage.eventMode = 'static';

		// INÍCIO DA MEDIÇÃO
		this.stage.on('pointerdown', (e) => {
			// A mágica: só ativa a régua se o jogador estiver a segurar o SHIFT
			if (!e.shiftKey) return;

			this.medindo = true;

			// Converte a posição do mouse na tela para a posição exata dentro do mundo (lidando com zoom)
			const pos = this.mundo.toLocal(e.global);
			this.startX = pos.x;
			this.startY = pos.y;

			this.graphics.clear();
			this.texto.visible = true;
			this.texto.x = pos.x;
			this.texto.y = pos.y;
		});

		// ARRASTANDO A RÉGUA
		this.stage.on('pointermove', (e) => {
			if (!this.medindo) return;

			const pos = this.mundo.toLocal(e.global);

			// Desenha a linha visual (dourada e meio transparente)
			this.graphics.clear();
			this.graphics.moveTo(this.startX, this.startY);
			this.graphics.lineTo(pos.x, pos.y);
			this.graphics.stroke({ width: 4, color: 0xffaa00, alpha: 0.8 });

			// Desenha dois círculos nas pontas para ficar com cara de VTT profissional
			this.graphics.circle(this.startX, this.startY, 5).fill(0xffaa00);
			this.graphics.circle(pos.x, pos.y, 5).fill(0xffaa00);

			// CÁLCULO DE D&D (Euclidiano simples para o grid)
			const dx = pos.x - this.startX;
			const dy = pos.y - this.startY;
			const distanciaPixels = Math.sqrt(dx * dx + dy * dy);

			// Se 1 quadrado (tamanhoGrid) = 1.5 metros:
			const quadrados = distanciaPixels / this.tamanhoGrid;
			// Arredondamos para ficar em múltiplos cravados de 1.5m (como manda o D&D)
			const metros = Math.floor(quadrados) * 1.5;

			// Posiciona o texto exatamente no meio da linha
			this.texto.x = this.startX + dx / 2;
			this.texto.y = this.startY + dy / 2 - 15; // -15px para ficar um pouco acima da linha
			this.texto.text = `${metros.toFixed(1)}m`;
		});

		// SOLTANDO O CLIQUE
		const pararMedicao = () => {
			if (this.medindo) {
				this.medindo = false;
				this.graphics.clear();
				this.texto.visible = false;
			}
		};

		this.stage.on('pointerup', pararMedicao);
		this.stage.on('pointerupoutside', pararMedicao);
	}

	destroy() {
		this.graphics.destroy();
		this.texto.destroy();
	}
}
