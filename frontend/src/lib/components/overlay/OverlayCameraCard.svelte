<script lang="ts">
	let {
		kind,
		src,
		title,
		label,
		secondaryLabel = '',
		hp = null,
		style = '',
		positioned = false
	}: {
		kind: 'host' | 'player';
		src: string;
		title: string;
		label: string;
		secondaryLabel?: string;
		hp?: { current: number; max: number } | null;
		style?: string;
		positioned?: boolean;
	} = $props();
	const hpPercent = () =>
		Math.max(0, Math.min(100, (100 * (hp?.current ?? 0)) / Math.max(1, hp?.max ?? 1)));
</script>

<article
	class="camera-card"
	class:host-camera={kind === 'host'}
	class:player-camera={kind === 'player'}
	class:layout-positioned={positioned}
	{style}
>
	<div class="camera-frame">
		<iframe {src} {title} allow="camera; microphone; autoplay; fullscreen"></iframe>
	</div>
	<strong>{label}</strong>
	{#if secondaryLabel && secondaryLabel !== label}<small>{secondaryLabel}</small>{/if}
	{#if hp}
		<div
			class="camera-hp"
			class:critical={hp.current > 0 && hpPercent() <= 25}
			class:unconscious={hp.current <= 0}
			aria-label={`Pontos de vida de ${label}: ${hp.current} de ${hp.max}`}
		>
			<div class="camera-hp-track"><span style={`width:${hpPercent()}%`}></span></div>
			<small>{hp.current <= 0 ? 'INCONSCIENTE' : `PV ${hp.current}/${hp.max}`}</small>
		</div>
	{/if}
</article>

<style>
	.camera-card {
		position: absolute;
		z-index: 45;
		box-sizing: border-box;
		display: grid;
		align-content: end;
		gap: 0.12rem;
		color: #f5d38c;
		font-size: clamp(0.45rem, 0.75vw, 0.76rem);
		text-align: center;
		text-shadow: 0 1px 3px #000;
	}
	.host-camera {
		z-index: 50;
	}
	.camera-frame {
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border: 1px solid #d8ad67a8;
		border-radius: clamp(4px, 0.6vw, 10px);
		background: #0b090de8;
		box-shadow: 0 5px 18px #0008;
	}
	.camera-frame iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		pointer-events: auto;
	}
	.camera-card strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.camera-card small {
		color: #d6c7b4;
	}
	.camera-hp {
		display: grid;
		grid-template-columns: minmax(2.5rem, 1fr) auto;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		min-width: 0;
		padding: 0.12rem 0.25rem;
		box-sizing: border-box;
		border: 1px solid #ffffff26;
		border-radius: 999px;
		background: #09080bd9;
	}
	.camera-hp-track {
		height: clamp(3px, 0.45vw, 6px);
		overflow: hidden;
		border-radius: 999px;
		background: #54464a;
	}
	.camera-hp-track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #b6d477, #60bd77);
		transition:
			width 240ms ease,
			background-color 240ms ease;
	}
	.camera-hp.critical .camera-hp-track span {
		background: linear-gradient(90deg, #f0bd58, #dd803d);
	}
	.camera-hp.unconscious .camera-hp-track span {
		background: #bd4c55;
	}
	.camera-hp small {
		font-size: clamp(0.38rem, 0.55vw, 0.58rem);
		font-weight: 800;
		white-space: nowrap;
	}
	.layout-positioned {
		left: var(--overlay-x, 0%);
		top: var(--overlay-y, 0%);
		width: var(--overlay-width, auto);
		min-height: var(--overlay-height, auto);
		color: var(--overlay-color, inherit);
		font-size: var(--overlay-font, inherit);
		opacity: var(--overlay-opacity, 1);
		border-color: var(--overlay-border, transparent);
		border-width: var(--overlay-border-width, 0);
		box-shadow: var(--overlay-shadow, none);
	}
</style>
