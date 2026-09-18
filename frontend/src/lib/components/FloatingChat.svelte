<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Session } from '@supabase/supabase-js';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { loadMessages, rollDice, saveMessage } from '$lib/services/eventApi';
	import {
		diceBatchOpen,
		diceOverlay,
		diceRendererMode,
		setDiceRendererMode
	} from '$lib/stores/diceOverlayStore';
	import {
		connectSceneSocket,
		type RealtimeStatus,
		type SceneSocket
	} from '$lib/services/sceneRealtime';
	import { appLocale } from '$lib/stores/locale';

	let { campaignId, sceneId, session }: { campaignId: string; sceneId: string; session: Session } =
		$props();
	let open = $state(true);
	let sending = $state(false);
	let expanded = $state<{ author: string; text: string } | null>(null);
	let channel = $state<'all' | 'chat' | 'combat' | 'info'>('all');
	let sceneSocket: SceneSocket | null = null;
	let messagesElement = $state<HTMLDivElement>();
	let initialized = false;
	let lastEventId = 0;
	const knownMessageIds = new SvelteSet<string>();
	const revealedRollIds = new SvelteSet<string>();
	const waitingRollIds = new SvelteSet<string>();
	const revealTimers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	const queueRollReveal = (messageId: string) => {
		if (revealedRollIds.has(messageId) || revealTimers.has(messageId)) return;
		if ($diceBatchOpen) {
			waitingRollIds.add(messageId);
			return;
		}
		revealTimers.set(
			messageId,
			setTimeout(() => {
				revealTimers.delete(messageId);
				revealedRollIds.add(messageId);
			}, 2500)
		);
	};
	let visibleMessages = $derived(
		channel === 'all'
			? $chatMensagens
			: $chatMensagens.filter((message) => (message.canal ?? 'chat') === channel)
	);
	$effect(() => {
		void visibleMessages.length;
		void revealedRollIds.size;
		if (open && messagesElement) {
			void tick().then(() => {
				if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight;
			});
		}
	});
	const rollLabel = (message: (typeof $chatMensagens)[number]) =>
		message.detalhesRolagem?.label ||
		message.texto.split(' · ')[0] ||
		message.detalhesRolagem?.expressao ||
		($appLocale === 'en' ? 'Roll' : 'Rolagem');

	async function reloadMessages() {
		try {
			const nextMessages = await loadMessages(
				session,
				campaignId,
				initialized ? lastEventId : undefined
			);
			if (!initialized) {
				nextMessages.forEach((message) => {
					knownMessageIds.add(message.id);
					if (message.tipo === 'rolagem') revealedRollIds.add(message.id);
				});
				$chatMensagens = nextMessages;
				initialized = true;
			} else {
				for (const message of nextMessages) {
					if (knownMessageIds.has(message.id)) continue;
					knownMessageIds.add(message.id);
					if (message.tipo === 'rolagem') queueRollReveal(message.id);
					if (message.tipo === 'rolagem' && message.detalhesRolagem)
						$diceOverlay = {
							expression: message.detalhesRolagem.expressao,
							total: message.detalhesRolagem.total,
							dice: message.detalhesRolagem.dados,
							nonce: crypto.randomUUID()
						};
				}
				if (nextMessages.length) $chatMensagens = [...$chatMensagens, ...nextMessages].slice(-100);
			}
			for (const message of nextMessages) {
				const numericId = Number(message.id);
				if (Number.isSafeInteger(numericId)) lastEventId = Math.max(lastEventId, numericId);
			}
		} catch (error) {
			console.error('Falha ao carregar histórico do chat:', error);
		}
	}

	$effect(() => {
		if (!initialized) return;
		if (!$diceBatchOpen) {
			for (const messageId of waitingRollIds) {
				waitingRollIds.delete(messageId);
				queueRollReveal(messageId);
			}
		}
		for (const message of $chatMensagens) {
			if (message.tipo === 'rolagem' && !revealedRollIds.has(message.id))
				queueRollReveal(message.id);
		}
	});

	onMount(() => {
		void reloadMessages();
		let fallbackTimer: number | undefined;
		const updateFallback = (status: RealtimeStatus) => {
			if (status === 'connected') {
				if (fallbackTimer) window.clearInterval(fallbackTimer);
				fallbackTimer = undefined;
				return;
			}
			if (!fallbackTimer) fallbackTimer = window.setInterval(() => void reloadMessages(), 60_000);
		};
		sceneSocket = connectSceneSocket(
			session,
			sceneId,
			() => void reloadMessages(),
			undefined,
			updateFallback
		);
		return () => {
			sceneSocket?.close();
			sceneSocket = null;
			if (fallbackTimer) window.clearInterval(fallbackTimer);
			for (const timer of revealTimers.values()) clearTimeout(timer);
			revealTimers.clear();
		};
	});

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		const form = event.currentTarget as HTMLFormElement;
		const input = new FormData(form).get('message')?.toString().trim() ?? '';
		if (!input) return;
		sending = true;
		try {
			if (/^\/(r|roll)\s+/i.test(input)) {
				const event = await rollDice(session, campaignId, input.replace(/^\/(r|roll)\s+/i, ''));
				const result = event.payload as NonNullable<
					(typeof $chatMensagens)[number]['detalhesRolagem']
				>;
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
				knownMessageIds.add(String(event.id));
				$diceOverlay = { expression: result.expressao, total: result.total, dice: result.dados };
			} else {
				await saveMessage(session, campaignId, input);
				$chatMensagens = [
					...$chatMensagens,
					{ id: crypto.randomUUID(), autor: 'Você', texto: input, tipo: 'texto' }
				];
			}
			sceneSocket?.publishRefresh();
			form.reset();
		} finally {
			sending = false;
		}
	}
