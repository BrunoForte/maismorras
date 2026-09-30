<script lang="ts">
	import type { Session } from '@supabase/supabase-js';
	import type { Scene } from '$lib/services/sceneApi';
	import type { CampaignSummary } from '$lib/services/campaignApi';
	import type { Participant } from '$lib/services/characterApi';
	import { appLocale } from '$lib/stores/locale';

	export type CampaignPanelActions = {
		toggleOverlay: () => void;
		createInvite: () => void;
		openParticipants: () => void;
		openNpcs: () => void;
		install: () => void;
		linkCamera: (index: number, characterId: string) => void;
		saveCameras: () => void;
		openOverlay: () => void;
		copyOverlayAddress: () => void;
		revokeOverlayAccess: () => void;
	};
	type OverlayCamera = {
		url: string;
		playerName: string;
		characterName: string;
		characterId?: string;
		email: string;
	};
	type OverlayEditorComponent = typeof import('$lib/components/OverlayLayoutEditor.svelte').default;
	type Props = {
		view: 'campaign' | 'overlay';
		campaign: CampaignSummary;
		activeScene: Scene | null;
		session: Session;
		overlayEnabled: boolean;
		overlayCameras: OverlayCamera[];
		overlayCharacters: Participant[];
		installAvailable: boolean;
		OverlayLayoutEditorComponent: OverlayEditorComponent | null;
		actions: CampaignPanelActions;
	};
	let {
		view,
		campaign,
		activeScene,
		session,
		overlayEnabled = $bindable(),
		overlayCameras = $bindable(),
		overlayCharacters,
		installAvailable,
		OverlayLayoutEditorComponent,
		actions
	}: Props = $props();
</script>

