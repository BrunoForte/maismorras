<script lang="ts">
	import type { Personagem, TokenVisibility } from '$lib/stores/gameStore';
	import type { NPC } from '$lib/services/npcApi';
	import type { EffectDefinition, SceneEffect } from '$lib/services/sceneApi';
	import type { Attack, CharacterSheet, InventoryItem, Spell } from '$lib/services/characterApi';
	import type { WeaponAttackProfile } from '$lib/utils/weaponRules';
	import CharacterMapSummary from './CharacterMapSummary.svelte';

	export type TokenInspectorPermissions = {
		canEditHitPoints: boolean;
		canViewCharacterSummary: boolean;
		canEditAppearance: boolean;
		canEditVision: boolean;
		canInteractWithDoor: boolean;
		canOpenSheet: boolean;
		canRemoveToken: boolean;
		canRollInitiative: boolean;
		canUseNpcActions: boolean;
		canManageConditions: boolean;
		canChangeVisibility: boolean;
	};

	let {
		token,
		npc = null,
		characterSheet,
		isEnglish = false,
		permissions,
		initiativeAdvantage = false,
		effectDefinitions = [],
		selectedEffectSlug = '',
		effectDuration = '',
		hitPointsUpdating = false,
		activeEffects = [],
		onClose,
		onAppearanceChange,
		onColorChange,
		onToggleTransparentBackground,
		onVisionChange,
		onLightChange,
		onInteractWithDoor,
		onOpenSheet,
		onOpenSheetInNewWindow,
		onRemoveToken,
		onRollInitiative,
		onInitiativeAdvantageChange,
		onNpcAction,
		onHitPointsChange,
		onHitPointsSet,
		onEffectSelectionChange,
		onEffectDurationChange,
		onApplyEffect,
		onRemoveEffect,
		onVisibilityChange,
		onWeaponRoll = () => {},
		onCustomAttack = () => {},
		onCastSpell = () => {},
		onPresentSpell = () => {}
	}: {
		token: Personagem;
		npc?: NPC | null;
		characterSheet?: CharacterSheet;
		isEnglish?: boolean;
		permissions: TokenInspectorPermissions;
		initiativeAdvantage?: boolean;
		effectDefinitions?: EffectDefinition[];
		selectedEffectSlug?: string;
		effectDuration?: string;
		hitPointsUpdating?: boolean;
		activeEffects?: SceneEffect[];
		onClose: () => void;
		onAppearanceChange: (
			field: 'fotoEscala' | 'fotoOffsetX' | 'fotoOffsetY',
			value: string
		) => void;
		onColorChange: (value: string) => void;
		onToggleTransparentBackground: () => void;
		onVisionChange: (value: string) => void;
		onLightChange: (value: string) => void;
		onInteractWithDoor: () => void;
		onOpenSheet: (actorId: string) => void;
		onOpenSheetInNewWindow: (actorId: string) => void;
		onRemoveToken: () => void;
		onRollInitiative: () => void;
		onInitiativeAdvantageChange: (checked: boolean) => void;
		onNpcAction: (action: NPC['sheet']['actions'][number]) => void;
		onHitPointsChange: (delta: number) => void;
		onHitPointsSet: (value: string) => void;
		onEffectSelectionChange: (slug: string) => void;
		onEffectDurationChange: (duration: string) => void;
		onApplyEffect: () => void;
		onRemoveEffect: (effect: SceneEffect) => void;
		onVisibilityChange: (
			field: keyof Pick<TokenVisibility, 'showName' | 'showHP' | 'showAC' | 'showStatuses'>,
			checked: boolean
		) => void;
		onWeaponRoll?: (
			item: InventoryItem,
			action: 'attack' | 'damage',
			profile?: WeaponAttackProfile
		) => void;
		onCustomAttack?: (attack: Attack, index: number, action: 'attack' | 'damage') => void;
		onCastSpell?: (spell: Spell, index: number) => void;
		onPresentSpell?: (spell: Spell) => void;
	} = $props();
	let selectedEffect = $derived(effectDefinitions.find((item) => item.slug === selectedEffectSlug));
	function npcActionKey(action: NPC['sheet']['actions'][number]): string {
		return [action.name, action.kind, action.toHit, action.range, action.damage, action.saveDC]
			.map((part) =>
				String(part ?? '')
					.trim()
					.toLocaleLowerCase()
			)
			.join(':');
	}
	const npcActions = $derived.by(() => {
		if (!npc) return [];
		const seen: Record<string, true> = Object.create(null) as Record<string, true>;
		return npc.sheet.actions.filter((action) => {
			const key = npcActionKey(action);
			if (Object.hasOwn(seen, key)) return false;
			seen[key] = true;
			return true;
		});
	});
