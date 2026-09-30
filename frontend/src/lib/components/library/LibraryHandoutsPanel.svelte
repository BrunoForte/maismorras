<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import type { LibraryHandout, LibraryHandoutActions, LibraryHandoutEditor } from './libraryTypes';
	let {
		handouts,
		isGM,
		editor,
		actions
	}: {
		handouts: readonly LibraryHandout[];
		isGM: boolean;
		editor: LibraryHandoutEditor;
		actions: LibraryHandoutActions;
	} = $props();
</script>

<section
	class="handouts"
	aria-label={$appLocale === 'en' ? 'Campaign handouts' : 'Handouts da campanha'}
>
	{#if editor.open && isGM}
		<form
			class="handout-form"
			onsubmit={(event) => {
				event.preventDefault();
				actions.save();
			}}
		>
			<input
				value={editor.title}
				maxlength="120"
				placeholder={$appLocale === 'en' ? 'Handout title' : 'Título do handout'}
				oninput={(event) => actions.changeTitle(event.currentTarget.value)}
			/>
			<textarea
				value={editor.body}
				maxlength="32000"
				placeholder={$appLocale === 'en'
					? 'Text, links, and guidance for the table'
					: 'Texto, links e orientações para a mesa'}
				oninput={(event) => actions.changeBody(event.currentTarget.value)}></textarea>
			<fieldset class="handout-audience">
				<legend
					>{$appLocale === 'en'
						? 'Who can see this handout?'
						: 'Quem pode ver este handout?'}</legend
				>
				<label>
					<input
						type="radio"
						name="handout-audience"
						value="all"
						checked={editor.audience === 'all'}
						onchange={() => actions.changeAudience('all')}
					/>
					{$appLocale === 'en' ? 'All players' : 'Todos os jogadores'}
				</label>
				<label>
					<input
						type="radio"
						name="handout-audience"
						value="selected"
						checked={editor.audience === 'selected'}
						onchange={() => actions.changeAudience('selected')}
					/>
					{$appLocale === 'en' ? 'Selected players' : 'Jogadores selecionados'}
				</label>
				<label>
					<input
						type="radio"
						name="handout-audience"
						value="gm"
						checked={editor.audience === 'gm'}
						onchange={() => actions.changeAudience('gm')}
					/>
					{$appLocale === 'en' ? 'Game master only' : 'Somente narrador'}
				</label>
				{#if editor.audience === 'selected'}
					<div class="handout-player-list">
						{#if editor.participants.length}
							{#each editor.participants as participant (participant.userId)}
								<label>
									<input
										type="checkbox"
										checked={editor.userIds.includes(participant.userId)}
										onchange={() => actions.toggleUser(participant.userId)}
									/>
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
							<small
								>{$appLocale === 'en'
									? 'No players have joined this campaign yet.'
									: 'Nenhum jogador entrou nesta mesa ainda.'}</small
							>
						{/if}
					</div>
				{/if}
			</fieldset>
			<div class="handout-form-actions">
				<button disabled={editor.saving}>
					{editor.saving
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: $appLocale === 'en'
							? 'Save handout'
							: 'Salvar handout'}
				</button>
			</div>
		</form>
	{/if}

	<h3>Handouts</h3>
	{#if handouts.length}
		<div class="handout-grid">
			{#each handouts as handout (handout.id)}
				<article>
					<small>
						{handout.visibility === 'players'
							? $appLocale === 'en'
								? 'Shared'
								: 'Compartilhado'
							: $appLocale === 'en'
								? 'Private'
								: 'Privado'}
					</small>
					<h4>{handout.title}</h4>
					<p>{handout.body || ($appLocale === 'en' ? 'No text.' : 'Sem texto.')}</p>
					{#if isGM}
						<div class="handout-actions">
							<button onclick={() => actions.edit(handout)}
								>{$appLocale === 'en' ? 'Edit' : 'Editar'}</button
							>
							<button onclick={() => actions.manageAccess(handout)}
								>{$appLocale === 'en' ? 'Players' : 'Acesso'}</button
							>
							<button onclick={() => actions.delete(handout)}
								>{$appLocale === 'en' ? 'Delete' : 'Excluir'}</button
							>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}
		<p class="empty-handouts">
			{$appLocale === 'en'
				? 'No handouts have been saved for this campaign.'
				: 'Nenhum handout salvo nesta campanha.'}
		</p>
	{/if}
</section>

<style>
	.handouts {
		margin: 0 0 1.4rem;
	}
	.handouts h3 {
		margin: 0 0 0.7rem;
		color: #d8ad67;
		font:
			0.8rem Georgia,
			serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.handout-form {
		display: grid;
		gap: 0.6rem;
		margin: 0 0 1.2rem;
		padding: 1rem;
		border: 1px solid #5a493b;
		border-radius: 10px;
		background: #211b1e;
	}
	.handout-form input:not([type='checkbox']):not([type='radio']),
	.handout-form textarea {
		border: 1px solid #5a493b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eee4d6;
		background: #121012;
		font: inherit;
	}
	.handout-form textarea {
		min-height: 100px;
		resize: vertical;
	}
	.handout-audience {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 8px;
	}
	.handout-audience legend {
		padding: 0 0.25rem;
		color: #d8ad67;
		font-size: 0.8rem;
	}
	.handout-audience > label,
	.handout-player-list > label {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.handout-audience input[type='checkbox'],
	.handout-audience input[type='radio'] {
		width: auto;
		margin: 0;
		accent-color: #d8ad67;
	}
	.handout-player-list {
		display: grid;
		gap: 0.4rem;
		max-height: 9rem;
		overflow: auto;
		padding: 0.55rem;
		border-left: 2px solid #80603b;
	}
	.handout-player-list span {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.handout-player-list small {
		color: #ad9e91;
	}
	.handout-form-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.handout-form button {
		border: 0;
		border-radius: 7px;
		padding: 0.52rem 0.7rem;
		color: #26190e;
		background: #e0b86f;
		font-weight: 750;
		cursor: pointer;
	}
	.handout-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.7rem;
	}
	.handout-grid article {
		min-width: 0;
		padding: 0.85rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		background: #211b1e;
	}
	.handout-grid small {
		color: #d8ad67;
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.handout-grid h4 {
		margin: 0.35rem 0;
		color: #eee4d6;
		font:
			600 1rem Georgia,
			serif;
	}
	.handout-grid p {
		color: #b9aa9d;
		white-space: pre-wrap;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.handout-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.7rem;
	}
	.handout-actions button {
		border: 1px solid #5a493b;
		border-radius: 5px;
		padding: 0.35rem 0.5rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.handout-actions button:hover {
		border-color: #d8ad67;
		background: #3a2920;
	}
	.empty-handouts {
		padding: 0.9rem;
		border: 1px dashed #5a493b;
		border-radius: 8px;
		color: #a99c91;
		font-size: 0.82rem;
	}
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
</style>
