<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Session } from '@supabase/supabase-js';
	import { getSupabaseClient, supabaseConfigured } from '$lib/services/supabase';
	import { getCharacterForGM, getMyCharacter } from '$lib/services/characterApi';
	import { listCampaigns } from '$lib/services/campaignApi';
	import { listScenes } from '$lib/services/sceneApi';
	import { appLocale, restoreAppLocale } from '$lib/stores/locale';
	import { resolveStandaloneSheetAccess } from '$lib/utils/standaloneSheetAccess';

	type SheetComponentType = typeof import('$lib/components/CharacterSheet.svelte').default;
	let SheetComponent = $state<SheetComponentType | null>(null);
	let session = $state<Session | null>(null);
	let access = $state<Awaited<ReturnType<typeof resolveStandaloneSheetAccess>> | null>(null);
	let loading = $state(true);
	let message = $state('');
	let requestGeneration = 0;
	const campaignId =
		new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get(
			'campaign'
		) ?? '';
	const characterId =
		new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get(
			'character'
		) ?? '';

	async function authorize(currentSession: Session) {
		const generation = ++requestGeneration;
		session = currentSession;
		loading = true;
		message = '';
		access = null;
		try {
			const next = await resolveStandaloneSheetAccess(currentSession, campaignId, characterId, {
				listCampaigns,
				listScenes,
				getMyCharacter,
				getCharacterForGM
			});
			if (generation !== requestGeneration) return;
			access = next;
			SheetComponent ??= (await import('$lib/components/CharacterSheet.svelte')).default;
		} catch {
			if (generation === requestGeneration)
				message =
					$appLocale === 'en'
						? 'This character sheet is unavailable or you do not have permission to open it.'
						: 'Esta ficha não está disponível ou você não tem permissão para abri-la.';
		} finally {
			if (generation === requestGeneration) loading = false;
		}
	}

	onMount(() => {
		let disposed = false;
		let hadSession = false;
		let unsubscribe: (() => void) | undefined;
		restoreAppLocale();
		void (async () => {
			if (!supabaseConfigured) {
				message =
					$appLocale === 'en'
						? 'Authentication is not configured for this application.'
						: 'A autenticação não está configurada nesta aplicação.';
				loading = false;
				return;
			}
			try {
				const client = await getSupabaseClient();
				if (!client || disposed) {
					if (!disposed) {
						message =
							$appLocale === 'en'
								? 'Authentication could not be initialized. Please reload this page.'
								: 'Não foi possível iniciar a autenticação. Recarregue esta página.';
						loading = false;
					}
					return;
				}
				const { data } = await client.auth.getSession();
				if (data.session) {
					hadSession = true;
					void authorize(data.session);
				} else {
					message =
						$appLocale === 'en'
							? 'Sign in to MaisMorras in this browser, then reopen this sheet.'
							: 'Entre no MaisMorras neste navegador e abra esta ficha novamente.';
					loading = false;
				}
				const { data: authState } = client.auth.onAuthStateChange((_event, nextSession) => {
					if (
						nextSession &&
						session?.user.id === nextSession.user.id &&
						session.access_token === nextSession.access_token &&
						(access || loading)
					) {
						session = nextSession;
						return;
					}
					requestGeneration += 1;
					access = null;
					if (nextSession) {
						hadSession = true;
						void authorize(nextSession);
					} else {
						session = null;
						loading = false;
						message = hadSession
							? $appLocale === 'en'
								? 'Your session ended. Sign in again to continue.'
								: 'Sua sessão terminou. Entre novamente para continuar.'
							: $appLocale === 'en'
								? 'Sign in to MaisMorras in this browser, then reopen this sheet.'
								: 'Entre no MaisMorras neste navegador e abra esta ficha novamente.';
					}
				});
				unsubscribe = () => authState.subscription.unsubscribe();
			} catch {
				if (!disposed) {
					message =
						$appLocale === 'en'
							? 'Authentication could not be initialized. Please reload this page.'
							: 'Não foi possível iniciar a autenticação. Recarregue esta página.';
					loading = false;
				}
			}
		})();
		return () => {
			disposed = true;
			requestGeneration += 1;
			unsubscribe?.();
		};
	});

	function closeSheet() {
		if (window.opener) window.close();
		else void goto(resolve('/'));
	}
</script>

<svelte:head>
	<title
		>{access
			? `${$appLocale === 'en' ? 'Character sheet' : 'Ficha'} · ${access.campaign.name}`
			: 'MaisMorras · Ficha'}</title
	>
	<meta name="description" content="Ficha de personagem do MaisMorras." />
</svelte:head>

{#if loading}
	<main class="sheet-status" aria-live="polite">
		{$appLocale === 'en' ? 'Checking access…' : 'Verificando acesso…'}
	</main>
{:else if access && session && SheetComponent}
	<SheetComponent
		campaignId={access.campaign.id}
		sceneId={access.scene?.id ?? ''}
		{session}
		isGM={access.isGM}
		characterId={access.characterId}
		docked={false}
		standalone={true}
		onclose={closeSheet}
		onTokenCreated={() => {}}
	/>
{:else}
	<main class="sheet-status" role="alert">
		<p>
			{message ||
				($appLocale === 'en'
					? 'The requested sheet could not be opened.'
					: 'Não foi possível abrir a ficha solicitada.')}
		</p>
		<div>
			{#if !session}<a href={resolve('/')}
					>{$appLocale === 'en' ? 'Go to sign in' : 'Ir para o login'}</a
				>{/if}
			<button onclick={closeSheet}>{$appLocale === 'en' ? 'Close' : 'Fechar'}</button>
		</div>
	</main>
{/if}

<style>
	.sheet-status {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1rem;
		padding: 1.5rem;
		color: #eee4d6;
		background: #100d10;
		text-align: center;
	}
	.sheet-status div {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem;
	}
	.sheet-status a,
	.sheet-status button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.65rem 0.9rem;
		color: #f0d29d;
		background: #211b1e;
	}
</style>
