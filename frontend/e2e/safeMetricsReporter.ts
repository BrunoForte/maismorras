import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

type SafeTestTiming = {
	test: string;
	status: string;
	retry: number;
	durationMs: number;
	steps: Array<{
		name: string;
		durationMs: number;
		depth: number;
		failed: boolean;
		failureType: 'TimeoutError' | 'Error' | null;
	}>;
};

function safeLabel(value: string) {
	return value
		.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email]')
		.replace(/\bLocal-[A-Za-z0-9_-]{20,}-9!/g, '[test password]')
		.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
		.replace(/https?:\/\/\S+/gi, '[url]')
		.replace(/[^\p{L}\p{N} .,:;()_/-]/gu, '')
		.slice(0, 180);
}

function collectSteps(steps: TestResult['steps'], depth = 0): SafeTestTiming['steps'] {
	return steps.flatMap((step) => {
		const children = collectSteps(step.steps, depth + (step.category === 'test.step' ? 1 : 0));
		if (step.category !== 'test.step') return children;
		return [
			{
				name: safeLabel(step.title),
				durationMs: Math.max(0, Math.round(step.duration)),
				depth,
				failed: Boolean(step.error),
				failureType: step.error
					? step.error.name === 'TimeoutError'
						? 'TimeoutError'
						: 'Error'
					: null
			},
			...children
		];
	});
}

/** Emits allow-listed test timing metadata only; never serializes errors or attachments. */
export default class SafeMetricsReporter implements Reporter {
	private readonly outputFile: string;

	constructor(options: { outputFile?: string } = {}) {
		this.outputFile = options.outputFile ?? process.env.E2E_TIMINGS_FILE ?? '';
	}

	onBegin() {
		if (!this.outputFile) return;
		mkdirSync(dirname(this.outputFile), { recursive: true });
		writeFileSync(this.outputFile, '', 'utf8');
	}

	onTestEnd(test: TestCase, result: TestResult) {
		const record: SafeTestTiming = {
			test: safeLabel(test.titlePath().join(' › ')),
			status: result.status,
			retry: result.retry,
			durationMs: Math.max(0, Math.round(result.duration)),
			steps: collectSteps(result.steps)
		};
		if (!this.outputFile) return;
		appendFileSync(this.outputFile, `${JSON.stringify(record)}\n`, 'utf8');
	}

	onEnd() {}
}
