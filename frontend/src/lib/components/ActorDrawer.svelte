<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import { resizablePanel, resizablePanelPreference } from '$lib/utils/resizablePanel';
	import RpgIcon from '$lib/components/RpgIcon.svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		listNPCCharacters,
		listParticipants,
		type Participant
	} from '$lib/services/characterApi';
	import { listNPCs, type NPC } from '$lib/services/npcApi';
	import {
		createTokenFromCharacter,
		deleteSceneToken,
		loadScene,
		request
	} from '$lib/services/sceneApi';

	let {
		campaignId,
		sceneId,
		session,
		sheetOpen = false,
		tokenSelected = false,
		onadded = async () => {},
		oncompendium = () => {}
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		sheetOpen?: boolean;
		tokenSelected?: boolean;
		onadded?: () => void | Promise<void>;
		oncompendium?: () => void;
	} = $props();

	type ActorRow = { id: string; name: string; kind: 'character' | 'npc'; detail: string };
	let open = $state(!(resizablePanelPreference('scene-actors')?.collapsed ?? false));
	let actors = $state<ActorRow[]>([]);
	// Svelte collections still need $state so reassignment invalidates the component.
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let linkedActorIds = $state(new SvelteSet<string>());
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let tokenIdsByActor = $state(new SvelteMap<string, string>());
	let loading = $state(true);
	let adding = $state<string | null>(null);
	let removing = $state<string | null>(null);
	let message = $state('');

	async function load() {
		loading = true;
		try {
			const [participantResponse, npcCharacterResponse, npcResponse, sceneResponse] =
				await Promise.all([
					listParticipants(session, campaignId),
					listNPCCharacters(session, campaignId),
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
			const fullNPCs = npcCharacterResponse.characters.map((character) => ({
				id: character.id,
				name: character.name,
				kind: 'character' as const,
				detail: `Ficha completa de NPC · ${character.class || 'Sem classe'} · nível ${character.level}`
			}));
			const npcs = npcResponse.npcs.map((npc: NPC) => ({
				id: npc.id,
				name: npc.name,
				kind: 'npc' as const,
				detail: `${npc.sheet.creatureType || 'Criatura'} · PV ${npc.sheet.hitPointsCurrent}/${npc.sheet.hitPointsMax}`
			}));
			actors = [...characters, ...fullNPCs, ...npcs];
			const actorTokens = new SvelteMap(
				sceneResponse.tokens.flatMap((token) =>
					token.actorId ? [[token.actorId, token.id] as const] : []
				)
			);
			tokenIdsByActor = actorTokens;
			linkedActorIds = new SvelteSet(actorTokens.keys());
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível carregar os atores.';
		} finally {
			loading = false;
		}
	}

	async function remove(actor: ActorRow) {
		const tokenId = tokenIdsByActor.get(actor.id);
		if (!tokenId || removing) return;
		if (!confirm(`Remover ${actor.name} desta cena? A ficha ou criatura continuará na campanha.`))
			return;
		removing = actor.id;
		message = '';
		try {
			await deleteSceneToken(session, sceneId, tokenId);
			const nextTokenIds = new SvelteMap(tokenIdsByActor);
			nextTokenIds.delete(actor.id);
			tokenIdsByActor = nextTokenIds;
			linkedActorIds = new SvelteSet(nextTokenIds.keys());
			await onadded();
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível remover o token da cena.';
		} finally {
			removing = null;
		}
	}

	async function add(actor: ActorRow) {
		if (adding || linkedActorIds.has(actor.id)) return;
		adding = actor.id;
		message = '';
		try {
			if (actor.kind === 'character') await createTokenFromCharacter(session, sceneId, actor.id);
			else
				await request(session, `/api/v1/scenes/${sceneId}/tokens/from-npc`, {
					method: 'POST',
					body: JSON.stringify({ actorId: actor.id })
				});
			linkedActorIds = new SvelteSet([...linkedActorIds, actor.id]);
			await onadded();
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível adicionar o ator à cena.';
		} finally {
			adding = null;
		}
	}

	onMount(() => void load());
</script>

<aside
	use:resizablePanel={{
		collapsed: !open,
		headerSelector: '.drawer-toggle',
		minWidth: 190,
		storageKey: 'scene-actors'
	}}
	class:closed={!open}
	class:sheet-open={sheetOpen}
	class:token-selected={tokenSelected}
	class="actor-drawer"
	aria-label="Atores da cena"
>
	<button class="drawer-toggle" onclick={() => (open = !open)} aria-expanded={open}>
		<RpgIcon name="character" size={20} />{open ? 'Atores da cena' : 'Abrir atores'}
	</button>
	{#if open}
		<div class="drawer-body">
			<button class="compendium-link" onclick={oncompendium}
				>Adicionar monstros do compêndio…</button
			>
			<p class="hint">Adicionar coloca o ator nesta cena. Um ator só pode ter um token por cena.</p>
			{#if loading}<p class="empty">Carregando elenco…</p>
			{:else if actors.length === 0}<p class="empty">Ainda não há fichas ou NPCs cadastrados.</p>
			{:else}<div class="actor-list">
					{#each actors as actor (actor.id)}<article>
							<div>
								<small>{actor.kind === 'character' ? 'PERSONAGEM' : 'NPC / CRIATURA'}</small><strong
									>{actor.name}</strong
								><span>{actor.detail}</span>
							</div>
							<div class="actor-actions">
								{#if linkedActorIds.has(actor.id)}<button
										class="remove"
										onclick={() => void remove(actor)}
										disabled={removing === actor.id}
										>{removing === actor.id ? 'Removendo…' : 'Remover'}</button
									>{:else}<button onclick={() => add(actor)} disabled={adding === actor.id}
										>{adding === actor.id ? 'Adicionando…' : 'Adicionar'}</button
									>{/if}
							</div>
						</article>{/each}
				</div>{/if}
			{#if message}<p class="message">{message}</p>{/if}
		</div>
	{/if}
</aside>

<style>
	.actor-drawer {
		position: fixed;
		z-index: 8;
		right: 1rem;
		bottom: calc(var(--mm-audio-footer-offset, 4.25rem) + 0.35rem);
		width: min(330px, calc(100% - 2rem));
		height: min(420px, calc(100dvh - 7.5rem));
		min-width: min(250px, calc(100vw - 1rem));
		min-height: 180px;
		max-width: calc(100vw - 1rem);
		resize: both;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		overflow: auto;
		border: 1px solid rgba(216, 173, 103, 0.4);
		border-radius: 12px;
		color: #eee4d6;
		background: rgba(27, 22, 26, 0.94);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
		backdrop-filter: blur(12px);
	}
	.actor-drawer.closed {
		width: min(220px, calc(100% - 2rem));
		min-width: 0;
		min-height: 0;
		height: auto;
		resize: none;
	}
	.actor-drawer.token-selected:not(.closed) {
		height: min(260px, calc(100dvh - 7.5rem));
	}
	.compendium-link {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		color: #f0cb85;
		background: #2b211c;
		font: inherit;
		font-size: 0.72rem;
		text-align: left;
		cursor: pointer;
	}
	.actor-drawer.closed .drawer-body {
		display: none;
	}
	.drawer-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		width: 100%;
		border: 0;
		padding: 0.75rem 0.9rem;
		color: #f0cb85;
		background: linear-gradient(90deg, rgba(105, 67, 34, 0.5), rgba(35, 27, 30, 0.8));
		font:
			700 0.74rem Georgia,
			serif;
		cursor: pointer;
		text-align: left;
	}
	.drawer-toggle :global(svg) {
		color: #d8ad67;
		flex: 0 0 auto;
	}
	.drawer-body {
		display: grid;
		gap: 0.6rem;
		max-height: none;
		min-height: 0;
		overflow: auto;
		padding: 0.7rem;
	}
	@media (max-width: 650px) {
		.actor-drawer {
			right: 0.6rem;
			bottom: calc(var(--mm-audio-footer-offset, 4.25rem) + 0.35rem);
			width: min(330px, calc(100% - 1.2rem));
			height: min(420px, calc(100dvh - 7.5rem));
		}
		.actor-drawer.sheet-open:not(.closed) {
			height: min(26dvh, 230px);
			max-height: min(26dvh, 230px);
			min-height: min(170px, 26dvh);
		}
		.actor-drawer.token-selected:not(.closed) {
			height: min(19dvh, 160px);
			max-height: min(19dvh, 160px);
			min-height: min(130px, 19dvh);
		}
	}
	.hint,
	.empty,
	.message {
		margin: 0;
		color: #a99c91;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.empty {
		text-align: center;
		padding: 1rem;
	}
	.message {
		color: #f0cb85;
	}
	.actor-list {
		display: grid;
		gap: 0.45rem;
	}
	.actor-list article {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.55rem;
		border-left: 2px solid #b58445;
		border-radius: 0 7px 7px 0;
		background: rgba(70, 51, 47, 0.48);
	}
	.actor-list article > div:first-child {
		display: grid;
		gap: 0.12rem;
		min-width: 0;
	}
	.actor-list small {
		color: #e8c786;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
	}
	.actor-list strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8rem;
	}
	.actor-list span {
		overflow: hidden;
		color: #b9aa9d;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.65rem;
	}
	.actor-actions {
		display: flex;
		gap: 0.3rem;
	}
	.actor-list button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.36rem 0.45rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.65rem;
		cursor: pointer;
	}
	.actor-list button.remove {
		border-color: #945348;
		color: #ffd0c4;
		background: #3a211f;
	}
	.actor-list button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	@media (max-width: 650px) {
		.actor-drawer {
			left: 0.6rem;
			bottom: calc(var(--mm-audio-footer-offset, 6.5rem) + 0.35rem);
			width: calc(100% - 1.2rem);
			height: min(340px, calc(100dvh - 7.5rem));
		}
		.drawer-body {
			max-height: none;
		}
	}
</style>
