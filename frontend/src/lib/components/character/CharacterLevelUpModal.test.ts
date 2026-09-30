import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import CharacterLevelUpModal from './CharacterLevelUpModal.svelte';

describe('CharacterLevelUpModal', () => {
	it('shows all three choices and forwards the selected action', () => {
		const onChoose = vi.fn();
		const html = render(CharacterLevelUpModal, {
			props: { locale: 'pt-BR', level: 4, onChoose }
		}).body;

		expect(html).toContain('Subida para o nível 4');
		expect(html).toContain('Usar valor máximo');
		expect(html).toContain('Rolar dados de vida');
		expect(html).toContain('Manter PV atuais');
	});
});
