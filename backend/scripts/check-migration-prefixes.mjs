import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function validatePrefixes(migrationsDir, historicalDuplicates = new Set()) {
	await access(migrationsDir);
	const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql'));
	const groups = new Map();

	for (const file of files) {
		const match = /^(\d+)_/.exec(file);
		if (!match) throw new Error(`Migration without numeric prefix: ${file}`);
		const prefix = match[1];
		groups.set(prefix, [...(groups.get(prefix) ?? []), file]);
	}

	const duplicates = [...groups.entries()].filter(([, names]) => names.length > 1);
	const unexpected = duplicates.filter(([prefix]) => !historicalDuplicates.has(prefix));

	if (unexpected.length) {
		for (const [prefix, names] of unexpected) console.error(`${prefix}: ${names.join(', ')}`);
		throw new Error(`Duplicate migration prefixes detected in ${migrationsDir}.`);
	}
	return { count: files.length, historicalDuplicates: [...historicalDuplicates] };
}

// backend/migrations is a frozen audit archive whose duplicates are already
// deployed. New schema changes belong to supabase/migrations and must be unique.
const legacy = await validatePrefixes(resolve(process.cwd(), 'migrations'), new Set(['0018', '0019']));
const canonical = await validatePrefixes(resolve(process.cwd(), '../supabase/migrations'));
console.log(
	`Migration prefixes valid (Supabase: ${canonical.count} files; legacy archive: ${legacy.count} files, historical duplicates allowed: ${legacy.historicalDuplicates.join(', ')}).`
);
