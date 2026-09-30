<!-- eslint-disable svelte/no-navigation-without-resolve -- overlay intentionally opens in a separate tab. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import CampaignWorkspace from '$lib/components/CampaignWorkspace.svelte';
	import { getSupabaseClient, supabaseConfigured } from '$lib/services/supabase';
	import { appLocale, restoreAppLocale } from '$lib/stores/locale';

	let session = $state<Session | null>(null);
	let loading = $state(true);
	let error = $state('');
	let localE2EEmail = $state('');
	let localE2EPassword = $state('');
	const localE2EAuthEnabled = import.meta.env.DEV && import.meta.env.PUBLIC_E2E_AUTH === 'true';
	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};
	let installPrompt = $state<InstallPromptEvent | null>(null);
	const sessionTimeoutMs = 10000;

	onMount(() => {
		let disposed = false;
		let unsubscribeAuth: (() => void) | undefined;
		restoreAppLocale();
		const rememberInstallPrompt = (event: Event) => {
			event.preventDefault();
			installPrompt = event as InstallPromptEvent;
		};
		const clearInstallPrompt = () => (installPrompt = null);
		window.addEventListener('beforeinstallprompt', rememberInstallPrompt);
		window.addEventListener('appinstalled', clearInstallPrompt);
		void (async () => {
			if (!supabaseConfigured) {
				error =
					$appLocale === 'en'
						? 'Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY in the .env file.'
						: 'Configure PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_PUBLISHABLE_KEY no arquivo .env.';
				loading = false;
				return;
			}
			try {
				const client = await getSupabaseClient();
				if (!client || disposed) return;
				const { data } = await Promise.race([
					client.auth.getSession(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error('A autenticação demorou demais para responder.')),
							sessionTimeoutMs
						)
					)
				]);
				session = data.session;
				let lastSessionKey = data.session
					? `${data.session.user.id}:${data.session.access_token}`
					: '';
				if (disposed) return;
				const { data: authState } = client.auth.onAuthStateChange((_event, nextSession) => {
					const nextKey = nextSession ? `${nextSession.user.id}:${nextSession.access_token}` : '';
					if (nextKey === lastSessionKey) return;
					lastSessionKey = nextKey;
					session = nextSession;
					error = '';
				});
				unsubscribeAuth = () => authState.subscription.unsubscribe();
			} catch (cause) {
				error = cause instanceof Error ? cause.message : 'Não foi possível restaurar sua sessão.';
			} finally {
				if (!disposed) loading = false;
			}
		})();
		return () => {
			disposed = true;
			unsubscribeAuth?.();
			window.removeEventListener('beforeinstallprompt', rememberInstallPrompt);
			window.removeEventListener('appinstalled', clearInstallPrompt);
		};
	});

	async function login() {
		const supabase = await getSupabaseClient();
		if (!supabase) return;
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`
			}
		});
		if (authError) error = authError.message;
	}
	async function loginLocalE2E() {
		const supabase = await getSupabaseClient();
		if (!supabase || !localE2EAuthEnabled) return;
		error = '';
		const { error: authError } = await supabase.auth.signInWithPassword({
			email: localE2EEmail,
			password: localE2EPassword
		});
		if (authError) error = 'Não foi possível autenticar a conta local de teste.';
	}
	async function logout() {
		await (await getSupabaseClient())?.auth.signOut();
	}
	async function installApp() {
		if (!installPrompt) return;
		await installPrompt.prompt();
		if ((await installPrompt.userChoice).outcome === 'accepted') installPrompt = null;
	}
</script>

<svelte:head>
	<title>MaisMorras</title>
	<meta name="description" content="Mesa virtual para campanhas de RPG." />
</svelte:head>

{#if loading}
	<main class="loading-screen" aria-live="polite">
		<div class="brand-mark">M</div>
		<p>{$appLocale === 'en' ? 'Preparing the portals…' : 'Preparando os portais…'}</p>
	</main>
{:else if !session}
	<main class="auth-shell">
		<section class="auth-intro">
			<div class="brand-lockup">
				<div class="brand-mark" aria-hidden="true">M</div>
				<span>MaisMorras</span>
			</div>
			<p class="eyebrow">
				{$appLocale === 'en' ? 'YOUR WORLD. YOUR TABLE.' : 'SEU MUNDO. SUA MESA.'}
			</p>
			<h1>{$appLocale === 'en' ? 'Where stories\ncome alive.' : 'Onde histórias\nganham vida.'}</h1>
			<p class="auth-copy">
				{$appLocale === 'en'
					? 'A fast virtual tabletop made for adventures your players will never forget.'
					: 'Uma mesa virtual rápida, feita para aventuras que seus jogadores não vão esquecer.'}
			</p>
			<div
				class="feature-list"
				aria-label={$appLocale === 'en' ? 'Platform features' : 'Recursos da plataforma'}
			>
				<span>⌘ {$appLocale === 'en' ? 'Real-time table' : 'Mesa em tempo real'}</span>
				<span>✦ {$appLocale === 'en' ? 'Persistent campaigns' : 'Campanhas persistentes'}</span>
				<span>◈ {$appLocale === 'en' ? 'Game-master tools' : 'Ferramentas para narrar'}</span>
			</div>
		</section>

		<section class="auth-card">
			<p class="eyebrow">{$appLocale === 'en' ? 'WELCOME' : 'BEM-VINDO'}</p>
			<h2>{$appLocale === 'en' ? 'Enter the adventure' : 'Entre na aventura'}</h2>
			<p>
				{$appLocale === 'en'
					? 'Use your Google account to access your tables and continue where you left off.'
					: 'Use sua conta Google para acessar suas mesas e continuar de onde parou.'}
			</p>
			{#if error}<p class="error">{error}</p>{/if}
			<button class="google-button" onclick={login} disabled={!supabaseConfigured}>
				<span class="google-g" aria-hidden="true">G</span>
				{$appLocale === 'en' ? 'Continue with Google' : 'Continuar com Google'}
			</button>
			{#if localE2EAuthEnabled}
				<form
					class="local-e2e-login"
					onsubmit={(event) => {
						event.preventDefault();
						void loginLocalE2E();
					}}
				>
					<label for="local-e2e-email">E-mail de teste</label>
					<input
						id="local-e2e-email"
						type="email"
						autocomplete="username"
						bind:value={localE2EEmail}
						required
					/>
					<label for="local-e2e-password">Senha de teste</label>
					<input
						id="local-e2e-password"
						type="password"
						autocomplete="current-password"
						bind:value={localE2EPassword}
						required
					/>
					<button type="submit" class="secondary-button" disabled={!supabaseConfigured}
						>Entrar no ambiente local</button
					>
				</form>
			{/if}
			<p class="auth-note">
				{$appLocale === 'en'
					? 'By signing in, you agree to play respectfully at your table.'
					: 'Ao entrar, você concorda em jogar com respeito à sua mesa.'}
			</p>
		</section>
	</main>{:else}
	{#key session?.user.id ?? 'anonymous'}{#if session}<CampaignWorkspace
				{session}
				{installPrompt}
				onlogout={logout}
				oninstall={installApp}
			/>{/if}{/key}
{/if}

<style>
	:global(body) {
		margin: 0;
		min-width: 320px;
		color: var(--mm-text, #f4eee4);
		background: var(--mm-bg, #100e11);
	}
	.loading-screen,
	.auth-shell {
		min-height: 100vh;
		background:
			radial-gradient(circle at 15% 15%, rgba(133, 78, 43, 0.33), transparent 32%),
			radial-gradient(circle at 85% 80%, rgba(81, 34, 68, 0.35), transparent 35%), #100e11;
	}
	.loading-screen {
		display: grid;
		place-content: center;
		gap: 1rem;
		text-align: center;
		color: #b7aa9b;
	}
	.brand-mark {
		display: inline-grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid #d8ad67;
		color: #f6d89c;
		background: linear-gradient(135deg, #342216, #171116);
		clip-path: polygon(50% 0, 94% 24%, 94% 76%, 50% 100%, 6% 76%, 6% 24%);
		font-family: Georgia, serif;
		font-weight: 700;
	}
	.auth-shell {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(390px, 0.9fr);
		align-items: center;
		gap: clamp(3rem, 10vw, 11rem);
		padding: clamp(2rem, 8vw, 8rem);
		overflow: hidden;
	}
	.auth-intro {
		max-width: 660px;
	}
	.brand-lockup {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #f7eedf;
		font:
			700 1.2rem Georgia,
			serif;
		letter-spacing: 0.03em;
	}
	.eyebrow {
		margin: 2.8rem 0 0.75rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.18em;
	}
	h1,
	h2,
	p {
		margin-top: 0;
	}
	.auth-intro h1 {
		margin-bottom: 1.25rem;
		font:
			500 clamp(3rem, 6vw, 5.75rem)/0.95 Georgia,
			'Times New Roman',
			serif;
		letter-spacing: -0.045em;
	}
	.auth-copy {
		max-width: 510px;
		color: #c5b8aa;
		font-size: 1.12rem;
		line-height: 1.7;
	}
	.feature-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin-top: 2rem;
		color: #a99d91;
		font-size: 0.86rem;
	}
	.feature-list span {
		white-space: nowrap;
	}
	.auth-card {
		max-width: 440px;
		padding: clamp(2rem, 4vw, 3.25rem);
		border: 1px solid rgba(216, 173, 103, 0.25);
		border-radius: 20px;
		background: linear-gradient(145deg, rgba(46, 37, 36, 0.9), rgba(25, 20, 23, 0.94));
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.38);
	}
	.auth-card .eyebrow {
		margin-top: 0;
	}
	.auth-card h2 {
		font:
			500 2rem Georgia,
			serif;
	}
	.auth-card > p:not(.eyebrow):not(.error):not(.auth-note) {
		color: #bcae9f;
		line-height: 1.6;
	}
	.google-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 100%;
		border: 0;
		border-radius: 9px;
		padding: 0.85rem 1rem;
		color: #20160e;
		background: #ecd09a;
		font-weight: 750;
		transition:
			transform 0.18s,
			background 0.18s;
	}
	.google-button:hover {
		background: #f5dbab;
		transform: translateY(-1px);
	}
	.google-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.google-g {
		display: grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		color: white;
		background: #4285f4;
		font-weight: 800;
		font-size: 0.78rem;
	}
	.auth-note {
		margin: 1.25rem 0 0;
		color: #81766e;
		font-size: 0.73rem;
		text-align: center;
	}
	.local-e2e-login {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(216, 173, 103, 0.2);
	}
	.local-e2e-login label {
		color: #bcae9f;
		font-size: 0.82rem;
	}
	.local-e2e-login input {
		min-width: 0;
		border: 1px solid rgba(216, 173, 103, 0.25);
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		color: #f2e8d8;
		background: rgba(15, 13, 15, 0.72);
	}
	.error {
		margin: 1rem 0;
		padding: 0.8rem;
		border: 1px solid #944a4a;
		border-radius: 8px;
		color: #ffb2aa;
		background: rgba(123, 36, 32, 0.2);
		font-size: 0.88rem;
	}
</style>
