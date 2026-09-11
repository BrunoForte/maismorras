<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { chatMensagens } from '$lib/stores/chatStore';
	import { loadMessages, rollDice, saveMessage } from '$lib/services/eventApi';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';
	import { connectSceneSocket, type SceneSocket } from '$lib/services/sceneRealtime';
	import { appLocale } from '$lib/stores/locale';

	let { campaignId, sceneId, session }: { campaignId: string; sceneId: string; session: Session } = $props();
	let open = $state(true);
	let sending = $state(false);
	let expanded = $state<{ author: string; text: string } | null>(null);
	let channel = $state<'all' | 'chat' | 'combat' | 'info'>('all');
	let sceneSocket: SceneSocket | null = null;
	let visibleMessages = $derived(
		channel === 'all'
			? $chatMensagens
			: $chatMensagens.filter((message) => (message.canal ?? 'chat') === channel)
	);

	async function reloadMessages() {
		try {
			$chatMensagens = await loadMessages(session, campaignId);
		} catch (error) {
			console.error('Falha ao carregar histórico do chat:', error);
		}
	}

	onMount(() => {
		void reloadMessages();
		sceneSocket = connectSceneSocket(session, sceneId, () => void reloadMessages());
		return () => {
			sceneSocket?.close();
			sceneSocket = null;
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

<aside class:closed={!open} class="floating-chat" aria-label={$appLocale === 'en' ? 'Table chat' : 'Chat da mesa'}>
	<button class="chat-toggle" onclick={() => (open = !open)} aria-expanded={open}>
		<span>◌</span>{open ? ($appLocale === 'en' ? 'Table chat' : 'Chat da mesa') : ($appLocale === 'en' ? 'Open chat' : 'Abrir chat')}
	</button>
	{#if open}
		<div class="chat-body">
			<nav class="channel-tabs" aria-label={$appLocale === 'en' ? 'Chat channels' : 'Canais do chat'}>
				<button class:active={channel === 'all'} onclick={() => (channel = 'all')}>{$appLocale === 'en' ? 'All' : 'Todos'}</button>
				<button class:active={channel === 'chat'} onclick={() => (channel = 'chat')} aria-label={$appLocale === 'en' ? 'Chat channel' : 'Canal de chat'}>Chat</button>
				<button class:active={channel === 'combat'} onclick={() => (channel = 'combat')}>{$appLocale === 'en' ? 'Combat' : 'Combate'}</button>
				<button class:active={channel === 'info'} onclick={() => (channel = 'info')}>{$appLocale === 'en' ? 'Info' : 'Info'}</button>
			</nav>
			<div class="messages" aria-live="polite">
				{#if visibleMessages.length === 0}<p class="empty">
						{channel === 'combat' ? ($appLocale === 'en' ? 'There are no combat events yet.' : 'Ainda não há eventos de combate.') : channel === 'info' ? ($appLocale === 'en' ? 'There is no system information yet.' : 'Ainda não há informações do sistema.') : ($appLocale === 'en' ? 'Talk to the group or use /r 1d20+2.' : 'Converse com o grupo ou use /r 1d20+2.')}
					</p>{/if}
				{#each visibleMessages as message (message.id)}
					<article class:combat={message.canal === 'combat'} class:info={message.canal === 'info'}>
						<strong>{message.autor}</strong>
						{#if message.tipo === 'texto'}<span>{message.texto}</span>{#if message.texto.length > 80}<button class="expand" onclick={() => expanded = { author: message.autor, text: message.texto }}>{$appLocale === 'en' ? 'Read in focus' : 'Ler em destaque'}</button>{/if}
						{:else if message.detalhesRolagem}<div class="roll">
								<small>{message.detalhesRolagem.expressao}</small><b
									>{message.detalhesRolagem.total}</b
								>
							</div>{/if}
					</article>
				{/each}
			</div>
			<form onsubmit={send}>
				<input
					name="message"
					autocomplete="off"
							placeholder={$appLocale === 'en' ? 'Message or /r 1d20+2' : 'Mensagem ou /r 1d20+2'}
					disabled={sending}
				/><button disabled={sending} aria-label={$appLocale === 'en' ? 'Send message' : 'Enviar mensagem'}>↑</button>
			</form>
		</div>
	{/if}
</aside>
{#if expanded}<div class="reading-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && (expanded = null)}><section><button aria-label={$appLocale === 'en' ? 'Close' : 'Fechar'} onclick={() => expanded = null}>×</button><small>{expanded.author}</small><p>{expanded.text}</p></section></div>{/if}

<style>
	.floating-chat {
		position: fixed;
		z-index: 8;
		right: 1rem;
		bottom: 1rem;
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
	.channel-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:.2rem; padding:.45rem .45rem 0; border-bottom:1px solid rgba(216,173,103,.15); }
	.channel-tabs button { border:0; border-radius:5px 5px 0 0; padding:.38rem .15rem; color:#ac9f94; background:transparent; font-size:.62rem; font-weight:700; cursor:pointer; }
	.channel-tabs button.active { color:#f0cb85; background:rgba(114,76,40,.35); }
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
	article.combat { border-left-color:#c86b48; background:rgba(105,45,34,.34); }
	article.info { border-left-color:#5f9cbd; background:rgba(42,71,91,.34); }
	article span {
		color: #e2d7ca;
		line-height: 1.4;
		word-break: break-word;
	}
	.roll {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border: 1px solid #5e4936;
		border-radius: 5px;
		padding: 0.38rem 0.5rem;
		background: #161216;
	}
	.roll small {
		color: #ad9e90;
	}
	.roll b {
		color: #f0cb85;
		font-size: 1rem;
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
			bottom: 0.6rem;
			width: calc(100% - 1.2rem);
		}
		.chat-body {
			height: 280px;
		}
	}
	.expand{justify-self:start;border:1px solid #765d3d;border-radius:5px;padding:.25rem .4rem;color:#f0cb85;background:#2b211c;font-size:.65rem;cursor:pointer}.reading-backdrop{position:fixed;z-index:40;inset:0;display:grid;place-items:center;padding:1.25rem;background:#080608c9;backdrop-filter:blur(6px)}.reading-backdrop section{position:relative;width:min(720px,100%);max-height:80vh;overflow:auto;border:1px solid #765d3d;border-radius:12px;padding:clamp(1.5rem,4vw,3rem);color:#f0e6d7;background:#201a1c;box-shadow:0 30px 90px #000}.reading-backdrop button{position:absolute;top:.7rem;right:.8rem;border:0;color:#ddc7ad;background:transparent;font-size:1.4rem}.reading-backdrop small{color:#d8ad67;text-transform:uppercase;letter-spacing:.12em}.reading-backdrop p{white-space:pre-wrap;font:1.05rem/1.75 Georgia,serif}
</style>
