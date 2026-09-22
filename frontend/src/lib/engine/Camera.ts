import { Application, Container, Graphics } from 'pixi.js';

export class Camera {
	public mundo: Container;
	private fundoInterativo: Graphics;
	private arrastandoCamera = false;
	private posicaoInicialCamera = { x: 0, y: 0 };
	private pinchDistance = 0;
	private readonly onKeyDown = (e: KeyboardEvent) => {
		if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			this.zoomBy(0.1);
		} else if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			this.zoomBy(-0.1);
		} else if (e.key === '0' || e.key === 'Home') {
			e.preventDefault();
			this.resetView();
		}
	};
	private readonly onWheel = (e: WheelEvent) => {
		e.preventDefault();
		const direcao = e.deltaY < 0 ? 1 : -1;
		const rect = this.app.canvas.getBoundingClientRect();
		this.zoomAt(1 + direcao * 0.1, e.clientX - rect.left, e.clientY - rect.top);
	};

	constructor(private app: Application) {
		this.mundo = new Container();
		app.stage.addChild(this.mundo);

		this.fundoInterativo = new Graphics();
		const LIMITE = 2520;
		this.fundoInterativo.rect(-LIMITE, -LIMITE, LIMITE * 2, LIMITE * 2);
		this.fundoInterativo.fill({ color: 0x222222, alpha: 0.01 });
		this.mundo.addChild(this.fundoInterativo);

		this.configurarEventos();
	}

	private configurarEventos() {
		this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
		this.app.canvas.style.touchAction = 'none';
		this.app.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
		this.app.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
		this.app.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
		this.app.canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
		this.app.canvas.addEventListener('keydown', this.onKeyDown);

		this.fundoInterativo.eventMode = 'static';
		this.setPanCursor('grab');
		this.fundoInterativo.on('pointerdown', (e) => {
			if (e.shiftKey) return;
			this.arrastandoCamera = true;
			this.setPanCursor('grabbing');
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

		const soltarCamera = () => {
			this.arrastandoCamera = false;
			this.setPanCursor('grab');
		};
		this.app.stage.on('pointerup', soltarCamera);
		this.app.stage.on('pointerupoutside', soltarCamera);
	}
	private onTouchStart = (event: TouchEvent) => {
		if (event.touches.length === 2)
			this.pinchDistance = this.distance(event.touches[0], event.touches[1]);
	};
	private onTouchMove = (event: TouchEvent) => {
		if (event.touches.length !== 2 || !this.pinchDistance) return;
		event.preventDefault();
		const nextDistance = this.distance(event.touches[0], event.touches[1]);
		const factor = nextDistance / this.pinchDistance;
		this.pinchDistance = nextDistance;
		const rect = this.app.canvas.getBoundingClientRect();
		this.zoomAt(
			factor,
			(event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left,
			(event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top
		);
	};
	private onTouchEnd = (event: TouchEvent) => {
		if (event.touches.length < 2) this.pinchDistance = 0;
	};
	private setPanCursor(cursor: 'grab' | 'grabbing' | '') {
		this.app.canvas.style.cursor = cursor;
		this.fundoInterativo.cursor = cursor || 'default';
	}

	private distance(a: Touch, b: Touch) {
		return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
	}
	public zoomBy(delta: number) {
		this.zoomAt(1 + delta, this.app.renderer.width / 2, this.app.renderer.height / 2);
	}

	public resetView() {
		this.mundo.scale.set(1);
		this.mundo.position.set(this.app.renderer.width / 2, this.app.renderer.height / 2);
	}

	public get zoom() {
		return this.mundo.scale.x;
	}

	public get view() {
		return { x: this.mundo.x, y: this.mundo.y, zoom: this.mundo.scale.x };
	}

	public setView(view: { x: number; y: number; zoom: number }) {
		if (![view.x, view.y, view.zoom].every(Number.isFinite)) return;
		this.mundo.position.set(view.x, view.y);
		this.mundo.scale.set(Math.max(0.3, Math.min(3, view.zoom)));
	}

	private zoomAt(factor: number, x: number, y: number) {
		const oldScale = this.mundo.scale.x;
		const newScale = Math.max(0.3, Math.min(3, oldScale * factor));
		if (newScale === oldScale) return;
		const worldX = (x - this.mundo.x) / oldScale;
		const worldY = (y - this.mundo.y) / oldScale;
		this.mundo.scale.set(newScale);
		this.mundo.x = x - worldX * newScale;
		this.mundo.y = y - worldY * newScale;
	}

	destroy() {
		this.app.canvas.removeEventListener('wheel', this.onWheel);
		this.app.canvas.removeEventListener('touchstart', this.onTouchStart);
		this.app.canvas.removeEventListener('touchmove', this.onTouchMove);
		this.app.canvas.removeEventListener('touchend', this.onTouchEnd);
		this.app.canvas.removeEventListener('touchcancel', this.onTouchEnd);
		this.app.canvas.removeEventListener('keydown', this.onKeyDown);
		this.setPanCursor('');
		this.fundoInterativo.removeAllListeners();
		this.app.stage.removeAllListeners();
	}
}
