import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.E2E_TIMINGS_FILE
		? [['line'], ['./e2e/safeMetricsReporter.ts', { outputFile: process.env.E2E_TIMINGS_FILE }]]
		: process.env.CI
			? 'line'
			: 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
		storageState: process.env.E2E_STORAGE_STATE || undefined,
		trace: 'on-first-retry'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }
	],
	webServer:
		process.env.E2E_BASE_URL || process.env.E2E_LOCAL_STACK === 'true'
			? undefined
			: {
					command: 'npm run dev -- --host 127.0.0.1 --port 4173',
					url: 'http://127.0.0.1:4173',
					reuseExistingServer: !process.env.CI,
					timeout: 120_000
				}
});
