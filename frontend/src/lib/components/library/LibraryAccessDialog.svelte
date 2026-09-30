<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import type { LibraryAccessDialogActions, LibraryAccessDialogModel } from './libraryTypes';
	let {
		model,
		actions,
		isGM
	}: {
		model: LibraryAccessDialogModel;
		actions: LibraryAccessDialogActions;
		isGM: boolean;
	} = $props();
</script>

{#if isGM}
	<div
		class="permission-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget && !(model.kind === 'access' && model.saving))
				actions.close();
		}}
	>
		<dialog open class="permission-dialog" aria-modal="true" aria-labelledby="library-dialog-title">
			<header>
				<div>
					<p>
						{model.kind === 'presentation'
							? $appLocale === 'en'
								? 'LIVE PRESENTATION'
								: 'EXIBIÇÃO NA MESA'
							: $appLocale === 'en'
								? 'CAMPAIGN ACCESS'
								: 'ACESSO DA MESA'}
					</p>
					<h3 id="library-dialog-title">
						{model.kind === 'presentation'
							? $appLocale === 'en'
								? 'Where to show this image?'
								: 'Onde exibir esta imagem?'
							: $appLocale === 'en'
								? 'Who can see this item?'
								: 'Quem pode ver este item?'}
					</h3>
					<span>{model.kind === 'presentation' ? model.assetName : model.label}</span>
				</div>
				<button
					class="dialog-close"
					onclick={actions.close}
					disabled={model.kind === 'access' && model.saving}
					aria-label={$appLocale === 'en' ? 'Close' : 'Fechar'}>×</button
				>
			</header>

			{#if model.loading}
				<p class="permission-empty">
					{$appLocale === 'en' ? 'Loading campaign players…' : 'Carregando jogadores da mesa…'}
				</p>
			{:else}
				<div class="permission-modes">
					<label>
						<input
							type="radio"
							name="library-audience"
							checked={!model.restricted}
							onchange={() => actions.setRestricted(false)}
						/>
						{model.kind === 'presentation'
							? $appLocale === 'en'
								? 'All players'
								: 'Todos os jogadores'
							: $appLocale === 'en'
								? 'All players'
								: 'Todos os jogadores'}
					</label>
					<label>
						<input
							type="radio"
							name="library-audience"
							checked={model.restricted}
							onchange={() => actions.setRestricted(true)}
						/>
						{$appLocale === 'en' ? 'Selected players' : 'Jogadores selecionados'}
					</label>
				</div>
				{#if model.restricted}
					<div class="permission-roster">
						{#if model.participants.length}
							{#each model.participants as participant (participant.userId)}
								<label class="player-option">
									<input
										type="checkbox"
										checked={model.selectedUserIds.includes(participant.userId)}
										onchange={() => actions.toggleUser(participant.userId)}
									/>
									<span class="player-color" aria-hidden="true"></span>
									<span>
										<strong
											>{participant.displayName ||
												($appLocale === 'en' ? 'Player' : 'Jogador')}</strong
										>
										{#if participant.character?.sheet?.name}<small
												>{participant.character.sheet.name}</small
											>{/if}
									</span>
								</label>
							{/each}
						{:else}
							<p class="permission-empty">
								{$appLocale === 'en'
									? 'No players have joined this campaign yet.'
									: 'Nenhum jogador entrou nesta mesa ainda.'}
							</p>
						{/if}
					</div>
					{#if model.kind === 'access'}
						<p class="permission-hint">
							{model.selectedUserIds.length === 0
								? $appLocale === 'en'
									? 'No selected players means only the GM can see it.'
									: 'Sem jogadores selecionados, somente o narrador verá.'
								: $appLocale === 'en'
									? `${model.selectedUserIds.length} player(s) selected.`
									: `${model.selectedUserIds.length} jogador(es) selecionado(s).`}
						</p>
					{/if}
				{:else if model.kind === 'access'}
					<p class="permission-hint">
						{$appLocale === 'en'
							? 'Every current and future player in this campaign can see it.'
							: 'Todos os jogadores atuais e futuros desta mesa poderão ver.'}
					</p>
				{/if}

				{#if model.kind === 'presentation'}
					<label class="presentation-overlay-option">
						<input
							type="checkbox"
							checked={model.overlayVisible}
							onchange={(event) => actions.setOverlayVisible(event.currentTarget.checked)}
						/>
						{$appLocale === 'en'
							? 'Also show in the OBS overlay'
							: 'Também exibir na overlay do OBS'}
					</label>
				{/if}
			{/if}

			<footer>
				<button
					class="secondary-button"
					onclick={actions.close}
					disabled={model.kind === 'access' && model.saving}
				>
					{$appLocale === 'en' ? 'Cancel' : 'Cancelar'}
				</button>
				{#if model.kind === 'access'}
					<button
						class="primary-button"
						onclick={actions.saveAccess}
						disabled={model.loading || model.saving}
					>
						{model.saving
							? $appLocale === 'en'
								? 'Saving…'
								: 'Salvando…'
							: $appLocale === 'en'
								? 'Save access'
								: 'Salvar acesso'}
					</button>
				{:else}
					<button
						class="primary-button"
						onclick={actions.confirmPresentation}
						disabled={model.loading}
					>
						{$appLocale === 'en' ? 'Show' : 'Exibir'}
					</button>
				{/if}
			</footer>
		</dialog>
	</div>
{/if}

<style>
	.permission-backdrop {
		position: fixed;
		z-index: 1100;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #080608cc;
		backdrop-filter: blur(5px);
	}
	.permission-dialog {
		position: relative;
		inset: auto;
		margin: 0;
		width: min(100%, 480px);
		max-height: min(80dvh, 680px);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow: hidden;
		padding: 1.1rem;
		border: 1px solid #5a493b;
		border-radius: 12px;
		color: #eee4d6;
		background: #211b1e;
		box-shadow: 0 22px 70px #000a;
	}
	.permission-dialog header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin: 0;
		padding: 0 0 0.8rem;
		border-bottom: 1px solid #493c39;
	}
	.permission-dialog header p {
		margin: 0 0 0.3rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}
	.permission-dialog h3 {
		margin: 0;
		font:
			600 1.25rem Georgia,
			serif;
	}
	.permission-dialog header span {
		display: block;
		max-width: 370px;
		margin-top: 0.35rem;
		overflow: hidden;
		color: #b9aa9d;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dialog-close {
		width: 2rem;
		height: 2rem;
		border: 1px solid #5a493b;
		border-radius: 6px;
		color: #edc77f;
		background: #171316;
		font-size: 1.2rem;
		cursor: pointer;
	}
	.permission-modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.permission-modes label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.7rem;
		padding: 0.55rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		color: #d8c9b9;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.permission-roster {
		display: grid;
		gap: 0.35rem;
		max-height: 36dvh;
		overflow: auto;
		padding-right: 0.2rem;
	}
	.player-option {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
		padding: 0.6rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		background: #171316;
		cursor: pointer;
	}
	.player-option span:last-child {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.player-option strong,
	.player-option small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.player-option small {
		color: #a99c91;
	}
	.player-color {
		width: 0.65rem;
		height: 0.65rem;
		flex: 0 0 auto;
		border-radius: 50%;
		background: #d8ad67;
	}
	.permission-empty,
	.permission-hint {
		margin: 0;
		color: #b9aa9d;
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.presentation-overlay-option {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: #e8d9c8;
		font-size: 0.82rem;
	}
	.permission-dialog footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.7rem;
		border-top: 1px solid #493c39;
	}
	.permission-dialog footer button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}
	.secondary-button {
		color: #edc77f;
		background: #2b211e;
	}
	.primary-button {
		border-color: #e0b86f !important;
		color: #26190e;
		background: #e0b86f;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
	@media (max-width: 650px) {
		.permission-modes {
			grid-template-columns: 1fr;
		}
	}
</style>
