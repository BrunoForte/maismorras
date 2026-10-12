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
		updateCampaignFeatSpellRule,
		type CampaignFeatSpellRule,
		type CompendiumDraft,
		type CompendiumEntry,
		type CompendiumSource
	} from '$lib/services/compendiumApi';
	import { createTokenFromCompendiumMonster } from '$lib/services/sceneApi';
	import { optimizeImage } from '$lib/services/imageProcessing';
	import { getSupabaseClient } from '$lib/services/supabase';
	import { getSignedAssetUrl } from '$lib/services/assetApi';
	import { appLocale } from '$lib/stores/locale';
	import {
		canResumeTranslationQueue,
		srdTranslationQueue,
		startSrdTranslationQueue
	} from '$lib/services/srdTranslationQueue';
	import CompendiumCatalogPanel from '$lib/components/compendium/CompendiumCatalogPanel.svelte';
	import CompendiumEntryEditor from '$lib/components/compendium/CompendiumEntryEditor.svelte';
	import CompendiumEntryDetails from '$lib/components/compendium/CompendiumEntryDetails.svelte';
	import {
		COMPENDIUM_ENTRY_TYPES,
		compendiumDraftFromEditor,
		compendiumRulesFromEditor,
		editorModelFromEntry,
		emptyCompendiumEditorModel,
		compendiumEntryTranslationStatus,
		canInitiateCompendiumTranslation,
		hasPendingCompendiumTranslation,
		translatedCompendiumName,
		translatedCompendiumText,
		type CompendiumCatalogFilters,
		type CompendiumEditorModel
	} from '$lib/utils/compendium/compendiumRules';
	import type { CompendiumDetailsView } from '$lib/components/compendium/compendiumTypes';
	import {
		campaignFeatSpellRuleFromEntryRules,
		emptyCampaignFeatSpellRuleDraft,
		serializeCampaignFeatSpellRuleDraft,
		type CampaignFeatSpellRuleDraft
	} from '$lib/utils/compendium/campaignFeatSpellRule';

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

	const types = COMPENDIUM_ENTRY_TYPES;
	let sources = $state<CompendiumSource[]>([]);
	let entries = $state<CompendiumEntry[]>([]);
	let canTranslateSharedSrd = $state(false);
	let filters = $state<CompendiumCatalogFilters>({
		query: '',
		entryType: 'all',
		sourceId: 'all',
		sortMode: 'name'
	});
	let loading = $state(true);
	let saving = $state(false);
	let importing = $state(false);
	let placing = $state<string | null>(null);
	let translating = $state<string | null>(null);
	let batchTranslating = $state(false);
	let batchPaused = $state(false);
	let batchProgress = $state('');
	let message = $state('');
	let selectedEntryId = $state<string | null>(null);
	let selectedArtUrl = $state('');
	let artRequestRevision = 0;
	let editingEntryId = $state<string | null>(null);
	let uploadingMonsterArt = $state(false);
	let campaignFeatRuleEntry = $state<CompendiumEntry | null>(null);
	let campaignFeatRuleDraft = $state<CampaignFeatSpellRuleDraft>(emptyCampaignFeatSpellRuleDraft());
	let campaignRuleSaving = $state(false);
	let draft = $state<CompendiumEditorModel>(emptyCompendiumEditorModel());
	const selectedEntry = $derived(entries.find((entry) => entry.id === selectedEntryId) ?? null);
	const privateSources = () => sources.filter((source) => !source.readOnly);
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
		return labels[value]?.[$appLocale === 'en' ? 1 : 0] ?? value;
	};
	const sourceKindLabel = (source: CompendiumSource) =>
		source.kind === 'srd' ? `SRD ${source.version}` : $appLocale === 'en' ? 'Private' : 'Privada';
	const displayName = (entry: CompendiumEntry) => translatedCompendiumName(entry, $appLocale);
	const displaySummary = (entry: CompendiumEntry) =>
		translatedCompendiumText(entry, 'summary', entry.summary, $appLocale);
	const isMonster = (entry: CompendiumEntry) =>
		entry.entryType === 'other' &&
		(entry.rules?.kind === 'monster' || entry.rules?.catalog === 'monster');
	const hasMonsterSheet = (entry: CompendiumEntry) =>
		isMonster(entry) && Number(entry.rules?.hpMax) > 0 && Number(entry.rules?.armorClass) >= 0;

	$effect(() => {
		const entry = selectedEntry;
		const imagePath = String(entry?.rules?.imageUrl ?? '');
		const revision = ++artRequestRevision;
		if (!imagePath) {
			selectedArtUrl = '';
			return;
		}
		void getSignedAssetUrl(session, campaignId, imagePath).then((url) => {
			if (revision === artRequestRevision) selectedArtUrl = url ?? '';
		});
	});

	function addLevelFeature() {
		draft.levelFeatures = [
			...draft.levelFeatures,
			{ id: crypto.randomUUID(), name: '', level: 1, description: '' }
		];
	}
	function removeLevelFeature(id: string) {
		draft.levelFeatures = draft.levelFeatures.filter((feature) => feature.id !== id);
	}
	function clearForm() {
		draft = {
			...draft,
			name: '',
			portugueseName: '',
			summary: '',
			imageUrl: '',
			monsterExtraRules: {},
			extraTranslations: {},
			itemDamage: '',
			itemDefense: 0,
			spellClasses: '',
			parentClass: '',
			levelFeatures: []
		};
	}
	async function load() {
		loading = true;
		message = '';
		try {
			const data = await getCompendium(session, campaignId);
			sources = data.sources;
			entries = data.entries;
			canTranslateSharedSrd = data.canTranslateSharedSrd === true;
			if (!editingEntryId)
				draft.sourceId = data.sources.find((source) => !source.readOnly)?.id ?? '';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not load the compendium.'
						: 'Não foi possível carregar o compêndio.';
		} finally {
			loading = false;
		}
	}
	async function create() {
		if (!draft.name.trim() || !draft.sourceId) {
			message =
				$appLocale === 'en'
					? 'Enter a name and a private source.'
					: 'Informe nome e uma fonte privada.';
			return;
		}
		saving = true;
		message = '';
		try {
			const payload = {
				...compendiumDraftFromEditor(
					draft,
					editingEntryId ? entries.find((item) => item.id === editingEntryId) : undefined
				),
				sourceId: draft.sourceId,
				entryType: draft.entryType
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
			message =
				$appLocale === 'en'
					? wasEditing
						? 'Private entry updated.'
						: 'Private entry added.'
					: wasEditing
						? 'Entrada privada atualizada.'
						: 'Entrada privada adicionada.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not save the entry.'
						: 'Não foi possível salvar a entrada.';
		} finally {
			saving = false;
		}
	}
	function editEntry(entry: CompendiumEntry) {
		if (sources.find((source) => source.id === entry.sourceId)?.readOnly) return;
		editingEntryId = entry.id;
		draft = editorModelFromEntry(entry);
	}
	function configureCampaignFeatRule(entry: CompendiumEntry) {
		if (!isGM || entry.entryType !== 'feat') return;
		campaignFeatRuleEntry = entry;
		campaignFeatRuleDraft = campaignFeatSpellRuleFromEntryRules(entry.rules);
		window.setTimeout(
			() => document.querySelector('.feat-spell-rule')?.scrollIntoView({ behavior: 'smooth' }),
			0
		);
	}
	async function saveCampaignFeatRule(draft: CampaignFeatSpellRuleDraft) {
		const entry = campaignFeatRuleEntry;
		if (!isGM || !entry || campaignRuleSaving) return;
		campaignRuleSaving = true;
		message = '';
		try {
			const rule: CampaignFeatSpellRule = serializeCampaignFeatSpellRuleDraft(draft);
			const updated = await updateCampaignFeatSpellRule(session, campaignId, entry.id, rule);
			entries = entries.map((item) => (item.id === updated.id ? updated : item));
			campaignFeatRuleEntry = updated;
			campaignFeatRuleDraft = campaignFeatSpellRuleFromEntryRules(updated.rules);
			message =
				$appLocale === 'en'
					? 'Campaign feat spell rule saved. Existing feat descriptions and translations were preserved.'
					: 'Regra de magias do talento salva nesta campanha. Descrições e traduções existentes foram preservadas.';
		} catch (error) {
			message =
				error instanceof Error ? error.message : 'Não foi possível salvar a regra do talento.';
		} finally {
			campaignRuleSaving = false;
		}
	}
	function copyMonsterForCampaign(entry: CompendiumEntry) {
		const source = privateSources()[0];
		if (!source) {
			message = 'Crie uma fonte privada da campanha antes de copiar criaturas do SRD.';
			return;
		}
		const monster = entry.rules ?? {};
		draft = {
			...editorModelFromEntry(entry),
			sourceId: source.id,
			entryType: 'other',
			category: 'monster',
			name: entry.name,
			portugueseName: String(entry.translations?.['pt-BR'] ?? ''),
			summary: displaySummary(entry),
			hpMax: Number(monster.hpMax ?? monster.hitPointsMax ?? 0),
			armorClass: Number(monster.armorClass ?? 10),
			size: Number(monster.size ?? 1),
			initiative: Number(monster.initiative ?? 0),
			color: draft.color,
			imageUrl: String(monster.imageUrl ?? ''),
			published: true
		};
		editingEntryId = null;
		selectedEntryId = null;
		window.setTimeout(
			() => document.querySelector('.assistant')?.scrollIntoView({ behavior: 'smooth' }),
			0
		);
		message = `Cópia de “${displayName(entry)}” preparada. Vincule uma URL ou caminho de imagem e salve.`;
	}
	async function uploadMonsterArt(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || uploadingMonsterArt) return;
		if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
			message = 'Escolha uma imagem de até 15 MB.';
			return;
		}
		uploadingMonsterArt = true;
		try {
			const supabase = await getSupabaseClient();
			if (!supabase) throw new Error('Supabase não está configurado.');
			const optimized = await optimizeImage(file, 768, 0.8);
			const path = `campaigns/${campaignId}/media/${crypto.randomUUID()}-criatura.webp`;
			const { error } = await supabase.storage
				.from('campaign-assets')
				.upload(path, optimized.file, {
					contentType: optimized.file.type,
					cacheControl: '31536000'
				});
			if (error) throw error;
			draft.imageUrl = path;
			message = 'Imagem otimizada e vinculada. Salve a criatura para concluir.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível enviar a imagem.';
		} finally {
			uploadingMonsterArt = false;
		}
	}
	async function removeEntry(entry: CompendiumEntry) {
		if (
			sources.find((source) => source.id === entry.sourceId)?.readOnly ||
			!confirm($appLocale === 'en' ? 'Delete this private entry?' : 'Excluir esta entrada privada?')
		)
			return;
		try {
			await deleteCompendiumEntry(session, campaignId, entry.id);
			entries = entries.filter((item) => item.id !== entry.id);
			selectedEntryId = null;
			message = $appLocale === 'en' ? 'Private entry deleted.' : 'Entrada privada excluída.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Não foi possível excluir.';
		}
	}
	function downloadTemplate() {
		const label = typeName(draft.entryType);
		const sample: CompendiumDraft = {
			name: `Novo(a) ${label}`,
			summary: 'Resumo autoral do efeito ou referência.',
			rules: compendiumRulesFromEditor(draft),
			translations: { 'pt-BR': `Novo(a) ${label}` },
			isPublished: true
		};
		const body = JSON.stringify({ entryType: draft.entryType, entries: [sample] }, null, 2);
		const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `maismorras-${draft.entryType}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}
	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !draft.sourceId) return;
		importing = true;
		message = '';
		try {
			const parsed = JSON.parse(await file.text()) as
				{ entryType?: string; entries?: CompendiumDraft[] } | CompendiumDraft[];
			const fileType = Array.isArray(parsed) ? draft.entryType : parsed.entryType;
			const imported = Array.isArray(parsed) ? parsed : parsed.entries;
			if (fileType !== draft.entryType || !Array.isArray(imported))
				throw new Error(
					`Use um arquivo de ${types.find(([value]) => value === draft.entryType)?.[1]}.`
				);
			const result = await importCompendiumEntries(
				session,
				campaignId,
				draft.sourceId,
				draft.entryType,
				imported
			);
			message =
				$appLocale === 'en'
					? `${result.imported} entr${result.imported === 1 ? 'y' : 'ies'} imported or updated.`
					: `${result.imported} entrada(s) importada(s) ou atualizada(s).`;
			await load();
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not import the file.'
						: 'Não foi possível importar o arquivo.';
		} finally {
			importing = false;
		}
	}
	async function placeMonster(entry: CompendiumEntry) {
		if (!sceneId) {
			message =
				$appLocale === 'en'
					? 'Open a scene in the Table tab before placing the monster.'
					: 'Abra uma cena na aba Mesa antes de posicionar o monstro.';
			return;
		}
		placing = entry.id;
		message = '';
		try {
			await createTokenFromCompendiumMonster(session, sceneId, entry.id);
			message = `${displayName(entry)} foi adicionado à cena.`;
			ontokencreated();
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not add the monster.'
						: 'Não foi possível adicionar o monstro.';
		} finally {
			placing = null;
		}
	}
	async function translate(entry: CompendiumEntry) {
		if (
			!canInitiateCompendiumTranslation(
				entry,
				sources.find((source) => source.id === entry.sourceId),
				canTranslateSharedSrd,
				isGM
			) ||
			!hasPendingCompendiumTranslation(entry)
		)
			return;
		translating = entry.id;
		message = '';
		try {
			const updated = await translateCompendiumEntry(session, campaignId, entry.id);
			entries = entries.map((item) => (item.id === updated.id ? updated : item));
			message =
				$appLocale === 'en'
					? 'Free AI translation generated and marked.'
					: 'Tradução livre (IA) gerada e identificada.';
		} catch (error) {
			message =
				error instanceof Error
					? error.message
					: $appLocale === 'en'
						? 'Could not generate the translation.'
						: 'Não foi possível gerar a tradução.';
		} finally {
			translating = null;
		}
	}
	async function translateSRDPending() {
		if (!canTranslateSharedSrd || $appLocale !== 'pt-BR' || batchTranslating) return;
		const pending = entries.filter(
			(entry) =>
				sources.find((source) => source.id === entry.sourceId)?.kind === 'srd' &&
				hasPendingCompendiumTranslation(entry)
		);
		if (!pending.length) {
			message = 'As entradas SRD já possuem tradução ou não têm texto para traduzir.';
			return;
		}
		message = '';
		await startSrdTranslationQueue(
			campaignId,
			pending,
			(entry) => translateCompendiumEntry(session, campaignId, entry.id),
			displayName
		);
	}

	const detailsView = $derived<CompendiumDetailsView | null>(
		selectedEntry
			? {
					entry: selectedEntry,
					artUrl: selectedArtUrl,
					displayName: displayName(selectedEntry),
					displaySummary: displaySummary(selectedEntry),
					typeLabel: typeName(selectedEntry.entryType),
					isMonster: isMonster(selectedEntry),
					hasMonsterSheet: hasMonsterSheet(selectedEntry),
					sourceReadOnly:
						sources.find((source) => source.id === selectedEntry.sourceId)?.readOnly ?? false,
					hasPrivateSource: privateSources().length > 0,
					isGM,
					canConfigureFeatSpellRule: selectedEntry.entryType === 'feat',
					canTranslate:
						$appLocale === 'pt-BR' &&
						hasPendingCompendiumTranslation(selectedEntry) &&
						canInitiateCompendiumTranslation(
							selectedEntry,
							sources.find((source) => source.id === selectedEntry.sourceId),
							canTranslateSharedSrd,
							isGM
						),
					translationStatus: compendiumEntryTranslationStatus(selectedEntry),
					canPlace: Boolean(sceneId),
					translating: translating === selectedEntry.id,
					placing: placing === selectedEntry.id
				}
			: null
	);
	const editorBusy = $derived({ saving, importing, uploadingArt: uploadingMonsterArt });
	const pendingSrdCount = $derived(
		entries.filter(
			(entry) =>
				sources.find((source) => source.id === entry.sourceId)?.kind === 'srd' &&
				hasPendingCompendiumTranslation(entry)
		).length
	);
	const editorActions = {
		save: () => void create(),
		cancel: () => {
			editingEntryId = null;
			clearForm();
		},
		downloadTemplate,
		importFile,
		uploadArt: uploadMonsterArt,
		addFeature: addLevelFeature,
		removeFeature: removeLevelFeature,
		saveCampaignFeatRule: (rule: CampaignFeatSpellRuleDraft) => void saveCampaignFeatRule(rule),
		closeCampaignFeatRule: () => (campaignFeatRuleEntry = null)
	};
	const detailActions = {
		close: () => (selectedEntryId = null),
		edit: editEntry,
		configureFeatSpellRule: configureCampaignFeatRule,
		remove: (entry: CompendiumEntry) => void removeEntry(entry),
		translate: (entry: CompendiumEntry) => void translate(entry),
		copyToCampaign: copyMonsterForCampaign,
		place: (entry: CompendiumEntry) => void placeMonster(entry)
	};

	onMount(() => {
		void load();
		return srdTranslationQueue.subscribe((state) => {
			if (state.campaignId !== campaignId) return;
			batchTranslating = state.status === 'running';
			batchPaused = state.status === 'paused';
			batchProgress =
				state.status === 'running'
					? `${Math.min(state.processed + 1, state.total)}/${state.total} · ${state.currentName}`
					: '';
			if (state.updatedEntry)
				entries = entries.map((item) =>
					item.id === state.updatedEntry?.id ? state.updatedEntry : item
				);
			if (state.status === 'completed')
				message = `Tradução concluída para ${state.completed} entrada(s) SRD.`;
			else if (state.status === 'paused') {
				const failedNames = state.failedEntries.slice(0, 3).join('”, “');
				const remaining = state.failedEntries.length - 3;
				const resumeText = {
					configuration:
						'Corrija a configuração do provedor e clique novamente para continuar apenas pelas pendentes.',
					quota:
						'Quando a cota estiver disponível novamente, clique para continuar apenas pelas pendentes.',
					rate_limited:
						'Aguarde antes de tentar novamente; a retomada processará apenas as pendentes.',
					provider:
						'As traduções salvas foram preservadas. Clique novamente para tentar apenas as pendentes.'
				}[state.pauseReason ?? 'provider'];
				message = `Lote pausado após ${state.completed}/${state.total} traduções salvas. ${state.failedEntries.length} entrada(s) pendente(s): “${failedNames}”${remaining > 0 ? ` e mais ${remaining}` : ''}. ${resumeText} ${state.error}`;
			}
		});
	});
</script>

<main class="compendium">
	<header>
		<div>
			<p>MAISMORRAS · COMPÊNDIO</p>
			<h2>{$appLocale === 'en' ? 'Compendium' : 'Compêndio'}</h2>
			<span
				>{$appLocale === 'en'
					? 'SRD, private material, and ready-to-use sheets for your campaign.'
					: 'SRD, material privado e fichas prontas para a sua campanha.'}</span
			>
		</div>
		<div class="header-actions">
			{#if canTranslateSharedSrd && $appLocale === 'pt-BR'}<button
					onclick={() => void translateSRDPending()}
					disabled={!canResumeTranslationQueue({
						isGM: canTranslateSharedSrd,
						locale: $appLocale,
						isRunning: batchTranslating,
						pendingCount: pendingSrdCount
					})}
					>{batchTranslating
						? `Traduzindo ${batchProgress}…`
						: batchPaused
							? `Retomar tradução (${pendingSrdCount})`
							: `Traduzir SRD pendente (${pendingSrdCount})`}</button
				>{/if}
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
	<CompendiumCatalogPanel
		section="sources"
		{entries}
		{sources}
		bind:filters
		{selectedEntryId}
		{loading}
		{displayName}
		{typeName}
		{sourceKindLabel}
		{isMonster}
		{hasMonsterSheet}
		onselect={(id) => (selectedEntryId = id || null)}
	/>
	{#if isGM}
		<CompendiumEntryEditor
			bind:model={draft}
			sources={privateSources()}
			{typeName}
			{isGM}
			editing={Boolean(editingEntryId)}
			busy={editorBusy}
			{campaignFeatRuleEntry}
			bind:campaignFeatRuleDraft
			spellEntries={entries.filter((entry) => entry.entryType === 'spell' && entry.isPublished)}
			{campaignRuleSaving}
			actions={editorActions}
		/>
	{/if}
	<div class="catalog-layout">
		<CompendiumCatalogPanel
			section="entries"
			{entries}
			{sources}
			bind:filters
			{selectedEntryId}
			{loading}
			{displayName}
			{typeName}
			{sourceKindLabel}
			{isMonster}
			{hasMonsterSheet}
			onselect={(id) => (selectedEntryId = id || null)}
		/>
		{#if detailsView}<CompendiumEntryDetails view={detailsView} actions={detailActions} />{/if}
	</div>
</main>

<style>
	.compendium {
		min-height: 510px;
		display: grid;
		gap: 1rem;
		padding: var(--mm-content-gutter, clamp(1rem, 2.5vw, 2rem));
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
	.compendium > header p {
		margin: 0;
		color: #d8ad67;
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.13em;
	}
	.compendium > header h2 {
		margin: 0.2rem 0;
		color: #f3d9a8;
		font:
			600 clamp(1.45rem, 3vw, 2rem) Georgia,
			serif;
	}
	.compendium > header span {
		color: #bcae9e;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex: none;
	}
	.header-actions button {
		border: 1px solid #59483b;
		border-radius: 6px;
		padding: 0.55rem;
		color: #eadfce;
		background: #161216;
		font: inherit;
		font-size: 0.78rem;
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
	.catalog-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(270px, 0.42fr);
		gap: 1rem;
	}
	@media (max-width: 760px) {
		.compendium > header {
			display: grid;
			grid-template-columns: 1fr;
		}
		.header-actions {
			justify-content: flex-start;
		}
		.catalog-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
