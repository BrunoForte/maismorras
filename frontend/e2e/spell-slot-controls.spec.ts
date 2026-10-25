import { expect, test } from '@playwright/test';

test('narrator adjusts available spell slots one at a time within the derived maximum', async ({
	page
}) => {
	await page.goto('/');
	await page.evaluate(() => document.body.replaceChildren());
	await page.addScriptTag({ type: 'module', url: '/src/lib/e2e/spellSlotControlsHarness.ts' });

	const narrator = page.getByTestId('narrator-slot-controls');
	const player = page.getByTestId('player-slot-controls');
	const group = narrator.getByRole('group', { name: 'Ajustar espaços disponíveis do círculo 1' });
	await expect(group).toBeVisible();
	const decrease = group.getByRole('button', { name: 'Diminuir espaços disponíveis do círculo 1' });
	const increase = group.getByRole('button', { name: 'Aumentar espaços disponíveis do círculo 1' });

	await expect(narrator).toContainText('1 / 2 disponíveis / máximo');
	await increase.click();
	await expect(narrator).toContainText('2 / 2 disponíveis / máximo');
	await expect(increase).toBeDisabled();

	await decrease.click();
	await expect(narrator).toContainText('1 / 2 disponíveis / máximo');
	await decrease.click();
	await expect(narrator).toContainText('0 / 2 disponíveis / máximo');
	await expect(decrease).toBeDisabled();

	await page.getByTestId('save-reopen-slots').click();
	await expect(narrator).toContainText('0 / 2 disponíveis / máximo');
	await expect(page.getByTestId('saved-slots')).toHaveText('[{"level":1,"current":0,"max":2}]');
	await expect(player.getByRole('group')).toHaveCount(0);
	await expect(
		player.getByRole('button', { name: /slots disponíveis|espaços disponíveis/i })
	).toHaveCount(0);
});
