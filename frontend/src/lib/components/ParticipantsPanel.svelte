<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { listParticipants, type Participant } from '$lib/services/characterApi';
	import { createTokenFromCharacter } from '$lib/services/sceneApi';
	import { appLocale } from '$lib/stores/locale';

	let {
		campaignId,
		sceneId,
		session,
		onclose,
		ontokencreated
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		onclose: () => void;
		ontokencreated: () => void;
	} = $props();
	let participants = $state<Participant[]>([]);
	let loading = $state(true);
	let message = $state('');
	let creatingActorId = $state<string | null>(null);
	onMount(async () => {
		try {
			participants = (await listParticipants(session, campaignId)).participants;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível carregar participantes.';
		} finally {
			loading = false;
		}
	});
	async function placeCharacter(participant: Participant) {
		if (!participant.character) return;
		creatingActorId = participant.character.id;
		message = '';
		try {
			await createTokenFromCharacter(session, sceneId, participant.character.id);
			message = `${participant.character.sheet.name} foi adicionado à cena.`;
			ontokencreated();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível criar o token.';
		} finally {
			creatingActorId = null;
		}
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.currentTarget === event.target) onclose();
	}}
>
	<section class="panel" aria-label={$appLocale === 'en' ? 'Campaign participants' : 'Participantes da campanha'}>
		<header>
			<div>
				<p>{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}</p>
				<h2>{$appLocale === 'en' ? 'Participants' : 'Participantes'}</h2>
			</div>
			<button onclick={onclose} aria-label={$appLocale === 'en' ? 'Close' : 'Fechar'}>×</button>
		</header>
		<div class="body">
			{#if loading}<p>{$appLocale === 'en' ? 'Consulting adventurers…' : 'Consultando aventureiros…'}</p>{:else if participants.length === 0}<p>
					{$appLocale === 'en' ? 'No participants yet.' : 'Nenhum participante ainda.'}
				</p>{:else}{#each participants as participant (participant.userId)}<article>
						<div class="avatar">{participant.displayName.slice(0, 1).toUpperCase()}</div>
						<div class="details">
							<strong>{participant.displayName}</strong><small
								>{participant.role === 'gm' ? 'Narrador' : 'Jogador'}</small
							>{#if participant.character}<span
									>{participant.character.sheet.name} · {participant.character.sheet.class ||
										'Sem classe'} nível {participant.character.sheet.level}</span
								>{:else}<span class="muted">Ainda não criou uma ficha.</span>{/if}
						</div>
						{#if participant.character}<button
								class="place"
								onclick={() => placeCharacter(participant)}
								disabled={creatingActorId === participant.character.id}
								>{creatingActorId === participant.character.id
									? 'Adicionando…'
									: 'Criar token'}</button
							>{/if}
					</article>{/each}{/if}
		</div>
		{#if message}<footer>{message}</footer>{/if}
	</section>
</div>

<style>
	.backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 6, 8, 0.72);
		backdrop-filter: blur(5px);
	}
	.panel {
		width: min(100%, 620px);
		border: 1px solid #765d3d;
		border-radius: 14px;
		overflow: hidden;
		color: #eee4d7;
		background: #1b171a;
		box-shadow: 0 30px 90px #000;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	header p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	h2 {
		margin: 0;
		font:
			600 1.35rem Georgia,
			serif;
	}
	header button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font-size: 1.4rem;
	}
	.body {
		display: grid;
		gap: 0.55rem;
		padding: 1rem;
		max-height: 60vh;
		overflow: auto;
	}
	.body > p {
		color: #ad9e90;
		text-align: center;
	}
	article {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		padding: 0.75rem;
		background: rgba(47, 36, 37, 0.7);
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border: 1px solid #806039;
		border-radius: 50%;
		color: #f0cb85;
		background: #2b211e;
		font:
			700 1rem Georgia,
			serif;
	}
	.details {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.details strong {
		font:
			600 0.98rem Georgia,
			serif;
	}
	small,
	.details span {
		color: #b6a89b;
		font-size: 0.72rem;
	}
	.details .muted {
		color: #83786f;
		font-style: italic;
	}
	.place {
		margin-left: auto;
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.5rem 0.65rem;
		color: #26190e;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.place:disabled {
		opacity: 0.6;
	}
	footer {
		border-top: 1px solid #403536;
		padding: 0.7rem 1rem;
		color: #f0d8aa;
		font-size: 0.8rem;
	}
</style>
