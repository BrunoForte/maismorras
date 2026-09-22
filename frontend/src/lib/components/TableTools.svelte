<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { personagens, turnoAtualId } from '$lib/stores/gameStore';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { loadMessages, rollDice } from '$lib/services/eventApi';
	import {
		getCombat,
		rollSceneInitiative,
		rollTokenInitiative,
		setCombat,
		setTokenInitiative
	} from '$lib/services/sceneApi';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { rulerMode, type RulerMode } from '$lib/stores/tableToolsStore';
	import { appLocale } from '$lib/stores/locale';

	let {
		campaignId,
		sceneId,
		session,
		isGM
	}: { campaignId: string; sceneId: string; session: Session; isGM: boolean } = $props();
	let initiativeOpen = $state(false);
	let toolsOpen = $state(false);
	let diceOpen = $state(false);
	let rolling = $state(false);
	let activeTokenId = $state<string | null>(null);
	let rollingInitiative = $state(false);
	let sceneSocket: SceneSocket | null = null;
	let combatants = $derived([...$personagens].sort((a, b) => b.iniciativa - a.iniciativa));
	async function syncCombat() {
		try {
			const combat = await getCombat(session, sceneId);
			activeTokenId = combat.activeTokenId;
			const values = new Map(combat.initiatives.map((item) => [item.tokenId, item.initiative]));
			$personagens = $personagens.map((token) =>
				token.persistedId && values.has(token.persistedId)
					? { ...token, iniciativa: values.get(token.persistedId)! }
					: token
			);
		} catch (error) {
			console.error('Falha ao carregar turno:', error);
		}
	}
	$effect(() => {
		$turnoAtualId = combatants.find((token) => token.persistedId === activeTokenId)?.id ?? null;
	});
	onMount(() => {
		sceneSocket = connectSceneSocket(
			session,
			sceneId,
			() => void syncCombat(),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => void syncCombat()
		);
		void syncCombat();
		return () => {
			sceneSocket?.close();
			sceneSocket = null;
		};
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
		const combat = await setCombat(session, sceneId, next.persistedId);
		activeTokenId = combat.activeTokenId;
		if (combat.message) $chatMensagens = await loadMessages(session, campaignId);
		sceneSocket?.publishCombatUpdated();
	}
	async function endCombat() {
		const combat = await setCombat(session, sceneId, null);
		activeTokenId = combat.activeTokenId;
		if (combat.message) $chatMensagens = await loadMessages(session, campaignId);
		sceneSocket?.publishCombatUpdated();
	}
	async function rollAllInitiative() {
		if (!isGM || rollingInitiative) return;
		rollingInitiative = true;
		try {
			const result = await rollSceneInitiative(session, sceneId);
			const values = new Map(result.tokens.map((token) => [token.id, token.initiative]));
			$personagens = $personagens.map((token) =>
				token.persistedId && values.has(token.persistedId)
					? { ...token, iniciativa: values.get(token.persistedId)! }
					: token
			);
			$chatMensagens = await loadMessages(session, campaignId);
			sceneSocket?.publishCombatUpdated();
		} finally {
			rollingInitiative = false;
		}
	}
	async function rollOwnInitiative(token: (typeof combatants)[number]) {
		if (isGM || !token.isOwned || !token.persistedId || rollingInitiative) return;
		rollingInitiative = true;
		try {
			const result = await rollTokenInitiative(session, sceneId, token.persistedId);
			$personagens = $personagens.map((item) =>
				item.persistedId === result.tokenId ? { ...item, iniciativa: result.initiative } : item
			);
			$chatMensagens = await loadMessages(session, campaignId);
			sceneSocket?.publishTokenUpdated({ tokenId: result.tokenId });
		} finally {
			rollingInitiative = false;
		}
	}
	async function selectTurn(tokenId: string | undefined) {
		if (!isGM || !tokenId) return;
		const combat = await setCombat(session, sceneId, tokenId);
		activeTokenId = combat.activeTokenId;
		if (combat.message) $chatMensagens = await loadMessages(session, campaignId);
		sceneSocket?.publishCombatUpdated();
	}
	async function setInitiative(id: number, tokenId: string | undefined, value: string) {
		const initiative = Number(value);
		if (!Number.isFinite(initiative) || !tokenId || !isGM) return;
		$personagens = $personagens.map((token) =>
			token.id === id ? { ...token, iniciativa: initiative } : token
		);
		try {
			await setTokenInitiative(session, sceneId, tokenId, initiative);
			sceneSocket?.publishCombatUpdated();
		} catch (error) {
			console.error('Falha ao salvar iniciativa:', error);
		}
	}
	function setRulerMode(mode: RulerMode) {
		rulerMode.set(mode);
	}
	type TableToolPanel = 'ruler' | 'initiative' | 'dice';
	function togglePanel(panel: TableToolPanel) {
		const wasOpen =
			panel === 'ruler' ? toolsOpen : panel === 'initiative' ? initiativeOpen : diceOpen;
		toolsOpen = false;
		initiativeOpen = false;
		diceOpen = false;
		if (wasOpen) return;
		window.dispatchEvent(new CustomEvent('maismorras:close-map-tools'));
		if (panel === 'ruler') toolsOpen = true;
		if (panel === 'initiative') initiativeOpen = true;
		if (panel === 'dice') diceOpen = true;
	}
	function toggleMapTool(tool: 'layers' | 'areas' | 'barriers') {
		toolsOpen = false;
		initiativeOpen = false;
		diceOpen = false;
		window.dispatchEvent(new CustomEvent('maismorras:map-tool', { detail: tool }));
	}
	function closePanels() {
		toolsOpen = false;
		initiativeOpen = false;
		diceOpen = false;
	}

	onMount(() => {
		const closeHandler = () => closePanels();
		window.addEventListener('maismorras:close-table-tools', closeHandler);
		return () => window.removeEventListener('maismorras:close-table-tools', closeHandler);
	});
</script>

<div class="table-tools" aria-label={$appLocale === 'en' ? 'Table tools' : 'Ferramentas da mesa'}>
	<div class="tool-group">
		<button
			class:active={toolsOpen}
			onclick={() => togglePanel('ruler')}
			title={$appLocale === 'en' ? 'Area ruler' : 'Régua de área'}>📏</button
		><button
			class:active={initiativeOpen}
			onclick={() => togglePanel('initiative')}
			title={$appLocale === 'en' ? 'Initiative' : 'Iniciativa'}>⚔️</button
		><button
			class:active={diceOpen}
			onclick={() => togglePanel('dice')}
			disabled={rolling}
			title={$appLocale === 'en' ? 'Dice' : 'Dados'}>🎲</button
		>
		{#if isGM}<button
				onclick={() => toggleMapTool('layers')}
				title={$appLocale === 'en' ? 'Map layers' : 'Camadas do mapa'}>🗺️</button
			><button
				onclick={() => toggleMapTool('areas')}
				title={$appLocale === 'en' ? 'Persistent areas' : 'Áreas persistentes'}>📐</button
			><button
				onclick={() => toggleMapTool('barriers')}
				title={$appLocale === 'en' ? 'Walls and doors' : 'Paredes e portas'}>🧱</button
			>{/if}
	</div>
	{#if toolsOpen}<section class="tool-popover">
			<strong>{$appLocale === 'en' ? 'Spell ruler' : 'Régua de magia'}</strong><span
				>{$appLocale === 'en' ? 'Choose an area and hold' : 'Escolha a área e segure'}
				<kbd>Shift</kbd>
				{$appLocale === 'en' ? 'while dragging on the map.' : 'enquanto arrasta no mapa.'}</span
			>
			<div class="mode-buttons">
				<button class:active={$rulerMode === 'line'} onclick={() => setRulerMode('line')}
					>{$appLocale === 'en' ? 'Line' : 'Linha'}</button
				><button class:active={$rulerMode === 'circle'} onclick={() => setRulerMode('circle')}
					>{$appLocale === 'en' ? 'Circle' : 'Círculo'}</button
				><button class:active={$rulerMode === 'cone'} onclick={() => setRulerMode('cone')}
					>{$appLocale === 'en' ? 'Cone' : 'Leque'}</button
				>
			</div>
		</section>{/if}
	{#if diceOpen}<section class="dice-popover">
			<strong>{$appLocale === 'en' ? 'Dice' : 'Dados'}</strong>
			<div class="quick-dice">
				<button onclick={() => void roll('1d4')}>d4</button><button onclick={() => void roll('1d6')}
					>d6</button
				><button onclick={() => void roll('1d8')}>d8</button><button
					onclick={() => void roll('1d10')}>d10</button
				><button onclick={() => void roll('1d12')}>d12</button><button
					onclick={() => void roll('1d20')}>d20</button
				>
			</div>
			<small
				>{$appLocale === 'en'
					? 'Use chat for expressions such as'
					: 'Use o chat para expressões como'} <code>/r 2d6+3</code>.</small
			>
		</section>{/if}
	{#if initiativeOpen}<section class="initiative-popover">
			<header>
				<div>
					<span>{$appLocale === 'en' ? 'COMBAT' : 'COMBATE'}</span><strong
						>{$appLocale === 'en' ? 'Initiative' : 'Iniciativa'}</strong
					>
				</div>
				{#if isGM}<div class="combat-actions">
						<button onclick={() => void rollAllInitiative()} disabled={rollingInitiative}
							>{rollingInitiative
								? $appLocale === 'en'
									? 'Rolling…'
									: 'Rolando…'
								: $appLocale === 'en'
									? 'Roll all'
									: 'Rolar todos'}</button
						><button onclick={() => void nextTurn()}
							>{activeTokenId
								? $appLocale === 'en'
									? 'Next turn →'
									: 'Próximo turno →'
								: $appLocale === 'en'
									? 'Start combat'
									: 'Iniciar combate'}</button
						>{#if activeTokenId}<button class="end-combat" onclick={() => void endCombat()}
								>{$appLocale === 'en' ? 'End' : 'Encerrar'}</button
							>{/if}
					</div>{/if}
			</header>
			{#if combatants.length === 0}<p>
					{$appLocale === 'en' ? 'No tokens in this scene.' : 'Nenhum token nesta cena.'}
				</p>{:else}{#each combatants as token (token.id)}<article
						class:turn={token.persistedId === activeTokenId}
					>
						<i style={`background:#${token.cor.toString(16).padStart(6, '0')}`}></i><strong
							>{token.nome}</strong
						>{#if isGM}<button
								class="turn-select"
								onclick={() => void selectTurn(token.persistedId)}
								>{token.persistedId === activeTokenId ? 'Ativo' : 'Ativar'}</button
							><input
								type="number"
								value={token.iniciativa}
								onchange={(event) =>
									void setInitiative(token.id, token.persistedId, event.currentTarget.value)}
							/>{:else}{#if token.isOwned}<button
									class="turn-select"
									onclick={() => void rollOwnInitiative(token)}
									disabled={rollingInitiative}>Rolar</button
								>{/if}<span>{token.iniciativa}</span>{/if}
					</article>{/each}{/if}
		</section>{/if}
</div>

<style>
	.table-tools {
		position: absolute;
		z-index: 8;
		top: 0.8rem;
		left: 0.9rem;
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
	.dice-popover,
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
	.dice-popover {
		top: 5.5rem;
		display: grid;
		gap: 0.55rem;
	}
	.dice-popover strong {
		color: #f0cb85;
		font:
			600 1rem Georgia,
			serif;
	}
	.dice-popover small {
		color: #bcae9f;
		font-size: 0.7rem;
	}
	.mode-buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
	}
	.mode-buttons button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.4rem;
		color: #e8d2aa;
		background: #2b211e;
		cursor: pointer;
		font-size: 0.7rem;
	}
	.mode-buttons button.active {
		color: #281a0f;
		background: #e0b86f;
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
	.combat-actions {
		display: flex;
		gap: 0.35rem;
	}
	.initiative-popover header .end-combat {
		border-color: #69413d;
		color: #e7b3aa;
		background: #2a1b1c;
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
	.turn-select {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.25rem 0.35rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.62rem;
		cursor: pointer;
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
	@media (max-width: 760px) {
		.table-tools {
			top: 0.75rem;
			left: 50%;
			bottom: auto;
			transform: translateX(-50%);
		}
		.tool-group {
			display: flex;
		}
		.tool-group button {
			width: 3rem;
			height: 3rem;
			font-size: 1.25rem;
		}
		.tool-popover,
		.dice-popover,
		.initiative-popover {
			top: 3.55rem;
			bottom: auto;
			left: 50%;
			width: min(340px, calc(100vw - 1.5rem));
			transform: translateX(-50%);
		}
	}
</style>
