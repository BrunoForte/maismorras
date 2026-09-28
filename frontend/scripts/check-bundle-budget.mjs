import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const frontendRoot = process.cwd();
const outputRoot = join(frontendRoot, '.svelte-kit', 'output', 'client');
const manifestPath = join(outputRoot, '.vite', 'manifest.json');
const generatedRoot = join(frontendRoot, '.svelte-kit', 'generated', 'client-optimized');
const budgets = {
	rootInitialBytes: 400_000,
	overlayInitialBytes: 700_000,
	optionalLazyBytes: 2_500_000
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const generatedApp = await readFile(join(generatedRoot, 'app.js'), 'utf8');
const routeNode = (route) => {
	const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const match = generatedApp.match(new RegExp(`"${escaped}"\\s*:\\s*\\[(\\d+)\\]`));
	if (!match) throw new Error(`Could not find generated client node for route ${route}.`);
	const source = `.svelte-kit/generated/client-optimized/nodes/${match[1]}.js`;
	const key = Object.keys(manifest).find((entry) => manifest[entry].src === source);
	if (!key) throw new Error(`Could not find manifest entry for route ${route} (${source}).`);
	return key;
};

const findEntry = (predicate, label) => {
	const key = Object.keys(manifest).find((entry) => predicate(entry, manifest[entry]));
	if (!key) throw new Error(`Could not find ${label} in the Vite manifest.`);
	return key;
};
const appEntry = findEntry(
	(_key, value) => value.src?.endsWith('/generated/client-optimized/app.js'),
	'SvelteKit app entry'
);
const startEntry = findEntry(
	(_key, value) => value.src?.includes('/runtime/client/entry.js'),
	'SvelteKit start entry'
);
const layoutEntry = findEntry(
	(_key, value) => value.src === '.svelte-kit/generated/client-optimized/nodes/0.js',
	'root layout'
);

async function measure(entries) {
	const seen = new Set();
	const visitStatic = (key) => {
		if (!manifest[key] || seen.has(key)) return;
		seen.add(key);
		for (const dependency of manifest[key].imports ?? []) visitStatic(dependency);
	};
	entries.forEach(visitStatic);
	const files = [...seen].map((key) => manifest[key].file).filter((file) => file?.endsWith('.js'));
	let bytes = 0;
	let gzipBytes = 0;
	for (const file of files) {
		const path = resolve(outputRoot, file);
		const contents = await readFile(path);
		bytes += contents.byteLength;
		gzipBytes += gzipSync(contents).byteLength;
	}
	return { bytes, gzipBytes, files: files.length, entries: seen };
}

async function collectOptionalLazy(initialEntries) {
	const initial = await measure(initialEntries);
	const optional = new Set();
	const visitOptional = (key) => {
		if (!manifest[key] || initial.entries.has(key) || optional.has(key)) return;
		optional.add(key);
		for (const dependency of manifest[key].imports ?? []) visitOptional(dependency);
		for (const dependency of manifest[key].dynamicImports ?? []) visitOptional(dependency);
	};
	for (const root of initial.entries) {
		for (const dynamicImport of manifest[root]?.dynamicImports ?? []) visitOptional(dynamicImport);
	}
	let bytes = 0;
	let gzipBytes = 0;
	for (const key of optional) {
		const file = manifest[key]?.file;
		if (!file?.endsWith('.js')) continue;
		const contents = await readFile(resolve(outputRoot, file));
		bytes += contents.byteLength;
		gzipBytes += gzipSync(contents).byteLength;
	}
	return { bytes, gzipBytes, chunks: optional.size };
}

const rootRoute = routeNode('/');
const overlayRoute = routeNode('/overlay');
const sharedEntries = [startEntry, appEntry, layoutEntry];
const rootInitial = await measure([...sharedEntries, rootRoute]);
const overlayInitial = await measure([...sharedEntries, overlayRoute]);
const rootOptionalLazy = await collectOptionalLazy([...sharedEntries, rootRoute]);
const overlayOptionalLazy = await collectOptionalLazy([...sharedEntries, overlayRoute]);
const report = {
	budgetsBytes: budgets,
	initialStatic: {
		'/': { bytes: rootInitial.bytes, gzipBytes: rootInitial.gzipBytes, files: rootInitial.files },
		'/overlay': {
			bytes: overlayInitial.bytes,
			gzipBytes: overlayInitial.gzipBytes,
			files: overlayInitial.files
		}
	},
	optionalLazy: {
		'/': {
			bytes: rootOptionalLazy.bytes,
			gzipBytes: rootOptionalLazy.gzipBytes,
			chunks: rootOptionalLazy.chunks
		},
		'/overlay': {
			bytes: overlayOptionalLazy.bytes,
			gzipBytes: overlayOptionalLazy.gzipBytes,
			chunks: overlayOptionalLazy.chunks
		}
	}
};
console.log(JSON.stringify(report, null, 2));

const exceeded = [];
if (rootInitial.bytes > budgets.rootInitialBytes)
	exceeded.push(`/ initial JS ${rootInitial.bytes} B exceeds ${budgets.rootInitialBytes} B`);
if (overlayInitial.bytes > budgets.overlayInitialBytes)
	exceeded.push(
		`/overlay initial JS ${overlayInitial.bytes} B exceeds ${budgets.overlayInitialBytes} B`
	);
if (rootOptionalLazy.bytes > budgets.optionalLazyBytes)
	exceeded.push(
		`optional lazy JS for / ${rootOptionalLazy.bytes} B exceeds ${budgets.optionalLazyBytes} B`
	);
if (overlayOptionalLazy.bytes > budgets.optionalLazyBytes)
	exceeded.push(
		`optional lazy JS for /overlay ${overlayOptionalLazy.bytes} B exceeds ${budgets.optionalLazyBytes} B`
	);
if (exceeded.length) {
	console.error(`Bundle budget exceeded: ${exceeded.join('; ')}`);
	process.exitCode = 1;
}
