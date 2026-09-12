// src/lib/engine/Token.ts
import * as PIXI from 'pixi.js';
import { get } from 'svelte/store';
import type { Personagem } from '$lib/stores/gameStore';
import { appLocale, distance } from '$lib/stores/locale';

export class Token {
	public containerPrincipal: PIXI.Container;
	private circuloFundo: PIXI.Graphics;
	private spriteFoto: PIXI.Sprite | null = null;
	private mascaraCircular: PIXI.Graphics | null = null;
	private textoCoordenada: PIXI.Text;
	private arrastando = false;
	private moveuDesdeClique = false;
	private inicioClique = { x: 0, y: 0 };

	private linhaRegua: PIXI.Graphics;
	private textoRegua: PIXI.Text;
	private startX = 0;
	private startY = 0;

	private fotoLoadSeq = 0;
	private texturaFoto: PIXI.Texture | null = null;

	constructor(
		public id: number,
		private dados: Personagem,
		private tamanhoGrid: number,
		private mundo: PIXI.Container,
		private stage: PIXI.Container,
		private readonly onSelecionar?: (tokenId: number) => void,
		private readonly onMover?: (tokenId: number, x: number, y: number) => boolean | void
	) {
		this.containerPrincipal = new PIXI.Container();
		this.containerPrincipal.x = dados.x;
		this.containerPrincipal.y = dados.y;

		// Elemento gráfico para borda/fundo
		this.circuloFundo = new PIXI.Graphics();
		this.containerPrincipal.addChild(this.circuloFundo);

		// A coordenada só aparece em hover: oferece orientação sem poluir a mesa.
		this.textoCoordenada = new PIXI.Text({
			text: '',
			style: {
				fontFamily: 'Arial',
				fontSize: 12,
				fill: 0xffffff,
				fontWeight: 'bold',
				stroke: { color: 0x111111, width: 4 }
			}
		});
		this.textoCoordenada.anchor.set(0, 1);
		this.textoCoordenada.visible = false;
		this.containerPrincipal.addChild(this.textoCoordenada);

		// Réguas de movimento
		this.linhaRegua = new PIXI.Graphics();
		this.textoRegua = new PIXI.Text({
			text: '',
			style: {
				fontFamily: 'Arial',
				fontSize: 16,
				fill: 0xffffff,
				fontWeight: 'bold',
				stroke: { color: 0x000000, width: 4 }
			}
		});
		this.textoRegua.anchor.set(0.5);
		this.textoRegua.visible = false;

		this.mundo.addChild(this.linhaRegua);
		this.mundo.addChild(this.textoRegua);

		// Renderiza o visual inicial
		this.atualizarDados(dados);
		this.configurarEventos();
	}

	private async carregarFoto(base64: string) {
		const loadSequence = ++this.fotoLoadSeq;
		try {
			this.removerFotoExistente();

			// O PixiJS v8 carrega Base64 de forma nativa, instantânea e sem restrições
			const textura = await PIXI.Assets.load(base64);
			// Uma atualização mais recente venceu esta requisição assíncrona.
			if (loadSequence !== this.fotoLoadSeq) return;

			this.spriteFoto = new PIXI.Sprite(textura);
			this.spriteFoto.anchor.set(0.5);

			this.mascaraCircular = new PIXI.Graphics();
			this.spriteFoto.mask = this.mascaraCircular;

			this.containerPrincipal.addChild(this.mascaraCircular);
			this.containerPrincipal.addChild(this.spriteFoto);
			// A foto é inserida depois dos elementos-base; trazemos o tooltip de volta
			// ao topo para ele continuar legível durante o hover.
			this.containerPrincipal.removeChild(this.textoCoordenada);
			this.containerPrincipal.addChild(this.textoCoordenada);

			this.desenharToken();
		} catch (e) {
			console.error('Erro interno do PixiJS ao renderizar:', e);
		}
	}

	private removerFotoExistente() {
		if (this.spriteFoto) {
			this.spriteFoto.mask = null; // CRÍTICO: Desvincula a máscara antes de destruir
			this.containerPrincipal.removeChild(this.spriteFoto);
			this.spriteFoto.destroy({ texture: false });
			this.spriteFoto = null;
		}
		if (this.mascaraCircular) {
			this.containerPrincipal.removeChild(this.mascaraCircular);
			this.mascaraCircular.destroy();
			this.mascaraCircular = null;
		}
	}

