<script lang="ts">
	import type { NPC } from '$lib/services/npcApi';
	import type { CreatureSheet } from '$lib/utils/bestiary/bestiaryRules';
	let {
		name = $bindable(''),
		sheet = $bindable<CreatureSheet>(),
		selected,
		saving,
		placing,
		locale,
		onSave,
		onAddTrait,
		onRemoveTrait,
		onAddAction,
		onRemoveAction,
		onPlace
	}: {
		name?: string;
		sheet?: CreatureSheet;
		selected: NPC | null;
		saving: boolean;
		placing: boolean;
		locale: string;
		onSave: () => void;
		onAddTrait: () => void;
		onRemoveTrait: (index: number) => void;
		onAddAction: () => void;
		onRemoveAction: (index: number) => void;
		onPlace: () => void;
	} = $props();
	const english = $derived(locale === 'en');
</script>

<div class="editor-head">
	<h3>
		{selected
			? english
				? 'Edit creature'
				: 'Editar criatura'
			: english
				? 'New private creature'
				: 'Nova criatura privada'}
	</h3>
	<span
		>{selected
			? 'As mudanças afetam novos tokens; tokens já na mesa mantêm o estado atual.'
			: 'Registre uma ficha compacta e utilizável em combate.'}</span
	>
</div>
<form
	onsubmit={(event) => {
		event.preventDefault();
		onSave();
	}}
