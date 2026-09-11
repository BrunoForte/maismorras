<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import { createCompendiumEntry, getCompendium, importCompendiumEntries, type CompendiumDraft, type CompendiumEntry, type CompendiumSource } from '$lib/services/compendiumApi';
	import { createTokenFromCompendiumMonster } from '$lib/services/sceneApi';
	let { campaignId, sceneId = null, session, isGM, ontokencreated = () => {} }: { campaignId: string; sceneId?: string | null; session: Session; isGM: boolean; ontokencreated?: () => void } = $props();
	const types = [['species','Espécie'],['background','Antecedente'],['class','Classe'],['subclass','Subclasse'],['feat','Talento'],['spell','Magia'],['item','Item'],['feature','Característica'],['other','Monstro / outro']] as const;
	type EntryType = typeof types[number][0];
	let sources = $state<CompendiumSource[]>([]), entries = $state<CompendiumEntry[]>([]);
	let filter = $state('all'), sourceFilter = $state('all'), query = $state(''), loading = $state(true), saving = $state(false), importing = $state(false), placing = $state<string | null>(null), message = $state('');
	let selectedEntryId = $state<string | null>(null);
	let entryType = $state<EntryType>('other'), name = $state(''), portugueseName = $state(''), summary = $state(''), sourceId = $state(''), published = $state(true);
	let category = $state('monster'), hpMax = $state(10), armorClass = $state(10), size = $state(1), initiative = $state(0), color = $state(4921830), imageUrl = $state('');
	let spellLevel = $state(1), spellClasses = $state(''), itemDamage = $state(''), itemDefense = $state(0), classHitDie = $state(8), parentClass = $state(''), speed = $state(9);
	let locale = $state<'pt-BR' | 'en'>('pt-BR');
	const privateSources = () => sources.filter((source) => !source.readOnly);
	const visible = () => entries.filter((entry) => (filter === 'all' || entry.entryType === filter) && (sourceFilter === 'all' || entry.sourceId === sourceFilter) && (!query.trim() || `${entry.name} ${entry.translations?.['pt-BR'] ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
	const entryCount = (id: string) => entries.filter((entry) => entry.sourceId === id).length;
	// The SRD pack keeps English as the canonical text. Localized fields use a
	// stable flat key (for example `pt-BR.summary` or `pt-BR.rules.school`) so
	// imports can add translations progressively without changing the schema.
	const translated = (entry: CompendiumEntry, field: string, fallback: string) =>
		locale === 'pt-BR' ? (entry.translations?.[`pt-BR.${field}`] || fallback) : fallback;
	const displayName = (entry: CompendiumEntry) => locale === 'pt-BR' ? (entry.translations?.['pt-BR'] || entry.name) : entry.name;
	const displaySummary = (entry: CompendiumEntry) => translated(entry, 'summary', entry.summary);
	const displayRule = (entry: CompendiumEntry, field: string, value: unknown) =>
		translated(entry, `rules.${field}`, String(value ?? ''));
	const displayAction = (entry: CompendiumEntry, index: number, field: string, value: unknown) =>
		translated(entry, `rules.actions.${index}.${field}`, String(value ?? ''));
	const rules = (entry: CompendiumEntry) => entry.rules ?? {};
	const isMonster = (entry: CompendiumEntry) => entry.entryType === 'other' && (rules(entry).kind === 'monster' || rules(entry).catalog === 'monster');
	const hasMonsterSheet = (entry: CompendiumEntry) => isMonster(entry) && Number(rules(entry).hpMax) > 0 && Number(rules(entry).armorClass) >= 0;
	const typeLabel = (entry: CompendiumEntry) => types.find(([value]) => value === entry.entryType)?.[1] ?? entry.entryType;
	const selectedEntry = () => entries.find((entry) => entry.id === selectedEntryId) ?? null;
	const groupedVisible = () => types.map(([type, label]) => ({ label, entries: visible().filter((entry) => entry.entryType === type) })).filter((group) => group.entries.length);
	function formRules(): Record<string, unknown> { if (entryType === 'other') return { kind: category, ...(category === 'monster' ? { hpMax, armorClass, size, initiative, color, ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}) } : {}) }; if (entryType === 'item') return { category, ...(itemDamage.trim() ? { damage: itemDamage.trim() } : {}), ...(itemDefense > 0 ? { armorClass: itemDefense } : {}) }; if (entryType === 'spell') return { level: spellLevel, classes: spellClasses.split(',').map((value) => value.trim()).filter(Boolean) }; if (entryType === 'class') return { hitDie: classHitDie }; if (entryType === 'subclass') return { className: parentClass.trim() }; if (entryType === 'species') return { speed }; return {}; }
	function clearForm() { name = ''; portugueseName = ''; summary = ''; imageUrl = ''; itemDamage = ''; itemDefense = 0; spellClasses = ''; parentClass = ''; }
	async function load() { loading = true; message = ''; try { const data = await getCompendium(session, campaignId); sources = data.sources; entries = data.entries; sourceId = privateSources()[0]?.id ?? ''; } catch (error) { message = error instanceof Error ? error.message : 'Não foi possível carregar o compêndio.'; } finally { loading = false; } }
	async function create() { if (!name.trim() || !sourceId) { message = 'Informe nome e uma fonte privada.'; return; } saving = true; message = ''; try { const entry = await createCompendiumEntry(session, campaignId, { sourceId, entryType, name: name.trim(), summary: summary.trim(), rules: formRules(), translations: portugueseName.trim() ? { 'pt-BR': portugueseName.trim() } : {}, isPublished: published }); entries = [...entries, entry].sort((a,b) => a.name.localeCompare(b.name)); clearForm(); message = 'Entrada privada adicionada.'; } catch (error) { message = error instanceof Error ? error.message : 'Não foi possível salvar a entrada.'; } finally { saving = false; } }
	function sample(): CompendiumDraft { const label = types.find(([value]) => value === entryType)?.[1] ?? 'Entrada'; return { name: `Novo(a) ${label}`, summary: 'Resumo autoral do efeito ou referência.', rules: formRules(), translations: { 'pt-BR': `Novo(a) ${label}` }, isPublished: true }; }
	function downloadTemplate() { const body = JSON.stringify({ entryType, entries: [sample()] }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `maismorras-${entryType}.json`; link.click(); URL.revokeObjectURL(url); }
	async function importFile(event: Event) { const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (!file || !sourceId) return; importing = true; message = ''; try { const parsed = JSON.parse(await file.text()) as { entryType?: string; entries?: CompendiumDraft[] } | CompendiumDraft[]; const fileType = Array.isArray(parsed) ? entryType : parsed.entryType; const imported = Array.isArray(parsed) ? parsed : parsed.entries; if (fileType !== entryType || !Array.isArray(imported)) throw new Error(`Use um arquivo de ${types.find(([value]) => value === entryType)?.[1]}.`); const result = await importCompendiumEntries(session, campaignId, sourceId, entryType, imported); message = `${result.imported} entrada(s) importada(s) ou atualizada(s).`; await load(); } catch (error) { message = error instanceof Error ? error.message : 'Não foi possível importar o arquivo.'; } finally { importing = false; } }
	async function placeMonster(entry: CompendiumEntry) { if (!sceneId) { message = 'Abra uma cena na aba Mesa antes de posicionar o monstro.'; return; } placing = entry.id; message = ''; try { await createTokenFromCompendiumMonster(session, sceneId, entry.id); message = `${displayName(entry)} foi adicionado à cena.`; ontokencreated(); } catch (error) { message = error instanceof Error ? error.message : 'Não foi possível adicionar o monstro.'; } finally { placing = null; } }
	function changeLocale(event: Event) { locale = (event.currentTarget as HTMLSelectElement).value === 'en' ? 'en' : 'pt-BR'; localStorage.setItem('maismorras.rulesLocale', locale); }
	onMount(() => { locale = localStorage.getItem('maismorras.rulesLocale') === 'en' ? 'en' : 'pt-BR'; void load(); });
</script>

<main class="compendium">
	<header><div><p>REGRAS E REFERÊNCIAS</p><h2>Compêndio</h2><span>SRD, material privado e fichas prontas para a sua campanha.</span></div><div class="header-actions"><select aria-label="Idioma" bind:value={locale} onchange={changeLocale}><option value="pt-BR">Português</option><option value="en">English</option></select>{#if isGM}<button onclick={load} disabled={loading}>Atualizar</button>{/if}</div></header>
	{#if message}<p class:success={message.includes('adicionada') || message.includes('importada') || message.includes('adicionado')} class="message">{message}</p>{/if}
	<section class="sources"><h3>Fontes ativas</h3><button class:active={sourceFilter === 'all'} onclick={() => sourceFilter = 'all'}><strong>Todas as fontes</strong><small>{entries.length} entradas</small></button>{#each sources as source (source.id)}<button class:active={sourceFilter === source.id} onclick={() => sourceFilter = source.id}><strong>{source.title}</strong><small>{source.kind === 'srd' ? `SRD ${source.version}` : 'Privada'} · {entryCount(source.id)} entradas</small></button>{/each}</section>
	{#if isGM}<section class="assistant"><div class="assistant-copy"><p>ASSISTENTE DO NARRADOR</p><h3>Cadastro privado estruturado</h3><span>Escolha o tipo. O formulário pede só os dados que a mesa consegue usar — e o JSON exportado vira um modelo para importar lotes do mesmo tipo.</span></div><div class="form"><select bind:value={sourceId}>{#each privateSources() as source}<option value={source.id}>{source.title}</option>{/each}</select><select bind:value={entryType}>{#each types as [value, label]}<option value={value}>{label}</option>{/each}</select><input bind:value={name} maxlength="120" placeholder="Nome"/><input bind:value={portugueseName} maxlength="120" placeholder="Nome em português (opcional)"/>
		{#if entryType === 'other'}<select bind:value={category}><option value="monster">Monstro</option><option value="vehicle">Veículo</option><option value="hazard">Perigo</option><option value="other">Outro</option></select>{#if category === 'monster'}<input bind:value={hpMax} type="number" min="1" placeholder="PV máximo"/><input bind:value={armorClass} type="number" min="0" placeholder="CA"/><input bind:value={size} type="number" min="1" max="6" placeholder="Tamanho"/><input bind:value={initiative} type="number" placeholder="Iniciativa"/><input bind:value={imageUrl} type="url" placeholder="URL da miniatura (opcional)"/>{/if}
		{:else if entryType === 'item'}<select bind:value={category}><option value="weapon">Arma</option><option value="armor">Armadura</option><option value="consumable">Consumível</option><option value="tool">Ferramenta</option><option value="gear">Equipamento</option></select><input bind:value={itemDamage} placeholder="Dano, ex.: 1d8 cortante"/><input bind:value={itemDefense} type="number" min="0" placeholder="Defesa / CA"/>
		{:else if entryType === 'spell'}<input bind:value={spellLevel} type="number" min="0" max="9" placeholder="Círculo"/><input bind:value={spellClasses} placeholder="Classes, separadas por vírgula"/>
		{:else if entryType === 'class'}<input bind:value={classHitDie} type="number" min="4" max="12" step="2" placeholder="Dado de vida"/>
		{:else if entryType === 'subclass'}<input bind:value={parentClass} placeholder="Classe-base"/>
		{:else if entryType === 'species'}<input bind:value={speed} type="number" min="0" placeholder="Deslocamento (m)"/>{/if}
		<textarea bind:value={summary} maxlength="2000" placeholder="Resumo autoral e objetivo do funcionamento."></textarea><label><input type="checkbox" bind:checked={published}/> Visível aos jogadores</label><div class="form-actions"><button class="ghost" onclick={downloadTemplate}>Baixar modelo JSON</button><label class="file"><input type="file" accept="application/json" onchange={importFile} disabled={importing}/> {importing ? 'Importando…' : `Importar ${types.find(([value]) => value === entryType)?.[1]}`}</label><button class="primary" onclick={create} disabled={saving}>{saving ? 'Salvando…' : 'Adicionar'}</button></div></div></section>{/if}
	<section class="entries"><div class="entry-head"><h3>Entradas</h3><input bind:value={query} placeholder="Buscar por nome…"/><select bind:value={filter} onchange={() => selectedEntryId = null}><option value="all">Todos os tipos</option>{#each types as [value,label]}<option value={value}>{label}</option>{/each}</select></div>{#if loading}<p class="empty">Carregando compêndio…</p>{:else if visible().length}<div class="catalog-layout"><div class="catalog-list">{#if filter === 'all'}{#each groupedVisible() as group}<section class="category-group"><h4>{group.label} <small>{group.entries.length}</small></h4><div class="entry-grid">{#each group.entries as entry (entry.id)}<button class:active={selectedEntryId === entry.id} onclick={() => selectedEntryId = entry.id}><span>{typeLabel(entry)}</span><strong>{displayName(entry)}</strong>{#if isMonster(entry) && hasMonsterSheet(entry)}<small>ND {String(rules(entry).challenge ?? '—')} · PV {rules(entry).hpMax}</small>{/if}</button>{/each}</div></section>{/each}{:else}<div class="entry-grid">{#each visible() as entry (entry.id)}<button class:active={selectedEntryId === entry.id} onclick={() => selectedEntryId = entry.id}><span>{typeLabel(entry)}</span><strong>{displayName(entry)}</strong>{#if isMonster(entry) && hasMonsterSheet(entry)}<small>ND {String(rules(entry).challenge ?? '—')} · PV {rules(entry).hpMax}</small>{/if}</button>{/each}</div>{/if}</div>{#if selectedEntry()}{@const entry = selectedEntry()!}{@const detail = rules(entry)}<aside class="entry-detail"><button class="close-detail" onclick={() => selectedEntryId = null}>×</button><span class="type">{typeLabel(entry)}</span><h3>{displayName(entry)}</h3>{#if locale === 'pt-BR' && entry.translations?.['pt-BR']}<small class="canonical">{entry.name}</small>{/if}<p>{displaySummary(entry) || 'Sem resumo cadastrado para esta entrada.'}</p>{#if isMonster(entry)}<div class="rules"><b>CA {String(detail.armorClass ?? '—')}</b><b>PV {String(detail.hpMax ?? '—')}</b><b>ND {String(detail.challenge ?? '—')}</b><b>{displayRule(entry, 'speed', detail.speed)}</b></div>{#if detail.abilities}<div class="rules">{#each Object.entries(detail.abilities as Record<string, unknown>) as [ability, score]}<b>{ability.slice(0,3).toUpperCase()} {String(score)}</b>{/each}</div>{/if}{#if Array.isArray(detail.actions) && detail.actions.length}<h4>Ações</h4>{#each detail.actions as action, index}<div class="action-card"><strong>{displayAction(entry, index, 'name', (action as Record<string,unknown>).name ?? 'Ação')}</strong><span>{String((action as Record<string,unknown>).toHit ?? '') !== '' ? `+${String((action as Record<string,unknown>).toHit)} para acertar · ` : ''}{displayAction(entry, index, 'damage', (action as Record<string,unknown>).damage ?? (action as Record<string,unknown>).description ?? '')}</span></div>{/each}{/if}{#if isGM && hasMonsterSheet(entry)}<button class="place" onclick={() => placeMonster(entry)} disabled={placing === entry.id}>{placing === entry.id ? 'Adicionando…' : 'Adicionar à cena'}</button>{/if}{:else if entry.entryType === 'spell'}<div class="rules"><b>Círculo {String(detail.level ?? 0)}</b><b>{Array.isArray(detail.classes) ? (detail.classes as string[]).join(', ') : ''}</b>{#if detail.school}<b>{displayRule(entry, 'school', detail.school)}</b>{/if}{#if detail.range}<b>{displayRule(entry, 'range', detail.range)}</b>{/if}</div>{:else if entry.entryType === 'item'}<div class="rules"><b>{displayRule(entry, 'category', detail.category ?? 'item')}</b>{#if detail.damage}<b>{displayRule(entry, 'damage', detail.damage)}</b>{/if}{#if detail.armorClass}<b>CA +{String(detail.armorClass)}</b>{/if}{#if detail.properties}<b>{Array.isArray(detail.properties) ? (detail.properties as string[]).join(', ') : String(detail.properties)}</b>{/if}</div>{:else if entry.entryType === 'class'}<div class="rules"><b>Dado de vida d{String(detail.hitDie ?? '—')}</b></div>{:else if entry.entryType === 'subclass'}<div class="rules"><b>Classe-base: {displayRule(entry, 'className', detail.className ?? '—')}</b></div>{:else if entry.entryType === 'species'}<div class="rules"><b>Deslocamento: {displayRule(entry, 'speed', detail.speed ?? '—')} m</b></div>{/if}<small>{entry.isPublished ? 'Visível aos jogadores' : 'Somente narrador'}</small></aside>{/if}</div>{:else}<p class="empty">Nenhuma entrada neste filtro.</p>{/if}</section>
</main>

<style>
	.compendium { min-height: 510px; display: grid; gap: 1rem; padding: clamp(1.25rem, 3vw, 2.5rem); color: #eee4d6; }
	.compendium > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #493c39; }
	.compendium > header p, .assistant-copy p { margin: 0; color: #d8ad67; font-size: .64rem; font-weight: 700; letter-spacing: .13em; }
	.compendium > header h2 { margin: .2rem 0; font: 600 clamp(1.45rem, 3vw, 2rem) Georgia, serif; color: #f3d9a8; }
	.compendium > header span, .assistant-copy span { color: #bcae9e; font-size: .8rem; line-height: 1.45; }
	.header-actions { display: flex; gap: .5rem; flex: none; }
	.header-actions select, .header-actions button, .entry-head input, .entry-head select, .form input, .form select, .form textarea { min-width: 0; border: 1px solid #59483b; border-radius: 6px; padding: .55rem; color: #eadfce; background: #161216; font: inherit; font-size: .78rem; }
	.header-actions button, .form button, .sources button, .place { cursor: pointer; }
	.message { margin: 0; border: 1px solid #805449; border-radius: 7px; padding: .6rem .75rem; color: #ffd3c6; background: #38201e; font-size: .76rem; }
	.message.success { border-color: #4e7a62; color: #c9f0d6; background: #1e3027; }
	.sources { display: flex; flex-wrap: wrap; gap: .5rem; align-items: stretch; }
	.sources h3 { width: 100%; margin: 0 0 .05rem; color: #cdbba8; font: 600 .78rem Georgia, serif; }
	.sources button { display: grid; gap: .22rem; min-width: 160px; border: 1px solid #493c39; border-radius: 8px; padding: .65rem .75rem; color: #d9ccbb; background: #211b1e; text-align: left; }
	.sources button:hover, .sources button.active { border-color: #d8ad67; background: #30251f; }
	.sources button strong { color: #f0d7a4; font-size: .76rem; }
	.sources button small { color: #a99c91; font-size: .66rem; }
	.assistant { display: grid; grid-template-columns: minmax(190px, .7fr) minmax(0, 1.3fr); gap: 1rem; border: 1px solid #59483b; border-radius: 10px; padding: 1rem; background: linear-gradient(120deg, #241d1c, #1b171a); }
	.assistant-copy { display: grid; align-content: start; gap: .45rem; }
	.assistant-copy h3 { margin: 0; color: #f0d29d; font: 600 1.05rem Georgia, serif; }
	.form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
	.form textarea { grid-column: 1 / -1; min-height: 76px; resize: vertical; }
	.form > label:not(.file) { display: flex; align-items: center; gap: .35rem; color: #cbbbab; font-size: .72rem; }
	.form-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; }
	.form button, .file { border: 1px solid #765d3d; border-radius: 6px; padding: .48rem .65rem; color: #f0d5a3; background: #30241e; font-size: .72rem; }
	.form .primary, .place { border-color: #b98a4b; color: #2c1b0d; background: #e0b86f; }
	.form .ghost { background: transparent; }
	.file { cursor: pointer; }
	.file input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
	.entries { min-width: 0; border-top: 1px solid #3e3434; padding-top: 1rem; }
	.entry-head { display: flex; gap: .5rem; align-items: center; margin-bottom: .75rem; }
	.entry-head h3 { margin: 0 auto 0 0; color: #f0d29d; font: 600 1rem Georgia, serif; }
	.entry-head input { width: min(100%, 270px); }
	.catalog-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, .42fr); gap: 1rem; }
	.category-group { margin-bottom: 1.2rem; }
	.category-group h4 { margin: 0 0 .5rem; color: #d8ad67; font: 600 .8rem Georgia, serif; }
	.category-group h4 small { color: #a99c91; }
	.entry-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: .5rem; }
	.entry-grid button { display: grid; gap: .25rem; min-height: 76px; border: 1px solid #493c39; border-radius: 8px; padding: .65rem; color: #eee4d6; background: #211b1e; text-align: left; cursor: pointer; }
	.entry-grid button:hover, .entry-grid button.active { border-color: #d8ad67; background: #30251f; }
	.entry-grid button span { color: #d8ad67; font-size: .59rem; text-transform: uppercase; }
	.entry-grid button strong { font: 600 .82rem Georgia, serif; }
	.entry-grid button small { color: #a99c91; font-size: .62rem; }
	.entry-detail { position: sticky; top: 1rem; align-self: start; display: grid; gap: .7rem; border: 1px solid #765d3d; border-radius: 10px; padding: 1rem; background: #251e1c; }
	.entry-detail h3, .entry-detail p { margin: 0; }
	.entry-detail p { color: #cbbbab; font-size: .8rem; line-height: 1.55; white-space: pre-wrap; }
	.entry-detail h4 { margin: .15rem 0 -.25rem; color: #e6c98f; font: 600 .84rem Georgia, serif; }
	.type, .canonical, .entry-detail > small { color: #aa9a8b; font-size: .67rem; }
	.close-detail { justify-self: end; border: 0; color: #cbbbab; background: transparent; font-size: 1.2rem; cursor: pointer; }
	.rules { display: flex; flex-wrap: wrap; gap: .4rem; }
	.rules b { border: 1px solid #59483b; border-radius: 6px; padding: .32rem .45rem; color: #e8cf98; font-size: .68rem; }
	.action-card { display: grid; gap: .2rem; border-left: 2px solid #9b7549; padding: .38rem .5rem; background: #1b1618; }
	.action-card strong { color: #f0d29d; font-size: .74rem; }
	.action-card span { color: #cbbbab; font-size: .7rem; line-height: 1.35; }
	.place { justify-self: start; padding: .55rem .75rem; font-size: .74rem; }
	.empty { color: #aa9a8b; font-style: italic; }
	@media (max-width: 760px) {
		.compendium > header, .assistant { grid-template-columns: 1fr; display: grid; }
		.header-actions { justify-content: flex-start; }
		.form, .catalog-layout { grid-template-columns: 1fr; }
		.entry-detail { position: static; }
		.entry-head { flex-wrap: wrap; }
		.entry-head h3 { width: 100%; }
		.entry-head input, .entry-head select { flex: 1 1 150px; }
	}
</style>
