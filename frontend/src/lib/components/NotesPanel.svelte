<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { appLocale } from '$lib/stores/locale';
	import { apiBase } from '$lib/services/apiBase';
	type Note = { id: string; title: string; body: string; visibility: 'gm' | 'players' };
	let {
		campaignId,
		session,
		isGM,
		onclose
	}: { campaignId: string; session: Session; isGM: boolean; onclose: () => void } = $props();
	let notes = $state<Note[]>([]);
	let title = $state('');
	let body = $state('');
	let visibility = $state<'gm' | 'players'>('gm');
	let message = $state('');
	let loading = $state(true);
	const base = apiBase;
	async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
		const r = await fetch(base + path, {
			...init,
			headers: {
				Authorization: `Bearer ${session.access_token}`,
				'Content-Type': 'application/json',
				...init.headers
			}
		});
		const data = await r.json();
		if (!r.ok) throw new Error(data.error?.message ?? 'Erro ao carregar notas.');
		return data;
	}
	onMount(async () => {
		try {
			notes = (await api<{ notes: Note[] }>(`/api/v1/campaigns/${campaignId}/notes`)).notes;
		} catch (e) {
			message = e instanceof Error ? e.message : 'Erro ao carregar notas.';
		} finally {
			loading = false;
		}
	});
	async function create() {
		if (!title.trim()) return;
		try {
			const note = await api<Note>(`/api/v1/campaigns/${campaignId}/notes`, {
				method: 'POST',
				body: JSON.stringify({ title, body, visibility })
			});
			notes = [note, ...notes];
			title = '';
			body = '';
			message = 'Nota registrada.';
		} catch (e) {
			message = e instanceof Error ? e.message : 'Erro ao salvar.';
		}
	}
</script>

<div
	class="back"
	role="presentation"
	onclick={(e) => {
		if (e.currentTarget === e.target) onclose();
	}}
>
	<section>
		<header>
			<div>
				<p>{$appLocale === 'en' ? 'CAMPAIGN ARCHIVE' : 'ARQUIVO DA CAMPANHA'}</p>
				<h2>{$appLocale === 'en' ? 'Notes' : 'Notas'}</h2>
			</div>
			<button onclick={onclose}>×</button>
		</header>
		{#if isGM}<form
				onsubmit={(e) => {
					e.preventDefault();
					void create();
				}}
			>
				<input
					bind:value={title}
					maxlength="120"
					placeholder={$appLocale === 'en' ? 'Note title' : 'Título da nota'}
				/><textarea
					bind:value={body}
					placeholder={$appLocale === 'en'
						? 'Clues, NPCs, preparation…'
						: 'Pistas, NPCs, preparação…'}></textarea>
				<div>
					<select bind:value={visibility}
						><option value="gm"
							>{$appLocale === 'en' ? 'Game Master only' : 'Somente narrador'}</option
						><option value="players"
							>{$appLocale === 'en' ? 'Visible to players' : 'Visível aos jogadores'}</option
						></select
					><button>{$appLocale === 'en' ? 'Save note' : 'Salvar nota'}</button>
				</div>
			</form>{/if}
		<main>
			{#if loading}<p>
					{$appLocale === 'en' ? 'Loading…' : 'Carregando…'}
				</p>{:else if notes.length === 0}<p>
					{$appLocale === 'en' ? 'No notes available.' : 'Nenhuma nota disponível.'}
				</p>{:else}{#each notes as note (note.id)}<article>
						<small>{note.visibility === 'gm' ? 'Privada' : 'Compartilhada'}</small>
						<h3>{note.title}</h3>
						<p>{note.body}</p>
					</article>{/each}{/if}
		</main>
		{#if message}<footer>{message}</footer>{/if}
	</section>
</div>

<style>
	.back {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #080608bb;
		backdrop-filter: blur(5px);
	}
	section {
		width: min(100%, 650px);
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 14px;
		color: #eee4d7;
		background: #1b171a;
		box-shadow: 0 30px 90px #000;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.2rem;
		border-bottom: 1px solid #403536;
	}
	header p {
		margin: 0;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	h2,
	h3 {
		margin: 0;
		font-family: Georgia, serif;
	}
	header button {
		border: 0;
		background: transparent;
		color: #d9c7b5;
		font-size: 1.4rem;
	}
	form {
		display: grid;
		gap: 0.55rem;
		padding: 1rem;
		border-bottom: 1px solid #403536;
	}
	input,
	textarea,
	select {
		border: 1px solid #5a4841;
		border-radius: 7px;
		padding: 0.55rem;
		color: #eee4d7;
		background: #121012;
		font: inherit;
	}
	textarea {
		min-height: 80px;
		resize: vertical;
	}
	form div {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
	}
	form button {
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.5rem 0.75rem;
		color: #26190e;
		background: #e0b86f;
		font-weight: 800;
	}
	main {
		display: grid;
		gap: 0.6rem;
		overflow: auto;
		padding: 1rem;
	}
	main > p {
		color: #a99c91;
		text-align: center;
	}
	article {
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.75rem;
		background: #2b2224;
	}
	article small {
		color: #d8ad67;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	article h3 {
		margin: 0.25rem 0;
		color: #f0dfc5;
		font-size: 1rem;
	}
	article p {
		margin: 0;
		white-space: pre-wrap;
		color: #c8bbae;
		line-height: 1.45;
		font-size: 0.86rem;
	}
	footer {
		border-top: 1px solid #403536;
		border-bottom: 0;
		color: #f0d8aa;
		font-size: 0.8rem;
	}
</style>