>
	<div class="grid">
		<label
			>Nome<input bind:value={name} maxlength="120" placeholder="Ex.: Sentinela da teia" /></label
		>
		<label
			>Tipo<input
				bind:value={sheet.creatureType}
				maxlength="80"
				placeholder="Ex.: Humanoide"
			/></label
		>
		<label>ND<input bind:value={sheet.challenge} maxlength="20" placeholder="Ex.: 2" /></label>
		<label
			>Deslocamento<input
				bind:value={sheet.speed}
				maxlength="80"
				placeholder="Ex.: 9 m, escalada 9 m"
			/></label
		>
		<label
			>PV máximo<input bind:value={sheet.hitPointsMax} type="number" min="1" max="9999" /></label
		>
		<label
			>PV atual<input
				bind:value={sheet.hitPointsCurrent}
				type="number"
				min="0"
				max={sheet.hitPointsMax}
			/></label
		>
		<label>CA<input bind:value={sheet.armorClass} type="number" min="0" max="99" /></label>
		<label>Iniciativa<input bind:value={sheet.initiative} type="number" /></label>
		<label>Tamanho no grid<input bind:value={sheet.size} type="number" min="1" max="6" /></label>
		<label class="wide"
			>URL da miniatura<input
				bind:value={sheet.imageUrl}
				type="url"
				placeholder="URL pública do Supabase Storage"
			/></label
		>
	</div>
	<h4>Atributos</h4>
	<div class="abilities">
		<label>FOR<input bind:value={sheet.abilities.strength} type="number" min="0" max="30" /></label>
		<label>DES<input bind:value={sheet.abilities.dexterity} type="number" min="0" max="30" /></label
		>
		<label
			>CON<input bind:value={sheet.abilities.constitution} type="number" min="0" max="30" /></label
		>
		<label
			>INT<input bind:value={sheet.abilities.intelligence} type="number" min="0" max="30" /></label
		>
		<label>SAB<input bind:value={sheet.abilities.wisdom} type="number" min="0" max="30" /></label>
		<label>CAR<input bind:value={sheet.abilities.charisma} type="number" min="0" max="30" /></label>
	</div>
	<div class="grid">
		<label
			>Resistências<input
				value={sheet.resistances.join(', ')}
				onchange={(event) =>
					(sheet.resistances = event.currentTarget.value
						.split(',')
						.map((item) => item.trim())
						.filter(Boolean))}
				placeholder="fogo, veneno"
			/></label
		>
		<label
			>Imunidades<input
				value={sheet.immunities.join(', ')}
				onchange={(event) =>
					(sheet.immunities = event.currentTarget.value
						.split(',')
						.map((item) => item.trim())
						.filter(Boolean))}
				placeholder="amedrontado"
			/></label
		>
		<label>Senses<input bind:value={sheet.senses} placeholder="visão no escuro 18 m" /></label>
		<label
			>{english ? 'Languages' : 'Idiomas'}<input
				bind:value={sheet.languages}
				placeholder={english ? 'Undercommon' : 'Subcomum'}
			/></label
		>
	</div>
	<div class="block">
		<div>
			<h4>{english ? 'Traits' : 'Traços'}</h4>
			<button type="button" onclick={onAddTrait}>+ {english ? 'Trait' : 'Traço'}</button>
		</div>
		{#each sheet.traits as trait, index (index)}<article>
				<input bind:value={trait.name} placeholder={english ? 'Trait name' : 'Nome do traço'} />
				<textarea bind:value={trait.description} placeholder="Resumo próprio do efeito"></textarea>
				<button
					type="button"
					aria-label={english ? 'Remove trait' : 'Remover traço'}
					onclick={() => onRemoveTrait(index)}>×</button
				>
			</article>{/each}
	</div>
	<div class="block">
		<div>
			<h4>{english ? 'Actions' : 'Ações'}</h4>
			<button type="button" onclick={onAddAction}>+ {english ? 'Action' : 'Ação'}</button>
		</div>
		{#each sheet.actions as action, index (index)}<article class="action">
				<input bind:value={action.name} placeholder={english ? 'Name' : 'Nome'} />
				<select bind:value={action.kind}
					><option value="action">Ação</option><option value="bonus">Ação bônus</option><option
						value="reaction">Reação</option
					></select
				>
				<input bind:value={action.toHit} type="number" placeholder="Acerto" />
				<input bind:value={action.damage} placeholder="Dano, ex.: 2d6 veneno" />
				<input bind:value={action.range} placeholder="Alcance" />
				<input bind:value={action.saveDC} type="number" min="0" placeholder="CD" />
				<textarea bind:value={action.description} placeholder="Resumo próprio e objetivo"
				></textarea>
				<button
					type="button"
					aria-label={english ? 'Remove action' : 'Remover ação'}
					onclick={() => onRemoveAction(index)}>×</button
				>
			</article>{/each}
	</div>
	<div class="footer">
		<button class="primary" disabled={saving}
			>{saving
				? english
					? 'Saving…'
					: 'Salvando…'
				: selected
					? english
						? 'Save changes'
						: 'Salvar alterações'
					: english
						? 'Add to bestiary'
						: 'Adicionar ao bestiário'}</button
		>
		{#if selected}<button type="button" class="place" onclick={onPlace} disabled={placing}
				>{placing
					? english
						? 'Adding…'
						: 'Adicionando…'
					: english
						? 'Add to scene'
						: 'Adicionar à cena'}</button
			>{/if}
	</div>
</form>

<style>
	.editor-head {
		margin-bottom: 1rem;
	}
	.editor-head span {
		color: #a99c91;
		font-size: 0.8rem;
	}
	h3,
	h4 {
		margin: 0 0 0.35rem;
		font:
			600 1rem Georgia,
			serif;
	}
	h4 {
		margin-top: 1.2rem;
		color: #d8ad67;
		font-size: 0.83rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.grid label,
	.abilities label {
		display: grid;
		gap: 0.25rem;
		color: #b9aa9d;
		font-size: 0.67rem;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.grid input,
	.abilities input,
	.block input,
	.block textarea,
	.block select {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.5rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
	}
	.abilities {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.45rem;
	}
	.block {
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid #493c39;
	}
	.block > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.block > div h4 {
		margin: 0;
	}
	.block > div button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.35rem 0.5rem;
		color: #edc77f;
		background: #2b211e;
		font-size: 0.67rem;
		font-weight: 750;
		cursor: pointer;
	}
	.block article {
		display: grid;
		grid-template-columns: 170px 1fr auto;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}
	.block textarea {
		min-height: 48px;
		resize: vertical;
	}
	.action {
		grid-template-columns: 1.2fr 0.8fr 0.55fr 1.2fr 0.8fr 0.55fr auto !important;
	}
	.action textarea {
		grid-column: 1 / -2;
	}
	.block article > button {
		border: 0;
		color: #d7b3a5;
		background: transparent;
		font-size: 1.1rem;
	}
	.footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}
	.footer button {
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.52rem 0.7rem;
		color: #edc77f;
		background: #2b211e;
		font-weight: 750;
		cursor: pointer;
	}
	.footer .primary {
		border: 0;
		color: #26190e;
		background: #e0b86f;
	}
	@media (max-width: 750px) {
		.abilities {
			grid-template-columns: repeat(3, 1fr);
		}
		.action,
		.block article {
			grid-template-columns: 1fr 1fr !important;
		}
		.action textarea {
			grid-column: 1 / -1;
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.wide {
			grid-column: auto;
		}
	}
</style>
