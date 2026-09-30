<script lang="ts">
	import type { SceneMapToolsActions, SceneMapToolsState } from '$lib/utils/sceneMapTools';

	let { state, actions }: { state: SceneMapToolsState; actions: SceneMapToolsActions } = $props();
</script>

<div class="camera-tools" aria-label={state.isEnglish ? 'Map camera' : 'Câmera do mapa'}>
	<button
		onclick={() => actions.onZoom(-0.1)}
		aria-label={state.isEnglish ? 'Zoom out' : 'Diminuir zoom'}
		title={state.isEnglish ? 'Zoom out' : 'Diminuir zoom'}>−</button
	>
	<span>{`${Math.round(state.cameraZoom * 100)}%`}</span>
	<button
		onclick={() => actions.onZoom(0.1)}
		aria-label={state.isEnglish ? 'Zoom in' : 'Aumentar zoom'}
		title={state.isEnglish ? 'Zoom in' : 'Aumentar zoom'}>+</button
	>
	<button
		class="camera-reset"
		onclick={actions.onRecenter}
		aria-label={state.isEnglish ? 'Center map' : 'Recentralizar mapa'}
		title={state.isEnglish ? 'Center map' : 'Recentralizar mapa'}>⌖</button
	>
	<button
		class:active={!state.gridVisible}
		onclick={actions.onToggleGrid}
		aria-label={state.isEnglish ? 'Toggle grid' : 'Alternar grade'}
		title={state.isEnglish ? 'Toggle grid' : 'Alternar grade'}>#</button
	>
</div>

