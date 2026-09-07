<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createCompendiumEntry, getCompendium, type CompendiumEntry, type CompendiumSource } from '$lib/services/compendiumApi';
	let { campaignId, session, isGM }: { campaignId: string; session: Session; isGM: boolean } = $props();
	let sources = $state<CompendiumSource[]>([]);
	let entries = $state<CompendiumEntry[]>([]);
	let filter = $state('all');
	let sourceFilter = $state('all');
	let loading = $state(true);
	let saving = $state(false);
	let message = $state('');
	let entryType = $state('feature');
	let name = $state('');
	let summary = $state('');
	let published = $state(true);
	let sourceId = $state('');
	const types = [['species','Espécie'],['background','Antecedente'],['class','Classe'],['subclass','Subclasse'],['feat','Talento'],['spell','Magia'],['item','Item'],['feature','Característica'],['other','Outro']];
	const visible = () => entries.filter((entry) =>
		(filter === 'all' || entry.entryType === filter) &&
		(sourceFilter === 'all' || entry.sourceId === sourceFilter)
	);
	const entryCount = (sourceId: string) => entries.filter((entry) => entry.sourceId === sourceId).length;
	async function load() {
		loading = true; message = '';
		try {
			const data = await getCompendium(session, campaignId);
			sources = data.sources; entries = data.entries;
			sourceId = sources.find((source) => !source.readOnly)?.id ?? '';
		} catch (error) { message = error instanceof Error ? error.message : 'Não foi possível carregar o compêndio.'; }
		finally { loading = false; }
	}
	async function create() {
		if (!name.trim() || !sourceId) { message = 'Informe ao menos o nome e a fonte.'; return; }
		saving = true; message = '';
		try {
			const entry = await createCompendiumEntry(session, campaignId, { sourceId, entryType, name: name.trim(), summary: summary.trim(), isPublished: published });
			entries = [...entries, entry].sort((a,b) => a.name.localeCompare(b.name));
			name = ''; summary = ''; message = 'Entrada adicionada ao compêndio.';
		} catch (error) { message = error instanceof Error ? error.message : 'Não foi possível salvar a entrada.'; }
		finally { saving = false; }
	}
	onMount(() => void load());
</script>

