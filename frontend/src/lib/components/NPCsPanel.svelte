<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createNPC, listNPCs, type NPC } from '$lib/services/npcApi';
	import { request } from '$lib/services/sceneApi';
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
	let npcs = $state<NPC[]>([]);
	let name = $state('');
	let hp = $state(10);
	let ca = $state(10);
	let loading = $state(true);
	let saving = $state(false);
	let placing = $state<string | null>(null);
	let message = $state('');
	onMount(async () => {
		try {
			npcs = (await listNPCs(session, campaignId)).npcs;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível carregar os NPCs.';
		} finally {
			loading = false;
		}
	});
	async function addNPC() {
		if (!name.trim() || saving) return;
		saving = true;
		message = '';
		try {
			const npc = await createNPC(session, campaignId, {
				name: name.trim(),
				sheet: {
					hitPointsCurrent: hp,
					hitPointsMax: hp,
					armorClass: ca,
					initiative: 0,
					size: 1,
					color: 3381504,
					imageUrl: '', creatureType: 'humanoide', challenge: '', speed: '9 m',
					abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
					traits: [], actions: [], resistances: [], immunities: [], senses: '', languages: ''
				}
			});
			npcs = [...npcs, npc];
			name = '';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível criar o NPC.';
		} finally {
			saving = false;
		}
	}
	async function placeNPC(npc: NPC) {
		placing = npc.id;
		message = '';
		try {
			await request(session, `/api/v1/scenes/${sceneId}/tokens/from-npc`, {
				method: 'POST',
				body: JSON.stringify({ actorId: npc.id })
			});
			await ontokencreated();
			message = `${npc.name} foi adicionado à cena.`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível adicionar o NPC.';
		} finally {
			placing = null;
		}
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(event) => event.currentTarget === event.target && onclose()}
>
	<section class="panel" aria-label={$appLocale === 'en' ? 'Campaign NPCs' : 'NPCs da campanha'}>
		<header>
			<div>
				<p>{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}</p>
				<h2>NPCs</h2>
			</div>
			<button onclick={onclose} aria-label="Fechar">×</button>
		</header>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void addNPC();
			}}
		>
			<input bind:value={name} placeholder={$appLocale === 'en' ? 'NPC name' : 'Nome do NPC'} maxlength="120" aria-label={$appLocale === 'en' ? 'NPC name' : 'Nome do NPC'} />
			<label>PV <input bind:value={hp} type="number" min="1" max="9999" /></label>
			<label>CA <input bind:value={ca} type="number" min="0" max="99" /></label>
			<button disabled={saving}>{saving ? ($appLocale === 'en' ? 'Creating…' : 'Criando…') : ($appLocale === 'en' ? 'Create NPC' : 'Criar NPC')}</button>
		</form>
		<div class="body">
			{#if loading}<p>{$appLocale === 'en' ? 'Consulting the bestiary…' : 'Consultando bestiário…'}</p>{:else if npcs.length === 0}<p>
					{$appLocale === 'en' ? 'No NPCs created yet.' : 'Nenhum NPC criado ainda.'}
				</p>{:else}{#each npcs as npc (npc.id)}<article>
						<div>
							<strong>{npc.name}</strong><small
								>PV {npc.sheet.hitPointsCurrent}/{npc.sheet.hitPointsMax} · CA {npc.sheet
									.armorClass}</small
							>
						</div>
						<button onclick={() => placeNPC(npc)} disabled={placing === npc.id}
							>{placing === npc.id ? 'Adicionando…' : 'Criar token'}</button
						>
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
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 14px;
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
	form {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
		gap: 0.55rem;
		padding: 1rem;
		border-bottom: 1px solid #403536;
	}
	input {
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 7px;
		padding: 0.55rem;
		color: #f6eee4;
		background: #151216;
	}
	label {
		display: grid;
		gap: 0.2rem;
		color: #b6a89b;
		font-size: 0.65rem;
	}
	label input {
		width: 4.3rem;
	}
	form button,
	article button {
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.5rem 0.65rem;
		color: #26190e;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 800;
	}
	button:disabled {
		opacity: 0.6;
	}
	.body {
		display: grid;
		gap: 0.55rem;
		max-height: 45vh;
		overflow: auto;
		padding: 1rem;
	}
	.body > p {
		color: #ad9e90;
		text-align: center;
	}
	article {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		padding: 0.75rem;
		background: rgba(47, 36, 37, 0.7);
	}
	article div {
		display: grid;
		gap: 0.18rem;
	}
	article strong {
		font:
			600 0.98rem Georgia,
			serif;
	}
	small {
		color: #b6a89b;
		font-size: 0.72rem;
	}
	footer {
		border-top: 1px solid #403536;
		padding: 0.7rem 1rem;
		color: #f0d8aa;
		font-size: 0.8rem;
	}
	@media (max-width: 560px) {
		form {
			grid-template-columns: 1fr 1fr;
		}
		form > input {
			grid-column: 1 / -1;
		}
		form button {
			grid-column: 1 / -1;
		}
	}
</style>
