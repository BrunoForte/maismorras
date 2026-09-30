<script lang="ts">
	let {
		profiles,
		activeProfile,
		canDelete,
		onSelect,
		onDuplicate,
		onRename,
		onDelete
	}: {
		profiles: string[];
		activeProfile: string;
		canDelete: boolean;
		onSelect: (name: string) => void;
		onDuplicate: () => void;
		onRename: () => void;
		onDelete: () => void;
	} = $props();
</script>

<div class="profile-bar" aria-label="Perfis de layout">
	<label
		>Perfil ativo<select
			value={activeProfile}
			onchange={(event) => onSelect(event.currentTarget.value)}
		>
			{#each profiles as name (name)}<option value={name}>{name}</option>{/each}
		</select></label
	>
	<button class="secondary-button" onclick={onDuplicate}>Duplicar</button>
	<button class="secondary-button" onclick={onRename}>Renomear</button>
	<button class="secondary-button danger" onclick={onDelete} disabled={!canDelete}>Excluir</button>
</div>

<style>
	.profile-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.45rem;
		margin: 0.8rem 0;
	}
	.profile-bar label {
		display: grid;
		gap: 0.2rem;
		color: #b9aa9b;
		font-size: 0.68rem;
	}
	.profile-bar select {
		box-sizing: border-box;
		max-width: 100%;
		min-width: 10rem;
		border: 1px solid #51443a;
		border-radius: 6px;
		padding: 0.4rem;
		color: #eee4d6;
		background: #211c1e;
	}
	.profile-bar .danger {
		color: #efaaa0;
	}
	.profile-bar button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.75rem;
		color: #edc77f;
		background: #2b211e;
		font: inherit;
		font-size: 0.74rem;
		font-weight: 750;
		cursor: pointer;
	}
	.profile-bar button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.profile-bar .danger {
		border-color: #8f5049;
		background: rgba(105, 45, 34, 0.22);
	}
	.profile-bar .danger:hover:not(:disabled) {
		border-color: #d77c6f;
		background: rgba(105, 45, 34, 0.42);
	}
	.profile-bar button:focus-visible {
		outline: 2px solid #f0cb85;
		outline-offset: 2px;
	}
</style>