{#if state.isGM}
	<div class="table-tools-gm" aria-label={state.isEnglish ? 'Table tools' : 'Ferramentas da mesa'}>
		<div class="table-tools-gm-buttons">
			<div class="layer-tool-trigger">
				<button
					class:active={state.openTool === 'layers'}
					onclick={() => actions.onToolToggle('layers')}
					aria-label={state.isEnglish ? 'Map layers' : 'Camadas do mapa'}
					title={state.isEnglish ? 'Map layers' : 'Camadas do mapa'}>🗺️</button
				>{#if state.openTool === 'layers'}
					<div class="layer-tools">
						<strong>{state.isEnglish ? 'Map layers' : 'Camadas do mapa'}</strong>
						<label
							><input type="checkbox" checked={state.gridVisible} onchange={actions.onToggleGrid} />
							{state.isEnglish ? 'Grid' : 'Grade'}</label
						>
						<label
							><input
								type="checkbox"
								checked={state.wallsVisible}
								onchange={() => actions.onToggleLayer('walls')}
							/>
							{state.isEnglish ? 'Walls and doors' : 'Paredes e portas'}</label
						>
						<label
							><input
								type="checkbox"
								checked={state.areasVisible}
								onchange={() => actions.onToggleLayer('areas')}
							/>
							{state.isEnglish ? 'Persistent areas' : 'Áreas persistentes'}</label
						>
						<small
							>{state.isEnglish
								? 'Visual only; scene data is preserved.'
								: 'Apenas visual; os dados da cena são preservados.'}</small
						>
					</div>
				{/if}
			</div>
			<div class="area-tool-trigger">
				<button
					class:active={state.openTool === 'areas' || state.saveAreaArmed}
					onclick={() => actions.onToolToggle('areas')}
					aria-label={state.isEnglish ? 'Persistent areas' : 'Áreas persistentes'}
					title={state.isEnglish ? 'Persistent areas' : 'Áreas persistentes'}>📐</button
				>{#if state.openTool === 'areas'}
					<div class="area-tools">
						<strong>{state.isEnglish ? 'Persistent area' : 'Área persistente'}</strong>
						<small
							>{state.isEnglish
								? 'Choose the ruler and drag with Shift to save an area.'
								: 'Escolha a régua e arraste com Shift para salvar a área.'}</small
						>
						<input
							value={state.areaLabel}
							oninput={(event) => actions.onAreaLabelChange(event.currentTarget.value)}
							maxlength="80"
							aria-label={state.isEnglish ? 'Area label' : 'Rótulo da área'}
						/>
						<label
							><input
								type="checkbox"
								checked={state.areaVisible}
								onchange={actions.onAreaVisibilityToggle}
							/>
							{state.isEnglish ? 'players can see' : 'jogadores veem'}</label
						>
						<button class:active={state.saveAreaArmed} onclick={actions.onSaveAreaToggle}
							>{state.saveAreaArmed
								? state.isEnglish
									? 'Draw with Shift'
									: 'Desenhe com Shift'
								: state.isEnglish
									? 'Save next ruler'
									: 'Salvar próxima régua'}</button
						>
						{#if state.areas.length}
							<div class="area-list">
								{#each state.areas as area (area.id)}
									<span
										>{area.label}<button onclick={() => actions.onAreaRemove(area)}>×</button></span
									>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
			<div class="wall-tool-trigger">
				<button
					class:active={state.openTool === 'barriers' || state.wallDrawing}
					onclick={() => actions.onToolToggle('barriers')}
					aria-label={state.isEnglish ? 'Walls and doors' : 'Paredes e portas'}
					title={state.isEnglish ? 'Walls and doors' : 'Paredes e portas'}>🧱</button
				>{#if state.openTool === 'barriers'}
					<div class="wall-tools">
						<strong>{state.isEnglish ? 'Barriers' : 'Barreiras'}</strong>
						<select
							value={state.wallKind}
							onchange={(event) =>
								actions.onWallKindChange(event.currentTarget.value as 'wall' | 'door')}
							aria-label="Tipo de barreira"
							><option value="wall">{state.isEnglish ? 'Wall' : 'Parede'}</option><option
								value="door">{state.isEnglish ? 'Door' : 'Porta'}</option
							></select
						>
						<button class:active={state.wallDrawing} onclick={actions.onWallDrawingToggle}
							>{state.wallDrawing
								? state.isEnglish
									? 'Drag on map…'
									: 'Arraste no mapa…'
								: state.isEnglish
									? `Draw ${state.wallKind === 'door' ? 'door' : 'wall'}`
									: `Desenhar ${state.wallKind === 'door' ? 'porta' : 'parede'}`}</button
						>
						<small
							>{state.isEnglish
								? 'Closed barriers block vision and movement.'
								: 'Fechadas bloqueiam visão e movimento.'}</small
						>
						{#if state.walls.length}
							<div class="wall-list">
								{#each state.walls as wall (wall.id)}
									<span
										>{wall.kind === 'door'
											? wall.open
												? state.isEnglish
													? 'Open door'
													: 'Porta aberta'
												: state.isEnglish
													? 'Closed door'
													: 'Porta fechada'
											: state.isEnglish
												? 'Wall'
												: 'Parede'}<span
											>{#if wall.kind === 'door'}<button onclick={() => actions.onDoorToggle(wall)}
													>{wall.open
														? state.isEnglish
															? 'Close'
															: 'Fechar'
														: state.isEnglish
															? 'Open'
															: 'Abrir'}</button
												>{/if}<button
												onclick={() => actions.onWallRemove(wall)}
												aria-label={state.isEnglish ? 'Remove barrier' : 'Remover barreira'}
												>×</button
											></span
										></span
									>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if state.isGM && state.fogEnabled}
	<div class="fog-tools">
		<strong>🌫 Névoa</strong>
		<div>
			<button
				class:active={state.fogMode === 'reveal'}
				onclick={() => actions.onFogModeToggle('reveal')}>Revelar</button
			>
			<button
				class:active={state.fogMode === 'hide'}
				onclick={() => actions.onFogModeToggle('hide')}>Ocultar</button
			>
		</div>
		<select
			value={state.fogBrush}
			onchange={(event) => actions.onFogBrushChange(Number(event.currentTarget.value))}
			aria-label="Tamanho do pincel"
			><option value={1}>1×1</option><option value={3}>3×3</option><option value={5}>5×5</option
			></select
		>
		{#if state.fogMode}<small
				>Clique no mapa para {state.fogMode === 'reveal' ? 'revelar' : 'ocultar'}.</small
			>{/if}
	</div>
{/if}

<style>
	.camera-tools {
		position: absolute;
		z-index: 4;
		top: 0.8rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.25rem;
		border: 1px solid rgba(216, 173, 103, 0.45);
		border-radius: 8px;
		color: #ead8b7;
		background: rgba(25, 19, 23, 0.92);
		box-shadow: 0 8px 18px #0004;
		backdrop-filter: blur(8px);
	}
	.camera-tools button {
		display: grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border: 0;
		border-radius: 5px;
		color: #f0cb85;
		background: transparent;
		font-size: 1rem;
		cursor: pointer;
	}
	.camera-tools button:hover {
		background: #453329;
	}
	.camera-tools span {
		min-width: 3.1rem;
		text-align: center;
		font-size: 0.63rem;
		font-variant-numeric: tabular-nums;
	}
	.camera-tools .camera-reset {
		border-left: 1px solid #5c4b40;
		border-radius: 0 5px 5px 0;
		margin-left: 0.1rem;
		padding-left: 0.35rem;
	}
	.fog-tools {
		position: absolute;
		z-index: 4;
		top: 0.8rem;
		right: 0.8rem;
		display: grid;
		gap: 0.35rem;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.92);
		font-size: 0.65rem;
	}
	.fog-tools div {
		display: flex;
		gap: 0.25rem;
	}
	.fog-tools button,
	.fog-tools select {
		border: 1px solid #5d493b;
		border-radius: 5px;
		padding: 0.3rem;
		color: #e8d3aa;
		background: #241c1e;
		font-size: 0.63rem;
	}
	.fog-tools button.active {
		color: #271b10;
		background: #e0b86f;
	}
	.fog-tools small {
		color: #baaa98;
		font-size: 0.58rem;
	}
	.area-tool-trigger {
		position: absolute;
		z-index: 5;
		top: 8.8rem;
		left: 0.9rem;
	}
	.area-tool-trigger > button {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		padding: 0.2rem;
		color: #ecd8a8;
		background: rgba(25, 19, 23, 0.92);
		font-size: 1.05rem;
		cursor: pointer;
	}
	.area-tool-trigger > button.active {
		color: #291b10;
		background: #e0b86f;
	}
	.area-tools {
		position: absolute;
		z-index: 1;
		top: 0;
		left: 3.45rem;
		display: grid;
		gap: 0.3rem;
		width: 180px;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.96);
		font-size: 0.62rem;
		box-shadow: 0 10px 24px #0006;
	}
	.area-tools small {
		color: #b9aa9d;
		line-height: 1.35;
	}
	.area-tools input {
		min-width: 0;
		border: 1px solid #5d493b;
		border-radius: 4px;
		padding: 0.3rem;
		color: #e8d3aa;
		background: #241c1e;
		font-size: 0.62rem;
	}
	.area-tools label {
		color: #b9aa9d;
	}
	.area-tools button {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.62rem;
	}
	.area-tools button.active {
		color: #281a0f;
		background: #e0b86f;
	}
	.area-list {
		display: grid;
		gap: 0.2rem;
		max-height: 92px;
		overflow: auto;
	}
	.area-list span {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: #d8c5aa;
	}
	.area-list button {
		border: 0;
		padding: 0;
		color: #dfa797;
		background: transparent;
	}
	.layer-tool-trigger {
		position: absolute;
		z-index: 5;
		top: 0.8rem;
		left: 0.8rem;
	}
	.layer-tool-trigger > button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 1px solid #765d3d;
		border-radius: 7px;
		color: #ecd8a8;
		background: rgba(25, 19, 23, 0.92);
		font-size: 1rem;
		cursor: pointer;
	}
	.layer-tool-trigger > button.active {
		color: #291b10;
		background: #e0b86f;
	}
	.layer-tools {
		position: absolute;
		top: 2.7rem;
		left: 0;
		display: grid;
		gap: 0.42rem;
		width: 190px;
		padding: 0.6rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.97);
		font-size: 0.65rem;
		box-shadow: 0 10px 24px #0006;
	}
	.layer-tools label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #cdbda9;
	}
	.layer-tools input {
		accent-color: #d8ad67;
	}
	.layer-tools small {
		color: #9f9186;
		font-size: 0.58rem;
		line-height: 1.3;
	}
	.wall-tools {
		position: absolute;
		z-index: 4;
		top: 12rem;
		right: 0.8rem;
		display: grid;
		gap: 0.3rem;
		width: 145px;
		padding: 0.55rem;
		border: 1px solid #765d3d;
		border-radius: 8px;
		color: #ebddca;
		background: rgba(25, 19, 23, 0.92);
		font-size: 0.62rem;
	}
	.wall-tools button,
	.wall-tools select {
		border: 1px solid #765d3d;
		border-radius: 5px;
		padding: 0.35rem;
		color: #e8d3aa;
		background: #2b211e;
		font-size: 0.62rem;
	}
	.wall-tools button.active {
		color: #281a0f;
		background: #e0b86f;
	}
	.wall-tools small {
		color: #b9aa9d;
		font-size: 0.58rem;
	}
	.wall-list {
		display: grid;
		gap: 0.2rem;
		max-height: 70px;
		overflow: auto;
	}
	.wall-list > span,
	.wall-list > span > span {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		color: #d8c5aa;
	}
	.wall-list button {
		border: 0;
		padding: 0;
		color: #dfa797;
		background: transparent;
	}
	.table-tools-gm {
		position: absolute;
		z-index: 6;
		top: 0.8rem;
		left: 0.9rem;
		width: 0;
		height: 0;
	}
	.table-tools-gm-buttons {
		display: block;
	}
	.table-tools-gm-buttons > div {
		position: relative;
		width: 0;
		height: 0;
	}
	.table-tools-gm-buttons .layer-tool-trigger,
	.table-tools-gm-buttons .area-tool-trigger,
	.table-tools-gm-buttons .wall-tool-trigger {
		position: relative;
		top: auto;
		left: auto;
		right: auto;
		transform: none;
	}
	.table-tools-gm-buttons > div > button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border: 0;
		border-radius: 6px;
		color: #f0cb85;
		background: transparent;
		font-size: 1.05rem;
		cursor: pointer;
	}
	.table-tools-gm-buttons > div > button {
		display: none;
	}
	.table-tools-gm-buttons > div > button:hover,
	.table-tools-gm-buttons > div > button.active {
		background: #453329;
	}
	.table-tools-gm .layer-tools,
	.table-tools-gm .area-tools,
	.table-tools-gm .wall-tools {
		box-sizing: border-box;
		display: grid;
		gap: 0.5rem;
		top: 0;
		left: 3rem;
		right: auto;
		width: min(300px, calc(100vw - 5rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: 0.85rem;
		border: 1px solid rgba(216, 173, 103, 0.38);
		border-radius: 10px;
		color: #eee4d6;
		background: rgba(25, 19, 23, 0.96);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(12px);
		z-index: 20;
		font-family: inherit;
		font-size: 0.72rem;
		line-height: 1.35;
		text-align: left;
	}
	.table-tools-gm .area-tools {
		top: 3rem;
	}
	.table-tools-gm .wall-tools {
		top: 6rem;
	}
	.table-tools-gm .layer-tools label,
	.table-tools-gm .area-tools label,
	.table-tools-gm .layer-tools small,
	.table-tools-gm .area-tools small,
	.table-tools-gm .wall-tools small,
	.table-tools-gm .layer-tools strong,
	.table-tools-gm .area-tools strong,
	.table-tools-gm .wall-tools strong {
		width: 100%;
		text-align: left;
	}
	.table-tools-gm .area-tools input,
	.table-tools-gm .wall-tools select,
	.table-tools-gm .area-tools button,
	.table-tools-gm .wall-tools button {
		width: 100%;
		font: inherit;
		font-size: 0.72rem;
		text-align: left;
	}
	@media (max-width: 760px) {
		.table-tools-gm {
			top: 0.75rem;
			left: 50%;
			transform: translateX(-50%);
		}
		.table-tools-gm-buttons > div > button {
			width: 2.35rem;
			height: 2.35rem;
			font-size: 1rem;
		}
		.table-tools-gm .layer-tools,
		.table-tools-gm .area-tools,
		.table-tools-gm .wall-tools {
			top: 3.55rem;
			left: 50%;
			transform: translateX(-50%);
			z-index: 20;
		}
		.camera-tools {
			top: 0.65rem;
		}
	}
</style>
