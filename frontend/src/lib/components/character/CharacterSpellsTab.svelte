<script lang="ts">
	import type { Spell } from '$lib/services/characterApi';
	import type {
		SpellbookProjection,
		SpellPresentation,
		SpellTabActions,
		SpellFeatGrantProjection
	} from '$lib/utils/character/characterSpellRules';
	import { appLocale, distanceText } from '$lib/stores/locale';
	import RpgIcon from '$lib/components/RpgIcon.svelte';

	let {
		newSpellName,
		newSpellLevel,
		expandedSpell,
		isGM,
		canDisplayCharacter = false,
		canAdjustSlots,
		canCastSpells,
		speciesSpellcastingAbility,
		hasSpeciesSpellGrants,
		castingSpell,
		spellbook,
		presentation,
		actions
	}: {
		newSpellName: string;
		newSpellLevel: number;
		expandedSpell: number | null;
		isGM: boolean;
		canDisplayCharacter?: boolean;
		canAdjustSlots: boolean;
		canCastSpells: boolean;
		speciesSpellcastingAbility: string;
		hasSpeciesSpellGrants: boolean;
		castingSpell: number | null;
		spellbook: SpellbookProjection;
		presentation: SpellPresentation;
		actions: SpellTabActions;
	} = $props();
	let pendingSlotLevels = $state<number[]>([]);
	let grantUseDrafts = $state<
		Record<string, { maxUses: number; currentUses: number; restoreOn: 'none' | 'short' | 'long' }>
	>({});
	let pendingGrantConfigs = $state<string[]>([]);
	async function adjustAvailableSlots(
		level: number,
		maximum: number,
		current: number,
		delta: -1 | 1
	) {
		if (!isGM || !canAdjustSlots || pendingSlotLevels.includes(level)) return;
		const next = current + delta;
		if (next < 0 || next > maximum) return;
		pendingSlotLevels = [...pendingSlotLevels, level];
		try {
			await actions.setAvailableSpellSlots(level, next);
		} finally {
			pendingSlotLevels = pendingSlotLevels.filter((pendingLevel) => pendingLevel !== level);
		}
	}
	function castSpellAction(
		spell: Spell,
		index: number,
		grant?: Pick<SpellFeatGrantProjection, 'id' | 'spellEntryId'>
	) {
		void actions.cast(
			spell,
			index,
			grant ? { grantId: grant.id, entryId: grant.spellEntryId, freeCast: false } : undefined
		);
	}
	function grantConfigKey(grant: { id: string; spellEntryId: string }) {
		return `${grant.id}:${grant.spellEntryId}`;
	}
	function grantSourceName(grant: SpellFeatGrantProjection) {
		if (grant.sourceKind !== 'species') return grant.featName;
		if (grant.featId === 'elven-lineage') return $appLocale === 'en' ? 'High Elf' : 'Alto Elfo';
		if (grant.featId === 'fiendish-legacy')
			return $appLocale === 'en' ? 'Abyssal Tiefling' : 'Tiefling Abissal';
		return grant.featName;
	}
	function grantRecoveryLabel(recovery: string) {
		if (recovery === 'short') return $appLocale === 'en' ? 'Short Rest' : 'Descanso curto';
		if (recovery === 'long') return $appLocale === 'en' ? 'Long Rest' : 'Descanso longo';
		return $appLocale === 'en' ? 'No recovery' : 'Sem recuperação';
	}
	function grantUseStatusLabel(grant: SpellFeatGrantProjection) {
		const useLabel =
			grant.freeCastsRemaining > 0
				? $appLocale === 'en'
					? `Free use ${grant.freeCastsRemaining}/${grant.freeCastsMax}`
					: `Uso grátis ${grant.freeCastsRemaining}/${grant.freeCastsMax}`
				: $appLocale === 'en'
					? 'Free use spent'
					: 'Uso grátis gasto';
		return `${grantSourceName(grant)} · ${useLabel} · ${grantRecoveryLabel(grant.recovery)}`;
	}
	type GrantDraft = { maxUses: number; currentUses: number; restoreOn: 'none' | 'short' | 'long' };
	function grantConfigDraft(grant: SpellFeatGrantProjection): GrantDraft {
		return (
			grantUseDrafts[grantConfigKey(grant)] ?? {
				maxUses: grant.freeCastsMax,
				currentUses: grant.freeCastsRemaining,
				restoreOn: (['none', 'short', 'long'].includes(grant.recovery)
					? grant.recovery
					: 'long') as GrantDraft['restoreOn']
			}
		);
	}
	function changeGrantDraft(grant: SpellFeatGrantProjection, changes: Partial<GrantDraft>) {
		const key = grantConfigKey(grant);
		grantUseDrafts = { ...grantUseDrafts, [key]: { ...grantConfigDraft(grant), ...changes } };
	}
	async function saveGrantConfig(grant: SpellFeatGrantProjection) {
		const key = grantConfigKey(grant);
		const draft = grantConfigDraft(grant);
		if (
			!isGM ||
			!canAdjustSlots ||
			draft.maxUses < 0 ||
			draft.maxUses > 100 ||
			draft.currentUses < 0 ||
			draft.currentUses > draft.maxUses ||
			pendingGrantConfigs.includes(key)
		)
			return;
		pendingGrantConfigs = [...pendingGrantConfigs, key];
		try {
			const saved = await actions.setSpellGrantUseConfig(
				grant.id,
				grant.spellEntryId,
				draft.maxUses,
				draft.currentUses,
				draft.restoreOn
			);
			if (saved) {
				const next = { ...grantUseDrafts };
				delete next[key];
				grantUseDrafts = next;
			}
		} finally {
			pendingGrantConfigs = pendingGrantConfigs.filter((item) => item !== key);
		}
	}