	private desenharToken() {
		const escalaGrid = this.dados.tamanho || 1;
		const diametro = this.tamanhoGrid * escalaGrid;
		const centro = diametro / 2;
		const raio = centro - 4; // Margem para a borda do token

		// 1. Redesenha a borda/fundo colorido
		this.circuloFundo.clear();
		this.circuloFundo.circle(centro, centro, raio + 2);
		this.circuloFundo.fill(this.dados.cor);
		// Condições são discretas, mas perceptíveis mesmo sem abrir o inspector.
		// A regra completa continua no painel do token; este aro é só um lembrete visual.
		if (this.dados.status?.length) {
			const statusColor = this.corDaCondicao(this.dados.status[0]);
			this.circuloFundo.circle(centro, centro, raio + 5);
			this.circuloFundo.stroke({ width: 3, color: statusColor, alpha: 0.95 });
		}
		this.atualizarCoordenada();

		// 2. Redesenha o corte da máscara circular. Informações como HP e condições
		// ficam no inspector aberto por clique, mantendo a mesa visualmente limpa.
		if (this.mascaraCircular) {
			this.mascaraCircular.clear();
			this.mascaraCircular.circle(centro, centro, raio);
			this.mascaraCircular.fill(0xffffff);
		}

		// 3. Aplica transformações de posição e zoom na imagem inserida
		if (this.spriteFoto && this.spriteFoto.texture) {
			this.spriteFoto.scale.set(1);

			// Calcula a escala para cobrir o círculo mantendo o aspect ratio
			const escalaBaseX = (raio * 2) / this.spriteFoto.texture.width;
			const escalaBaseY = (raio * 2) / this.spriteFoto.texture.height;
			const escalaBase = Math.max(escalaBaseX, escalaBaseY);

			const zoomUsuario = this.dados.fotoEscala || 1.0;
			this.spriteFoto.scale.set(escalaBase * zoomUsuario);

			// Posicionamento com base no centro do Token + offset manual do usuário
			this.spriteFoto.x = centro + (this.dados.fotoOffsetX || 0);
			this.spriteFoto.y = centro + (this.dados.fotoOffsetY || 0);
		}
	}

	private corDaCondicao(status: string) {
		const colors: Record<string, number> = {
			Envenenado: 0x78b159,
			Queimando: 0xdf6b40,
			Caído: 0xa49789,
			Invisível: 0x8a79c8,
			Concentrando: 0x67b6d6
		};
		return colors[status] ?? 0xe0b86f;
	}

	private atualizarCoordenada() {
		const coluna = Math.floor(this.containerPrincipal.x / this.tamanhoGrid) + 1;
		const linha = Math.floor(this.containerPrincipal.y / this.tamanhoGrid) + 1;
		this.textoCoordenada.text = `C${coluna} · L${linha}`;
		this.textoCoordenada.position.set(0, -6);
	}

	public atualizarDados(novosDados: Personagem) {
		const fotoAlterada = novosDados.fotoUrl !== this.dados.fotoUrl;
		this.dados = novosDados;
		this.containerPrincipal.position.set(novosDados.x, novosDados.y);

		if (fotoAlterada || (novosDados.fotoUrl && !this.spriteFoto)) {
			if (novosDados.fotoUrl) {
				this.carregarFoto(novosDados.fotoUrl);
			} else {
				this.removerFotoExistente();
			}
		}

		// Redesenha os elementos visuais com os dados novos/atualizados
		this.desenharToken();
	}

	/** Libera elementos Pixi quando o token sai da mesa. */
	public destroy() {
		this.fotoLoadSeq++;
		this.removerFotoExistente();
		this.linhaRegua.destroy();
		this.textoRegua.destroy();
		this.containerPrincipal.destroy({ children: true, texture: false, textureSource: false });
	}

