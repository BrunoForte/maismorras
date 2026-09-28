<script lang="ts">
	import { tick } from 'svelte';
	import {
		activeDiceRolls,
		completedDiceRollNonces,
		diceRendererEffective,
		diceRendererError,
		diceRendererMode,
		diceOverlay,
		diceResultDisplayDuration,
		reportDiceAnimationComplete,
		restoreDicePreference,
		setDiceRendererMode
	} from '$lib/stores/diceOverlayStore';
	let { viewport = false }: { viewport?: boolean } = $props();
	type DiceBoxComponent = typeof import('./DiceBox3D.svelte').default;
	let DiceBox3DComponent = $state<DiceBoxComponent | null>(null);
	let visible = $state(false);
	let retrying = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

	void $activeDiceRolls;
	void $diceRendererEffective;
	restoreDicePreference();
	$effect(() => {
		if ($diceRendererEffective === '2d' || !$activeDiceRolls.length || DiceBox3DComponent) return;
		void import('./DiceBox3D.svelte').then((module) => {
			DiceBox3DComponent = module.default;
		});
	});
	$effect(() => {
		if (!$activeDiceRolls.length) {
			visible = false;
			return;
		}
		visible = false;
		if (timer) clearTimeout(timer);
		if (fallbackTimer) clearTimeout(fallbackTimer);
		if ($diceRendererEffective === '2d') {
			// The lightweight visual is a short animation; do not block indefinitely.
			fallbackTimer = setTimeout(() => {
				reportDiceAnimationComplete(
					$activeDiceRolls.map((roll) => roll.nonce).filter(Boolean) as string[]
				);
			}, 700);
		}
	});
	$effect(() => {
		const rolls = $activeDiceRolls;
		const completed = $completedDiceRollNonces;
		if (!rolls.length || !rolls.every((roll) => roll.nonce && completed.includes(roll.nonce)))
			return;
		void tick().then(() => {
			visible = true;
			if (timer) clearTimeout(timer);
			const displayDuration = diceResultDisplayDuration(rolls.length);
			timer = setTimeout(() => {
				visible = false;
				diceOverlay.set(null);
			}, displayDuration);
		});
	});
	const sides = (expression: string) =>
		Number(expression.match(/d(4|6|8|10|12|20|100)/i)?.[1] ?? 20);
	async function retryDiceBox() {
		retrying = true;
		DiceBox3DComponent = null;
		setDiceRendererMode($diceRendererMode === 'auto' ? 'auto' : $diceRendererMode);
		await tick();
		if ($diceRendererEffective !== '2d') {
			try {
				DiceBox3DComponent = (await import('./DiceBox3D.svelte')).default;
			} catch {
				// A falha detalhada já é exibida pelo componente/store.
			}
		}
		retrying = false;
	}
</script>

{#if $diceRendererEffective !== '2d' && DiceBox3DComponent}
	<DiceBox3DComponent {viewport} />
{:else if $diceRendererEffective !== '2d' && $activeDiceRolls.length}
	<div class="dice-loading" role="status" aria-live="polite">Carregando dados 3D…</div>
{/if}
{#if $diceRendererError}
	<div class="dice-error" role="status">
		<span>{$diceRendererError}</span>
		<button type="button" onclick={retryDiceBox} disabled={retrying}>
			{retrying ? 'Tentando…' : 'Tentar novamente'}
		</button>
	</div>
{/if}
{#if $activeDiceRolls.length && visible}
	<div class="dice-overlay" aria-live="polite" aria-label="Rolagens recentes">
		{#each $activeDiceRolls as result (result.nonce ?? `${result.expression}-${result.total}-${result.dice.join(',')}`)}<article
			>
				{#if $diceRendererEffective === '2d'}<div class={`die d${sides(result.expression)}`}>
						d{sides(result.expression)}
					</div>{/if}
				<div class="result">
					<span>{result.expression}</span><strong>{result.total}</strong>
					{#if $diceRendererEffective !== '2d'}<small class="result-source"
							>Resultado oficial do servidor</small
						>{/if}
					<small>[{result.dice.join(', ')}]</small>
				</div>
			</article>{/each}
	</div>
{/if}

<style>
	.dice-overlay {
		position: absolute;
		z-index: 7;
		left: 50%;
		top: 50%;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		align-items: center;
		gap: 0.75rem;
		width: min(94vw, 900px);
		transform: translate(-50%, -50%);
		pointer-events: none;
		animation: appear 0.24s ease-out both;
	}
	.dice-error {
		position: absolute;
		z-index: 12;
		left: 50%;
		top: 1rem;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: min(94vw, 42rem);
		padding: 0.6rem 0.8rem;
		border: 1px solid #c87965;
		border-radius: 0.65rem;
		color: #fff1e8;
		background: rgba(48, 25, 24, 0.96);
		box-shadow: 0 8px 24px #0008;
		font-size: 0.8rem;
	}
	.dice-loading {
		position: fixed;
		z-index: 120;
		inset: 1rem auto auto 50%;
		transform: translateX(-50%);
		padding: 0.45rem 0.75rem;
		border: 1px solid rgba(216, 173, 103, 0.55);
		border-radius: 0.5rem;
		background: rgba(24, 20, 22, 0.94);
		color: #f2d49a;
		font-size: 0.8rem;
	}
	.dice-error button {
		flex: none;
		padding: 0.4rem 0.65rem;
		border: 1px solid #d5a87b;
		border-radius: 0.45rem;
		color: #fff4df;
		background: #49362d;
		cursor: pointer;
	}
	.dice-overlay article {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		justify-content: center;
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
	.d4 {
		clip-path: polygon(50% 0, 100% 100%, 0 100%);
	}
	.d6 {
		clip-path: polygon(20% 0, 80% 0, 100% 50%, 80% 100%, 20% 100%, 0 50%);
	}
	.d8 {
		clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
	}
	.d10 {
		clip-path: polygon(50% 0, 95% 32%, 78% 100%, 22% 100%, 5% 32%);
	}
	.d12 {
		clip-path: polygon(50% 0, 85% 12%, 100% 50%, 85% 88%, 50% 100%, 15% 88%, 0 50%, 15% 12%);
	}
	.d100 {
		clip-path: polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%);
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
	.result .result-source {
		color: #f0d29d;
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
	@media (max-width: 640px) {
		.dice-overlay {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.5rem;
		}
		.die {
			width: 3.25rem;
			height: 3.25rem;
		}
	}
</style>
