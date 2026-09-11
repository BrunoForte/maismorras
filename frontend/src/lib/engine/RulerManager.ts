import * as PIXI from 'pixi.js';
import { rulerMode, type RulerMode } from '$lib/stores/tableToolsStore';
import { get, type Unsubscriber } from 'svelte/store';
import { appLocale, distance } from '$lib/stores/locale';
export type MeasuredArea = { shape: RulerMode; startX: number; startY: number; endX: number; endY: number };

export class RulerManager {
	private graphics: PIXI.Graphics;
	private texto: PIXI.Text;
	private medindo = false;
	private startX = 0;
	private startY = 0;
	private mode: RulerMode = 'line';
	private unsubscribe: Unsubscriber;
	private endX = 0;
	private endY = 0;

	constructor(
		private mundo: PIXI.Container,
		private stage: PIXI.Container,
		private tamanhoGrid: number,
		private readonly onComplete?: (area: MeasuredArea) => void
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
		this.unsubscribe = rulerMode.subscribe((mode) => (this.mode = mode));

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
			this.endX = pos.x;
			this.endY = pos.y;
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
			this.endX = pos.x;
			this.endY = pos.y;

			// Linha, círculo e cone compartilham o mesmo ponto inicial, grid e zoom.
			this.graphics.clear();
			const dx = pos.x - this.startX;
			const dy = pos.y - this.startY;
			const distanciaPixels = Math.sqrt(dx * dx + dy * dy);
			const deltaX = Math.abs(Math.round(dx / this.tamanhoGrid));
			const deltaY = Math.abs(Math.round(dy / this.tamanhoGrid));
			// Regra de diagonais 5-10-5: cada segundo quadrado diagonal custa dois.
			const diagonais = Math.min(deltaX, deltaY);
			const retas = Math.max(deltaX, deltaY) - diagonais;
			const quadrados = diagonais + Math.floor(diagonais / 2) + retas;
			const metros = quadrados * 1.5;
			if (this.mode === 'line') {
				this.graphics
					.moveTo(this.startX, this.startY)
					.lineTo(pos.x, pos.y)
					.stroke({ width: 4, color: 0xffaa00, alpha: 0.9 });
				this.graphics.circle(this.startX, this.startY, 5).circle(pos.x, pos.y, 5).fill(0xffaa00);
			} else if (this.mode === 'circle') {
				this.graphics
					.circle(this.startX, this.startY, distanciaPixels)
					.fill({ color: 0x5e9bdd, alpha: 0.18 })
					.stroke({ width: 3, color: 0x8bc4ff, alpha: 0.9 });
				this.graphics.circle(this.startX, this.startY, 5).fill(0x8bc4ff);
			} else {
				const angle = Math.atan2(dy, dx);
				const spread = Math.PI / 6; // cone de 60°, formato mais comum em D&D
				this.graphics.moveTo(this.startX, this.startY);
				this.graphics.arc(
					this.startX,
					this.startY,
					distanciaPixels,
					angle - spread,
					angle + spread
				);
				this.graphics
					.closePath()
					.fill({ color: 0xd878c7, alpha: 0.2 })
					.stroke({ width: 3, color: 0xf0a8e1, alpha: 0.9 });
			}

			// Posiciona o texto exatamente no meio da linha
			this.texto.x = this.startX + dx / 2;
			this.texto.y = this.startY + dy / 2 - 15; // -15px para ficar um pouco acima da linha
			const locale = get(appLocale);
			const shape = this.mode === 'line' ? (locale === 'en' ? 'line' : 'linha') : this.mode === 'circle' ? (locale === 'en' ? 'radius' : 'raio') : 'cone 60°';
			this.texto.text = `${distance(metros, locale)} · ${shape}`;
		});

		// SOLTANDO O CLIQUE
		const pararMedicao = () => {
			if (this.medindo) {
				this.medindo = false;
				this.onComplete?.({ shape: this.mode, startX: this.startX, startY: this.startY, endX: this.endX, endY: this.endY });
				this.graphics.clear();
				this.texto.visible = false;
			}
		};

		this.stage.on('pointerup', pararMedicao);
		this.stage.on('pointerupoutside', pararMedicao);
	}

	destroy() {
		this.unsubscribe();
		this.graphics.destroy();
		this.texto.destroy();
	}
}