<main class="compendium">
	<header>
		<div><p>REGRAS E REFERÊNCIAS</p><h2>Compêndio</h2><span>Opções da campanha, homebrew e referências licenciadas.</span></div>
		{#if isGM}<button class="refresh" onclick={load} disabled={loading}>Atualizar</button>{/if}
	</header>
	{#if message}<p class:success={message.includes('adicionada')} class="message">{message}</p>{/if}
	<section class="sources"><h3>Fontes ativas · clique para filtrar</h3><button class:active={sourceFilter === 'all'} onclick={() => (sourceFilter = 'all')}><strong>Todas as fontes</strong><small>{entries.length} entradas</small></button>{#each sources as source (source.id)}<button class:active={sourceFilter === source.id} onclick={() => (sourceFilter = source.id)}><strong>{source.title}</strong><small>{source.kind === 'srd' ? `SRD ${source.version}` : source.kind === 'homebrew' ? 'Homebrew' : 'Privada'} · {entryCount(source.id)} entradas</small>{#if source.attribution}<span>{source.attribution}</span>{/if}</button>{/each}</section>
	{#if isGM}<section class="create"><div><h3>Adicionar referência</h3><p>Cadastre nomes, resumos e efeitos práticos. Evite transcrever texto de livros não-SRD.</p></div><div class="form"><select bind:value={sourceId}>{#each sources.filter((source) => !source.readOnly) as source}<option value={source.id}>{source.title}</option>{/each}</select><select bind:value={entryType}>{#each types as type}<option value={type[0]}>{type[1]}</option>{/each}</select><input bind:value={name} maxlength="120" placeholder="Nome da opção"/><textarea bind:value={summary} maxlength="2000" placeholder="Resumo próprio, anotações ou efeito mecânico."></textarea><label class="published"><input type="checkbox" bind:checked={published}/> Visível aos jogadores</label><button onclick={create} disabled={saving}>{saving ? 'Salvando…' : 'Adicionar ao compêndio'}</button></div></section>{/if}
	<section class="entries"><div class="entry-head"><h3>Entradas</h3><select bind:value={filter}><option value="all">Todos os tipos</option>{#each types as type}<option value={type[0]}>{type[1]}</option>{/each}</select></div>{#if loading}<p class="empty">Carregando compêndio…</p>{:else if visible().length}<div class="entry-grid">{#each visible() as entry (entry.id)}<article><span class="type">{types.find((type) => type[0] === entry.entryType)?.[1] ?? entry.entryType}</span><h4>{entry.name}</h4>{#if entry.summary}<p>{entry.summary}</p>{/if}<small>{entry.isPublished ? 'Visível aos jogadores' : 'Somente narrador'}</small></article>{/each}</div>{:else}<p class="empty">Nenhuma entrada neste filtro.</p>{/if}</section>
</main>

<style>
.compendium{min-height:510px;padding:clamp(1.25rem,3vw,2.5rem);color:#eee4d6}.compendium header{display:flex;justify-content:space-between;gap:1rem;margin-bottom:1.3rem;padding-bottom:1.2rem;border-bottom:1px solid #3b3030}.compendium header p{margin:0 0 .45rem;color:#d8ad67;font-size:.65rem;font-weight:800;letter-spacing:.14em}.compendium h2{margin:0 0 .45rem;font:500 clamp(1.8rem,4vw,2.7rem) Georgia,serif}.compendium header span,.create p{color:#a99c91;font-size:.85rem}.refresh,.create button{align-self:start;border:1px solid #765d3d;border-radius:7px;padding:.52rem .7rem;color:#edc77f;background:#2b211e;font-weight:750;cursor:pointer}.message{margin:0 0 1rem;color:#f0cb85;font-size:.8rem}.message.success{color:#acdba2}.sources{display:flex;flex-wrap:wrap;gap:.65rem;margin-bottom:1.3rem}.sources h3{width:100%;margin:0;font:600 .75rem Georgia,serif;letter-spacing:.08em;color:#d8ad67}.sources button{display:grid;gap:.18rem;min-width:210px;border:1px solid #493c39;border-radius:8px;padding:.7rem .8rem;color:#eee4d6;background:#211b1e;text-align:left;cursor:pointer}.sources button:hover,.sources button.active{border-color:#d8ad67;background:#30251f}.sources strong{font-size:.82rem}.sources small,.sources span{color:#a99c91;font-size:.67rem}.create{display:grid;grid-template-columns:minmax(180px,.55fr) 1fr;gap:1.2rem;margin:1.2rem 0;padding:1rem;border:1px solid #5b4938;border-radius:10px;background:#251e1c}.create h3,.entries h3{margin:0 0 .35rem;font:600 1rem Georgia,serif}.create p{margin:0;line-height:1.5}.form{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}.form input,.form select,.form textarea,.entry-head select{border:1px solid #59483b;border-radius:6px;padding:.55rem;color:#eadfce;background:#161216;font:inherit;font-size:.78rem}.form textarea{grid-column:1/-1;min-height:68px;resize:vertical}.form button{justify-self:end;background:#e0b86f;color:#26190e;border:0}.published{grid-column:1/-1;color:#cbbbab;font-size:.75rem}.entries{padding-top:.5rem}.entry-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem}.entry-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:.7rem}.entry-grid article{min-height:105px;padding:.8rem;border:1px solid #493c39;border-radius:9px;background:#211b1e}.type{color:#d8ad67;font-size:.62rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.entry-grid h4{margin:.35rem 0;font:600 1rem Georgia,serif}.entry-grid p{margin:0;color:#b9aa9d;font-size:.77rem;line-height:1.45;white-space:pre-wrap}.entry-grid small{display:block;margin-top:.6rem;color:#807268;font-size:.65rem}.empty{padding:1.5rem;border:1px dashed #5a493b;border-radius:8px;color:#a99c91;text-align:center}@media(max-width:650px){.compendium header,.create{display:flex;flex-direction:column}.form{grid-template-columns:1fr}.form button{justify-self:stretch}}
</style>
