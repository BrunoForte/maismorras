import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.E2E_SUPABASE_URL?.trim();
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY?.trim();
const baseURL = process.env.E2E_BASE_URL?.trim() || 'https://maismorras.vercel.app';

if (!supabaseUrl || !publishableKey) {
	throw new Error('Configure E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;
const accounts = [
	{
		role: 'narrator',
		email: process.env.E2E_GM_EMAIL?.trim(),
		password: process.env.E2E_GM_PASSWORD
	},
	{
		role: 'player',
		email: process.env.E2E_PLAYER_EMAIL?.trim(),
		password: process.env.E2E_PLAYER_PASSWORD
	}
];

for (const account of accounts) {
	if (!account.email || !account.password) {
		throw new Error(`Missing E2E ${account.role} account credentials.`);
	}
}

const userIds = new Set();
for (const account of accounts) {
	const client = createClient(supabaseUrl, publishableKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const { data, error } = await client.auth.signInWithPassword({
		email: account.email,
		password: account.password
	});
	if (error || !data.session || !data.user) {
		throw new Error(`Could not authenticate the dedicated E2E ${account.role} account.`);
	}
	userIds.add(data.user.id);
	const path =
		account.role === 'narrator' ? 'e2e-storage-state.json' : 'e2e-player-storage-state.json';
	const state = {
		cookies: [],
		origins: [
			{
				origin: new URL(baseURL).origin,
				localStorage: [{ name: storageKey, value: JSON.stringify(data.session) }]
			}
		]
	};
	await writeFile(path, JSON.stringify(state), { mode: 0o600 });
}

if (userIds.size !== accounts.length) {
	throw new Error('Narrator and player E2E credentials must belong to different Supabase users.');
}

console.log('Fresh authenticated E2E states generated for the dedicated narrator and player.');
