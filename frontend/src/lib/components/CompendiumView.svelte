<script lang="ts">
	import { onMount } from 'svelte';
	import type { Session } from '@supabase/supabase-js';
	import {
		createCompendiumEntry,
		deleteCompendiumEntry,
		getCompendium,
		importCompendiumEntries,
		translateCompendiumEntry,
		updateCompendiumEntry,
		type CompendiumDraft,
		type CompendiumEntry,
		type CompendiumSource
	} from '$lib/services/compendiumApi';
	import { createTokenFromCompendiumMonster } from '$lib/services/sceneApi';
	import { appLocale, distanceText } from '$lib/stores/locale';
	let {
		campaignId,
		sceneId = null,
		session,
		isGM,
		ontokencreated = () => {}
	}: {
		campaignId: string;
		sceneId?: string | null;
		session: Session;
		isGM: boolean;
		ontokencreated?: () => void;
	} = $props();
	const types = [
		['species', 'Espécie'],
		['background', 'Antecedente'],
		['class', 'Classe'],
		['subclass', 'Subclasse'],
		['feat', 'Talento'],
		['spell', 'Magia'],
		['item', 'Item'],
		['feature', 'Característica'],
		['other', 'Monstro / outro']
	] as const;
	type EntryType = (typeof types)[number][0];
	let sources = $state<CompendiumSource[]>([]),
		entries = $state<CompendiumEntry[]>([]);
	let filter = $state('all'),
		sourceFilter = $state('all'),
		sortMode = $state<'name' | 'category' | 'challenge' | 'source'>('name'),
		query = $state(''),
		loading = $state(true),
		saving = $state(false),
		importing = $state(false),
		placing = $state<string | null>(null),
		translating = $state<string | null>(null),
		batchTranslating = $state(false),
		batchProgress = $state(''),
		message = $state('');
	let selectedEntryId = $state<string | null>(null);
	let editingEntryId = $state<string | null>(null);
	let entryType = $state<EntryType>('other'),
		name = $state(''),
		portugueseName = $state(''),
		summary = $state(''),
		sourceId = $state(''),
		published = $state(true);
	let category = $state('monster'),
		hpMax = $state(10),
		armorClass = $state(10),
		size = $state(1),
		initiative = $state(0),
		color = $state(4921830),
		imageUrl = $state('');
	let spellLevel = $state(1),
		spellClasses = $state(''),
		itemDamage = $state(''),
		itemDefense = $state(0),
		classHitDie = $state(8),
		parentClass = $state(''),
		speed = $state(9);
	type LevelFeature = { id: string; name: string; level: number; description: string };
	let levelFeatures = $state<LevelFeature[]>([]);
	const newFeature = (): LevelFeature => ({ id: crypto.randomUUID(), name: '', level: 1, description: '' });
	function addLevelFeature() { levelFeatures = [...levelFeatures, newFeature()]; }
	function removeLevelFeature(id: string) { levelFeatures = levelFeatures.filter((feature) => feature.id !== id); }
	const privateSources = () => sources.filter((source) => !source.readOnly);
	const visible = () =>
		entries.filter(
			(entry) =>
				(filter === 'all' || entry.entryType === filter) &&
				(sourceFilter === 'all' || entry.sourceId === sourceFilter) &&
				(!query.trim() ||
					`${entry.name} ${entry.translations?.['pt-BR'] ?? ''}`
						.toLocaleLowerCase()
						.includes(query.trim().toLocaleLowerCase()))
		).sort((a, b) => {
			if (sortMode === 'challenge') return Number(rules(a).challenge ?? 999) - Number(rules(b).challenge ?? 999) || a.name.localeCompare(b.name);
			if (sortMode === 'category') return a.entryType.localeCompare(b.entryType) || a.name.localeCompare(b.name);
			if (sortMode === 'source') return (sources.find((s) => s.id === a.sourceId)?.title ?? '').localeCompare(sources.find((s) => s.id === b.sourceId)?.title ?? '') || a.name.localeCompare(b.name);
			return displayName(a).localeCompare(displayName(b));
		});
	const entryCount = (id: string) => entries.filter((entry) => entry.sourceId === id).length;
	// The SRD pack keeps English as the canonical text. Localized fields use a
	// stable flat key (for example `pt-BR.summary` or `pt-BR.rules.school`) so
	// imports can add translations progressively without changing the schema.
	const translated = (entry: CompendiumEntry, field: string, fallback: string) =>
		$appLocale === 'pt-BR' ? entry.translations?.[`pt-BR.${field}`] || fallback : fallback;
	const displayName = (entry: CompendiumEntry) =>
		$appLocale === 'pt-BR' ? entry.translations?.['pt-BR'] || entry.name : entry.name;
	const displaySummary = (entry: CompendiumEntry) => translated(entry, 'summary', entry.summary);
	const displayRule = (entry: CompendiumEntry, field: string, value: unknown) =>
		translated(entry, `rules.${field}`, String(value ?? ''));
	const displayAction = (entry: CompendiumEntry, index: number, field: string, value: unknown) =>
		translated(entry, `rules.actions.${index}.${field}`, String(value ?? ''));
	const translationIsOfficial = (entry: CompendiumEntry, field = 'summary') =>
		$appLocale === 'pt-BR' && entry.translations?.[`pt-BR.${field}.source`] === 'official';
	const translationHasAI = (entry: CompendiumEntry) =>
		$appLocale === 'pt-BR' &&
		Object.entries(entry.translations ?? {}).some(
			([key, value]) => key.startsWith('pt-BR') && key.endsWith('.source') && value === 'ai'
		);
	const rules = (entry: CompendiumEntry) => entry.rules ?? {};
	const isMonster = (entry: CompendiumEntry) =>
		entry.entryType === 'other' &&
		(rules(entry).kind === 'monster' || rules(entry).catalog === 'monster');
	const hasMonsterSheet = (entry: CompendiumEntry) =>
		isMonster(entry) && Number(rules(entry).hpMax) > 0 && Number(rules(entry).armorClass) >= 0;
	const typeLabel = (entry: CompendiumEntry) =>
		typeName(entry.entryType);
	const typeName = (value: string) => {
		const labels: Record<string, [string, string]> = {
			species: ['Espécie', 'Species'],
			background: ['Antecedente', 'Background'],
			class: ['Classe', 'Class'],
			subclass: ['Subclasse', 'Subclass'],
			feat: ['Talento', 'Feat'],
			spell: ['Magia', 'Spell'],
			item: ['Item', 'Item'],
			feature: ['Característica', 'Feature'],
			other: ['Monstro / outro', 'Monster / other']
		};
		const label = labels[value];
		return label ? label[$appLocale === 'en' ? 1 : 0] : value;
	};
	const sourceKindLabel = (source: CompendiumSource) =>
		source.kind === 'srd' ? `SRD ${source.version}` : $appLocale === 'en' ? 'Private' : 'Privada';
	const selectedEntry = () => entries.find((entry) => entry.id === selectedEntryId) ?? null;
	const groupedVisible = () =>
		types
			.map(([type]) => ({
				label: typeName(type),
				entries: visible().filter((entry) => entry.entryType === type)
			}))
			.filter((group) => group.entries.length);
	function formRules(): Record<string, unknown> {
		if (entryType === 'other')
			return {
				kind: category,
				...(category === 'monster'
					? {
							hpMax,
							armorClass,
							size,
							initiative,
							color,
							...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {})
						}
					: {})
			};
		if (entryType === 'item')
			return {
				category,
				...(itemDamage.trim() ? { damage: itemDamage.trim() } : {}),
				...(itemDefense > 0 ? { armorClass: itemDefense } : {})
			};
		if (entryType === 'spell')
			return {
				level: spellLevel,
				classes: spellClasses
					.split(',')
					.map((value) => value.trim())
					.filter(Boolean)
			};
		if (entryType === 'class') return { hitDie: classHitDie, ...(levelFeatures.length ? { features: levelFeatures.filter((feature) => feature.name.trim()).map((feature) => ({ ...feature, name: feature.name.trim(), description: feature.description.trim() })) } : {}) };
		if (entryType === 'subclass') return { className: parentClass.trim(), ...(levelFeatures.length ? { features: levelFeatures.filter((feature) => feature.name.trim()).map((feature) => ({ ...feature, name: feature.name.trim(), description: feature.description.trim() })) } : {}) };
		if (entryType === 'species') return { speed };
		return {};
	}
	function clearForm() {
		name = '';
		portugueseName = '';
		summary = '';
		imageUrl = '';
		itemDamage = '';
		itemDefense = 0;
		spellClasses = '';
		parentClass = '';
		levelFeatures = [];
	}
	async function load() {
		loading = true;
		message = '';
		try {
			const data = await getCompendium(session, campaignId);
			sources = data.sources;
			entries = data.entries;
			sourceId = privateSources()[0]?.id ?? '';
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not load the compendium.' : 'Não foi possível carregar o compêndio.');
		} finally {
			loading = false;
		}
	}
	async function create() {
		if (!name.trim() || !sourceId) {
			message = $appLocale === 'en' ? 'Enter a name and a private source.' : 'Informe nome e uma fonte privada.';
			return;
		}
		saving = true;
		message = '';
		try {
			const payload: CompendiumDraft & { sourceId: string; entryType: string } = {
				sourceId,
				entryType,
				name: name.trim(),
				summary: summary.trim(),
				rules: formRules(),
				translations: portugueseName.trim() ? { 'pt-BR': portugueseName.trim() } : {} as Record<string, string>,
				isPublished: published
			};
			const wasEditing = Boolean(editingEntryId);
			const entry = editingEntryId
				? await updateCompendiumEntry(session, campaignId, editingEntryId, payload)
				: await createCompendiumEntry(session, campaignId, payload);
			entries = editingEntryId
				? entries.map((item) => (item.id === entry.id ? entry : item))
				: [...entries, entry].sort((a, b) => a.name.localeCompare(b.name));
			clearForm();
			editingEntryId = null;
			message = $appLocale === 'en' ? (wasEditing ? 'Private entry updated.' : 'Private entry added.') : (wasEditing ? 'Entrada privada atualizada.' : 'Entrada privada adicionada.');
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not save the entry.' : 'Não foi possível salvar a entrada.');
		} finally {
			saving = false;
		}
	}
	function editEntry(entry: CompendiumEntry) {
		if (sources.find((source) => source.id === entry.sourceId)?.readOnly) return;
		editingEntryId = entry.id;
		sourceId = entry.sourceId;
		entryType = entry.entryType as EntryType;
		name = entry.name;
		summary = entry.summary;
		published = entry.isPublished;
		const value = entry.rules ?? {};
		category = String(value.kind ?? value.category ?? 'monster') as typeof category;
		hpMax = Number(value.hpMax ?? 10); armorClass = Number(value.armorClass ?? 10); size = Number(value.size ?? 1); initiative = Number(value.initiative ?? 0); imageUrl = String(value.imageUrl ?? '');
		itemDamage = String(value.damage ?? ''); itemDefense = Number(value.armorClass ?? 0); spellLevel = Number(value.level ?? 1); spellClasses = Array.isArray(value.classes) ? value.classes.join(', ') : ''; classHitDie = Number(value.hitDie ?? 8); parentClass = String(value.className ?? ''); speed = Number(value.speed ?? 9);
		levelFeatures = Array.isArray(value.features) ? value.features.map((feature, index) => { const item = feature as Record<string, unknown>; return { id: String(item.id ?? `feature-${index}`), name: String(item.name ?? ''), level: Number(item.level ?? 1), description: String(item.description ?? '') }; }) : [];
	}
	async function removeEntry(entry: CompendiumEntry) {
		if (sources.find((source) => source.id === entry.sourceId)?.readOnly || !confirm($appLocale === 'en' ? 'Delete this private entry?' : 'Excluir esta entrada privada?')) return;
		try { await deleteCompendiumEntry(session, campaignId, entry.id); entries = entries.filter((item) => item.id !== entry.id); selectedEntryId = null; message = $appLocale === 'en' ? 'Private entry deleted.' : 'Entrada privada excluída.'; }
		catch (error) { message = error instanceof Error ? error.message : 'Não foi possível excluir.'; }
	}
	function sample(): CompendiumDraft {
		const label = typeName(entryType);
		return {
			name: `Novo(a) ${label}`,
			summary: 'Resumo autoral do efeito ou referência.',
			rules: formRules(),
			translations: { 'pt-BR': `Novo(a) ${label}` },
			isPublished: true
		};
	}
	function downloadTemplate() {
		const body = JSON.stringify({ entryType, entries: [sample()] }, null, 2);
		const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `maismorras-${entryType}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement,
			file = input.files?.[0];
		input.value = '';
		if (!file || !sourceId) return;
		importing = true;
		message = '';
		try {
			const parsed = JSON.parse(await file.text()) as
				{ entryType?: string; entries?: CompendiumDraft[] } | CompendiumDraft[];
			const fileType = Array.isArray(parsed) ? entryType : parsed.entryType;
			const imported = Array.isArray(parsed) ? parsed : parsed.entries;
			if (fileType !== entryType || !Array.isArray(imported))
				throw new Error(`Use um arquivo de ${types.find(([value]) => value === entryType)?.[1]}.`);
			const result = await importCompendiumEntries(
				session,
				campaignId,
				sourceId,
				entryType,
				imported
			);
			message = $appLocale === 'en' ? `${result.imported} entr${result.imported === 1 ? 'y' : 'ies'} imported or updated.` : `${result.imported} entrada(s) importada(s) ou atualizada(s).`;
			await load();
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not import the file.' : 'Não foi possível importar o arquivo.');
		} finally {
			importing = false;
		}
	}
	async function placeMonster(entry: CompendiumEntry) {
		if (!sceneId) {
			message = $appLocale === 'en' ? 'Open a scene in the Table tab before placing the monster.' : 'Abra uma cena na aba Mesa antes de posicionar o monstro.';
			return;
		}
		placing = entry.id;
		message = '';
		try {
			await createTokenFromCompendiumMonster(session, sceneId, entry.id);
			message = `${displayName(entry)} foi adicionado à cena.`;
			ontokencreated();
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not add the monster.' : 'Não foi possível adicionar o monstro.');
		} finally {
			placing = null;
		}
	}
	async function translate(entry: CompendiumEntry) {
		translating = entry.id;
		message = '';
		try {
			const updated = await translateCompendiumEntry(session, campaignId, entry.id);
			entries = entries.map((item) => (item.id === updated.id ? updated : item));
			message = $appLocale === 'en' ? 'AI translation generated and marked.' : 'Tradução por IA gerada e identificada.';
		} catch (error) {
			message = error instanceof Error ? error.message : ($appLocale === 'en' ? 'Could not generate the translation.' : 'Não foi possível gerar a tradução.');
		} finally {
			translating = null;
		}
	}
	async function translateSRDPending() {
		if ($appLocale !== 'pt-BR' || batchTranslating) return;
		const pending = entries.filter((entry) => sources.find((source) => source.id === entry.sourceId)?.kind === 'srd' && !entry.translations?.['pt-BR.summary']);
		if (!pending.length) { message = 'As entradas SRD já possuem tradução ou não têm texto para traduzir.'; return; }
		batchTranslating = true;
		message = '';
		try {
			for (let index = 0; index < pending.length; index += 1) {
				const entry = pending[index];
				batchProgress = `${index + 1}/${pending.length}`;
				const updated = await translateCompendiumEntry(session, campaignId, entry.id);
				entries = entries.map((item) => (item.id === updated.id ? updated : item));
			}
			message = `Tradução concluída para ${pending.length} entrada(s) SRD.`;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível concluir a tradução em lote.';
		} finally {
			batchTranslating = false;
			batchProgress = '';
		}
	}
	onMount(() => void load());
</script>

<main class="compendium">
	<header>
		<div>
			<p>{$appLocale === 'en' ? 'RULES AND REFERENCES' : 'REGRAS E REFERÊNCIAS'}</p>
			<h2>{$appLocale === 'en' ? 'Compendium' : 'Compêndio'}</h2>
			<span
				>{$appLocale === 'en'
					? 'SRD, private material, and ready-to-use sheets for your campaign.'
					: 'SRD, material privado e fichas prontas para a sua campanha.'}</span
			>
		</div>
		<div class="header-actions">
			{#if isGM && $appLocale === 'pt-BR'}<button onclick={() => void translateSRDPending()} disabled={batchTranslating}>{batchTranslating ? `Traduzindo ${batchProgress}…` : 'Traduzir SRD pendente'}</button>{/if}
			{#if isGM}<button onclick={load} disabled={loading}
					>{$appLocale === 'en' ? 'Refresh' : 'Atualizar'}</button
				>{/if}
		</div>
	</header>
	{#if message}<p
			class:success={message.includes('adicionada') ||
				message.includes('importada') ||
				message.includes('adicionado')}
			class="message"
		>
			{message}
		</p>{/if}
	<section class="sources">
		<h3>{$appLocale === 'en' ? 'Active sources' : 'Fontes ativas'}</h3>
		<button class:active={sourceFilter === 'all'} onclick={() => (sourceFilter = 'all')}
			><strong>{$appLocale === 'en' ? 'All sources' : 'Todas as fontes'}</strong><small>{entries.length} {$appLocale === 'en' ? 'entries' : 'entradas'}</small></button
		>{#each sources as source (source.id)}<button
				class:active={sourceFilter === source.id}
				onclick={() => (sourceFilter = source.id)}
				><strong>{source.title}</strong><small
					>{sourceKindLabel(source)} · {entryCount(source.id)} {$appLocale === 'en' ? 'entries' : 'entradas'}</small
				></button
			>{/each}
	</section>
	{#if isGM}<section class="assistant">
			<div class="assistant-copy">
				<p>ASSISTENTE DO NARRADOR</p>
				<h3>Cadastro privado estruturado</h3>
				<span
					>Escolha o tipo. O formulário pede só os dados que a mesa consegue usar — e o JSON
					exportado vira um modelo para importar lotes do mesmo tipo.</span
				>
			</div>
			<div class="form">
				<select bind:value={sourceId}
					>{#each privateSources() as source}<option value={source.id}>{source.title}</option
						>{/each}</select
				><select bind:value={entryType}
					>{#each types as [value]}<option value={value}>{typeName(value)}</option>{/each}</select
								><input bind:value={name} maxlength="120" placeholder={$appLocale === 'en' ? 'Name' : 'Nome'} /><input
					bind:value={portugueseName}
					maxlength="120"
									placeholder={$appLocale === 'en' ? 'Portuguese name (optional)' : 'Nome em português (opcional)'}
				/>
				{#if entryType === 'other'}<select bind:value={category}
						><option value="monster">{$appLocale === 'en' ? 'Monster' : 'Monstro'}</option><option value="vehicle">{$appLocale === 'en' ? 'Vehicle' : 'Veículo'}</option><option
							value="hazard">Perigo</option
						><option value="other">Outro</option></select
					>{#if category === 'monster'}<input
							bind:value={hpMax}
							type="number"
							min="1"
							placeholder="PV máximo"
						/><input bind:value={armorClass} type="number" min="0" placeholder="CA" /><input
							bind:value={size}
							type="number"
							min="1"
							max="6"
							placeholder="Tamanho"
						/><input bind:value={initiative} type="number" placeholder="Iniciativa" /><input
							bind:value={imageUrl}
							type="url"
							placeholder="URL da miniatura (opcional)"
						/>{/if}
				{:else if entryType === 'item'}<select bind:value={category}
						><option value="weapon">Arma</option><option value="armor">Armadura</option><option
							value="consumable">Consumível</option
						><option value="tool">Ferramenta</option><option value="gear">Equipamento</option
						></select
					><input bind:value={itemDamage} placeholder="Dano, ex.: 1d8 cortante" /><input
						bind:value={itemDefense}
						type="number"
						min="0"
						placeholder="Defesa / CA"
					/>
				{:else if entryType === 'spell'}<input
						bind:value={spellLevel}
						type="number"
						min="0"
						max="9"
						placeholder="Círculo"
					/><input bind:value={spellClasses} placeholder="Classes, separadas por vírgula" />
				{:else if entryType === 'class'}<input
						bind:value={classHitDie}
						type="number"
						min="4"
						max="12"
						step="2"
						placeholder="Dado de vida"
					/>
				{:else if entryType === 'subclass'}<input
						bind:value={parentClass}
						placeholder="Classe-base"
					/>
				{:else if entryType === 'species'}<input
						bind:value={speed}
						type="number"
						min="0"
						placeholder="Deslocamento (m)"
					/>{/if}
				{#if entryType === 'class' || entryType === 'subclass'}
					<div class="level-features-editor">
						<div class="feature-editor-head"><strong>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</strong><button class="ghost" type="button" onclick={addLevelFeature}>+ {$appLocale === 'en' ? 'Add feature' : 'Adicionar habilidade'}</button></div>
						{#if levelFeatures.length === 0}<small>{$appLocale === 'en' ? 'Add each feature with the level at which it unlocks.' : 'Adicione cada habilidade com o nível em que ela é desbloqueada.'}</small>{/if}
						{#each levelFeatures as feature (feature.id)}
							<div class="level-feature-row">
								<input type="number" min="1" max="20" bind:value={feature.level} aria-label={$appLocale === 'en' ? 'Unlock level' : 'Nível de desbloqueio'} />
								<input bind:value={feature.name} placeholder={$appLocale === 'en' ? 'Feature name' : 'Nome da habilidade'} />
								<textarea bind:value={feature.description} rows="2" placeholder={$appLocale === 'en' ? 'Short objective description' : 'Descrição curta e objetiva'}></textarea>
								<button class="ghost" type="button" onclick={() => removeLevelFeature(feature.id)} aria-label={$appLocale === 'en' ? 'Remove feature' : 'Remover habilidade'}>×</button>
							</div>
						{/each}
					</div>
				{/if}
				<textarea
					bind:value={summary}
					maxlength="2000"
					placeholder={$appLocale === 'en' ? 'Original, objective summary of how it works.' : 'Resumo autoral e objetivo do funcionamento.'}></textarea><label
					><input type="checkbox" bind:checked={published} /> {$appLocale === 'en' ? 'Visible to players' : 'Visível aos jogadores'}</label
				>
				<div class="form-actions">
					<button class="ghost" onclick={downloadTemplate}>Baixar modelo JSON</button><label
						class="file"
						><input
							type="file"
							accept="application/json"
							onchange={importFile}
							disabled={importing}
						/>
						{importing
							? ($appLocale === 'en' ? 'Importing…' : 'Importando…')
							: ($appLocale === 'en' ? `Import ${types.find(([value]) => value === entryType)?.[1]}` : `Importar ${types.find(([value]) => value === entryType)?.[1]}`)}</label
					>{#if editingEntryId}<button class="ghost" onclick={() => { editingEntryId = null; clearForm(); }}>{$appLocale === 'en' ? 'Cancel edit' : 'Cancelar edição'}</button>{/if}<button class="primary" onclick={create} disabled={saving}
						>{saving ? ($appLocale === 'en' ? 'Saving…' : 'Salvando…') : (editingEntryId ? ($appLocale === 'en' ? 'Save changes' : 'Salvar alterações') : ($appLocale === 'en' ? 'Add' : 'Adicionar'))}</button
					>
				</div>
			</div>
		</section>{/if}
	<section class="entries">
		<div class="entry-head">
			<h3>{$appLocale === 'en' ? 'Entries' : 'Entradas'}</h3>
			<input
				bind:value={query}
				placeholder={$appLocale === 'en' ? 'Search by name…' : 'Buscar por nome…'}
			/><select bind:value={filter} onchange={() => (selectedEntryId = null)}
				><option value="all">{$appLocale === 'en' ? 'All types' : 'Todos os tipos'}</option
				>{#each types as [value, label]}<option {value}>{label}</option>{/each}</select
			>
			<select bind:value={sortMode} aria-label={$appLocale === 'en' ? 'Sort entries' : 'Ordenar entradas'}>
				<option value="name">{$appLocale === 'en' ? 'Sort: name' : 'Ordenar: nome'}</option>
				<option value="category">{$appLocale === 'en' ? 'Sort: category' : 'Ordenar: categoria'}</option>
				<option value="challenge">{$appLocale === 'en' ? 'Sort: challenge rating' : 'Ordenar: nível de desafio'}</option>
				<option value="source">{$appLocale === 'en' ? 'Sort: source' : 'Ordenar: fonte'}</option>
			</select>
		</div>
		{#if loading}<p class="empty">
				{$appLocale === 'en' ? 'Loading compendium…' : 'Carregando compêndio…'}
			</p>{:else if visible().length}<div class="catalog-layout">
				<div class="catalog-list">
					{#if filter === 'all'}{#each groupedVisible() as group}<section class="category-group">
								<h4>{group.label} <small>{group.entries.length}</small></h4>
								<div class="entry-grid">
									{#each group.entries as entry (entry.id)}<button
											class:active={selectedEntryId === entry.id}
											onclick={() => (selectedEntryId = entry.id)}
											><span>{typeLabel(entry)}</span><strong>{displayName(entry)}</strong
											>{#if isMonster(entry) && hasMonsterSheet(entry)}<small
													>{$appLocale === 'en' ? 'CR' : 'ND'}
													{String(rules(entry).challenge ?? '—')} · {$appLocale === 'en'
														? 'HP'
														: 'PV'}
													{rules(entry).hpMax}</small
												>{/if}</button
										>{/each}
								</div>
							</section>{/each}{:else}<div class="entry-grid">
							{#each visible() as entry (entry.id)}<button
									class:active={selectedEntryId === entry.id}
									onclick={() => (selectedEntryId = entry.id)}
									><span>{typeLabel(entry)}</span><strong>{displayName(entry)}</strong
									>{#if isMonster(entry) && hasMonsterSheet(entry)}<small
											>{$appLocale === 'en' ? 'CR' : 'ND'}
											{String(rules(entry).challenge ?? '—')} · {$appLocale === 'en' ? 'HP' : 'PV'}
											{rules(entry).hpMax}</small
										>{/if}</button
								>{/each}
						</div>{/if}
				</div>
				{#if selectedEntry()}{@const entry = selectedEntry()!}{@const detail = rules(entry)}
					<aside class="entry-detail">
						<button class="close-detail" onclick={() => (selectedEntryId = null)}>×</button><span
							class="type">{typeLabel(entry)}</span
						>
						{#if isGM && !sources.find((source) => source.id === entry.sourceId)?.readOnly}
							<div class="entry-actions">
								<button class="ghost" onclick={() => editEntry(entry)}>{$appLocale === 'en' ? 'Edit private entry' : 'Editar entrada privada'}</button>
								<button class="danger" onclick={() => void removeEntry(entry)}>{$appLocale === 'en' ? 'Delete' : 'Excluir'}</button>
							</div>
						{/if}
						<h3>{displayName(entry)}</h3>
						{#if $appLocale === 'pt-BR' && entry.translations?.['pt-BR']}<small class="canonical"
								>{entry.name}</small
							>{/if}{#if translationIsOfficial(entry)}<small class="official-translation"
								>{$appLocale === 'en' ? 'Official translation' : 'Tradução oficial'}</small
							>{/if}{#if translationHasAI(entry)}<small class="ai-translation"
								>{$appLocale === 'en' ? 'Translated with AI' : 'Traduzido com IA'}</small
							>{/if}
						<p>
							{displaySummary(entry) ||
								($appLocale === 'en'
									? 'No summary is available for this entry.'
					: 'Sem resumo cadastrado para esta entrada.')}
						</p>
						{#if isGM && $appLocale === 'pt-BR'}
							<button
								class="translate"
								onclick={() => void translate(entry)}
								disabled={translating === entry.id}
								>{translating === entry.id
									? 'Traduzindo…'
									: entry.translations?.['pt-BR.summary']
									? 'Completar tradução com IA'
									: 'Traduzir com IA'}</button
							>
						{/if}
						{#if isMonster(entry)}<div class="rules">
								<b>{$appLocale === 'en' ? 'AC' : 'CA'} {String(detail.armorClass ?? '—')}</b><b
									>{$appLocale === 'en' ? 'HP' : 'PV'} {String(detail.hpMax ?? '—')}</b
								><b>{$appLocale === 'en' ? 'CR' : 'ND'} {String(detail.challenge ?? '—')}</b><b
									>{distanceText(displayRule(entry, 'speed', detail.speed), $appLocale)}</b
								>
							</div>
							{#if detail.abilities}<div class="rules">
									{#each Object.entries(detail.abilities as Record<string, unknown>) as [ability, score]}<b
											>{ability.slice(0, 3).toUpperCase()} {String(score)}</b
										>{/each}
								</div>{/if}{#if Array.isArray(detail.actions) && detail.actions.length}<h4>
									{$appLocale === 'en' ? 'Actions' : 'Ações'}
								</h4>
								{#each detail.actions as action, index}<div class="action-card">
										<strong
											>{displayAction(
												entry,
												index,
												'name',
												(action as Record<string, unknown>).name ?? 'Ação'
											)}</strong
										><span
											>{String((action as Record<string, unknown>).toHit ?? '') !== ''
												? `+${String((action as Record<string, unknown>).toHit)} ${$appLocale === 'en' ? 'to hit' : 'para acertar'} · `
												: ''}{displayAction(
												entry,
												index,
												'damage',
												(action as Record<string, unknown>).damage ??
													(action as Record<string, unknown>).description ??
													''
											)}</span
										>
									</div>{/each}{/if}{#if isGM && hasMonsterSheet(entry)}<button
									class="place"
									onclick={() => placeMonster(entry)}
									disabled={placing === entry.id}
									>{placing === entry.id
										? $appLocale === 'en'
											? 'Adding…'
											: 'Adicionando…'
										: $appLocale === 'en'
											? 'Add to scene'
										: 'Adicionar à cena'}</button
								>{/if}{:else if entry.entryType === 'spell'}<div class="rules">
								<b>{$appLocale === 'en' ? 'Level' : 'Círculo'} {String(detail.level ?? 0)}</b><b
									>{Array.isArray(detail.classes) ? (detail.classes as string[]).join(', ') : ''}</b
								>{#if detail.school}<b>{displayRule(entry, 'school', detail.school)}</b
									>{/if}{#if detail.range}<b
										>{distanceText(displayRule(entry, 'range', detail.range), $appLocale)}</b
									>{/if}
							</div>{:else if entry.entryType === 'item'}<div class="rules">
								<b>{displayRule(entry, 'category', detail.category ?? 'item')}</b
								>{#if detail.damage}<b>{displayRule(entry, 'damage', detail.damage)}</b
									>{/if}{#if detail.armorClass}<b
										>{$appLocale === 'en' ? 'AC' : 'CA'} +{String(detail.armorClass)}</b
									>{/if}{#if detail.properties}<b
										>{Array.isArray(detail.properties)
											? (detail.properties as string[]).join(', ')
											: String(detail.properties)}</b
									>{/if}
							</div>{:else if entry.entryType === 'class'}<div class="rules">
								<b
									>{$appLocale === 'en' ? 'Hit Die' : 'Dado de vida'} d{String(
										detail.hitDie ?? '—'
									)}</b
								>
							</div>{#if Array.isArray(detail.features) && detail.features.length}<div class="feature-detail-list"><h4>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</h4>{#each detail.features as feature, index (String((feature as Record<string, unknown>).id ?? index))}<article><strong>{$appLocale === 'en' ? 'Level' : 'Nível'} {String((feature as Record<string, unknown>).level ?? '—')} · {String((feature as Record<string, unknown>).name ?? '')}</strong>{#if (feature as Record<string, unknown>).description}<p>{String((feature as Record<string, unknown>).description)}</p>{/if}</article>{/each}</div>{/if}{:else if entry.entryType === 'subclass'}<div class="rules">
								<b
									>{$appLocale === 'en' ? 'Base class' : 'Classe-base'}: {displayRule(
										entry,
										'className',
										detail.className ?? '—'
									)}</b
								>
							</div>{#if Array.isArray(detail.features) && detail.features.length}<div class="feature-detail-list"><h4>{$appLocale === 'en' ? 'Features by level' : 'Habilidades por nível'}</h4>{#each detail.features as feature, index (String((feature as Record<string, unknown>).id ?? index))}<article><strong>{$appLocale === 'en' ? 'Level' : 'Nível'} {String((feature as Record<string, unknown>).level ?? '—')} · {String((feature as Record<string, unknown>).name ?? '')}</strong>{#if (feature as Record<string, unknown>).description}<p>{String((feature as Record<string, unknown>).description)}</p>{/if}</article>{/each}</div>{/if}{:else if entry.entryType === 'species'}<div class="rules">
								<b
									>{$appLocale === 'en' ? 'Speed' : 'Deslocamento'}: {distanceText(
										displayRule(entry, 'speed', detail.speed ?? '—'),
										$appLocale
									)}</b
								>
							</div>{/if}<small
							>{entry.isPublished
								? $appLocale === 'en'
									? 'Visible to players'
									: 'Visível aos jogadores'
								: $appLocale === 'en'
									? 'Game master only'
					: 'Somente narrador'}</small
						>
					</aside>{/if}
			</div>{:else}<p class="empty">
				{$appLocale === 'en' ? 'No entries match this filter.' : 'Nenhuma entrada neste filtro.'}
			</p>{/if}
	</section>
</main>

<style>
	.compendium {
		min-height: 510px;
		display: grid;
		gap: 1rem;
		padding: clamp(1.25rem, 3vw, 2.5rem);
		color: #eee4d6;
	}
	.compendium > header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #493c39;
	}
	.compendium > header p,
	.assistant-copy p {
		margin: 0;
		color: #d8ad67;
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.13em;
	}
	.compendium > header h2 {
		margin: 0.2rem 0;
		font:
			600 clamp(1.45rem, 3vw, 2rem) Georgia,
			serif;
		color: #f3d9a8;
	}
	.compendium > header span,
	.assistant-copy span {
		color: #bcae9e;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex: none;
	}
	.header-actions button,
	.entry-head input,
	.entry-head select,
	.form input,
	.form select,
	.form textarea {
		min-width: 0;
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
	}
	.level-features-editor {
		display: grid;
		gap: 0.55rem;
		padding: 0.75rem;
		border: 1px solid #59483b;
		border-radius: 8px;
		background: #121015;
	}
	.feature-editor-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	.level-features-editor small { color: #a99b8d; font-size: 0.72rem; }
	.level-feature-row { display: grid; grid-template-columns: 5rem minmax(9rem, 1fr) minmax(12rem, 2fr) auto; gap: 0.45rem; align-items: start; }
	.level-feature-row textarea { resize: vertical; min-height: 2.5rem; }
	@media (max-width: 720px) { .level-feature-row { grid-template-columns: 4.5rem 1fr auto; } .level-feature-row textarea { grid-column: 1 / -1; } }
	.feature-detail-list { display: grid; gap: 0.45rem; margin-top: 0.8rem; }
	.feature-detail-list h4 { margin: 0; color: #d8ad67; font-size: 0.78rem; }
	.feature-detail-list article { padding: 0.45rem 0.6rem; border-left: 2px solid #8f6737; background: #171417; }
	.feature-detail-list article strong { font-size: 0.76rem; color: #eadfce; }
	.feature-detail-list article p { margin: 0.2rem 0 0; color: #bcae9e; font-size: 0.74rem; line-height: 1.4; }
	.header-actions button,
	.form button,
	.sources button,
	.place {
		cursor: pointer;
	}
	.message {
		margin: 0;
		border: 1px solid #805449;
		border-radius: 7px;
		padding: 0.6rem 0.75rem;
		color: #ffd3c6;
		background: #38201e;
		font-size: 0.76rem;
	}
	.message.success {
		border-color: #4e7a62;
		color: #c9f0d6;
		background: #1e3027;
	}
	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: stretch;
	}
	.sources h3 {
		width: 100%;
		margin: 0 0 0.05rem;
		color: #cdbba8;
		font:
			600 0.78rem Georgia,
			serif;
	}
	.sources button {
		display: grid;
		gap: 0.22rem;
		min-width: 160px;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem 0.75rem;
		color: #d9ccbb;
		background: #211b1e;
		text-align: left;
	}
	.sources button:hover,
	.sources button.active {
		border-color: #d8ad67;
		background: #30251f;
	}
	.sources button strong {
		color: #f0d7a4;
		font-size: 0.76rem;
	}
	.sources button small {
		color: #a99c91;
		font-size: 0.66rem;
	}
	.assistant {
		display: grid;
		grid-template-columns: minmax(190px, 0.7fr) minmax(0, 1.3fr);
		gap: 1rem;
		border: 1px solid #59483b;
		border-radius: 10px;
		padding: 1rem;
		background: linear-gradient(120deg, #241d1c, #1b171a);
	}
	.assistant-copy {
		display: grid;
		align-content: start;
		gap: 0.45rem;
	}
	.assistant-copy h3 {
		margin: 0;
		color: #f0d29d;
		font:
			600 1.05rem Georgia,
			serif;
	}
	.form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.form textarea {
		grid-column: 1 / -1;
		min-height: 76px;
		resize: vertical;
	}
	.form > label:not(.file) {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #cbbbab;
		font-size: 0.72rem;
	}
	.form-actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
	}
	.form button,
	.file {
		border: 1px solid #765d3d;
		border-radius: 6px;
		padding: 0.48rem 0.65rem;
		color: #f0d5a3;
		background: #30241e;
		font-size: 0.72rem;
	}
	.form .primary,
	.place {
		border-color: #b98a4b;
		color: #2c1b0d;
		background: #e0b86f;
	}
	.form .ghost {
		background: transparent;
	}
	.entry-actions { display: flex; gap: .4rem; margin: .45rem 0 .7rem; }
	.entry-actions button { font-size: .7rem; padding: .35rem .55rem; border-radius: 5px; border: 1px solid #765d3d; color: #f0d5a3; background: transparent; }
	.entry-actions .danger { border-color: #9c5c54; color: #f0aaa0; }
	.file {
		cursor: pointer;
	}
	.file input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		opacity: 0;
	}
	.entries {
		min-width: 0;
		border-top: 1px solid #3e3434;
		padding-top: 1rem;
	}
	.entry-head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	.entry-head h3 {
		margin: 0 auto 0 0;
		color: #f0d29d;
		font:
			600 1rem Georgia,
			serif;
	}
	.entry-head input {
		width: min(100%, 270px);
	}
	.catalog-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(270px, 0.42fr);
		gap: 1rem;
	}
	.category-group {
		margin-bottom: 1.2rem;
	}
	.category-group h4 {
		margin: 0 0 0.5rem;
		color: #d8ad67;
		font:
			600 0.8rem Georgia,
			serif;
	}
	.category-group h4 small {
		color: #a99c91;
	}
	.entry-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
		gap: 0.5rem;
	}
	.entry-grid button {
		display: grid;
		gap: 0.25rem;
		min-height: 76px;
		border: 1px solid #493c39;
		border-radius: 8px;
		padding: 0.65rem;
		color: #eee4d6;
		background: #211b1e;
		text-align: left;
		cursor: pointer;
	}
	.entry-grid button:hover,
	.entry-grid button.active {
		border-color: #d8ad67;
		background: #30251f;
	}
	.entry-grid button span {
		color: #d8ad67;
		font-size: 0.59rem;
		text-transform: uppercase;
	}
	.entry-grid button strong {
		font:
			600 0.82rem Georgia,
			serif;
	}
	.entry-grid button small {
		color: #a99c91;
		font-size: 0.62rem;
	}
	.entry-detail {
		position: sticky;
		top: 1rem;
		align-self: start;
		display: grid;
		gap: 0.7rem;
		border: 1px solid #765d3d;
		border-radius: 10px;
		padding: 1rem;
		background: #251e1c;
	}
	.entry-detail h3,
	.entry-detail p {
		margin: 0;
	}
	.entry-detail p {
		color: #cbbbab;
		font-size: 0.8rem;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.entry-detail h4 {
		margin: 0.15rem 0 -0.25rem;
		color: #e6c98f;
		font:
			600 0.84rem Georgia,
			serif;
	}
	.type,
	.canonical,
	.entry-detail > small {
		color: #aa9a8b;
		font-size: 0.67rem;
	}
	.official-translation {
		justify-self: start;
		border: 1px solid #5a8b6a;
		border-radius: 999px;
		padding: 0.18rem 0.42rem;
		color: #bce8c8 !important;
		background: #1d3929;
		font-weight: 700;
	}
	.ai-translation {
		justify-self: start;
		border: 1px solid #6378a1;
		border-radius: 999px;
		padding: 0.18rem 0.42rem;
		color: #cbd9ff !important;
		background: #202c47;
		font-weight: 700;
	}
	.translate {
		justify-self: start;
		border: 1px solid #6378a1;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		color: #d9e3ff;
		background: #202c47;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.translate:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.close-detail {
		justify-self: end;
		border: 0;
		color: #cbbbab;
		background: transparent;
		font-size: 1.2rem;
		cursor: pointer;
	}
	.rules {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.rules b {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.32rem 0.45rem;
		color: #e8cf98;
		font-size: 0.68rem;
	}
	.action-card {
		display: grid;
		gap: 0.2rem;
		border-left: 2px solid #9b7549;
		padding: 0.38rem 0.5rem;
		background: #1b1618;
	}
	.action-card strong {
		color: #f0d29d;
		font-size: 0.74rem;
	}
	.action-card span {
		color: #cbbbab;
		font-size: 0.7rem;
		line-height: 1.35;
	}
	.place {
		justify-self: start;
		padding: 0.55rem 0.75rem;
		font-size: 0.74rem;
	}
	.empty {
		color: #aa9a8b;
		font-style: italic;
	}
	@media (max-width: 760px) {
		.compendium > header,
		.assistant {
			grid-template-columns: 1fr;
			display: grid;
		}
		.header-actions {
			justify-content: flex-start;
		}
		.form,
		.catalog-layout {
			grid-template-columns: 1fr;
		}
		.entry-detail {
			position: static;
		}
		.entry-head {
			flex-wrap: wrap;
		}
		.entry-head h3 {
			width: 100%;
		}
		.entry-head input,
		.entry-head select {
			flex: 1 1 150px;
		}
	}
</style>