	private configurarEventos() {
		this.containerPrincipal.eventMode = 'static';
		this.containerPrincipal.cursor = 'pointer';

		this.containerPrincipal.on('pointerdown', (e) => {
			e.stopPropagation();
			this.arrastando = true;
			this.moveuDesdeClique = false;
			this.inicioClique = { x: e.global.x, y: e.global.y };
			this.containerPrincipal.alpha = 0.8;

			const escalaGrid = this.dados.tamanho || 1;
			this.startX = this.containerPrincipal.x + (this.tamanhoGrid * escalaGrid) / 2;
			this.startY = this.containerPrincipal.y + (this.tamanhoGrid * escalaGrid) / 2;
		});

		this.stage.on('pointermove', (e) => {
			if (this.arrastando) {
				const distanciaX = e.global.x - this.inicioClique.x;
				const distanciaY = e.global.y - this.inicioClique.y;
				if (Math.hypot(distanciaX, distanciaY) > 5) this.moveuDesdeClique = true;

				const pos = this.mundo.toLocal(e.global);
				const escalaGrid = this.dados.tamanho || 1;
				const metadeToken = (this.tamanhoGrid * escalaGrid) / 2;

				this.containerPrincipal.x = pos.x - metadeToken;
				this.containerPrincipal.y = pos.y - metadeToken;

				if (e.shiftKey) {
					const atualX = pos.x;
					const atualY = pos.y;
					this.linhaRegua.clear();
					this.linhaRegua.moveTo(this.startX, this.startY);
					this.linhaRegua.lineTo(atualX, atualY);
					this.linhaRegua.stroke({ width: 3, color: 0x4caf50, alpha: 0.8 });
					this.linhaRegua.circle(this.startX, this.startY, 5).fill(0x4caf50);

					const dx = atualX - this.startX;
					const dy = atualY - this.startY;
					const distanciaPixels = Math.sqrt(dx * dx + dy * dy);
					const metros = Math.floor(distanciaPixels / this.tamanhoGrid) * 1.5;

					this.textoRegua.visible = true;
					this.textoRegua.x = this.startX + dx / 2;
					this.textoRegua.y = this.startY + dy / 2 - 15;
					this.textoRegua.text = distance(metros, get(appLocale));
				} else {
					this.linhaRegua.clear();
					this.textoRegua.visible = false;
				}
			}
		});

		const soltarToken = () => {
			if (this.arrastando) {
				this.arrastando = false;
				this.containerPrincipal.alpha = 1.0;
				this.linhaRegua.clear();
				this.textoRegua.visible = false;

				const escalaGrid = this.dados.tamanho || 1;
				const metadeToken = (this.tamanhoGrid * escalaGrid) / 2;

				const centroX = this.containerPrincipal.x + metadeToken;
				const centroY = this.containerPrincipal.y + metadeToken;
				const coluna = Math.floor(centroX / this.tamanhoGrid);
				const linha = Math.floor(centroY / this.tamanhoGrid);

				// Centraliza no grid com base na escala dele
				if (escalaGrid % 2 === 0) {
					// Tamanhos pares (2x2) encaixam nas linhas de grade
					this.containerPrincipal.x =
						Math.round(this.containerPrincipal.x / this.tamanhoGrid) * this.tamanhoGrid;
					this.containerPrincipal.y =
						Math.round(this.containerPrincipal.y / this.tamanhoGrid) * this.tamanhoGrid;
				} else {
					// Tamanhos ímpares (1x1, 3x3) centralizam no meio do quadrado
					this.containerPrincipal.x =
						coluna * this.tamanhoGrid - (metadeToken - this.tamanhoGrid / 2);
					this.containerPrincipal.y =
						linha * this.tamanhoGrid - (metadeToken - this.tamanhoGrid / 2);
				}

				if (this.moveuDesdeClique) {
					const moved = this.onMover?.(
						this.id,
						this.containerPrincipal.x,
						this.containerPrincipal.y
					);
					// A rule can deny movement (for example Restrained). Revert the
					// visual token immediately so its rendered position cannot diverge
					// from the persisted board state.
					if (moved === false) this.containerPrincipal.position.set(this.dados.x, this.dados.y);
				} else this.onSelecionar?.(this.id);
				this.atualizarCoordenada();
			}
		};

		this.stage.on('pointerup', soltarToken);
		this.stage.on('pointerupoutside', soltarToken);

		this.containerPrincipal.on('pointerover', () => (this.textoCoordenada.visible = true));
		this.containerPrincipal.on('pointerout', () => (this.textoCoordenada.visible = false));
	}
}