</script>

<section
	class="token-inspector"
	aria-label={`${isEnglish ? 'Information for' : 'Informações de'} ${token.nome}`}
>
	<header>
		<div>
			<span class="inspector-eyebrow">{isEnglish ? 'SELECTED TOKEN' : 'TOKEN SELECIONADO'}</span>
			<h2>{characterSheet?.name || token.nome}</h2>
		</div>
		<button
			class="close-button"
			onclick={onClose}
			aria-label={isEnglish ? 'Close inspector' : 'Fechar inspector'}>×</button
		>
	</header>
	<div class="quick-stats">
		<span><b>INI</b>{token.iniciativa}</span><span><b>TAM</b>{token.tamanho}×{token.tamanho}</span>
	</div>
	{#if token.actorId && !npc && characterSheet && permissions.canViewCharacterSummary}
		<CharacterMapSummary
			sheet={characterSheet}
			{isEnglish}
			canCastSpells={token.isOwned}
			hitPointsCurrent={token.hpAtual}
			hitPointsMax={token.hpMax}
			{hitPointsUpdating}
			{onHitPointsChange}
			{onHitPointsSet}
			{onWeaponRoll}
			{onCustomAttack}
			{onCastSpell}
			{onPresentSpell}
		/>
	{/if}
	{#if permissions.canInteractWithDoor}<button class="door-interaction" onclick={onInteractWithDoor}
			>🚪 {isEnglish ? 'Interact with nearby door' : 'Interagir com porta próxima'}</button
		>{/if}
	{#if token.actorId && permissions.canOpenSheet}
		<div class="sheet-actions">
			<button class="open-sheet" onclick={() => onOpenSheet(token.actorId!)}
				>{isEnglish ? 'Open linked sheet' : 'Abrir ficha vinculada'}</button
			>
			<button class="open-sheet-new-window" onclick={() => onOpenSheetInNewWindow(token.actorId!)}
				>{isEnglish ? 'Open sheet in auxiliary window' : 'Abrir ficha em janela auxiliar'}</button
			>
		</div>
	{/if}
	{#if permissions.canRollInitiative}
		<div class="token-rolls">
			<button class="token-initiative-button" onclick={onRollInitiative}
				>⚔️ {isEnglish ? 'Roll initiative' : 'Rolar iniciativa'}</button
			>
			{#if token.actorId && !npc}<label class="token-initiative-advantage"
					><input
						type="checkbox"
						checked={initiativeAdvantage}
						onchange={(event) => onInitiativeAdvantageChange(event.currentTarget.checked)}
					/><span>{isEnglish ? 'Advantage next time' : 'Vantagem na próxima'}</span></label
				>{/if}
		</div>
	{/if}
	{#if permissions.canUseNpcActions && npc?.sheet.actions.length}
		<div class="npc-actions">
			<span>{isEnglish ? 'Creature actions' : 'Ações da criatura'}</span>
			{#each npcActions as action (npcActionKey(action))}<button
					onclick={() => onNpcAction(action)}
					title={action.description || action.damage}
					><strong>{action.name}</strong><small
						>{action.toHit >= 0 ? `+${action.toHit}` : action.toHit} · {action.damage ||
							action.range ||
							(isEnglish ? 'Action' : 'Ação')}</small
					></button
				>{/each}
		</div>
	{/if}
	{#if !characterSheet || !token.actorId || npc}
		<div class="hp-control">
			<div>
				<span>{isEnglish ? 'Hit points' : 'Pontos de vida'}</span><strong
					>{token.hpAtual} <small>/ {token.hpMax}</small></strong
				>
			</div>
			{#if permissions.canEditHitPoints}<div class="hp-edit">
					<div class="hp-actions">
						<button
							disabled={hitPointsUpdating}
							onclick={() => onHitPointsChange(-1)}
							aria-label="Reduzir 1 ponto de vida">−</button
						><input
							aria-label="Pontos de vida atuais"
							type="text"
							inputmode="numeric"
							value={token.hpAtual}
							aria-busy={hitPointsUpdating}
							onchange={(event) => onHitPointsSet(event.currentTarget.value)}
						/><button
							disabled={hitPointsUpdating}
							onclick={() => onHitPointsChange(1)}
							aria-label="Aumentar 1 ponto de vida">+</button
						>
					</div>
					<small class="hp-hint"
						>{isEnglish ? 'Type -10 to take 10 damage' : 'Digite -10 para sofrer 10 de dano'}</small
					>
				</div>{/if}
		</div>
	{/if}
	<div class="official-effects">
		<div class="status-heading">
			<span>{isEnglish ? 'Official conditions (SRD)' : 'Condições oficiais (SRD)'}</span>
		</div>
		{#if permissions.canManageConditions}
			{#if effectDefinitions.length}
				<select
					value={selectedEffectSlug}
					onchange={(event) => onEffectSelectionChange(event.currentTarget.value)}
					aria-label={isEnglish ? 'Official condition' : 'Condição oficial'}
					>{#each effectDefinitions as definition (definition.slug)}<option value={definition.slug}
							>{definition.name}</option
						>{/each}</select
				>
				{#if selectedEffect}<p>{selectedEffect.summary}</p>{/if}
				<div class="effect-actions">
					<input
						value={effectDuration}
						oninput={(event) => onEffectDurationChange(event.currentTarget.value)}
						inputmode="numeric"
						type="number"
						min="1"
						placeholder={isEnglish ? 'Turns (optional)' : 'Turnos (opcional)'}
						aria-label={isEnglish ? 'Duration in turns' : 'Duração em turnos'}
					/><button onclick={onApplyEffect}>{isEnglish ? 'Apply' : 'Aplicar'}</button>
				</div>
			{:else}<p class="effect-empty">
					{isEnglish
						? 'Run migration 0017 to load the SRD catalog.'
						: 'Execute a migração 0017 para carregar o catálogo SRD.'}
				</p>{/if}
		{/if}
		{#if activeEffects.length}<div class="official-effect-list">
				{#each activeEffects as effect (effect.id)}<span title={effect.source}
						>{effect.name}{effect.remainingTurns
							? ` · ${effect.remainingTurns} ${isEnglish ? 'turns' : 'turnos'}`
							: ''}{#if permissions.canManageConditions}<button
								onclick={() => onRemoveEffect(effect)}
								aria-label={`${isEnglish ? 'Remove' : 'Remover'} ${effect.name}`}>×</button
							>{/if}</span
					>{/each}
			</div>{:else}<p class="effect-empty">
				{isEnglish ? 'No active conditions.' : 'Nenhuma condição ativa.'}
			</p>{/if}
	</div>
	{#if permissions.canEditAppearance || permissions.canEditVision || permissions.canChangeVisibility || permissions.canRemoveToken}
		<details class="token-settings">
			<summary>{isEnglish ? 'Token settings' : 'Configurações do token'}</summary>
			{#if permissions.canEditAppearance}
				<div class="token-appearance">
					<strong>Aparência do token</strong>
					<label
						>Zoom <input
							type="range"
							min="0.5"
							max="3"
							step="0.05"
							value={token.fotoEscala}
							onchange={(event) => onAppearanceChange('fotoEscala', event.currentTarget.value)}
						/></label
					>
					<label
						>Horizontal <input
							type="range"
							min="-100"
							max="100"
							step="1"
							value={token.fotoOffsetX}
							onchange={(event) => onAppearanceChange('fotoOffsetX', event.currentTarget.value)}
						/></label
					>
					<label
						>Vertical <input
							type="range"
							min="-100"
							max="100"
							step="1"
							value={token.fotoOffsetY}
							onchange={(event) => onAppearanceChange('fotoOffsetY', event.currentTarget.value)}
						/></label
					>
					<label class="color-control"
						>Cor do jogador <input
							type="color"
							value={`#${token.cor.toString(16).padStart(6, '0')}`}
							onchange={(event) => onColorChange(event.currentTarget.value)}
							aria-label="Cor de identificação do token"
						/></label
					>
					<small class="color-hint"
						>{isEnglish
							? 'Choose a color different from other characters in the campaign.'
							: 'Escolha uma cor diferente dos outros personagens da campanha.'}</small
					>
					<button onclick={onToggleTransparentBackground}
						>{token.visibility.transparentBackground
							? 'Usar fundo colorido'
							: 'Remover fundo colorido'}</button
					>
				</div>
			{/if}
			{#if permissions.canEditVision}
				<div class="vision-control">
					<span
						>{isEnglish ? 'Fog vision' : 'Visão na névoa'}
						<small>({isEnglish ? 'squares' : 'quadrados'})</small></span
					><input
						type="number"
						min="0"
						max="30"
						value={token.visionRange}
						onchange={(event) => onVisionChange(event.currentTarget.value)}
						aria-label={isEnglish ? 'Vision range in squares' : 'Raio de visão em quadrados'}
					/>
				</div>
				<div class="vision-control">
					<span
						>{isEnglish ? 'Light source' : 'Fonte de luz'}
						<small>({isEnglish ? 'squares' : 'quadrados'})</small></span
					><input
						type="number"
						min="0"
						max="30"
						value={token.lightRange}
						onchange={(event) => onLightChange(event.currentTarget.value)}
						aria-label={isEnglish ? 'Light range in squares' : 'Raio de luz em quadrados'}
					/>
				</div>
			{/if}
			{#if permissions.canChangeVisibility}
				<div class="visibility-control">
					<div>
						<span class="inspector-eyebrow"
							>{isEnglish
								? 'VISIBILITY FOR OTHER PLAYERS'
								: 'VISIBILIDADE PARA OUTROS JOGADORES'}</span
						>
						<p>
							{isEnglish
								? 'The Game Master always sees complete data. These options control what other players see.'
								: 'O narrador sempre vê os dados completos. Estas opções regulam os outros jogadores.'}
						</p>
					</div>
					<label
						><input
							type="checkbox"
							checked={token.visibility.showName}
							onchange={(event) => onVisibilityChange('showName', event.currentTarget.checked)}
						/>{isEnglish ? 'Name' : 'Nome'}</label
					>
					<label
						><input
							type="checkbox"
							checked={token.visibility.showHP}
							onchange={(event) => onVisibilityChange('showHP', event.currentTarget.checked)}
						/> HP</label
					>
					<label
						><input
							type="checkbox"
							checked={token.visibility.showAC}
							onchange={(event) => onVisibilityChange('showAC', event.currentTarget.checked)}
						/>{isEnglish ? 'AC' : 'CA'}</label
					>
					<label
						><input
							type="checkbox"
							checked={token.visibility.showStatuses}
							onchange={(event) => onVisibilityChange('showStatuses', event.currentTarget.checked)}
						/>{isEnglish ? 'Conditions' : 'Condições'}</label
					>
				</div>
			{/if}
			{#if permissions.canRemoveToken}<button class="remove-token" onclick={onRemoveToken}
					>{isEnglish ? 'Remove token from scene' : 'Remover token da cena'}</button
				>{/if}
		</details>
	{/if}
</section>

<style>
	.remove-token {
		border: 1px solid #9b5b4d;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		color: #ffd5ca;
		background: #3b211f;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.remove-token:hover {
		background: #572923;
	}
	.token-inspector {
		position: absolute;
		z-index: 2;
		top: 1rem;
		right: 1rem;
		width: min(340px, calc(100% - 2rem));
		height: min(420px, calc(100% - 2rem));
		min-width: 260px;
		min-height: 180px;
		max-width: calc(100% - 1rem);
		max-height: calc(100% - 2rem);
		resize: both;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 1rem;
		border: 1px solid rgba(216, 173, 103, 0.42);
		border-radius: 12px;
		color: #f4eee4;
		background: rgba(27, 22, 27, 0.95);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(12px);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.token-inspector > header,
	.token-inspector > .quick-stats,
	.token-inspector > .hp-control,
	.token-inspector > .token-rolls {
		order: 0;
	}
	.token-inspector .token-settings > .token-appearance,
	.token-inspector .token-settings > .vision-control,
	.token-inspector .token-settings > .visibility-control,
	.token-inspector > .official-effects,
	.token-inspector .token-settings > .remove-token {
		order: 5;
	}
	.token-appearance {
		display: grid;
		gap: 0.45rem;
		margin: 0.2rem 0;
		border-top: 1px solid #393034;
		padding-top: 0.65rem;
	}
	.token-appearance strong {
		color: #d8ad67;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.token-appearance label {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
		gap: 0.5rem;
		color: #b9aa9b;
		font-size: 0.7rem;
	}
	.token-appearance input[type='range'] {
		width: 100%;
		accent-color: #d8ad67;
	}
	.token-appearance .color-hint {
		color: #b9aa9b;
		font-size: 0.66rem;
		line-height: 1.4;
	}
	.token-appearance button {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.68rem;
	}
	.token-inspector header {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: start;
		margin-bottom: 0.9rem;
	}
	.inspector-eyebrow {
		color: #d8ad67;
		font-size: 0.59rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}
	.token-inspector h2 {
		margin: 0.2rem 0 0;
		font:
			600 1.2rem Georgia,
			serif;
	}
	.token-rolls {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		align-items: center;
		gap: 0.35rem;
		padding: 0.55rem 0;
		border-top: 1px solid #493c39;
	}
	.token-rolls button {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.36rem 0.48rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.token-rolls .token-initiative-button {
		min-height: 2.25rem;
		border-color: #8c6d43;
		border-radius: 7px;
		padding: 0.45rem 0.7rem;
		color: #f5e4c0;
		background: linear-gradient(180deg, #423126, #2b211c);
		font-size: 0.75rem;
		font-weight: 650;
	}
	.token-rolls .token-initiative-button:hover:not(:disabled) {
		border-color: #d8ad67;
		background: #493020;
	}
	.token-initiative-advantage {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2.25rem;
		border: 1px solid #594a3e;
		border-radius: 7px;
		padding: 0.4rem 0.55rem;
		color: #d8c5aa;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.token-initiative-advantage input {
		width: 1rem;
		accent-color: #d8ad67;
	}
	.open-sheet-new-window {
		margin: 0 1rem 0.5rem;
	}
	.sheet-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}
	.sheet-actions .open-sheet,
	.sheet-actions .open-sheet-new-window {
		width: 100%;
		min-width: 0;
		margin: 0;
		min-height: 2.25rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.48rem 0.45rem;
		color: #f0d29d;
		background: #2b211c;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 650;
		line-height: 1.25;
		cursor: pointer;
	}
	.sheet-actions .open-sheet:hover,
	.sheet-actions .open-sheet-new-window:hover {
		border-color: #d8ad67;
		background: #403027;
	}
	.sheet-actions .open-sheet:focus-visible,
	.sheet-actions .open-sheet-new-window:focus-visible {
		outline: 2px solid #e0b86f;
		outline-offset: 2px;
	}
	.sheet-actions .open-sheet:disabled,
	.sheet-actions .open-sheet-new-window:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.token-settings {
		display: grid;
		gap: 0.5rem;
		border: 1px solid #423839;
		border-radius: 8px;
		padding: 0.55rem 0.65rem;
		background: rgba(15, 13, 15, 0.34);
	}
	.token-settings > summary {
		color: #e8c786;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.token-settings[open] > summary {
		padding-bottom: 0.4rem;
		border-bottom: 1px solid #423839;
	}
	.npc-actions {
		display: grid;
		gap: 0.38rem;
		padding: 0.7rem 1rem;
		border-top: 1px solid #493c39;
	}
	.npc-actions > span {
		color: #b9aa9d;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.npc-actions button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.48rem 0.55rem;
		color: #f1dfbd;
		background: #2b211c;
		text-align: left;
		cursor: pointer;
	}
	.npc-actions button:hover {
		background: #403027;
	}
	.npc-actions button strong {
		font-size: 0.73rem;
	}
	.npc-actions button small {
		color: #bba994;
		font-size: 0.65rem;
	}
	.open-sheet {
		margin: 0 1rem 0.5rem;
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.42rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.close-button {
		border: 0;
		padding: 0 0.2rem;
		color: #aa9e94;
		background: transparent;
		font-size: 1.4rem;
		line-height: 1;
	}
	.close-button:hover {
		color: #fff;
	}
	.quick-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-bottom: 0.8rem;
		border: 1px solid #423839;
		border-radius: 8px;
		overflow: hidden;
	}
	.quick-stats span {
		display: grid;
		place-items: center;
		gap: 0.16rem;
		padding: 0.45rem;
		border-right: 1px solid #423839;
		color: #e6d9ca;
		font-size: 0.88rem;
	}
	.quick-stats span:last-child {
		border: 0;
	}
	.quick-stats b {
		color: #92857b;
		font-size: 0.58rem;
		letter-spacing: 0.07em;
	}
	.vision-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.8rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid #423839;
		border-radius: 8px;
		color: #cdbda9;
		font-size: 0.7rem;
	}
	.vision-control small {
		color: #8f8378;
		font-size: 0.61rem;
	}
	.vision-control input {
		width: 3rem;
		border: 1px solid #5a4841;
		border-radius: 5px;
		padding: 0.3rem;
		color: #f4eee4;
		background: #282125;
		text-align: center;
	}
	.door-interaction {
		width: calc(100% - 2rem);
		margin: 0 1rem 0.7rem;
		border: 1px solid #927449;
		border-radius: 6px;
		padding: 0.46rem 0.55rem;
		color: #f0d29d;
		background: #2b211c;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.hp-control {
		padding: 0.75rem 0;
		border-top: 1px solid #423839;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.hp-edit {
		display: grid;
		justify-items: end;
		gap: 0.2rem;
	}
	.hp-hint {
		color: #aa9c90;
		font-size: 0.62rem;
	}
	.hp-control > div:first-child {
		display: grid;
		gap: 0.2rem;
		color: #a99c91;
		font-size: 0.72rem;
	}
	.hp-control strong {
		color: #f4eee4;
		font-size: 1rem;
	}
	.hp-control small {
		color: #95887f;
		font-size: 0.72rem;
		font-weight: 500;
	}
	.hp-actions {
		display: flex;
		align-items: center;
		border: 1px solid #5a4841;
		border-radius: 7px;
		overflow: hidden;
	}
	.hp-actions button,
	.hp-actions input {
		width: 2rem;
		height: 2rem;
		border: 0;
		color: #f0debf;
		background: #302629;
		text-align: center;
	}
	.hp-actions button:disabled {
		cursor: wait;
		opacity: 0.55;
	}
	.hp-actions button:hover {
		background: #4a382d;
	}
	.hp-actions input {
		width: 2.5rem;
		border-inline: 1px solid #5a4841;
		color: #fff;
	}
	.hp-actions input::-webkit-inner-spin-button {
		appearance: none;
	}
	.status-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		color: #a99c91;
		font-size: 0.72rem;
	}
	.official-effects {
		padding: 0.75rem 0;
		border-top: 1px solid #423839;
	}
	.official-effects select,
	.effect-actions input {
		box-sizing: border-box;
		width: 100%;
		margin-top: 0.45rem;
		border: 1px solid #5a4841;
		border-radius: 6px;
		padding: 0.42rem;
		color: #e7dacc;
		background: #282125;
		font-size: 0.72rem;
	}
	.official-effects p {
		margin: 0.45rem 0;
		color: #b9aa9d;
		font-size: 0.7rem;
		line-height: 1.35;
	}
	.effect-actions {
		display: flex;
		gap: 0.4rem;
		align-items: end;
	}
	.effect-actions input {
		margin: 0;
	}
	.effect-actions button {
		border: 1px solid #725a3b;
		border-radius: 6px;
		padding: 0.45rem 0.62rem;
		color: #e8c786;
		background: #2a211e;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.official-effect-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.55rem;
	}
	.official-effect-list span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid #624d42;
		border-radius: 999px;
		padding: 0.23rem 0.42rem;
		color: #e9d5ad;
		font-size: 0.64rem;
	}
	.official-effect-list button {
		border: 0;
		padding: 0;
		color: #e9d5ad;
		background: transparent;
		cursor: pointer;
		font-size: 0.85rem;
		line-height: 0.65rem;
	}
	.effect-empty {
		color: #c69072 !important;
	}
	.visibility-control {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		margin-top: 0.8rem;
		padding-top: 0.8rem;
		border-top: 1px solid #423839;
		color: #c7b8a7;
		font-size: 0.72rem;
	}
	.visibility-control > div {
		grid-column: 1 / -1;
	}
	.visibility-control p {
		margin: 0.25rem 0 0;
		color: #8f8378;
		line-height: 1.35;
	}
	.visibility-control label {
		display: flex;
		align-items: center;
		gap: 0.38rem;
	}
	.visibility-control input {
		accent-color: #d8ad67;
	}
	@media (max-width: 760px) {
		.token-inspector {
			top: auto;
			right: 0.45rem;
			bottom: 0.45rem;
			width: calc(100% - 0.9rem);
			height: min(360px, 52%);
			min-width: 0;
			max-height: 52%;
			resize: none;
		}
		.sheet-actions {
			grid-template-columns: 1fr;
		}
	}
</style>
