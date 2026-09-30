<script lang="ts">
	import { appLocale } from '$lib/stores/locale';
	import type { CompendiumSource } from '$lib/services/compendiumApi';
	import {
		COMPENDIUM_ENTRY_TYPES,
		type CompendiumEditorModel,
		type CompendiumEntryType
	} from '$lib/utils/compendium/compendiumRules';

	let {
		model = $bindable<CompendiumEditorModel>(),
		sources,
		typeName,
		isGM,
		editing,
		busy,
		actions
	}: {
		model: CompendiumEditorModel;
		sources: CompendiumSource[];
		typeName: (value: string) => string;
		isGM: boolean;
		editing: boolean;
		busy: { saving: boolean; importing: boolean; uploadingArt: boolean };
		actions: {
			save: () => void;
			cancel: () => void;
			downloadTemplate: () => void;
			importFile: (event: Event) => void;
			uploadArt: (event: Event) => void;
			addFeature: () => void;
			removeFeature: (id: string) => void;
		};
	} = $props();

	const types = COMPENDIUM_ENTRY_TYPES;
	const updateEntryType = (value: string) => {
		model.entryType = value as CompendiumEntryType;
	};
</script>

{#if isGM}<section class="assistant">
		<div class="assistant-copy">
			<p>ASSISTENTE DO NARRADOR</p>
			<h3>Cadastro privado estruturado</h3>
			<span
				>Escolha o tipo. O formulário pede só os dados que a mesa consegue usar — e o JSON exportado
				vira um modelo para importar lotes do mesmo tipo.</span
			>
		</div>
		<div class="form">
			<select bind:value={model.sourceId} aria-label="Fonte privada">
				{#each sources as source (source.id)}<option value={source.id}>{source.title}</option
					>{/each}
			</select>
			<select
				value={model.entryType}
				onchange={(event) => updateEntryType(event.currentTarget.value)}
			>
				{#each types as [value] (value)}<option {value}>{typeName(value)}</option>{/each}
			</select>
			<input
				bind:value={model.name}
				maxlength="120"
				placeholder={$appLocale === 'en' ? 'Name' : 'Nome'}
			/>
			<input
				bind:value={model.portugueseName}
				maxlength="120"
				placeholder={$appLocale === 'en'
					? 'Portuguese name (optional)'
					: 'Nome em português (opcional)'}
			/>
			{#if model.entryType === 'other'}
				<select bind:value={model.category}>
					<option value="monster">{$appLocale === 'en' ? 'Monster' : 'Monstro'}</option>
					<option value="vehicle">{$appLocale === 'en' ? 'Vehicle' : 'Veículo'}</option>
					<option value="hazard">Perigo</option>
					<option value="other">Outro</option>
				</select>
				{#if model.category === 'monster'}
					<input bind:value={model.hpMax} type="number" min="1" placeholder="PV máximo" />
					<input bind:value={model.armorClass} type="number" min="0" placeholder="CA" />
					<input bind:value={model.size} type="number" min="1" max="6" placeholder="Tamanho" />
					<input bind:value={model.initiative} type="number" placeholder="Iniciativa" />
					<input
						bind:value={model.imageUrl}
						type="text"
						placeholder="URL ou caminho em campaign-assets (opcional)"
					/>
					<label class="file monster-image-file">
						<input
							type="file"
							accept="image/*"
							onchange={actions.uploadArt}
							disabled={busy.uploadingArt}
						/>
						{$appLocale === 'en'
							? busy.uploadingArt
								? 'Optimizing artwork…'
								: 'Upload monster artwork'
							: busy.uploadingArt
								? 'Otimizando imagem…'
								: 'Enviar imagem do monstro'}
					</label>
					<small class="image-link-hint">
						{$appLocale === 'en'
							? 'A public URL or a relative Storage path is copied to the token when the creature enters the scene.'
							: 'Uma URL pública ou o caminho relativo do Storage é copiado ao token quando a criatura entra na cena.'}
					</small>
				{/if}
			{:else if model.entryType === 'item'}
				<select bind:value={model.category}>
					<option value="weapon">Arma</option><option value="armor">Armadura</option>
					<option value="consumable">Consumível</option><option value="tool">Ferramenta</option>
					<option value="gear">Equipamento</option>
				</select>
				<input bind:value={model.itemDamage} placeholder="Dano, ex.: 1d8 cortante" />
				<input bind:value={model.itemDefense} type="number" min="0" placeholder="Defesa / CA" />
			{:else if model.entryType === 'spell'}
				<input bind:value={model.spellLevel} type="number" min="0" max="9" placeholder="Círculo" />
				<input bind:value={model.spellClasses} placeholder="Classes, separadas por vírgula" />
			{:else if model.entryType === 'class'}
				<input
					bind:value={model.classHitDie}
					type="number"
					min="4"
					max="12"
					step="2"
					placeholder="Dado de vida"
				/>
			{:else if model.entryType === 'subclass'}
				<input bind:value={model.parentClass} placeholder="Classe-base" />
			{:else if model.entryType === 'species'}
				<input bind:value={model.speed} type="number" min="0" placeholder="Deslocamento (m)" />
			{/if}
			{#if model.entryType === 'class' || model.entryType === 'subclass'}
				<div class="level-features-editor">
					<div class="feature-editor-head">
						<strong>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</strong>
						<button class="ghost" type="button" onclick={actions.addFeature}>
							+ {$appLocale === 'en' ? 'Add feature' : 'Adicionar habilidade'}
						</button>
					</div>
					{#if model.levelFeatures.length === 0}
						<small
							>{$appLocale === 'en'
								? 'Add each feature with the level at which it unlocks.'
								: 'Adicione cada habilidade com o nível em que ela é desbloqueada.'}</small
						>
					{/if}
					{#each model.levelFeatures as feature (feature.id)}
						<div class="level-feature-row">
							<input
								type="number"
								min="1"
								max="20"
								bind:value={feature.level}
								aria-label={$appLocale === 'en' ? 'Unlock level' : 'Nível de desbloqueio'}
							/>
							<input
								bind:value={feature.name}
								placeholder={$appLocale === 'en' ? 'Feature name' : 'Nome da habilidade'}
							/>
							<textarea
								bind:value={feature.description}
								rows="2"
								placeholder={$appLocale === 'en'
									? 'Short objective description'
									: 'Descrição curta e objetiva'}></textarea>
							<button
								class="ghost"
								type="button"
								onclick={() => actions.removeFeature(feature.id)}
								aria-label={$appLocale === 'en' ? 'Remove feature' : 'Remover habilidade'}>×</button
							>
						</div>
					{/each}
				</div>
			{/if}
			<textarea
				bind:value={model.summary}
				maxlength="2000"
				placeholder={$appLocale === 'en'
					? 'Original, objective summary of how it works.'
					: 'Resumo autoral e objetivo do funcionamento.'}></textarea>
			<label
				><input type="checkbox" bind:checked={model.published} />
				{$appLocale === 'en' ? 'Visible to players' : 'Visível aos jogadores'}</label
			>
			<div class="form-actions">
				<button class="ghost" onclick={actions.downloadTemplate}>Baixar modelo JSON</button>
				<label class="file">
					<input
						type="file"
						accept="application/json"
						onchange={actions.importFile}
						disabled={busy.importing}
					/>
					{busy.importing
						? $appLocale === 'en'
							? 'Importing…'
							: 'Importando…'
						: `${$appLocale === 'en' ? 'Import' : 'Importar'} ${typeName(model.entryType)}`}
				</label>
				{#if editing}<button class="ghost" onclick={actions.cancel}
						>{$appLocale === 'en' ? 'Cancel edit' : 'Cancelar edição'}</button
					>{/if}
				<button class="primary" onclick={actions.save} disabled={busy.saving}>
					{busy.saving
						? $appLocale === 'en'
							? 'Saving…'
							: 'Salvando…'
						: editing
							? $appLocale === 'en'
								? 'Save changes'
								: 'Salvar alterações'
							: $appLocale === 'en'
								? 'Add'
								: 'Adicionar'}
				</button>
			</div>
		</div>
	</section>
{/if}

<style>
	.assistant {
		display: grid;
		grid-template-columns: minmax(190px, 0.7fr) minmax(0, 1.3fr);
		gap: 1rem;
		border: 1px solid #59483b;
		border-radius: 10px;
		padding: 1rem;
		background: linear-gradient(120deg, #241d1c, #1b171a);
	}
	.assistant-copy {
		display: grid;
		align-content: start;
		gap: 0.45rem;
	}
	.assistant-copy p {
		margin: 0;
		color: #d8ad67;
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.13em;
	}
	.assistant-copy h3 {
		margin: 0;
		color: #f0d29d;
		font:
			600 1.05rem Georgia,
			serif;
	}
	.assistant-copy span {
		color: #bcae9e;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.form input,
	.form select,
	.form textarea {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
	}
	.form textarea {
		grid-column: 1 / -1;
		min-height: 76px;
		resize: vertical;
	}
	.form > label:not(.file) {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #cbbbab;
		font-size: 0.72rem;
	}
	.form-actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
	}
	.form button,
	.file {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.48rem 0.65rem;
		color: #f0d5a3;
		background: #30241e;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.form .primary {
		border-color: #b98a4b;
		color: #2c1b0d;
		background: #e0b86f;
	}
	.form .ghost {
		background: transparent;
	}
	.file {
		position: relative;
	}
	.file input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		opacity: 0;
	}
	.image-link-hint {
		grid-column: 1 / -1;
		color: #a99c91;
		font-size: 0.66rem;
		line-height: 1.4;
	}
	.level-features-editor {
		display: grid;
		grid-column: 1 / -1;
		gap: 0.55rem;
		padding: 0.75rem;
		border: 1px solid #59483b;
		border-radius: 8px;
		background: #121015;
	}
	.feature-editor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.level-features-editor small {
		color: #a99b8d;
		font-size: 0.72rem;
	}
	.level-feature-row {
		display: grid;
		grid-template-columns: 5rem minmax(9rem, 1fr) minmax(12rem, 2fr) auto;
		gap: 0.45rem;
		align-items: start;
	}
	.level-feature-row textarea {
		resize: vertical;
		min-height: 2.5rem;
	}
	@media (max-width: 760px) {
		.assistant {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 720px) {
		.level-feature-row {
			grid-template-columns: 4.5rem 1fr auto;
		}
		.level-feature-row textarea {
			grid-column: 1 / -1;
		}
	}
</style>
