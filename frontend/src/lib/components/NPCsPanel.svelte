<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createNPC, deleteNPC, listNPCs, type NPC } from '$lib/services/npcApi';
	import { generateNPC, type NPCClass, type NPCGender } from '$lib/utils/npcGenerator';
	import { request } from '$lib/services/sceneApi';
	import { appLocale } from '$lib/stores/locale';

	let {
		campaignId,
		sceneId,
		session,
		onclose,
		ontokencreated
	}: {
		campaignId: string;
		sceneId: string;
		session: Session;
		onclose: () => void;
		ontokencreated: () => void;
	} = $props();
	let npcs = $state<NPC[]>([]);
	let name = $state('');
	let hp = $state('');
	let ca = $state('');
	let nameManuallySet = $state(false);
	let hpManuallySet = $state(false);
	let caManuallySet = $state(false);
	let level = $state(1);
	let gender = $state<NPCGender>('unissex');
	let className = $state<NPCClass>('guerreiro');
	let generatedAttack = $state<ReturnType<typeof generateNPC>['attack'] | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let placing = $state<string | null>(null);
	let message = $state('');
	function randomName() {
		if (nameManuallySet && name.trim()) return;
		name = generateNPC({ className, level, gender }).name;
	}
	function randomNPC() {
		const result = generateNPC({
			className,
			level,
			gender,
			name: nameManuallySet ? name : '',
			hitPoints: hpManuallySet && hp !== '' ? Number(hp) : null,
			armorClass: caManuallySet && ca !== '' ? Number(ca) : null
		});
		name = result.name;
		hp = String(result.hitPoints);
		ca = String(result.armorClass);
		generatedAttack = result.attack;
	}
	onMount(async () => {
		try {
			npcs = (await listNPCs(session, campaignId)).npcs;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not load NPCs.'
						: 'Não foi possível carregar os NPCs.';
		} finally {
			loading = false;
		}
	});
	async function addNPC() {
		if (saving) return;
		saving = true;
		message = '';
		try {
			const generated = generateNPC({
				className,
				level,
				gender,
				name: nameManuallySet ? name : '',
				hitPoints: hpManuallySet && hp !== '' ? Number(hp) : null,
				armorClass: caManuallySet && ca !== '' ? Number(ca) : null
			});
			const npc = await createNPC(session, campaignId, {
				name: generated.name,
				sheet: {
					className,
					level: generated.level,
					gender: generated.gender,
					hitPointsCurrent: generated.hitPoints,
					hitPointsMax: generated.hitPoints,
					armorClass: generated.armorClass,
					initiative: 0,
					size: 1,
					color: 3381504,
					imageUrl: '',
					creatureType: 'humanoide',
					challenge: '',
					speed: '9 m',
					abilities: generated.abilities,
					traits: [],
					actions: [
						{
							name: generated.attack.name,
							kind: 'action',
							toHit: generated.attack.toHit,
							range: generated.attack.range,
							damage: generated.attack.damage,
							saveDC: 0,
							description: generated.attack.description
						}
					],
					resistances: [],
					immunities: [],
					senses: '',
					languages: ''
				}
			});
			npcs = [...npcs, npc];
			name = '';
			hp = '';
			ca = '';
			nameManuallySet = false;
			hpManuallySet = false;
			caManuallySet = false;
			generatedAttack = null;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not create the NPC.'
						: 'Não foi possível criar o NPC.';
		} finally {
			saving = false;
		}
	}
	async function placeNPC(npc: NPC) {
		placing = npc.id;
		message = '';
		try {
			await request(session, `/api/v1/scenes/${sceneId}/tokens/from-npc`, {
				method: 'POST',
				body: JSON.stringify({ actorId: npc.id })
			});
			await ontokencreated();
			message =
				$appLocale === 'en'
					? `${npc.name} was added to the scene.`
					: `${npc.name} foi adicionado à cena.`;
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not add the NPC.'
						: 'Não foi possível adicionar o NPC.';
		} finally {
			placing = null;
		}
	}
	async function removeNPC(npc: NPC) {
		if (
			!confirm(
				$appLocale === 'en'
					? `Delete ${npc.name} and its scene tokens?`
					: `Excluir ${npc.name} e seus tokens das cenas?`
			)
		)
			return;
		placing = npc.id;
		message = '';
		try {
			await deleteNPC(session, campaignId, npc.id);
			npcs = npcs.filter((item) => item.id !== npc.id);
			message = $appLocale === 'en' ? 'NPC deleted.' : 'NPC excluído.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível excluir o NPC.';
		} finally {
			placing = null;
		}
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(event) => event.currentTarget === event.target && onclose()}
>
	<section class="panel" aria-label={$appLocale === 'en' ? 'Campaign NPCs' : 'NPCs da campanha'}>
		<header>
			<div>
				<p>{$appLocale === 'en' ? 'CAMPAIGN MANAGEMENT' : 'GESTÃO DA CAMPANHA'}</p>
				<h2>NPCs</h2>
			</div>
			<button onclick={onclose} aria-label="Fechar">×</button>
		</header>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void addNPC();
			}}
		>
			<input
				bind:value={name}
				oninput={(event) => (nameManuallySet = Boolean(event.currentTarget.value.trim()))}
				placeholder={$appLocale === 'en' ? 'NPC name' : 'Nome do NPC'}
				maxlength="120"
				aria-label={$appLocale === 'en' ? 'NPC name' : 'Nome do NPC'}
			/>
			<label
				>PV <input
					bind:value={hp}
					oninput={(event) => (hpManuallySet = event.currentTarget.value !== '')}
					type="number"
					min="1"
					max="9999"
					placeholder="Auto"
				/></label
			>
			<label
				>CA <input
					bind:value={ca}
					oninput={(event) => (caManuallySet = event.currentTarget.value !== '')}
					type="number"
					min="1"
					max="99"
					placeholder="Auto"
				/></label
			>
			<label
				>Nível <input
					bind:value={level}
					oninput={() => (generatedAttack = null)}
					type="number"
					min="1"
					max="20"
					required
				/></label
			>
			<label
				>Classe <select bind:value={className} onchange={() => (generatedAttack = null)}>
					<option value="barbaro">Bárbaro</option><option value="bardo">Bardo</option><option
						value="clerigo">Clérigo</option
					><option value="druida">Druida</option><option value="feiticeiro">Feiticeiro</option
					><option value="guerreiro">Guerreiro</option><option value="ladino">Ladino</option><option
						value="mago">Mago</option
					><option value="monge">Monge</option><option value="paladino">Paladino</option><option
						value="patrulheiro">Patrulheiro</option
					><option value="bruxo">Bruxo</option>
				</select></label
			>
			<label
				>Sexo <select bind:value={gender} onchange={() => (generatedAttack = null)}
					><option value="unissex">Unissex</option><option value="masculino">Masculino</option
					><option value="feminino">Feminino</option></select
				></label
			>
			<button type="button" class="secondary" onclick={randomName}>Gerar nome</button>
			<button type="button" class="secondary" onclick={randomNPC}>NPC aleatório</button>
			{#if generatedAttack}<p class="generated-attack">
					Ataque: {generatedAttack.name} · {generatedAttack.toHit >= 0
						? '+'
						: ''}{generatedAttack.toHit} · {generatedAttack.damage}
				</p>{/if}
			<button disabled={saving}
				>{saving
					? $appLocale === 'en'
						? 'Creating…'
						: 'Criando…'
					: $appLocale === 'en'
						? 'Create NPC'
						: 'Criar NPC'}</button
			>
		</form>
		<div class="body">
			{#if loading}<p>
					{$appLocale === 'en' ? 'Consulting the bestiary…' : 'Consultando bestiário…'}
				</p>{:else if npcs.length === 0}<p>
					{$appLocale === 'en' ? 'No NPCs created yet.' : 'Nenhum NPC criado ainda.'}
				</p>{:else}{#each npcs as npc (npc.id)}<article>
						<div>
							<strong>{npc.name}</strong><small
								>{npc.sheet.className ?? 'NPC'}{npc.sheet.level ? ` · Nv. ${npc.sheet.level}` : ''} ·
								PV {npc.sheet.hitPointsCurrent}/{npc.sheet.hitPointsMax} · CA {npc.sheet
									.armorClass}{npc.sheet.actions[0]
									? ` · ${npc.sheet.actions[0].name} (${npc.sheet.actions[0].damage})`
									: ''}</small
							>
						</div>
						<button onclick={() => placeNPC(npc)} disabled={placing === npc.id}
							>{placing === npc.id
								? $appLocale === 'en'
									? 'Adding…'
									: 'Adicionando…'
								: $appLocale === 'en'
									? 'Create token'
									: 'Criar token'}</button
						><button
							class="danger"
							onclick={() => void removeNPC(npc)}
							disabled={placing === npc.id}>{$appLocale === 'en' ? 'Delete' : 'Excluir'}</button
						>
					</article>{/each}{/if}
		</div>
		{#if message}<footer>{message}</footer>{/if}
	</section>
</div>

<style>
	.backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 6, 8, 0.72);
		backdrop-filter: blur(5px);
	}
	.panel {
		width: min(100%, 620px);
		overflow: hidden;
		border: 1px solid #765d3d;
		border-radius: 14px;
		color: #eee4d7;
		background: #1b171a;
		box-shadow: 0 30px 90px #000;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #403536;
	}
	header p {
		margin: 0 0 0.25rem;
		color: #d8ad67;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
	}
	h2 {
		margin: 0;
		font:
			600 1.35rem Georgia,
			serif;
	}
	header button {
		border: 0;
		color: #cbb9a7;
		background: transparent;
		font-size: 1.4rem;
	}
	form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.55rem;
		padding: 1rem;
		border-bottom: 1px solid #403536;
	}
	form > input:first-child {
		grid-column: span 2;
	}
	form button {
		min-height: 2.2rem;
	}
	.secondary {
		border: 1px solid #806039;
		border-radius: 7px;
		color: #f0cb85;
		background: #2b211e;
	}
	input {
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 7px;
		padding: 0.55rem;
		color: #f6eee4;
		background: #151216;
	}
	select {
		min-width: 0;
		border: 1px solid #51443a;
		border-radius: 7px;
		padding: 0.55rem;
		color: #f6eee4;
		background: #151216;
	}
	.generated-attack {
		grid-column: 1 / -1;
		margin: 0;
		color: #f0cb85;
		font-size: 0.75rem;
	}
	label {
		display: grid;
		gap: 0.2rem;
		color: #b6a89b;
		font-size: 0.65rem;
	}
	label input {
		width: 4.3rem;
	}
	form button,
	article button {
		border: 1px solid #806039;
		border-radius: 7px;
		padding: 0.5rem 0.65rem;
		color: #26190e;
		background: #e0b86f;
		font-size: 0.72rem;
		font-weight: 800;
	}
	button:disabled {
		opacity: 0.6;
	}
	.body {
		display: grid;
		gap: 0.55rem;
		max-height: 45vh;
		overflow: auto;
		padding: 1rem;
	}
	.body > p {
		color: #ad9e90;
		text-align: center;
	}
	article {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid #493c39;
		border-radius: 9px;
		padding: 0.75rem;
		background: rgba(47, 36, 37, 0.7);
	}
	article div {
		display: grid;
		gap: 0.18rem;
	}
	article strong {
		font:
			600 0.98rem Georgia,
			serif;
	}
	small {
		color: #b6a89b;
		font-size: 0.72rem;
	}
	.danger {
		border: 1px solid #945348;
		border-radius: 7px;
		padding: 0.5rem 0.65rem;
		color: #ffd0c4;
		background: #3a211f;
		font-size: 0.72rem;
		font-weight: 800;
		white-space: nowrap;
	}
	footer {
		border-top: 1px solid #403536;
		padding: 0.7rem 1rem;
		color: #f0d8aa;
		font-size: 0.8rem;
	}
	@media (max-width: 560px) {
		form {
			grid-template-columns: 1fr 1fr;
		}
		form > input {
			grid-column: 1 / -1;
		}
		form button {
			grid-column: 1 / -1;
		}
	}
</style>
