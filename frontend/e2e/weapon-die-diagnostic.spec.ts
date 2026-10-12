import { expect, test } from '@playwright/test';

test('weapon damage builder sends numeric dice, validates formulas, and round-trips base and alternate profiles', async ({
	page
}) => {
	await page.goto('/');
	await page.evaluate(() => document.body.replaceChildren());
	await page.addScriptTag({ type: 'module', url: '/src/lib/e2e/weaponDamageHarness.ts' });
	await expect(page.getByTestId('hydrated')).toHaveText('true');
	for (const profile of ['base', 'alternate'] as const) {
		const section = page.locator(`[data-profile="${profile}"]`);
		const emptyState = section.getByTestId('no-damage-dice');
		await expect(emptyState).toBeVisible();
		await expect(emptyState.getByRole('spinbutton')).toBeDisabled();
		const emptyReport = JSON.parse(
			(await section.getByTestId(`${profile}-report`).textContent()) ?? 'null'
		);
		expect(emptyReport).toMatchObject({ components: [], formula: '', validation: null });
	}
	await page.getByTestId('save-reload').click();
	await expect(page.getByTestId('base-formula')).toHaveText('Fórmula: ');
	await expect(page.getByTestId('alternate-formula')).toHaveText('Fórmula: ');
	expect(JSON.parse((await page.getByTestId('saved').textContent()) ?? 'null')).toEqual({
		base: '',
		alternate: ''
	});
	const dieSides = [4, 6, 8, 10, 12, 20, 100];
	for (const profile of ['base', 'alternate'] as const) {
		const section = page.locator(`[data-profile="${profile}"]`);
		const picker = section.locator('.die-type-picker');
		await section.getByRole('button', { name: '+ dado' }).click();
		for (const sides of dieSides) {
			await picker.locator('summary').click();
			await expect(picker).toHaveAttribute('open', '');
			await picker.getByRole('button', { name: `d${sides}`, exact: true }).click();
			await expect(section.getByTestId(`${profile}-formula`)).toHaveText(`Fórmula: 1d${sides}`);
			await page.getByTestId('save-reload').click();
			await expect(section.getByTestId(`${profile}-formula`)).toHaveText(`Fórmula: 1d${sides}`);
			const report = JSON.parse(
				(await section.getByTestId(`${profile}-report`).textContent()) ?? 'null'
			) as {
				profile: string;
				components: Array<{
					count: number | '';
					countType: string;
					sides: number | '';
					sidesType: string;
				}>;
				formula: string;
				validation: unknown;
			};
			expect(report).toEqual({
				profile,
				components: [{ count: 1, countType: 'number', sides, sidesType: 'number' }],
				formula: `1d${sides}`,
				validation: null
			});
		}
	}
	await page.getByTestId('save-reload').click();
	await expect(page.getByTestId('base-formula')).toHaveText('Fórmula: 1d100');
	await expect(page.getByTestId('alternate-formula')).toHaveText('Fórmula: 1d100');
	expect(JSON.parse((await page.getByTestId('saved').textContent()) ?? 'null')).toEqual({
		base: '1d100',
		alternate: '1d100'
	});
});