{#if view === 'overlay'}<main class="campaign-settings overlay-workspace">
		<section class="overlay-toggle-card">
			<div>
				<p class="eyebrow">TRANSMISSÃO</p>
				<h2>Overlay da live</h2>
				<p>Ative os recursos de overlay para esta campanha e configure a cena atual.</p>
			</div>
			<label class="switch"
				><input type="checkbox" checked={overlayEnabled} onchange={actions.toggleOverlay} /><span
				></span>{overlayEnabled ? 'Ativada' : 'Desativada'}</label
			>
		</section>
		{#if overlayEnabled && activeScene && OverlayLayoutEditorComponent}<OverlayLayoutEditorComponent
				campaignId={campaign.id}
				sceneId={activeScene.id}
				{session}
			/>{:else if !overlayEnabled}<p class="status-message">
				Ative a overlay para editar seus elementos.
			</p>{:else}<p class="status-message">Selecione uma cena para editar a overlay.</p>{/if}
	</main>
{:else}<main class="campaign-settings">
		<section>
			<p class="eyebrow">
				{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}
			</p>
			<h2>{$appLocale === 'en' ? 'Invites and settings' : 'Convites e configurações'}</h2>
			<p>
				{$appLocale === 'en'
					? 'Manage who joins the campaign and the options that affect the whole table.'
					: 'Gerencie quem entra na campanha e as opções que afetam toda a mesa.'}
			</p>
		</section>
		<div class="settings-actions">
			<button class="primary-button" onclick={actions.createInvite}
				>{$appLocale === 'en' ? 'Copy player invite' : 'Copiar convite de jogador'}</button
			><button class="secondary-button" onclick={actions.openParticipants}
				>{$appLocale === 'en' ? 'Participants' : 'Participantes'}</button
			><button class="secondary-button" onclick={actions.openNpcs}
				>{$appLocale === 'en' ? 'NPCs' : 'NPCs'}</button
			>
			{#if installAvailable}<button class="secondary-button" onclick={actions.install}
					>{$appLocale === 'en' ? 'Install MaisMorras' : 'Instalar MaisMorras'}</button
				>{/if}
		</div>
		<section class="overlay-settings">
			<p class="eyebrow">OVERLAY DA LIVE</p>
			<h3>Link, cena e câmeras</h3>
			<p>
				Configure até cinco câmeras de jogadores e uma do narrador. Cole o link de sala do
				VDO.Ninja; o narrador aparece no topo sobre a iniciativa e as câmeras dos jogadores na base,
				à frente dos dados. O nome do personagem aparece junto ao vídeo.
			</p>
			<div class="overlay-camera-grid">
				{#each overlayCameras as camera, index (index)}<fieldset>
						<legend
							>{index === 5
								? 'Câmera do narrador · topo esquerdo'
								: `Câmera do jogador ${index < 5 ? index + 1 : index}`}</legend
						>
						<input bind:value={camera.url} placeholder="Link https://vdo.ninja/..." />
						<input bind:value={camera.playerName} placeholder="Nome do jogador" />
						<label class="camera-character-link">
							<span>Ficha vinculada</span>
							<select
								value={camera.characterId ?? ''}
								onchange={(event) => actions.linkCamera(index, event.currentTarget.value)}
							>
								<option value="">Sem vínculo</option>
								{#each overlayCharacters as participant (participant.character?.id)}
									{#if participant.character}<option value={participant.character.id}
											>{participant.character.sheet.name} · {participant.displayName}</option
										>{/if}
								{/each}
							</select>
						</label>
						{#if !camera.characterId}<input
								bind:value={camera.characterName}
								placeholder="Nome exibido, se não houver ficha vinculada"
							/>{/if}
						<input bind:value={camera.email} type="email" placeholder="E-mail (opcional)" />
					</fieldset>{/each}
			</div>
			<div class="settings-actions">
				<button class="primary-button" onclick={actions.saveCameras}>Salvar câmeras</button>
				<button class="secondary-button" onclick={actions.openOverlay}
					>Abrir overlay no navegador</button
				>
				<button class="secondary-button" onclick={() => void actions.copyOverlayAddress()}
					>Gerar link pareado para o OBS</button
				>
				<button class="secondary-button" onclick={() => void actions.revokeOverlayAccess()}
					>Revogar acesso do OBS</button
				>
			</div>
		</section>
	</main>{/if}

<style>
	.campaign-settings {
		display: grid;
		gap: 1.5rem;
		min-height: 510px;
		min-width: 0;
		padding: clamp(1.5rem, 4vw, 3.5rem) clamp(1.25rem, 5vw, 5rem);
		color: #e9dfd3;
	}
	.overlay-workspace {
		min-width: 0;
		overflow-x: hidden;
	}
	.overlay-workspace > * {
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
	}
	.overlay-settings {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
	}
	.overlay-toggle-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
		border: 1px solid #3a312e;
		border-radius: 12px;
		padding: clamp(1rem, 2.5vw, 1.5rem);
		background: #201b1e;
	}
	.overlay-toggle-card h2 {
		margin-bottom: 0.35rem;
	}
	.overlay-toggle-card p:not(.eyebrow) {
		margin: 0;
		color: #a99c91;
		font-size: 0.82rem;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: #d8c9b9;
		font-size: 0.78rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.switch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.switch span {
		position: relative;
		width: 2.5rem;
		height: 1.35rem;
		border-radius: 999px;
		background: #4a3d36;
		transition: background 0.2s;
	}
	.switch span::after {
		content: '';
		position: absolute;
		top: 0.18rem;
		left: 0.18rem;
		width: 0.99rem;
		height: 0.99rem;
		border-radius: 50%;
		background: #e9dfd3;
		transition: transform 0.2s;
	}
	.switch input:checked + span {
		background: #9a6d35;
	}
	.switch input:checked + span::after {
		transform: translateX(1.15rem);
	}
	.overlay-settings h3 {
		margin: 0 0 0.45rem;
		color: #f0e0c8;
		font:
			600 clamp(1.1rem, 2vw, 1.35rem) Georgia,
			serif;
	}
	.overlay-settings > p:not(.eyebrow) {
		margin: 0 0 1rem;
		max-width: 680px;
		color: #a99c91;
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.overlay-camera-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr));
		gap: 0.75rem;
		width: 100%;
		min-width: 0;
	}
	.overlay-camera-grid fieldset {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
		margin: 0;
		border: 1px solid #51443a;
		border-radius: 9px;
		padding: 0.75rem;
		background: #181417;
	}
	.overlay-camera-grid legend {
		max-width: 100%;
		padding: 0 0.3rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.overlay-camera-grid input {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.55rem 0.6rem;
		color: #eee4d6;
		background: #211c1e;
		font-family: inherit;
		font-size: 0.76rem;
	}
	.overlay-camera-grid select {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid #5c5045;
		border-radius: 7px;
		padding: 0.55rem 0.6rem;
		color: #eee4d6;
		background: #211c1e;
		font: inherit;
		font-size: 0.76rem;
	}
	.camera-character-link {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		color: #b6a899;
		font-size: 0.7rem;
	}
	.overlay-camera-grid input::placeholder {
		color: #84776d;
	}
	.overlay-camera-grid input:focus {
		border-color: #d8ad67;
		outline: 2px solid rgba(216, 173, 103, 0.2);
		outline-offset: 1px;
	}
	.overlay-settings > .settings-actions {
		margin-top: 1rem;
	}
	.campaign-settings h2 {
		margin: 0 0 0.6rem;
		font:
			500 clamp(1.8rem, 4vw, 2.7rem) Georgia,
			serif;
	}
	.campaign-settings section > p:not(.eyebrow) {
		max-width: 580px;
		color: #a99c91;
		line-height: 1.6;
	}
	.settings-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}
	.settings-actions .primary-button {
		width: auto;
	}
	.eyebrow {
		margin: 2.8rem 0 0.75rem;
		color: #d8ad67;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.18em;
	}
	.primary-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 100%;
		border: 0;
		border-radius: 9px;
		padding: 0.85rem 1rem;
		color: #20160e;
		background: #ecd09a;
		font-weight: 750;
		transition:
			transform 0.18s,
			background 0.18s;
		cursor: pointer;
	}
	.primary-button:hover {
		background: #f5dbab;
		transform: translateY(-1px);
	}
	.secondary-button {
		border: 1px solid #5c5045;
		border-radius: 8px;
		padding: 0.65rem 0.85rem;
		color: #e4d7c7;
		background: #211c1e;
	}
	.secondary-button:hover {
		border-color: #c19c62;
		color: #f6d89c;
	}
	.status-message {
		color: #a89b8e;
	}
	@media (max-width: 760px) {
		.campaign-settings {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.overlay-settings {
			padding: 0.85rem;
		}
		.overlay-toggle-card {
			align-items: flex-start;
			flex-direction: column;
		}
		.overlay-camera-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.overlay-camera-grid fieldset {
			padding: 0.65rem;
		}
		.settings-actions {
			display: grid;
			grid-template-columns: 1fr;
		}
		.settings-actions button {
			width: 100%;
		}
	}
</style>
