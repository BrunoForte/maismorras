import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'line' : 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
		storageState: process.env.E2E_STORAGE_STATE || undefined,
		trace: 'on-first-retry'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: 'npm run dev -- --host 127.0.0.1 --port 4173',
				url: 'http://127.0.0.1:4173',
				reuseExistingServer: !process.env.CI,
				timeout: 120_000
			}
});
