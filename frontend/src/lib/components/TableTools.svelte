<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { personagens, turnoAtualId } from '$lib/stores/gameStore';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { rollDice } from '$lib/services/eventApi';
	import { getCombat, setCombat } from '$lib/services/sceneApi';

	let {
		campaignId,
		sceneId,
		session,
		isGM
	}: { campaignId: string; sceneId: string; session: Session; isGM: boolean } = $props();
	let initiativeOpen = $state(false);
	let toolsOpen = $state(false);
	let rolling = $state(false);
	let combatants = $derived([...$personagens].sort((a, b) => b.iniciativa - a.iniciativa));
	onMount(async () => {
		try {
			const combat = await getCombat(session, sceneId);
			$turnoAtualId =
				combatants.find((token) => token.persistedId === combat.activeTokenId)?.id ?? null;
		} catch (error) {
			console.error('Falha ao carregar turno:', error);
		}
	});

	async function roll(expression: string) {
		if (rolling) return;
		rolling = true;
		try {
			const event = await rollDice(session, campaignId, expression);
			const result = event.payload as {
				expressao: string;
				dados: number[];
				modificador: number;
				total: number;
			};
			$chatMensagens = [
				...$chatMensagens,
				{
					id: String(event.id),
					autor: event.author,
					texto: '',
					tipo: 'rolagem',
					detalhesRolagem: result
				}
			];
			$diceOverlay = { expression: result.expressao, total: result.total, dice: result.dados };
		} finally {
			rolling = false;
		}
	}
	async function nextTurn() {
		if (!combatants.length) return;
		const current = combatants.findIndex((token) => token.id === $turnoAtualId);
		const next = combatants[(current + 1) % combatants.length];
		if (!next.persistedId) return;
		await setCombat(session, sceneId, next.persistedId);
		$turnoAtualId = next.id;
	}
	function setInitiative(id: number, value: string) {
		const initiative = Number(value);
		if (!Number.isFinite(initiative)) return;
		$personagens = $personagens.map((token) =>
			token.id === id ? { ...token, iniciativa: initiative } : token
		);
	}
</script>

<div class="table-tools" aria-label="Ferramentas da mesa">
	<div class="tool-group">
		<button
			class:active={toolsOpen}
			onclick={() => (toolsOpen = !toolsOpen)}
			title="Régua e instruções">⌁</button
		><button
			class:active={initiativeOpen}
			onclick={() => (initiativeOpen = !initiativeOpen)}
			title="Iniciativa">≣</button
		><button onclick={() => void roll('1d20')} disabled={rolling} title="Rolar d20">◇</button>
	</div>
	{#if toolsOpen}<section class="tool-popover">
			<strong>Régua</strong><span
				>Segure <kbd>Shift</kbd> e arraste sobre o mapa para medir. Ao mover um token, o mesmo gesto mede
				o deslocamento.</span
			>
			<div class="quick-dice">
				<button onclick={() => void roll('1d4')}>d4</button><button onclick={() => void roll('1d6')}
					>d6</button
				><button onclick={() => void roll('1d8')}>d8</button><button
					onclick={() => void roll('1d10')}>d10</button
				><button onclick={() => void roll('1d12')}>d12</button><button
					onclick={() => void roll('1d20')}>d20</button
				>
			</div>
		</section>{/if}
	{#if initiativeOpen}<section class="initiative-popover">
			<header>
				<div><span>COMBATE</span><strong>Iniciativa</strong></div>
				{#if isGM}<button onclick={() => void nextTurn()}>Próximo turno →</button>{/if}
			</header>
			{#if combatants.length === 0}<p>
					Nenhum token nesta cena.
				</p>{:else}{#each combatants as token (token.id)}<article
						class:turn={token.id === $turnoAtualId}
					>
						<i style={`background:#${token.cor.toString(16).padStart(6, '0')}`}></i><strong
							>{token.nome}</strong
						>{#if isGM}<input
								type="number"
								value={token.iniciativa}
								onchange={(event) => setInitiative(token.id, event.currentTarget.value)}
							/>{:else}<span>{token.iniciativa}</span>{/if}
					</article>{/each}{/if}
		</section>{/if}
</div>

<style>
	.table-tools {
		position: absolute;
		z-index: 8;
		top: 2rem;
		left: calc(clamp(1.25rem, 5vw, 5rem) + 1rem);
	}
	.tool-group {
		display: grid;
		gap: 0.4rem;
	}
	.tool-group button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid rgba(216, 173, 103, 0.45);
		border-radius: 8px;
		color: #f0cb85;
		background: rgba(30, 23, 27, 0.92);
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.35);
		cursor: pointer;
		font-size: 1.1rem;
	}
	.tool-group button:hover,
	.tool-group button.active {
		background: #493020;
		border-color: #e0b86f;
	}
	.tool-popover,
	.initiative-popover {
		position: absolute;
		top: 0;
		left: 2.85rem;
		width: 300px;
		padding: 0.85rem;
		border: 1px solid rgba(216, 173, 103, 0.38);
		border-radius: 10px;
		color: #eee4d6;
		background: rgba(25, 19, 23, 0.96);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(12px);
	}
	.tool-popover {
		display: grid;
		gap: 0.45rem;
	}
	.tool-popover strong,
	.initiative-popover strong {
		font:
			600 1rem Georgia,
			serif;
		color: #f0cb85;
	}
	.tool-popover span,
	.initiative-popover p {
		color: #bcae9f;
		font-size: 0.75rem;
		line-height: 1.45;
	}
	kbd {
		border: 1px solid #665042;
		border-radius: 4px;
		padding: 0.08rem 0.26rem;
		color: #f4dfb6;
		background: #171216;
	}
	.quick-dice {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
		margin-top: 0.2rem;
	}
	.quick-dice button,
	.initiative-popover header button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.38rem;
		color: #f0cb85;
		background: #2b211e;
		cursor: pointer;
		font-weight: 700;
		font-size: 0.72rem;
	}
	.quick-dice button:hover,
	.initiative-popover header button:hover {
		background: #513321;
	}
	.initiative-popover {
		max-height: min(62vh, 520px);
		overflow: auto;
	}
	.initiative-popover header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.65rem;
	}
	.initiative-popover header div {
		display: grid;
		gap: 0.15rem;
	}
	.initiative-popover header span {
		color: #b58b52;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.initiative-popover article {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.48rem;
		border-top: 1px solid rgba(216, 173, 103, 0.12);
		font-size: 0.78rem;
	}
	.initiative-popover article.turn {
		border-left: 2px solid #e0b86f;
		background: rgba(115, 71, 34, 0.25);
	}
	.initiative-popover i {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
	}
	.initiative-popover article strong {
		flex: 1;
		overflow: hidden;
		color: #e8ddd0;
		font:
			600 0.84rem Georgia,
			serif;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.initiative-popover input {
		width: 3rem;
		border: 1px solid #5c493b;
		border-radius: 5px;
		padding: 0.25rem;
		color: #f0cb85;
		background: #171216;
		text-align: center;
	}
	.initiative-popover article > span {
		color: #f0cb85;
		font-weight: 800;
	}
	@media (max-width: 650px) {
		.table-tools {
			top: 1.75rem;
			left: 1.25rem;
		}
		.tool-popover,
		.initiative-popover {
			left: 2.75rem;
			width: min(300px, calc(100vw - 5rem));
		}
	}
</style>
