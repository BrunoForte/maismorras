import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'migrations');
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql'));
const groups = new Map();

for (const file of files) {
	const match = /^(\d+)_/.exec(file);
	if (!match) throw new Error(`Migration without numeric prefix: ${file}`);
	const prefix = match[1];
	groups.set(prefix, [...(groups.get(prefix) ?? []), file]);
}

// These duplicates predate this check and are already part of the deployed
// Supabase history. They must remain immutable; new migrations cannot reuse
// either prefix or introduce another duplicate.
const historicalDuplicates = new Set(['0018', '0019']);
const duplicates = [...groups.entries()].filter(([, names]) => names.length > 1);
const unexpected = duplicates.filter(([prefix]) => !historicalDuplicates.has(prefix));

if (unexpected.length) {
	for (const [prefix, names] of unexpected) console.error(`${prefix}: ${names.join(', ')}`);
	throw new Error('Duplicate migration prefixes detected. Use a unique timestamp/sequence.');
}

console.log(`Migration prefixes valid (${files.length} files; historical duplicates allowed: 0018, 0019).`);
