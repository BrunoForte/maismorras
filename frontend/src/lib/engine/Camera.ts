import * as PIXI from 'pixi.js';

export class Camera {
	public mundo: PIXI.Container;
	private fundoInterativo: PIXI.Graphics;
	private arrastandoCamera = false;
	private posicaoInicialCamera = { x: 0, y: 0 };
	private readonly onWheel = (e: WheelEvent) => {
		e.preventDefault();
		const direcao = e.deltaY < 0 ? 1 : -1;
		const novoScale = this.mundo.scale.x + direcao * 0.1;
		if (novoScale >= 0.3 && novoScale <= 3.0) {
			this.mundo.scale.set(novoScale);
		}
	};

	constructor(private app: PIXI.Application) {
		this.mundo = new PIXI.Container();
		app.stage.addChild(this.mundo);

		this.fundoInterativo = new PIXI.Graphics();
		const LIMITE = 2520;
		this.fundoInterativo.rect(-LIMITE, -LIMITE, LIMITE * 2, LIMITE * 2);
		this.fundoInterativo.fill({ color: 0x222222, alpha: 0.01 });
		this.mundo.addChild(this.fundoInterativo);

		this.configurarEventos();
	}

	private configurarEventos() {
		this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });

		this.fundoInterativo.eventMode = 'static';
		this.fundoInterativo.on('pointerdown', (e) => {
			if (e.shiftKey) return;
			this.arrastandoCamera = true;
			this.posicaoInicialCamera = { x: e.global.x - this.mundo.x, y: e.global.y - this.mundo.y };
		});

		this.app.stage.eventMode = 'static';
		this.app.stage.on('pointermove', (e) => {
			if (e.shiftKey) return;
			if (this.arrastandoCamera) {
				this.mundo.x = e.global.x - this.posicaoInicialCamera.x;
				this.mundo.y = e.global.y - this.posicaoInicialCamera.y;
			}
		});

		const soltarCamera = () => (this.arrastandoCamera = false);
		this.app.stage.on('pointerup', soltarCamera);
		this.app.stage.on('pointerupoutside', soltarCamera);
	}

	destroy() {
		this.app.canvas.removeEventListener('wheel', this.onWheel);
		this.fundoInterativo.removeAllListeners();
		this.app.stage.removeAllListeners();
	}
}
