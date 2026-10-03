import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import TableTools from './TableTools.svelte';

describe('TableTools map menu actions', () => {
	it('places the signal action after the six accessible menu triggers', () => {
		const { body } = render(TableTools, {
			props: {
				campaignId: 'campaign-test',
				sceneId: 'scene-test',
				session: {} as Session,
				isGM: true
			}
		});
		const menuNames = [
			'Régua',
			'Iniciativa',
			'Dados',
			'Camadas do mapa',
			'Área persistente',
			'Barreiras'
		];
		const positions = menuNames.map((name) => body.indexOf(`aria-label="${name}"`));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((left, right) => left - right));
		const signalPosition = body.indexOf('data-testid="map-signal-button"');
		expect(signalPosition).toBeGreaterThan(positions.at(-1)!);
		expect(body).toContain('aria-pressed="false"');
		expect(body).toContain('Sinalizar');
	});

	it('does not render GM-only map menus to a player while retaining the permitted signal action', () => {
		const { body } = render(TableTools, {
			props: {
				campaignId: 'campaign-test',
				sceneId: 'scene-test',
				session: {} as Session,
				isGM: false
			}
		});
		expect(body).not.toContain('Camadas do mapa');
		expect(body).not.toContain('Barreiras');
		expect(body).toContain('data-testid="map-signal-button"');
	});
});
