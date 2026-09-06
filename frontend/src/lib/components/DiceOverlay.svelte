<script lang="ts">
	import { tick } from 'svelte';
	import { diceOverlay } from '$lib/stores/diceOverlayStore';

	let visible = $state(false);
	let result = $state<{ expression: string; total: number; dice: number[] } | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	$diceOverlay;
	$effect(() => {
		if (!$diceOverlay) return;
		result = $diceOverlay;
		visible = false;
		void tick().then(() => (visible = true));
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (visible = false), 2500);
	});
</script>

{#if result && visible}
	<div
		class="dice-overlay"
		aria-live="polite"
		aria-label={`Rolagem ${result.expression}: ${result.total}`}
	>
		<div class="die">d20</div>
		<div class="result">
			<span>{result.expression}</span><strong>{result.total}</strong><small
				>[{result.dice.join(', ')}]</small
			>
		</div>
	</div>
{/if}

<style>
	.dice-overlay {
		position: absolute;
		z-index: 7;
		left: 50%;
		top: 50%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		transform: translate(-50%, -50%);
		pointer-events: none;
		animation: appear 0.24s ease-out both;
	}
	.die {
		display: grid;
		place-items: center;
		width: 4.5rem;
		height: 4.5rem;
		color: #24180e;
		background: linear-gradient(135deg, #f4d796, #b8793b);
		clip-path: polygon(50% 0, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
		font:
			800 1rem Georgia,
			serif;
		animation: roll 0.72s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		box-shadow: 0 15px 28px rgba(0, 0, 0, 0.45);
	}
	.result {
		display: grid;
		gap: 0.08rem;
		min-width: 5rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid rgba(240, 203, 133, 0.8);
		border-radius: 9px;
		color: #f8eedf;
		background: rgba(23, 16, 18, 0.9);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
		text-align: center;
	}
	.result span,
	.result small {
		color: #d8bd8e;
		font-size: 0.68rem;
	}
	.result strong {
		color: #f4d796;
		font:
			700 2rem Georgia,
			serif;
		line-height: 1;
	}
	@keyframes roll {
		0% {
			transform: scale(0.2) rotate(-180deg);
			opacity: 0;
		}
		65% {
			transform: scale(1.15) rotate(25deg);
		}
		100% {
			transform: scale(1) rotate(0);
		}
	}
	@keyframes appear {
		from {
			opacity: 0;
			transform: translate(-50%, -35%);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dice-overlay,
		.die {
			animation: none;
		}
	}
</style>