</script>

<aside
	class:closed={!open}
	class="floating-chat"
	aria-label={$appLocale === 'en' ? 'Table chat' : 'Chat da mesa'}
>
	<button class="chat-toggle" onclick={() => (open = !open)} aria-expanded={open}>
		<span>◌</span>{open
			? $appLocale === 'en'
				? 'Table chat'
				: 'Chat da mesa'
			: $appLocale === 'en'
				? 'Open chat'
				: 'Abrir chat'}
	</button>
	{#if open}
		<div class="chat-body">
			<nav
				class="channel-tabs"
				aria-label={$appLocale === 'en' ? 'Chat channels' : 'Canais do chat'}
			>
				<label class="dice-preference"
					>Dados <select
						value={$diceRendererMode}
						onchange={(event) =>
							setDiceRendererMode(
								event.currentTarget.value as 'auto' | '2d' | '3d-overlay' | '3d-table'
							)}
						aria-label="Modo de renderização dos dados"
						><option value="auto">Automático</option><option value="2d">Somente efeito 2D</option
						><option value="3d-overlay">Dados 3D temporários</option><option value="3d-table"
							>Dados 3D persistentes</option
						></select
					></label
				>
				<button class:active={channel === 'all'} onclick={() => (channel = 'all')}
					>{$appLocale === 'en' ? 'All' : 'Todos'}</button
				>
				<button
					class:active={channel === 'chat'}
					onclick={() => (channel = 'chat')}
					aria-label={$appLocale === 'en' ? 'Chat channel' : 'Canal de chat'}>Chat</button
				>
				<button class:active={channel === 'combat'} onclick={() => (channel = 'combat')}
					>{$appLocale === 'en' ? 'Combat' : 'Combate'}</button
				>
				<button class:active={channel === 'info'} onclick={() => (channel = 'info')}
					>{$appLocale === 'en' ? 'Info' : 'Info'}</button
				>
			</nav>
			<div class="messages" bind:this={messagesElement} aria-live="polite">
				{#if visibleMessages.length === 0}<p class="empty">
						{channel === 'combat'
							? $appLocale === 'en'
								? 'There are no combat events yet.'
								: 'Ainda não há eventos de combate.'
							: channel === 'info'
								? $appLocale === 'en'
									? 'There is no system information yet.'
									: 'Ainda não há informações do sistema.'
								: $appLocale === 'en'
									? 'Talk to the group or use /r 1d20+2.'
									: 'Converse com o grupo ou use /r 1d20+2.'}
					</p>{/if}
				{#each visibleMessages as message (message.id)}
					<article
						class:combat={message.canal === 'combat'}
						class:info={message.canal === 'info'}
						class:roll-article={message.tipo === 'rolagem'}
					>
						{#if message.tipo === 'texto'}<strong>{message.autor}</strong><span
								>{message.texto}</span
							>{#if message.texto.length > 80}<button
									class="expand"
									onclick={() => (expanded = { author: message.autor, text: message.texto })}
									>{$appLocale === 'en' ? 'Read in focus' : 'Ler em destaque'}</button
								>{/if}
						{:else if message.detalhesRolagem}<div class="roll-heading">
								<strong>{message.autor}</strong><span>/</span><small>{rollLabel(message)}</small>
							</div>
							{#if revealedRollIds.has(message.id)}<div class="roll">
									<div>
										<small>{message.detalhesRolagem.expressao}</small
										>{#if message.detalhesRolagem.dados.length}<em
												>{message.detalhesRolagem.mode === 'advantage'
													? $appLocale === 'en'
														? 'Advantage'
														: 'Vantagem'
													: message.detalhesRolagem.mode === 'disadvantage'
														? $appLocale === 'en'
															? 'Disadvantage'
															: 'Desvantagem'
														: $appLocale === 'en'
															? 'Normal'
															: 'Normal'} · [{message.detalhesRolagem.dados.join(', ')}] · {message
													.detalhesRolagem.modificador >= 0
													? '+'
													: ''}{message.detalhesRolagem.modificador}</em
											>{/if}
									</div>
									<b>{message.detalhesRolagem.total}</b>
								</div>{:else}<div class="roll pending">
									<small>🎲 {$appLocale === 'en' ? 'Rolling…' : 'Rolando…'}</small>
								</div>{/if}{/if}
					</article>
				{/each}
			</div>
			<form onsubmit={send}>
				<input
					name="message"
					autocomplete="off"
					placeholder={$appLocale === 'en' ? 'Message or /r 1d20+2' : 'Mensagem ou /r 1d20+2'}
					disabled={sending}
				/><button
					disabled={sending}
					aria-label={$appLocale === 'en' ? 'Send message' : 'Enviar mensagem'}>↑</button
				>
			</form>
		</div>
	{/if}
</aside>
{#if expanded}<div
		class="reading-backdrop"
		role="presentation"
		onclick={(event) => event.currentTarget === event.target && (expanded = null)}
	>
		<section>
			<button
				aria-label={$appLocale === 'en' ? 'Close' : 'Fechar'}
				onclick={() => (expanded = null)}>×</button
			><small>{expanded.author}</small>
			<p>{expanded.text}</p>
		</section>
	</div>{/if}

<style>
	.floating-chat {
		position: fixed;
		z-index: 8;
		right: 1rem;
		bottom: 4.25rem;
		min-height: 9rem;
		max-height: min(70vh, 560px);
		resize: both;
		width: min(360px, calc(100% - 2rem));
		border: 1px solid rgba(216, 173, 103, 0.4);
		border-radius: 12px;
		overflow: hidden;
		color: #eee4d6;
		background: rgba(27, 22, 26, 0.94);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
		backdrop-filter: blur(12px);
	}
	.chat-toggle {
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
	.chat-toggle span {
		color: #d8ad67;
		font-size: 1rem;
	}
	.chat-body {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: 315px;
	}
	.channel-tabs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.2rem;
		padding: 0.45rem 0.45rem 0;
		border-bottom: 1px solid rgba(216, 173, 103, 0.15);
	}
	.channel-tabs button {
		border: 0;
		border-radius: 5px 5px 0 0;
		padding: 0.38rem 0.15rem;
		color: #ac9f94;
		background: transparent;
		font-size: 0.62rem;
		font-weight: 700;
		cursor: pointer;
	}
	.channel-tabs button.active {
		color: #f0cb85;
		background: rgba(114, 76, 40, 0.35);
	}
	.dice-preference {
		grid-column: 1 / -1;
		justify-self: end;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: #a99c91;
		font-size: 0.62rem;
	}
	.dice-preference select {
		border: 1px solid #5c493b;
		border-radius: 4px;
		padding: 0.18rem 0.28rem;
		color: #e8c786;
		background: #171216;
		font-size: 0.62rem;
	}
	.messages {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow: auto;
		padding: 0.75rem;
	}
	.empty {
		margin: auto;
		color: #a99c91;
		font-size: 0.78rem;
		text-align: center;
		line-height: 1.6;
	}
	article {
		display: grid;
		gap: 0.2rem;
		padding: 0.55rem 0.65rem;
		border-left: 2px solid #b58445;
		border-radius: 0 7px 7px 0;
		background: rgba(70, 51, 47, 0.48);
		font-size: 0.8rem;
	}
	article strong {
		color: #e8c786;
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.roll-article {
		padding-top: 0.45rem;
	}
	.roll-heading {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.35rem;
		text-align: center;
	}
	.roll-heading span {
		color: #806b58;
	}
	.roll-heading small {
		color: #d8bd8e;
		font-size: 0.68rem;
		font-weight: 700;
	}
	article.combat {
		border-left-color: #c86b48;
		background: rgba(105, 45, 34, 0.34);
	}
	article.info {
		border-left-color: #5f9cbd;
		background: rgba(42, 71, 91, 0.34);
	}
	article span {
		color: #e2d7ca;
		line-height: 1.4;
		word-break: break-word;
	}
	.roll {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		border: 1px solid #5e4936;
		border-radius: 5px;
		padding: 0.38rem 0.5rem;
		background: #161216;
	}
	.roll small {
		display: block;
		color: #ad9e90;
		line-height: 1.35;
		text-align: center;
	}
	.roll em {
		display: block;
		margin-top: 0.15rem;
		color: #d8bd8e;
		font-size: 0.64rem;
		font-style: normal;
		text-align: center;
	}
	.roll b {
		color: #f0cb85;
		font-size: 1.35rem;
		line-height: 1;
	}
	form {
		display: flex;
		gap: 0.45rem;
		padding: 0.65rem;
		border-top: 1px solid rgba(216, 173, 103, 0.18);
		background: rgba(15, 12, 15, 0.6);
	}
	input {
		flex: 1;
		min-width: 0;
		border: 1px solid #5c493b;
		border-radius: 7px;
		padding: 0.55rem 0.65rem;
		color: #eee4d6;
		background: #171216;
		font: inherit;
		font-size: 0.76rem;
	}
	form button {
		width: 2rem;
		border: 1px solid #a97b43;
		border-radius: 7px;
		color: #281a0f;
		background: #e0b86f;
		font-weight: 900;
		cursor: pointer;
	}
	form button:disabled,
	input:disabled {
		opacity: 0.6;
	}
	@media (max-width: 650px) {
		.floating-chat {
			right: 0.6rem;
			bottom: 4.25rem;
			width: calc(100% - 1.2rem);
		}
		.chat-body {
			height: 280px;
		}
	}
	.expand {
		justify-self: start;
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.25rem 0.4rem;
		color: #f0cb85;
		background: #2b211c;
		font-size: 0.65rem;
		cursor: pointer;
	}
	.reading-backdrop {
		position: fixed;
		z-index: 40;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1.25rem;
		background: #080608c9;
		backdrop-filter: blur(6px);
	}
	.reading-backdrop section {
		position: relative;
		width: min(720px, 100%);
		max-height: 80vh;
		overflow: auto;
		border: 1px solid #765d3d;
		border-radius: 12px;
		padding: clamp(1.5rem, 4vw, 3rem);
		color: #f0e6d7;
		background: #201a1c;
		box-shadow: 0 30px 90px #000;
	}
	.reading-backdrop button {
		position: absolute;
		top: 0.7rem;
		right: 0.8rem;
		border: 0;
		color: #ddc7ad;
		background: transparent;
		font-size: 1.4rem;
	}
	.reading-backdrop small {
		color: #d8ad67;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
	.reading-backdrop p {
		white-space: pre-wrap;
		font:
			1.05rem/1.75 Georgia,
			serif;
	}
</style>
