import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('weapon damage layout wiring', () => {
	it('uses the responsive damage builder in the weapon attack accordion', () => {
		const attacks = readFileSync(
			resolve(process.cwd(), 'src/lib/components/character/CharacterWeaponAttacks.svelte'),
			'utf8'
		);
		const builder = readFileSync(
			resolve(process.cwd(), 'src/lib/components/character/WeaponDamageBuilder.svelte'),
			'utf8'
		);
		expect(attacks).toContain("import WeaponDamageBuilder from './WeaponDamageBuilder.svelte'");
		expect(attacks).toContain('<WeaponDamageBuilder');
		expect(builder).toContain('flex-wrap: wrap');
		expect(builder).toContain('min-width: min(100%, 15rem)');
		expect(builder).toContain(
			'grid-template-columns: minmax(3.25rem, 1fr) minmax(3.25rem, 1fr) auto'
		);
	});
});