</script>

<section>
	<div class="section-title">
		<h3>{$appLocale === 'en' ? 'Spells' : 'Magias'}</h3>
	</div>
	{#if hasSpeciesSpellGrants}
		<label class="species-spell-ability">
			{$appLocale === 'en' ? 'Species spellcasting ability' : 'Atributo das magias de espécie'}
			<select
				value={speciesSpellcastingAbility}
				aria-label={$appLocale === 'en'
					? 'Species spellcasting ability'
					: 'Atributo das magias de espécie'}
				onchange={(event) => actions.setSpeciesSpellcastingAbility(event.currentTarget.value)}
			>
				<option value="">{$appLocale === 'en' ? 'Choose an ability' : 'Escolha um atributo'}</option
				>
				<option value="intelligence">{$appLocale === 'en' ? 'Intelligence' : 'Inteligência'}</option
				>
				<option value="wisdom">{$appLocale === 'en' ? 'Wisdom' : 'Sabedoria'}</option>
				<option value="charisma">{$appLocale === 'en' ? 'Charisma' : 'Carisma'}</option>
			</select>
			<small
				>{$appLocale === 'en'
					? 'Save the sheet before casting.'
					: 'Salve a ficha antes de conjurar.'}</small
			>
		</label>
	{/if}
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
							{@const slot = spellbook.slotForCircle(circle)}
							<strong>{slot?.current ?? 0}</strong> / {slot?.max ?? 0}
							{$appLocale === 'en' ? 'available / maximum' : 'disponíveis / máximo'}
							{#if isGM && slot}
								<div
									class="available-slot-control"
									role="group"
									aria-label={$appLocale === 'en'
										? `Adjust available level ${circle} spell slots`
										: `Ajustar espaços disponíveis do círculo ${circle}`}
								>
									{$appLocale === 'en' ? 'Available slots' : 'Espaços disponíveis'}
									<button
										type="button"
										class="slot-adjust-button"
										aria-label={$appLocale === 'en'
											? `Decrease available level ${circle} spell slots`
											: `Diminuir espaços disponíveis do círculo ${circle}`}
										disabled={!canAdjustSlots ||
											slot.current <= 0 ||
											pendingSlotLevels.includes(circle)}
										onclick={() => void adjustAvailableSlots(circle, slot.max, slot.current, -1)}
										>−</button
									><button
										type="button"
										class="slot-adjust-button"
										aria-label={$appLocale === 'en'
											? `Increase available level ${circle} spell slots`
											: `Aumentar espaços disponíveis do círculo ${circle}`}
										disabled={!canAdjustSlots ||
											slot.current >= slot.max ||
											pendingSlotLevels.includes(circle)}
										onclick={() => void adjustAvailableSlots(circle, slot.max, slot.current, 1)}
										>+</button
									>
								</div>
							{/if}
						{:else}{$appLocale === 'en' ? 'Always available' : 'Sempre disponíveis'}{/if}
					</small>
				</div>
			</header>
			{#if spellbook.spellsForCircle(circle).length}
				{#each spellbook.spellsForCircle(circle) as { spell, index, key, featGrants = [], origins = [] } (key ?? index)}
					{@const freeCastGrants = featGrants.filter((grant) => grant.freeUses > 0)}
					{@const atWillGrant = featGrants.find((grant) => grant.freeUses === 0)}
					{@const spellGrant = featGrants.find((grant) => grant.canUseExistingSlots)}
					<article class="spell-card">
						<button
							class="spell-toggle"
							type="button"
							aria-expanded={expandedSpell === index}
							onclick={() => actions.setExpandedSpell(expandedSpell === index ? null : index)}
						>
							<div class="spell-heading">
								<strong
									>{presentation.displayName(spell) ||
										($appLocale === 'en' ? 'Unnamed spell' : 'Magia sem nome')}</strong
								>
								{#each freeCastGrants as grant (grant.id)}
									<small class="free-cast-status" class:spent={grant.freeCastsRemaining === 0}>
										{grantUseStatusLabel(grant)}
									</small>
								{/each}
							</div>
							<span
								>{presentation.circleLabel(spell.level)} · <RpgIcon
									name={expandedSpell === index ? 'chevron-up' : 'chevron-down'}
									size={14}
								/></span
							>
						</button>
						{#if origins.length > 1 || origins[0] === 'feat' || origins[0] === 'species'}
							<small class="spell-origins"
								>{$appLocale === 'en' ? 'Sources' : 'Origens'}: {origins
									.map((origin) =>
										origin === 'feat'
											? $appLocale === 'en'
												? 'Feat'
												: 'Talento'
											: origin === 'species'
												? $appLocale === 'en'
													? 'Species'
													: 'Espécie'
												: $appLocale === 'en'
													? 'Class'
													: 'Classe'
									)
									.join(' · ')}</small
							>
						{/if}
						{#if expandedSpell === index}
							<div class="spell-details">
								{#if index >= 0}<label
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
								{/if}
								{#if index >= 0}<label
										>{$appLocale === 'en' ? 'Spell name' : 'Nome da magia'}
										<input
											value={spell.name}
											oninput={(event) =>
												actions.change(index, { name: event.currentTarget.value })}
										/>
									</label>
								{/if}
								{#if index >= 0}<label
										>{$appLocale === 'en' ? 'Dice expression' : 'Dados de efeito'}
										<input
											value={spell.diceFormula ?? ''}
											placeholder="Ex.: 6d6"
											oninput={(event) =>
												actions.change(index, { diceFormula: event.currentTarget.value })}
										/>
									</label>
								{/if}
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
											{distanceText(
												presentation.description(spell) || 'Descrição não cadastrada no compêndio.',
												$appLocale
											)}
										</p>
										{#if presentation.higherLevels(spell)}<h5>
												{$appLocale === 'en' ? 'At higher levels' : 'Em níveis mais altos'}
											</h5>
											<p>{distanceText(presentation.higherLevels(spell), $appLocale)}</p>{/if}
									</section>
									{@const mechanics = presentation.mechanics(spell)}
									{#if mechanics.reviewed}
										<section
											class="spell-mechanics"
											aria-label={$appLocale === 'en' ? 'Spell mechanics' : 'Mecânicas da magia'}
										>
											<h5>{$appLocale === 'en' ? 'Damage and scaling' : 'Dano e escalonamento'}</h5>
											<p>
												<strong>{$appLocale === 'en' ? 'Damage:' : 'Dano:'}</strong>
												{mechanics.damage.length
													? mechanics.damage.join(' · ')
													: $appLocale === 'en'
														? 'None'
														: 'Não se aplica'}
											</p>
											<p>
												<strong
													>{$appLocale === 'en'
														? 'By character level:'
														: 'Por nível do personagem:'}</strong
												>
												{mechanics.characterLevel.length
													? mechanics.characterLevel.join(' · ')
													: $appLocale === 'en'
														? 'None'
														: 'Não se aplica'}
											</p>
											<p>
												<strong
													>{$appLocale === 'en' ? 'By spell slot:' : 'Por nível do espaço:'}</strong
												>
												{mechanics.spellSlot.length
													? mechanics.spellSlot.join(' · ')
													: $appLocale === 'en'
														? 'None'
														: 'Não se aplica'}
											</p>
										</section>
									{/if}
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
								{#if index >= 0}<label class="spell-description-field"
										>{$appLocale === 'en' ? 'Notes' : 'Notas'}
										<textarea
											value={spell.notes}
											rows="2"
											oninput={(event) =>
												actions.change(index, { notes: event.currentTarget.value })}></textarea>
									</label>
								{/if}
								<div class="spell-actions">
									{#each featGrants as grant (grant.id)}
										<small class="feat-casting-source">
											{grantSourceName(grant)}{grant.spellList
												? ` · ${grant.spellList}`
												: ''}{grant.ability ? ` · ${grant.ability}` : ''}
											· {grant.freeCastsRemaining}/{grant.freeCastsMax}
										</small>
										{#if canAdjustSlots && grant.freeUses > 0}
											{@const draft = grantConfigDraft(grant)}
											<div
												class="spell-grant-config"
												role="group"
												aria-label={$appLocale === 'en'
													? `Configure ${grantSourceName(grant)} uses`
													: `Configurar usos de ${grantSourceName(grant)}`}
											>
												<label
													>{$appLocale === 'en' ? 'Maximum' : 'Máximo'}
													<input
														type="number"
														min="0"
														max="100"
														value={draft.maxUses}
														aria-label={$appLocale === 'en'
															? `${grantSourceName(grant)} maximum uses`
															: `Usos máximos de ${grantSourceName(grant)}`}
														oninput={(event) =>
															changeGrantDraft(grant, {
																maxUses: Number(event.currentTarget.value)
															})}
													/>
												</label>
												<label
													>{$appLocale === 'en' ? 'Available' : 'Disponíveis'}
													<input
														type="number"
														min="0"
														max={draft.maxUses}
														value={draft.currentUses}
														aria-label={$appLocale === 'en'
															? `${grantSourceName(grant)} available uses`
															: `Usos disponíveis de ${grantSourceName(grant)}`}
														oninput={(event) =>
															changeGrantDraft(grant, {
																currentUses: Number(event.currentTarget.value)
															})}
													/>
												</label>
												<label
													>{$appLocale === 'en' ? 'Restore' : 'Recuperar'}
													<select
														value={draft.restoreOn}
														aria-label={$appLocale === 'en'
															? `${grantSourceName(grant)} recovery`
															: `Recuperação de ${grantSourceName(grant)}`}
														onchange={(event) =>
															changeGrantDraft(grant, {
																restoreOn: event.currentTarget.value as GrantDraft['restoreOn']
															})}
													>
														<option value="none">{$appLocale === 'en' ? 'Never' : 'Nunca'}</option>
														<option value="short"
															>{$appLocale === 'en' ? 'Short rest' : 'Descanso curto'}</option
														>
														<option value="long"
															>{$appLocale === 'en' ? 'Long rest' : 'Descanso longo'}</option
														>
													</select>
												</label>
												<button
													type="button"
													disabled={pendingGrantConfigs.includes(grantConfigKey(grant)) ||
														draft.currentUses > draft.maxUses}
													onclick={() => void saveGrantConfig(grant)}
													>{$appLocale === 'en' ? 'Save uses' : 'Salvar usos'}</button
												>
											</div>
										{/if}
										{#if canCastSpells && grant.freeCastsRemaining > 0}<button
												class="free-cast"
												type="button"
												disabled={castingSpell === index ||
													(grant.sourceKind === 'species' && !grant.ability)}
												onclick={() =>
													actions.cast(spell, index, {
														grantId: grant.id,
														entryId: grant.spellEntryId,
														freeCast: true
													})}
												>{$appLocale === 'en'
													? `Cast free (${grant.freeCastsRemaining})`
													: `Lançar grátis (${grant.freeCastsRemaining})`}</button
											>{/if}
									{/each}
									{#if canDisplayCharacter}<button
											type="button"
											onclick={() => actions.present(spell)}
											>{$appLocale === 'en' ? 'Show to table' : 'Destacar na tela'}</button
										>{/if}
									{#if spell.diceFormula?.trim() && spell.level === 0}<button
											class="roll-effect"
											type="button"
											onclick={() => actions.rollEffect(spell)}
											><RpgIcon name="d20" size={18} />
											{$appLocale === 'en' ? 'Roll effect' : 'Rolar efeito'}</button
										>{/if}
									{#if index >= 0}<button type="button" onclick={() => actions.remove(index)}
											>{$appLocale === 'en' ? 'Remove' : 'Remover'}</button
										>
									{/if}
								</div>
							</div>
						{/if}
						{#if (canCastSpells && spell.level === 0 && (index >= 0 || atWillGrant)) || (canCastSpells && spell.level > 0 && (index >= 0 || spellGrant))}
							<div
								class="spell-cast-controls"
								role="group"
								aria-label={$appLocale === 'en' ? 'Cast spell' : 'Lançar magia'}
							>
								{#if canCastSpells && spell.level === 0 && (index >= 0 || atWillGrant)}
									{#if index < 0 && atWillGrant}<small class="feat-casting-source">
											{$appLocale === 'en' ? 'Granted cantrip' : 'Truque concedido'} · {atWillGrant.featName}
										</small>{/if}
									<button
										class="cast-spell"
										type="button"
										disabled={castingSpell === index}
										aria-busy={castingSpell === index}
										onclick={() => castSpellAction(spell, index, atWillGrant)}
										>{castingSpell === index
											? '…'
											: $appLocale === 'en'
												? 'Cast cantrip'
												: 'Lançar truque'}</button
									>
								{/if}
								{#if canCastSpells && spell.level > 0 && (index >= 0 || spellGrant)}
									<select
										value={spellbook.selectedSlot(spell, index)}
										onchange={(event) =>
											actions.chooseSlot(index, Number(event.currentTarget.value))}
										aria-label={$appLocale === 'en' ? 'Spell slot' : 'Espaço de magia'}
									>
										{#each spellbook.compatibleSlots(spell) as slot (slot.level)}<option
												value={slot.level}
												>{presentation.circleLabel(slot.level)} · {slot.current}/{slot.max}</option
											>{/each}
									</select>
									<button
										class="cast-spell"
										type="button"
										disabled={castingSpell === index ||
											!spellbook.compatibleSlots(spell).length ||
											(spellGrant?.sourceKind === 'species' && !spellGrant.ability)}
										aria-busy={castingSpell === index}
										onclick={() =>
											castSpellAction(spell, index, index < 0 ? spellGrant : undefined)}
										>{castingSpell === index
											? '…'
											: $appLocale === 'en'
												? 'Cast'
												: 'Lançar'}</button
									>
									{#if !spellbook.compatibleSlots(spell).length}<small class="spell-slot-empty">
											{$appLocale === 'en'
												? 'No compatible spell slots available.'
												: 'Nenhum espaço compatível disponível.'}
										</small>{/if}
								{/if}
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
	.spell-origins,
	.feat-casting-source,
	.spell-slot-empty {
		color: #bba681;
		font-size: 0.68rem;
	}
	.spell-slot-empty {
		grid-column: 1 / -1;
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
	.available-slot-control {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.slot-adjust-button {
		min-width: 1.65rem;
		min-height: 1.65rem;
		border: 1px solid #725a3b;
		border-radius: 5px;
		padding: 0.1rem 0.35rem;
		color: #e8c786;
		background: #2a211e;
		font: inherit;
		font-size: 0.85rem;
		line-height: 1;
	}
	.slot-adjust-button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
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
	.spell-heading {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
	}
	.spell-circle .free-cast-status {
		width: fit-content;
		border: 1px solid #42674e;
		border-radius: 999px;
		padding: 0.15rem 0.45rem;
		color: #bce2c4;
		background: #1b2a20;
		font-size: 0.66rem;
		font-weight: 600;
		white-space: normal;
	}
	.spell-circle .free-cast-status.spent {
		border-color: #66564a;
		color: #d3b99f;
		background: #29211e;
	}
	.spell-details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		border-top: 1px solid #3d3334;
		padding: 0.75rem;
	}
	.spell-cast-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
		border-top: 1px solid #3d3334;
		padding: 0.55rem 0.75rem;
	}
	.spell-cast-controls select,
	.spell-cast-controls button {
		min-height: 2.25rem;
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.4rem 0.65rem;
		color: #f0d29d;
		background: #2a211e;
		font: inherit;
		font-size: 0.75rem;
	}
	.spell-cast-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
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
	.spell-mechanics {
		grid-column: 1 / -1;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.55rem 0.9rem;
		color: #e8ddcd;
		font-size: 0.85rem;
	}
	.spell-mechanics h5,
	.spell-mechanics p {
		margin: 0.25rem 0;
	}
	.spell-mechanics h5 {
		color: #e8c985;
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
	.spell-actions button {
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
	.roll-effect {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
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
	.species-spell-ability {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.25rem 0 0.65rem;
		font-size: 0.75rem;
	}
	.species-spell-ability select,
	.spell-grant-config input,
	.spell-grant-config select {
		min-width: 0;
		border: 1px solid #554841;
		border-radius: 6px;
		padding: 0.35rem 0.45rem;
		color: #f5ede3;
		background: #121012;
		font: inherit;
	}
	.spell-grant-config {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.45rem;
		width: 100%;
	}
	.spell-grant-config label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.68rem;
	}
	.spell-grant-config input {
		width: 6rem;
	}
	.spell-grant-config button {
		min-height: 2rem;
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.35rem 0.55rem;
		color: #e8c786;
		background: #2a211e;
		font: inherit;
		font-size: 0.72rem;
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
