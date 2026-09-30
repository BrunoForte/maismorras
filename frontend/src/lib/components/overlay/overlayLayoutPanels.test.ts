import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import OverlayBlockInspector from './OverlayBlockInspector.svelte';
import OverlayBackgroundControl from './OverlayBackgroundControl.svelte';
import OverlayLayoutCanvas from './OverlayLayoutCanvas.svelte';
import OverlayProfileBar from './OverlayProfileBar.svelte';
import { createDefaultOverlayLayout } from '$lib/utils/overlay/overlayLayoutRules';

describe('overlay layout panels', () => {
	it('renders profile controls and disables deletion of the only profile', () => {
		const html = render(OverlayProfileBar, {
			props: {
				profiles: ['Principal'],
				activeProfile: 'Principal',
				canDelete: false,
				onSelect: vi.fn(),
				onDuplicate: vi.fn(),
				onRename: vi.fn(),
				onDelete: vi.fn()
			}
		}).body;
		expect(html).toContain('Perfis de layout');
		expect(html).toContain('Duplicar');
		expect(html).toContain('Renomear');
		expect(html).toContain('disabled');
	});

	it('renders the composition canvas and marks locked blocks', () => {
		const blocks = createDefaultOverlayLayout().blocks.map((block) =>
			block.id === 'dice' ? { ...block, locked: true } : block
		);
		const html = render(OverlayLayoutCanvas, {
			props: {
				blocks,
				selectedId: 'dice',
				backgroundPreview: '',
				snapToGrid: true,
				onSnapChange: vi.fn(),
				onSelect: vi.fn(),
				onDragStart: vi.fn(),
				onDropPosition: vi.fn(),
				onResizeStart: vi.fn()
			}
		}).body;
		expect(html).toContain('Área para posicionar os blocos');
		expect(html).toContain('TRANSPARÊNCIA');
		expect(html).toContain('Dados 3D');
		expect(html).toContain('aria-disabled="true"');
	});

	it('renders inspector properties, lock and visibility toggles for selected blocks', () => {
		const blocks = createDefaultOverlayLayout().blocks;
		const html = render(OverlayBlockInspector, {
			props: { selected: { ...blocks[0], locked: true }, blocks, onUpdate: vi.fn() }
		}).body;
		expect(html).toContain('Bloquear posição');
		expect(html).toContain('Opacidade (%)');
		expect(html).toContain('Barra de iniciativa');
		expect(html).toContain('Cor da borda');
	});

	it('renders background selection controls without integrating Storage', () => {
		const callbacks = { onUpload: vi.fn(), onTransparent: vi.fn() };
		const html = render(OverlayBackgroundControl, {
			props: { background: 'campaigns/example.webp', ...callbacks }
		}).body;
		expect(html).toContain('Fundo da overlay');
		expect(html).toContain('Escolher imagem');
		expect(html).toContain('Usar transparente');
		expect(callbacks.onUpload).not.toHaveBeenCalled();
		expect(callbacks.onTransparent).not.toHaveBeenCalled();
	});
});
