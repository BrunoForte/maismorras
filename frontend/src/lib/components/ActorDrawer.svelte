<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { listParticipants, type Participant } from '$lib/services/characterApi';
	import { listNPCs, type NPC } from '$lib/services/npcApi';
	import { createTokenFromCharacter, loadScene, request } from '$lib/services/sceneApi';

	let {
		campaignId,
		sceneId,
		session,
		onadded = async () => {}
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		onadded?: () => void | Promise<void>;
	} = $props();

	type ActorRow = { id: string; name: string; kind: 'character' | 'npc'; detail: string };
	let open = $state(true);
	let actors = $state<ActorRow[]>([]);
	let linkedActorIds = $state(new Set<string>());
	let loading = $state(true);
	let adding = $state<string | null>(null);
	let message = $state('');

	async function load() {
		loading = true;
		try {
			const [participantResponse, npcResponse, sceneResponse] = await Promise.all([
				listParticipants(session, campaignId),
				listNPCs(session, campaignId),
				loadScene(session, sceneId)
			]);
			const characters = participantResponse.participants
				.filter((participant: Participant) => participant.character)
				.map((participant: Participant) => ({
					id: participant.character!.id,
					name: participant.character!.sheet.name || participant.displayName,
					kind: 'character' as const,
					detail: `Personagem de ${participant.displayName}`
				}));
			const npcs = npcResponse.npcs.map((npc: NPC) => ({
				id: npc.id,
				name: npc.name,
				kind: 'npc' as const,
				detail: `${npc.sheet.creatureType || 'Criatura'} · PV ${npc.sheet.hitPointsCurrent}/${npc.sheet.hitPointsMax}`
			}));
			actors = [...characters, ...npcs];
			linkedActorIds = new Set(
				sceneResponse.tokens.flatMap((token) => (token.actorId ? [token.actorId] : []))
			);
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível carregar os atores.';
		} finally {
			loading = false;
		}
	}

	async function add(actor: ActorRow) {
		if (adding || linkedActorIds.has(actor.id)) return;
		adding = actor.id;
		message = '';
		try {
			if (actor.kind === 'character') await createTokenFromCharacter(session, sceneId, actor.id);
			else await request(session, `/api/v1/scenes/${sceneId}/tokens/from-npc`, { method: 'POST', body: JSON.stringify({ actorId: actor.id }) });
			linkedActorIds = new Set([...linkedActorIds, actor.id]);
			await onadded();
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível adicionar o ator à cena.';
		} finally {
			adding = null;
		}
	}

	onMount(() => void load());
</script>

<aside class:closed={!open} class="actor-drawer" aria-label="Atores da cena">
	<button class="drawer-toggle" onclick={() => (open = !open)} aria-expanded={open}>
		<span>♟</span>{open ? 'Atores da cena' : 'Abrir atores'}
	</button>
	{#if open}
		<div class="drawer-body">
			<p class="hint">Adicionar coloca o ator nesta cena. Um ator só pode ter um token por cena.</p>
			{#if loading}<p class="empty">Carregando elenco…</p>
			{:else if actors.length === 0}<p class="empty">Ainda não há fichas ou NPCs cadastrados.</p>
			{:else}<div class="actor-list">{#each actors as actor (actor.id)}<article>
				<div><small>{actor.kind === 'character' ? 'PERSONAGEM' : 'NPC / CRIATURA'}</small><strong>{actor.name}</strong><span>{actor.detail}</span></div>
				<button onclick={() => add(actor)} disabled={adding === actor.id || linkedActorIds.has(actor.id)}>{linkedActorIds.has(actor.id) ? 'Na cena' : adding === actor.id ? 'Adicionando…' : 'Adicionar'}</button>
			</article>{/each}</div>{/if}
			{#if message}<p class="message">{message}</p>{/if}
		</div>
	{/if}
</aside>

<style>
	.actor-drawer { position:fixed; z-index:8; left:1rem; bottom:1rem; width:min(330px,calc(100% - 2rem)); overflow:hidden; border:1px solid rgba(216,173,103,.4); border-radius:12px; color:#eee4d6; background:rgba(27,22,26,.94); box-shadow:0 18px 48px rgba(0,0,0,.48); backdrop-filter:blur(12px); }
	.drawer-toggle { display:flex; align-items:center; gap:.45rem; width:100%; border:0; padding:.75rem .9rem; color:#f0cb85; background:linear-gradient(90deg,rgba(105,67,34,.5),rgba(35,27,30,.8)); font:700 .74rem Georgia,serif; cursor:pointer; text-align:left; }.drawer-toggle span{color:#d8ad67;font-size:1rem}
	.drawer-body { display:grid; gap:.6rem; max-height:360px; overflow:auto; padding:.7rem; }.hint,.empty,.message{margin:0;color:#a99c91;font-size:.72rem;line-height:1.45}.empty{text-align:center;padding:1rem}.message{color:#f0cb85}
	.actor-list{display:grid;gap:.45rem}.actor-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:center;padding:.55rem;border-left:2px solid #b58445;border-radius:0 7px 7px 0;background:rgba(70,51,47,.48)}.actor-list div{display:grid;gap:.12rem;min-width:0}.actor-list small{color:#e8c786;font-size:.58rem;letter-spacing:.06em}.actor-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem}.actor-list span{overflow:hidden;color:#b9aa9d;text-overflow:ellipsis;white-space:nowrap;font-size:.65rem}.actor-list button{border:1px solid #765d3d;border-radius:6px;padding:.36rem .45rem;color:#f0d29d;background:#2b211c;font-size:.65rem;cursor:pointer}.actor-list button:disabled{opacity:.55;cursor:default}
	@media(max-width:650px){.actor-drawer{left:.6rem;bottom:3.65rem;width:calc(100% - 1.2rem)}.drawer-body{max-height:260px}}
</style>
