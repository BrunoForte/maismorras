import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Configuration check that does not load the Supabase SDK into the initial route bundle. */
export const supabaseConfigured = Boolean(url && key);

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Load the SDK only when authentication, realtime auth, or Storage is actually used. */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
	if (!supabaseConfigured) return Promise.resolve(null);
	clientPromise ??= import('@supabase/supabase-js')
		.then(({ createClient }) => createClient(url!, key!))
		.catch((error: unknown) => {
			clientPromise = null;
			throw error;
		});
	return clientPromise;
}
