<script lang="ts">
	import type { Spell } from '$lib/services/characterApi';
	import type {
		SpellbookProjection,
		SpellPresentation,
		SpellTabActions
	} from '$lib/utils/character/characterSpellRules';
	import { appLocale } from '$lib/stores/locale';

	let {
		newSpellName,
		newSpellLevel,
		expandedSpell,
		isGM,
		castingSpell,
		spellbook,
		presentation,
		actions
	}: {
		newSpellName: string;
		newSpellLevel: number;
		expandedSpell: number | null;
		isGM: boolean;
		castingSpell: number | null;
		spellbook: SpellbookProjection;
		presentation: SpellPresentation;
		actions: SpellTabActions;
	} = $props();
</script>

<section>
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Spells' : 'Magias'}</h3>
	</div>
	<div class="compendium-picker spell-picker">
		<select
			value={newSpellLevel}
			aria-label={$appLocale === 'en' ? 'Manual spell circle' : 'Círculo da magia manual'}
			onchange={(event) => actions.setNewSpellLevel(Number(event.currentTarget.value))}
		>
			{#each spellbook.addableCircles() as level (level)}<option value={level}
					>{presentation.circleLabel(level)}</option
				>{/each}
		</select>
		<input
			value={newSpellName}
			list="spell-suggestions"
			placeholder={$appLocale === 'en'
				? 'Search or type a spell name'
				: 'Busque ou digite o nome da magia'}
			aria-label={$appLocale === 'en' ? 'Spell name' : 'Nome da magia'}
			oninput={(event) => actions.setNewSpellName(event.currentTarget.value)}
		/>
		<datalist id="spell-suggestions">
			{#each spellbook.entriesForCircle(newSpellLevel) as entry (entry.id)}<option
					value={presentation.optionLabel(entry)}
				></option>{/each}
		</datalist>
		<button type="button" onclick={actions.add} disabled={!newSpellName.trim()}>
			+ {$appLocale === 'en' ? 'Add' : 'Adicionar'}
		</button>
	</div>
	{#each spellbook.availableCircles() as circle (circle)}
		<section class="spell-circle">
			<header>
				<div>
					<h4>{presentation.circleLabel(circle)}</h4>
					<small>
						{#if circle > 0}
							<strong>{spellbook.slotForCircle(circle)?.current ?? 0}</strong> / {spellbook.slotForCircle(
								circle
							)?.max ?? 0}
							{$appLocale === 'en' ? 'slots' : 'espaços'}
						{:else}{$appLocale === 'en' ? 'Always available' : 'Sempre disponíveis'}{/if}
					</small>
				</div>
			</header>
			{#if spellbook.spellsForCircle(circle).length}
				{#each spellbook.spellsForCircle(circle) as { spell, index } (index)}
					<article class="spell-card">
						<button
							class="spell-toggle"
							type="button"
							aria-expanded={expandedSpell === index}
							onclick={() => actions.setExpandedSpell(expandedSpell === index ? null : index)}
						>
							<strong
								>{presentation.displayName(spell) ||
									($appLocale === 'en' ? 'Unnamed spell' : 'Magia sem nome')}</strong
							>
							<span
								>{presentation.circleLabel(spell.level)} · {expandedSpell === index
									? '⌃'
									: '⌄'}</span
							>
						</button>
						{#if expandedSpell === index}
							<div class="spell-details">
								<label
									>{$appLocale === 'en' ? 'Spell source' : 'Origem da magia'}
									<select
										value={spell.origin ?? 'class'}
										onchange={(event) =>
											actions.change(index, {
												origin: event.currentTarget.value as Spell['origin']
											})}
									>
										<option value="class">{$appLocale === 'en' ? 'Class' : 'Classe'}</option>
										<option value="species"
											>{$appLocale === 'en' ? 'Species / race' : 'Raça'}</option
										>
										<option value="feat">{$appLocale === 'en' ? 'Feat' : 'Talento'}</option>
									</select>
								</label>
								<label
									>{$appLocale === 'en' ? 'Spell name' : 'Nome da magia'}
									<input
										value={spell.name}
										oninput={(event) => actions.change(index, { name: event.currentTarget.value })}
									/>
								</label>
								<label
									>{$appLocale === 'en' ? 'Dice expression' : 'Dados de efeito'}
									<input
										value={spell.diceFormula ?? ''}
										placeholder="Ex.: 6d6"
										oninput={(event) =>
											actions.change(index, { diceFormula: event.currentTarget.value })}
									/>
								</label>
								{#if !spell.entryId}
									<div class="custom-spell-scaling">
										<label>
											<input
												type="checkbox"
												checked={(spell.scalingDicePerLevel ?? 0) > 0}
												onchange={(event) =>
													actions.change(index, {
														scalingDicePerLevel: event.currentTarget.checked
															? Math.max(1, spell.scalingDicePerLevel ?? 0)
															: 0
													})}
												disabled={!spell.diceFormula?.trim()}
											/>
											{$appLocale === 'en'
												? 'Calculate extra damage when using a higher slot'
												: 'Calcular aumento ao usar espaço de nível superior'}
										</label>
										{#if (spell.scalingDicePerLevel ?? 0) > 0}
											<label
												>{$appLocale === 'en'
													? 'Extra dice per slot level'
													: 'Dados extras por nível do espaço'}
												<input
													type="number"
													min="1"
													max="10"
													value={spell.scalingDicePerLevel}
													oninput={(event) =>
														actions.change(index, {
															scalingDicePerLevel: Number(event.currentTarget.value)
														})}
												/>
											</label>
											<small
												>{$appLocale === 'en'
													? 'Uses the same die size as the base damage formula.'
													: 'Usa o mesmo tipo de dado da fórmula de dano base.'}</small
											>
										{/if}
									</div>
								{/if}
								{#if spell.entryId}
									<section class="spell-lore" aria-label="Descrição da magia">
										{#if presentation.hasAITranslation(spell)}<small>Tradução livre (IA)</small
											>{/if}
										<p>
											{presentation.description(spell) || 'Descrição não cadastrada no compêndio.'}
										</p>
										{#if presentation.higherLevels(spell)}<h5>
												{$appLocale === 'en' ? 'At higher levels' : 'Em níveis mais altos'}
											</h5>
											<p>{presentation.higherLevels(spell)}</p>{/if}
									</section>
								{:else}
									<label class="spell-description-field"
										>{$appLocale === 'en' ? 'Description' : 'Descrição'}
										<textarea
											value={spell.description ?? ''}
											rows="4"
											oninput={(event) =>
												actions.change(index, { description: event.currentTarget.value })}
										></textarea>
									</label>
									<label class="spell-description-field"
										>{$appLocale === 'en' ? 'At higher levels' : 'Em níveis mais altos'}
										<textarea
											value={spell.higherLevels ?? ''}
											rows="2"
											oninput={(event) =>
												actions.change(index, { higherLevels: event.currentTarget.value })}
										></textarea>
									</label>
								{/if}
								<label class="spell-description-field"
									>{$appLocale === 'en' ? 'Notes' : 'Notas'}
									<textarea
										value={spell.notes}
										rows="2"
										oninput={(event) => actions.change(index, { notes: event.currentTarget.value })}
									></textarea>
								</label>
								<div class="spell-actions">
									{#if isGM}<button type="button" onclick={() => actions.present(spell)}
											>{$appLocale === 'en' ? 'Show to table' : 'Destacar na tela'}</button
										>{/if}
									{#if spell.diceFormula?.trim() && spell.level === 0}<button
											type="button"
											onclick={() => actions.rollEffect(spell)}
											>🎲 {$appLocale === 'en' ? 'Roll effect' : 'Rolar efeito'}</button
										>{/if}
									{#if spell.level > 0}
										<select
											value={spellbook.selectedSlot(spell, index)}
											onchange={(event) =>
												actions.chooseSlot(index, Number(event.currentTarget.value))}
											aria-label="Espaço de magia"
										>
											{#each spellbook.compatibleSlots(spell) as slot (slot.level)}<option
													value={slot.level}
													>{presentation.circleLabel(slot.level)} · {slot.current}/{slot.max}</option
												>{/each}
										</select>
										<button
											class="cast-spell"
											type="button"
											disabled={castingSpell === index || !spellbook.compatibleSlots(spell).length}
											onclick={() => actions.cast(spell, index)}
											>{castingSpell === index
												? '…'
												: $appLocale === 'en'
													? 'Cast'
													: 'Lançar'}</button
										>
									{/if}
									<button type="button" onclick={() => actions.remove(index)}
										>{$appLocale === 'en' ? 'Remove' : 'Remover'}</button
									>
								</div>
							</div>
						{/if}
					</article>
				{/each}
			{:else}
				<p>
					{$appLocale === 'en'
						? `No ${circle === 0 ? 'cantrips' : `level ${circle} spells`} added.`
						: `Nenhuma ${circle === 0 ? 'magia' : 'magia deste círculo'} adicionada.`}
				</p>
			{/if}
		</section>
	{/each}
</section>

<style>
	.spell-circle {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.75rem;
		background: #171417;
	}
	.spell-circle header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.spell-circle h4 {
		margin: 0;
		color: #f0cb85;
		font:
			600 0.9rem Georgia,
			serif;
	}
	.spell-circle small {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: #a99c91;
		font-size: 0.68rem;
	}
	.spell-circle p {
		margin: 0;
		color: #8f8378;
		font-size: 0.72rem;
		font-style: italic;
	}
	.spell-card {
		min-width: 0;
		border: 1px solid #3d3334;
		border-radius: 7px;
		background: #1c191b;
		overflow: hidden;
	}
	.spell-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 0;
		padding: 0.7rem 0.8rem;
		color: #e8d8c2;
		background: transparent;
		text-align: left;
	}
	.spell-toggle span {
		color: #b99a68;
		font-size: 0.72rem;
		white-space: nowrap;
	}
	.spell-details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		border-top: 1px solid #3d3334;
		padding: 0.75rem;
	}
	.spell-lore {
		grid-column: 1 / -1;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.8rem 0.9rem;
		color: #e8ddcd;
		background: linear-gradient(145deg, #201b1b, #171417);
		white-space: pre-line;
	}
	.spell-lore p {
		margin: 0.35rem 0 0;
		line-height: 1.55;
	}
	.spell-lore h5 {
		margin: 0.85rem 0 0;
		color: #e8c985;
	}
	.spell-lore small {
		color: #cbd9ff;
	}
	.spell-details label {
		min-width: 0;
		display: grid;
		gap: 0.3rem;
		color: #bcae9f;
		font-size: 0.7rem;
	}
	.spell-details input,
	.spell-details select,
	.spell-details textarea {
		width: 100%;
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.55rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
		font-size: 0.82rem;
		resize: vertical;
	}
	.custom-spell-scaling {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		border: 1px solid #493c39;
		border-radius: 7px;
		padding: 0.65rem;
		background: #171417;
	}
	.custom-spell-scaling label:first-child {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.custom-spell-scaling input[type='checkbox'] {
		width: 1rem;
		margin: 0;
		accent-color: #c89655;
	}
	.custom-spell-scaling label:not(:first-child) {
		max-width: 16rem;
	}
	.custom-spell-scaling small {
		color: #a99c91;
		font-size: 0.68rem;
	}
	.spell-description-field {
		grid-column: 1 / -1;
	}
	.spell-actions {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.spell-actions button,
	.spell-actions select {
		min-height: 2.25rem;
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.45rem 0.65rem;
		color: #e8c786;
		background: #2a211e;
		font: inherit;
		font-size: 0.75rem;
	}
	.compendium-picker {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
		margin-bottom: 0.55rem;
	}
	.spell-picker {
		grid-template-columns: 130px minmax(0, 1fr) auto;
	}
	.compendium-picker select,
	.compendium-picker input {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.5rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.compendium-picker button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-title h3 {
		margin-bottom: 0.55rem;
		color: #e7c98c;
		font-size: 1rem;
	}
	@media (max-width: 520px) {
		.spell-details,
		.spell-picker {
			grid-template-columns: 1fr;
		}
		.spell-description-field,
		.spell-actions {
			grid-column: auto;
		}
	}
</style>
