package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"strings"
	"vtt-backend/internal/observability"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("entry not found")
)

type Source struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Kind        string `json:"kind"`
	Version     string `json:"version"`
	Attribution string `json:"attribution"`
	LicenseURL  string `json:"licenseUrl"`
	ReadOnly    bool   `json:"readOnly"`
}
type Entry struct {
	ID             string          `json:"id"`
	SourceID       string          `json:"sourceId"`
	CatalogEntryID string          `json:"catalogEntryId,omitempty"`
	EntryType      string          `json:"entryType"`
	Name           string          `json:"name"`
	Summary        string          `json:"summary"`
	Rules          json.RawMessage `json:"rules"`
	Translations   json.RawMessage `json:"translations"`
	IsPublished    bool            `json:"isPublished"`
}
type Repository struct {
	pool            *pgxpool.Pool
	platformOwnerID string
}

func NewRepository(pool *pgxpool.Pool, platformOwnerIDs ...string) *Repository {
	ownerID := ""
	if len(platformOwnerIDs) > 0 && observability.IsUUID(platformOwnerIDs[0]) {
		ownerID = strings.ToLower(platformOwnerIDs[0])
	}
	return &Repository{pool: pool, platformOwnerID: ownerID}
}
func (r *Repository) role(ctx context.Context, campaignID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrForbidden
	}
	return role, err
}

func (r *Repository) CanTranslateSharedSRD(ctx context.Context, campaignID, userID string) bool {
	if !r.isPlatformOwner(userID) {
		return false
	}
	_, err := r.role(ctx, campaignID, userID)
	return err == nil
}

func (r *Repository) isPlatformOwner(userID string) bool {
	return r.platformOwnerID != "" && strings.EqualFold(r.platformOwnerID, userID)
}

func (r *Repository) IsSharedSRD(ctx context.Context, campaignID, entryID string) bool {
	_, found, err := r.sharedEntry(ctx, r.pool, campaignID, entryID, false)
	return err == nil && found
}

// This creates a private source and a read-only SRD attribution marker. It never
// claims that paid-book content is shipped with the VTT.
func (r *Repository) ensureDefaults(ctx context.Context, campaignID string) error {
	pack, err := loadSRDPack()
	if err != nil {
		return fmt.Errorf("load SRD pack: %w", err)
	}
	_, err = r.pool.Exec(ctx, `insert into compendium_sources(campaign_id,slug,title,kind,version,attribution,license_url,is_read_only) values ($1,'campaign-private','Compêndio privado da campanha','private','','Conteúdo cadastrado privadamente pelo narrador.','',false) on conflict (campaign_id,slug) do nothing`, campaignID)
	if err != nil {
		return err
	}
	return r.ensureSharedCatalog(ctx, campaignID, pack)
}

// ensureSharedCatalog upserts the embedded, versioned SRD into one canonical
// catalog and records aliases for legacy campaign-specific IDs. It never reads
// or copies translations from legacy campaign rows.
func (r *Repository) ensureSharedCatalog(ctx context.Context, campaignID string, pack srdPack) error {
	var sourceID string
	var storedRevision string
	if err := r.pool.QueryRow(ctx, `insert into srd_catalog_sources(slug,version,revision,title,attribution,license_url) values('dnd-srd', $1,$2,'D&D System Reference Document',$3,'https://www.dndbeyond.com/srd') on conflict(slug,version) do update set title=excluded.title,attribution=excluded.attribution,license_url=excluded.license_url,updated_at=case when srd_catalog_sources.revision is distinct from excluded.revision then now() else srd_catalog_sources.updated_at end returning id::text,revision`, pack.Version, pack.Revision, pack.Attribution).Scan(&sourceID, &storedRevision); err != nil {
		return err
	}
	if _, err := r.pool.Exec(ctx, `insert into campaign_srd_catalog_sources(campaign_id,source_id) values($1,$2) on conflict do nothing`, campaignID, sourceID); err != nil {
		return err
	}
	entries := uniqueEntries(pack.Entries)
	var storedCount int
	if err := r.pool.QueryRow(ctx, `select count(*) from srd_catalog_entries where source_id=$1`, sourceID).Scan(&storedCount); err != nil {
		return err
	}
	if storedRevision != pack.Revision || storedCount < len(entries) {
		batch := &pgx.Batch{}
		for _, entry := range entries {
			if len(entry.Rules) == 0 {
				entry.Rules = json.RawMessage(`{}`)
			}
			if len(entry.Translations) == 0 {
				entry.Translations = json.RawMessage(`{}`)
			}
			batch.Queue(`insert into srd_catalog_entries(source_id,entry_type,name,summary,rules,translations,is_published) values($1,$2,$3,$4,$5,$6,true) on conflict(source_id,entry_type,name) do update set summary=excluded.summary,rules=case when srd_catalog_entries.rules='{}'::jsonb or (excluded.rules->>'catalog'='monster' and not (srd_catalog_entries.rules ? 'hpMax')) then excluded.rules when excluded.rules->>'catalog'='magic-item' and srd_catalog_entries.rules->'description' is null and excluded.rules->'description' is not null then jsonb_set(srd_catalog_entries.rules,'{description}',excluded.rules->'description',true) else srd_catalog_entries.rules end,updated_at=now()`, sourceID, entry.EntryType, entry.Name, entry.Summary, entry.Rules, entry.Translations)
		}
		br := r.pool.SendBatch(ctx, batch)
		for range entries {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
				return fmt.Errorf("seed shared SRD: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return err
		}
	}
	if storedRevision != pack.Revision {
		if _, err := r.pool.Exec(ctx, `update srd_catalog_sources set revision=$1,updated_at=now() where id=$2`, pack.Revision, sourceID); err != nil {
			return fmt.Errorf("update SRD catalog revision: %w", err)
		}
	}
	report, err := r.syncReviewedTranslations(ctx, sourceID, entries)
	if err != nil {
		return fmt.Errorf("sync reviewed SRD translations: %w", err)
	}
	if len(report.Unresolved) > 0 {
		slog.Warn("SRD translation sync preserved values with unknown provenance", "source", "dnd-srd", "version", pack.Version, "count", len(report.Unresolved), "entries", report.Unresolved)
	}
	_, err = r.pool.Exec(ctx, `insert into srd_catalog_entry_aliases(campaign_id,legacy_entry_id,catalog_entry_id)
		select $1, old.id, shared.id
		from compendium_entries old
		join compendium_sources old_source on old_source.id=old.source_id and old_source.campaign_id=old.campaign_id and old_source.slug='dnd-srd-5-2-1' and old.campaign_id=$1
		join srd_catalog_entries shared on shared.source_id=$2 and shared.entry_type=old.entry_type and shared.name=old.name
		on conflict(campaign_id,legacy_entry_id) do nothing`, campaignID, sourceID)
	if err != nil {
		return err
	}
	// Preserve campaign feat rules in their isolated namespace without promoting
	// any campaign text or translation into the canonical catalog.
	_, err = r.pool.Exec(ctx, `insert into campaign_srd_entry_overrides(campaign_id,catalog_entry_id,rules,translations,updated_by)
		select $1,a.catalog_entry_id,coalesce(e.rules->'campaignOverrides','{}'::jsonb),coalesce(e.translations,'{}'::jsonb),c.owner_id
		from srd_catalog_entry_aliases a join compendium_entries e on e.id=a.legacy_entry_id
		join campaigns c on c.id=a.campaign_id
		where a.campaign_id=$1 and (coalesce(e.rules->'campaignOverrides','{}'::jsonb) <> '{}'::jsonb or coalesce(e.translations,'{}'::jsonb) <> '{}'::jsonb)
		on conflict(campaign_id,catalog_entry_id) do update set translations=case when campaign_srd_entry_overrides.translations='{}'::jsonb then excluded.translations else campaign_srd_entry_overrides.translations end,updated_at=now()`, campaignID)
	if err != nil {
		return err
	}
	unresolved, err := r.auditCampaignTranslationOverrides(ctx, campaignID, sourceID, entries)
	if err != nil {
		return fmt.Errorf("audit campaign SRD translation overrides: %w", err)
	}
	if len(unresolved) > 0 {
		slog.Warn("SRD campaign translation overrides preserved with unknown provenance", "campaign_id", campaignID, "count", len(unresolved), "entries", unresolved)
	}
	return err
}

func (r *Repository) auditCampaignTranslationOverrides(ctx context.Context, campaignID, sourceID string, entries []srdEntry) ([]string, error) {
	var unresolved []string
	for _, entry := range entries {
		approved := decodeTranslations(entry.Translations)
		if !strings.EqualFold(strings.TrimSpace(approved["pt-BR.source"]), "reviewed") {
			continue
		}
		var raw json.RawMessage
		err := r.pool.QueryRow(ctx, `select o.translations from campaign_srd_entry_overrides o join srd_catalog_entries e on e.id=o.catalog_entry_id where o.campaign_id=$1 and e.source_id=$2 and e.entry_type=$3 and e.name=$4`, campaignID, sourceID, entry.EntryType, entry.Name).Scan(&raw)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return unresolved, err
		}
		override := decodeTranslations(raw)
		for key := range approved {
			if key != "pt-BR" && !strings.HasPrefix(key, "pt-BR.") || strings.HasSuffix(key, ".source") || strings.TrimSpace(override[key]) == "" {
				continue
			}
			source := strings.ToLower(strings.TrimSpace(override[key+".source"]))
			if source != "ai" && source != "" && !translationSourceIsProtected(override, key) {
				unresolved = append(unresolved, entry.EntryType+":"+entry.Name+" "+key)
			}
		}
	}
	return unresolved, nil
}
func (r *Repository) List(ctx context.Context, campaignID, userID string) ([]Source, []Entry, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return nil, nil, err
	}
	if err = r.ensureDefaults(ctx, campaignID); err != nil {
		return nil, nil, fmt.Errorf("ensure compendium: %w", err)
	}
	srcRows, err := r.pool.Query(ctx, `select id::text,slug,title,kind,version,attribution,license_url,is_read_only from compendium_sources where campaign_id=$1 and slug <> 'dnd-srd-5-2-1' order by is_read_only,title`, campaignID)
	if err != nil {
		return nil, nil, err
	}
	defer srcRows.Close()
	sources := []Source{}
	for srcRows.Next() {
		var s Source
		if err := srcRows.Scan(&s.ID, &s.Slug, &s.Title, &s.Kind, &s.Version, &s.Attribution, &s.LicenseURL, &s.ReadOnly); err != nil {
			return nil, nil, err
		}
		sources = append(sources, s)
	}
	if err := srcRows.Err(); err != nil {
		return nil, nil, err
	}
	var sharedSource Source
	if err := r.pool.QueryRow(ctx, `select s.id::text,s.slug,s.title,'srd',s.version,s.attribution,s.license_url,true from srd_catalog_sources s join campaign_srd_catalog_sources cs on cs.source_id=s.id where cs.campaign_id=$1`, campaignID).Scan(&sharedSource.ID, &sharedSource.Slug, &sharedSource.Title, &sharedSource.Kind, &sharedSource.Version, &sharedSource.Attribution, &sharedSource.LicenseURL, &sharedSource.ReadOnly); err != nil {
		return nil, nil, fmt.Errorf("load campaign SRD source: %w", err)
	}
	sources = append(sources, sharedSource)
	q := `select e.id::text,e.source_id::text,e.entry_type,e.name,e.summary,e.rules,e.translations,e.is_published from compendium_entries e join compendium_sources s on s.id=e.source_id where e.campaign_id=$1 and s.slug <> 'dnd-srd-5-2-1'`
	if role != "gm" {
		q += ` and is_published=true`
	}
	q += ` order by entry_type,name`
	rows, err := r.pool.Query(ctx, q, campaignID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	entries := []Entry{}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.SourceID, &e.EntryType, &e.Name, &e.Summary, &e.Rules, &e.Translations, &e.IsPublished); err != nil {
			return nil, nil, err
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	sharedRows, err := r.pool.Query(ctx, `select e.id::text,e.source_id::text,e.entry_type,e.name,e.summary,e.rules,e.translations,e.is_published,coalesce(o.rules,'{}'::jsonb),coalesce(o.translations,'{}'::jsonb)
		from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id
		join campaign_srd_catalog_sources cs on cs.source_id=s.id and cs.campaign_id=$1
		left join campaign_srd_entry_overrides o on o.catalog_entry_id=e.id and o.campaign_id=$1
		where e.is_published order by e.entry_type,e.name`, campaignID)
	if err != nil {
		return nil, nil, err
	}
	defer sharedRows.Close()
	for sharedRows.Next() {
		var e Entry
		var override, campaignTranslations json.RawMessage
		if err := sharedRows.Scan(&e.ID, &e.SourceID, &e.EntryType, &e.Name, &e.Summary, &e.Rules, &e.Translations, &e.IsPublished, &override, &campaignTranslations); err != nil {
			return nil, nil, err
		}
		e.CatalogEntryID = e.ID
		e.Rules = mergeCampaignOverrides(e.Rules, override)
		e.Translations = mergeCampaignTranslations(e.Translations, campaignTranslations)
		entries = append(entries, e)
	}
	return sources, entries, sharedRows.Err()
}

func mergeCampaignTranslations(canonical, campaign json.RawMessage) json.RawMessage {
	translations := decodeTranslations(canonical)
	var scoped map[string]string
	if json.Unmarshal(campaign, &scoped) != nil {
		return canonical
	}
	for key, value := range scoped {
		if !strings.HasSuffix(key, ".source") && canonicalTranslationTakesPrecedence(translations, scoped, key) {
			continue
		}
		if strings.HasSuffix(key, ".source") {
			field := strings.TrimSuffix(key, ".source")
			if canonicalTranslationTakesPrecedence(translations, scoped, field) {
				continue
			}
		}
		translations[key] = value
	}
	encoded, err := json.Marshal(translations)
	if err != nil {
		return canonical
	}
	return encoded
}

func canonicalTranslationTakesPrecedence(canonical, campaign map[string]string, key string) bool {
	canonicalSource := strings.ToLower(strings.TrimSpace(canonical[key+".source"]))
	if canonicalSource != "reviewed" && !translationSourceIsProtected(canonical, key) && !strings.EqualFold(strings.TrimSpace(campaign[key+".source"]), "ai") {
		return false
	}
	return !translationSourceIsProtected(campaign, key)
}

type TranslationSyncReport struct {
	Updated    []string
	Unresolved []string
}

func (r *Repository) syncReviewedTranslations(ctx context.Context, sourceID string, entries []srdEntry) (TranslationSyncReport, error) {
	report := TranslationSyncReport{}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return report, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, entry := range entries {
		approved := decodeTranslations(entry.Translations)
		if !strings.EqualFold(strings.TrimSpace(approved["pt-BR.source"]), "reviewed") {
			continue
		}
		var raw json.RawMessage
		err = tx.QueryRow(ctx, `select translations from srd_catalog_entries where source_id=$1 and entry_type=$2 and name=$3 for update`, sourceID, entry.EntryType, entry.Name).Scan(&raw)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return report, err
		}
		current := decodeTranslations(raw)
		changed, updated, unresolved := applyReviewedTranslation(current, entry)
		report.Updated = append(report.Updated, updated...)
		report.Unresolved = append(report.Unresolved, unresolved...)
		if changed {
			encoded, marshalErr := json.Marshal(current)
			if marshalErr != nil {
				return report, marshalErr
			}
			if _, err = tx.Exec(ctx, `update srd_catalog_entries set translations=$1,updated_at=now() where source_id=$2 and entry_type=$3 and name=$4`, encoded, sourceID, entry.EntryType, entry.Name); err != nil {
				return report, err
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return report, err
	}
	return report, nil
}

func applyReviewedTranslation(current map[string]string, entry srdEntry) (bool, []string, []string) {
	approved := decodeTranslations(entry.Translations)
	if !strings.EqualFold(strings.TrimSpace(approved["pt-BR.source"]), "reviewed") {
		return false, nil, nil
	}
	changed := false
	var updated, unresolved []string
	for key, value := range approved {
		if (key != "pt-BR" && !strings.HasPrefix(key, "pt-BR.")) || strings.HasSuffix(key, ".source") {
			continue
		}
		field := entry.EntryType + ":" + entry.Name + " " + key
		provenance := strings.ToLower(strings.TrimSpace(current[key+".source"]))
		switch {
		case translationSourceIsProtected(current, key):
			// Explicit official or human-reviewed translations remain authoritative.
		case provenance == "ai" || provenance == "":
			current[key] = value
			current[key+".source"] = "reviewed"
			changed = true
			updated = append(updated, field)
		default:
			unresolved = append(unresolved, field)
		}
	}
	return changed, updated, unresolved
}

func packVersion() string { pack, _ := loadSRDPack(); return pack.Version }

func mergeCampaignOverrides(raw, override json.RawMessage) json.RawMessage {
	var rules map[string]any
	if json.Unmarshal(raw, &rules) != nil || rules == nil {
		rules = map[string]any{}
	}
	var scoped map[string]any
	if json.Unmarshal(override, &scoped) != nil || len(scoped) == 0 {
		return raw
	}
	current, _ := rules["campaignOverrides"].(map[string]any)
	if current == nil {
		current = map[string]any{}
	}
	for key, value := range scoped {
		current[key] = value
	}
	rules["campaignOverrides"] = current
	encoded, err := json.Marshal(rules)
	if err != nil {
		return raw
	}
	return encoded
}
func (r *Repository) CreateEntry(ctx context.Context, campaignID, userID string, item Entry) (Entry, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return Entry{}, err
	}
	// Players may publish only custom inventory items they created from the
	// character sheet. All other compendium mutations remain GM-only.
	if role != "gm" && !(item.EntryType == "item" && customItemRules(item.Rules)) {
		return Entry{}, ErrForbidden
	}
	var readOnly bool
	err = r.pool.QueryRow(ctx, `select is_read_only from compendium_sources where id=$1 and campaign_id=$2`, item.SourceID, campaignID).Scan(&readOnly)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	if err != nil {
		return Entry{}, err
	}
	if readOnly {
		return Entry{}, ErrForbidden
	}
	if len(item.Rules) == 0 {
		item.Rules = json.RawMessage(`{}`)
	}
	if len(item.Translations) == 0 {
		item.Translations = json.RawMessage(`{}`)
	}
	err = r.pool.QueryRow(ctx, `insert into compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, campaignID, item.SourceID, item.EntryType, item.Name, item.Summary, item.Rules, item.Translations, item.IsPublished, userID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if err != nil {
		return Entry{}, fmt.Errorf("create compendium entry: %w", err)
	}
	return item, nil
}

func customItemRules(raw json.RawMessage) bool {
	var rules map[string]any
	if len(raw) == 0 || json.Unmarshal(raw, &rules) != nil {
		return false
	}
	value, ok := rules["custom"].(bool)
	return ok && value
}

func (r *Repository) UpdateEntry(ctx context.Context, campaignID, userID string, item Entry) (Entry, error) {
	if _, err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Entry{}, err
	}
	var readOnly bool
	if err := r.pool.QueryRow(ctx, `select s.is_read_only from compendium_entries e join compendium_sources s on s.id=e.source_id where e.id=$1 and e.campaign_id=$2`, item.ID, campaignID).Scan(&readOnly); errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	} else if err != nil {
		return Entry{}, err
	}
	if readOnly {
		return Entry{}, ErrForbidden
	}
	if len(item.Rules) == 0 {
		item.Rules = json.RawMessage(`{}`)
	}
	if len(item.Translations) == 0 {
		item.Translations = json.RawMessage(`{}`)
	}
	err := r.pool.QueryRow(ctx, `update compendium_entries set entry_type=$1,name=$2,summary=$3,rules=$4,translations=$5,is_published=$6,updated_at=now() where id=$7 and campaign_id=$8 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, item.EntryType, item.Name, item.Summary, item.Rules, item.Translations, item.IsPublished, item.ID, campaignID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return item, err
}

// SetCampaignFeatSpellRule updates only the campaign override namespace on an
// existing feat. The SRD text, translations, visibility, and other campaign
// rules are retained verbatim.
func (r *Repository) SetCampaignFeatSpellRule(ctx context.Context, campaignID, userID, entryID string, rule CampaignFeatSpellRule) (Entry, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var role string
	if err = tx.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2 for share`, campaignID, userID).Scan(&role); errors.Is(err, pgx.ErrNoRows) || (err == nil && role != "gm") {
		return Entry{}, ErrForbidden
	} else if err != nil {
		return Entry{}, err
	}
	if sharedItem, shared, sharedErr := r.sharedEntry(ctx, tx, campaignID, entryID, true); sharedErr != nil {
		return Entry{}, sharedErr
	} else if shared {
		if sharedItem.EntryType != "feat" {
			return Entry{}, ErrNotFound
		}
		levels := make(map[string]int, len(rule.Spells))
		for _, spell := range rule.Spells {
			var raw []byte
			err = tx.QueryRow(ctx, `select rules from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1 where e.id::text=$2 and s.slug='dnd-srd' and s.version=$3 and e.entry_type='spell' and e.is_published
				union all select e.rules from compendium_entries e where e.campaign_id=$1 and e.id::text=$2 and e.entry_type='spell' and e.is_published
				union all select e.rules from srd_catalog_entry_aliases a join srd_catalog_entries e on e.id=a.catalog_entry_id where a.campaign_id=$1 and a.legacy_entry_id::text=$2 and e.entry_type='spell' and e.is_published limit 1`, campaignID, spell.SpellEntryID, packVersion()).Scan(&raw)
			if errors.Is(err, pgx.ErrNoRows) {
				return Entry{}, fmt.Errorf("%w: spell reference is not available in this campaign", ErrInvalidFeatSpellRule)
			}
			if err != nil {
				return Entry{}, err
			}
			var spellRules map[string]any
			if err = json.Unmarshal(raw, &spellRules); err != nil {
				return Entry{}, err
			}
			level, ok := spellRules["level"].(float64)
			if !ok || level < 0 || level > 9 || level != float64(int(level)) {
				return Entry{}, fmt.Errorf("%w: invalid compendium spell level", ErrInvalidFeatSpellRule)
			}
			levels[spell.SpellEntryID] = int(level)
		}
		if err = ValidateCampaignFeatSpellRule(rule, levels); err != nil {
			return Entry{}, err
		}
		encoded, marshalErr := json.Marshal(rule)
		if marshalErr != nil {
			return Entry{}, marshalErr
		}
		if _, err = tx.Exec(ctx, `insert into campaign_srd_entry_overrides(campaign_id,catalog_entry_id,rules,updated_by) values($1,$2,jsonb_build_object('featSpellGrant',$3::jsonb),$4) on conflict(campaign_id,catalog_entry_id) do update set rules=jsonb_set(campaign_srd_entry_overrides.rules,'{featSpellGrant}',$3::jsonb,true),updated_by=$4,updated_at=now()`, campaignID, sharedItem.ID, encoded, userID); err != nil {
			return Entry{}, err
		}
		var override json.RawMessage
		if err = tx.QueryRow(ctx, `select rules from campaign_srd_entry_overrides where campaign_id=$1 and catalog_entry_id=$2`, campaignID, sharedItem.ID).Scan(&override); err != nil {
			return Entry{}, err
		}
		sharedItem.Rules = mergeCampaignOverrides(sharedItem.Rules, override)
		if err = tx.Commit(ctx); err != nil {
			return Entry{}, err
		}
		return sharedItem, nil
	}
	var item Entry
	if err = tx.QueryRow(ctx, `select id::text,source_id::text,entry_type,name,summary,rules,translations,is_published from compendium_entries where campaign_id=$1 and id=$2 for update`, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished); errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	} else if err != nil {
		return Entry{}, err
	}
	if item.EntryType != "feat" {
		return Entry{}, ErrNotFound
	}
	levels := make(map[string]int, len(rule.Spells))
	for _, spell := range rule.Spells {
		var raw []byte
		if err = tx.QueryRow(ctx, `select rules from compendium_entries where campaign_id=$1 and id=$2 and entry_type='spell' and is_published=true`, campaignID, spell.SpellEntryID).Scan(&raw); errors.Is(err, pgx.ErrNoRows) {
			return Entry{}, fmt.Errorf("%w: spell reference is not available in this campaign", ErrInvalidFeatSpellRule)
		} else if err != nil {
			return Entry{}, err
		}
		var spellRules map[string]any
		if err = json.Unmarshal(raw, &spellRules); err != nil {
			return Entry{}, err
		}
		level, ok := spellRules["level"].(float64)
		if !ok || level < 0 || level > 9 || level != float64(int(level)) {
			return Entry{}, fmt.Errorf("%w: invalid compendium spell level", ErrInvalidFeatSpellRule)
		}
		levels[spell.SpellEntryID] = int(level)
	}
	if err = ValidateCampaignFeatSpellRule(rule, levels); err != nil {
		return Entry{}, err
	}
	var rules map[string]any
	if len(item.Rules) == 0 {
		rules = map[string]any{}
	} else if err = json.Unmarshal(item.Rules, &rules); err != nil {
		return Entry{}, err
	}
	overrides, _ := rules["campaignOverrides"].(map[string]any)
	if overrides == nil {
		overrides = map[string]any{}
	}
	overrides["featSpellGrant"] = rule
	rules["campaignOverrides"] = overrides
	encoded, err := json.Marshal(rules)
	if err != nil {
		return Entry{}, err
	}
	if err = tx.QueryRow(ctx, `update compendium_entries set rules=$1,updated_at=now() where campaign_id=$2 and id=$3 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, encoded, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished); err != nil {
		return Entry{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Entry{}, err
	}
	return item, nil
}

func (r *Repository) DeleteEntry(ctx context.Context, campaignID, userID, entryID string) error {
	if _, err := r.requireGM(ctx, campaignID, userID); err != nil {
		return err
	}
	var readOnly bool
	if err := r.pool.QueryRow(ctx, `select s.is_read_only from compendium_entries e join compendium_sources s on s.id=e.source_id where e.id=$1 and e.campaign_id=$2`, entryID, campaignID).Scan(&readOnly); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if readOnly {
		return ErrForbidden
	}
	result, err := r.pool.Exec(ctx, `delete from compendium_entries where id=$1 and campaign_id=$2`, entryID, campaignID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) Entry(ctx context.Context, campaignID, entryID, userID string) (Entry, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return Entry{}, err
	}
	if item, found, sharedErr := r.sharedEntry(ctx, r.pool, campaignID, entryID, false); found || sharedErr != nil {
		if sharedErr != nil {
			return Entry{}, sharedErr
		}
		return item, nil
	}
	var item Entry
	query := `select id::text,source_id::text,entry_type,name,summary,rules,translations,is_published from compendium_entries where campaign_id=$1 and id=$2`
	if role != "gm" {
		query += ` and is_published=true`
	}
	err = r.pool.QueryRow(ctx, query, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return item, err
}

func (r *Repository) TranslationFields(ctx context.Context, campaignID, entryID, userID string) (map[string]string, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return nil, err
	}
	if err = r.ensureDefaults(ctx, campaignID); err != nil {
		return nil, fmt.Errorf("ensure compendium before translation: %w", err)
	}
	item, shared, err := r.sharedEntry(ctx, r.pool, campaignID, entryID, false)
	if err != nil {
		return nil, err
	}
	if shared {
		if !r.CanTranslateSharedSRD(ctx, campaignID, userID) {
			return nil, ErrForbidden
		}
		if err = r.pool.QueryRow(ctx, `select rules,translations from srd_catalog_entries where id=$1`, item.ID).Scan(&item.Rules, &item.Translations); err != nil {
			return nil, err
		}
	} else {
		if role != "gm" {
			return nil, ErrForbidden
		}
		item, err = r.entryForGM(ctx, campaignID, entryID)
		if err != nil {
			return nil, err
		}
	}
	return missingTranslationFields(item), nil
}

// TranslateShared runs provider work while holding a row lock on the canonical
// entry. Concurrent campaigns therefore share one idempotent translation run.
func (r *Repository) TranslateShared(ctx context.Context, campaignID, entryID, userID string, translate func(context.Context, map[string]string) (map[string]string, error)) (Entry, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var role string
	if err = tx.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2 for share`, campaignID, userID).Scan(&role); err != nil {
		return Entry{}, ErrForbidden
	}
	item, shared, err := r.sharedEntry(ctx, tx, campaignID, entryID, true)
	if err != nil {
		return Entry{}, err
	}
	if !shared {
		return Entry{}, ErrNotSharedSRD
	}
	if !r.isPlatformOwner(userID) {
		return Entry{}, ErrForbidden
	}
	if err = tx.QueryRow(ctx, `select rules,translations from srd_catalog_entries where id=$1`, item.ID).Scan(&item.Rules, &item.Translations); err != nil {
		return Entry{}, err
	}
	fields := missingTranslationFields(item)
	if len(fields) == 0 {
		if err = tx.Commit(ctx); err != nil {
			return Entry{}, err
		}
		return item, nil
	}
	translated, err := translate(ctx, fields)
	if err != nil {
		return Entry{}, err
	}
	if mergeAITranslations(&item, fields, translated) {
		if err = tx.QueryRow(ctx, `update srd_catalog_entries set translations=$1,updated_at=now() where id=$2 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, item.Translations, item.ID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished); err != nil {
			return Entry{}, err
		}
		item.CatalogEntryID = item.ID
	}
	if err = tx.Commit(ctx); err != nil {
		return Entry{}, err
	}
	return r.Entry(ctx, campaignID, item.ID, userID)
}

var ErrNotSharedSRD = errors.New("not a shared SRD entry")

func missingTranslationFields(item Entry) map[string]string {
	translations := decodeTranslations(item.Translations)
	fields := map[string]string{}
	if isTranslationPending(item.Name, translations, "pt-BR") {
		fields["pt-BR"] = item.Name
	}
	if isTranslationPending(item.Summary, translations, "pt-BR.summary") {
		fields["pt-BR.summary"] = item.Summary
	}
	var ruleData any
	if json.Unmarshal(item.Rules, &ruleData) == nil {
		collectMissingTranslationFields(fields, translations, "pt-BR.rules", ruleData)
	}
	return fields
}

func mergeAITranslations(item *Entry, sourceFields, translated map[string]string) bool {
	translations := decodeTranslations(item.Translations)
	pending := missingTranslationFields(*item)
	changed := false
	for key, original := range sourceFields {
		current, ok := pending[key]
		value := strings.TrimSpace(translated[key])
		if !ok || current != original || value == "" {
			continue
		}
		translations[key] = value
		translations[key+".source"] = "ai"
		changed = true
	}
	if changed {
		encoded, err := json.Marshal(translations)
		if err == nil {
			item.Translations = encoded
		}
	}
	return changed
}

func (r *Repository) SaveAITranslations(ctx context.Context, campaignID, entryID, userID string, sourceFields, translated map[string]string) (Entry, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var role string
	err = tx.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2 for share`, campaignID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrForbidden
	}
	if err != nil {
		return Entry{}, err
	}

	item, shared, err := r.sharedEntry(ctx, tx, campaignID, entryID, true)
	if err != nil {
		return Entry{}, err
	}
	if shared && !r.isPlatformOwner(userID) {
		return Entry{}, ErrForbidden
	}
	if shared {
		if err = tx.QueryRow(ctx, `select rules,translations from srd_catalog_entries where id=$1`, item.ID).Scan(&item.Rules, &item.Translations); err != nil {
			return Entry{}, err
		}
	}
	if !shared {
		if role != "gm" {
			return Entry{}, ErrForbidden
		}
		err = tx.QueryRow(ctx, `select id::text,source_id::text,entry_type,name,summary,rules,translations,is_published from compendium_entries where campaign_id=$1 and id=$2 for update`, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
		if errors.Is(err, pgx.ErrNoRows) {
			return Entry{}, ErrNotFound
		}
		if err != nil {
			return Entry{}, err
		}
	}

	translations := decodeTranslations(item.Translations)
	currentSources := map[string]string{}
	if isTranslationPending(item.Name, translations, "pt-BR") {
		currentSources["pt-BR"] = item.Name
	}
	if isTranslationPending(item.Summary, translations, "pt-BR.summary") {
		currentSources["pt-BR.summary"] = item.Summary
	}
	var ruleData any
	if json.Unmarshal(item.Rules, &ruleData) == nil {
		collectMissingTranslationFields(currentSources, translations, "pt-BR.rules", ruleData)
	}
	changed := false
	for key, original := range sourceFields {
		current, stillPending := currentSources[key]
		value := strings.TrimSpace(translated[key])
		if !stillPending || current != original || value == "" {
			continue
		}
		translations[key] = value
		translations[key+".source"] = "ai"
		changed = true
	}
	if changed {
		encoded, marshalErr := json.Marshal(translations)
		if marshalErr != nil {
			return Entry{}, fmt.Errorf("encode translations: %w", marshalErr)
		}
		if shared {
			err = tx.QueryRow(ctx, `update srd_catalog_entries set translations=$1,updated_at=now() where id=$2 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, encoded, item.ID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
		} else {
			err = tx.QueryRow(ctx, `update compendium_entries set translations=$1,updated_at=now() where campaign_id=$2 and id=$3 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, encoded, campaignID, item.ID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
		}
		if err != nil {
			return Entry{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Entry{}, err
	}
	if shared {
		return r.Entry(ctx, campaignID, item.ID, userID)
	}
	return item, nil
}

func (r *Repository) sharedEntry(ctx context.Context, queryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, campaignID, entryID string, lock bool) (Entry, bool, error) {
	var item Entry
	query := `select e.id::text,e.source_id::text,e.entry_type,e.name,e.summary,e.rules,e.translations,e.is_published
		from srd_catalog_entries e join srd_catalog_sources s on s.id=e.source_id
		join campaign_srd_catalog_sources cs on cs.source_id=s.id and cs.campaign_id=$1
		where e.is_published and (e.id::text=$2
			or exists(select 1 from srd_catalog_entry_aliases a where a.campaign_id=$1 and a.legacy_entry_id::text=$2 and a.catalog_entry_id=e.id)
			or exists(select 1 from compendium_entries old join compendium_sources old_source on old_source.id=old.source_id where old.campaign_id=$1 and old.id::text=$2 and old.entry_type=e.entry_type and old.name=e.name and old_source.slug='dnd-srd-5-2-1'))`
	if lock {
		query += ` for update of e`
	}
	err := queryer.QueryRow(ctx, query, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, false, nil
	}
	if err != nil {
		return Entry{}, false, err
	}
	item.CatalogEntryID = item.ID
	var override, campaignTranslations json.RawMessage
	if err := queryer.QueryRow(ctx, `select rules,translations from campaign_srd_entry_overrides where campaign_id=$1 and catalog_entry_id=$2`, campaignID, item.ID).Scan(&override, &campaignTranslations); err == nil {
		item.Rules = mergeCampaignOverrides(item.Rules, override)
		item.Translations = mergeCampaignTranslations(item.Translations, campaignTranslations)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, false, err
	}
	return item, true, nil
}

func (r *Repository) requireGM(ctx context.Context, campaignID, userID string) (string, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return "", err
	}
	if role != "gm" {
		return "", ErrForbidden
	}
	return role, nil
}

func (r *Repository) entryForGM(ctx context.Context, campaignID, entryID string) (Entry, error) {
	var item Entry
	err := r.pool.QueryRow(ctx, `select id::text,source_id::text,entry_type,name,summary,rules,translations,is_published from compendium_entries where campaign_id=$1 and id=$2`, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return item, err
}

var translatableRuleFields = map[string]struct{}{
	"name": {}, "description": {}, "summary": {}, "text": {}, "benefit": {}, "benefits": {}, "notes": {},
}

var nonTranslatableRulePaths = map[string]struct{}{
	"catalog": {}, "source": {}, "id": {}, "abilityScoreIncreases": {}, "armorProficiencies": {},
	"startingEquipment": {}, "skillProficiencies": {}, "toolProficiency": {}, "toolProficiencies": {},
	"weaponProficiencies": {}, "savingThrows": {}, "classes": {}, "spellIds": {}, "languages": {},
	"abilities": {}, "speed": {}, "hpMax": {}, "armorClass": {}, "initiative": {}, "challenge": {},
	"size": {}, "damage": {}, "damageType": {}, "toHit": {}, "range": {}, "cost": {}, "weight": {},
	"level": {}, "hitDie": {}, "spellSlotProgression": {}, "preparedFormula": {}, "dice": {},
	"ability": {}, "abilityBonuses": {}, "primaryAbility": {}, "components": {}, "duration": {},
	"castingTime": {}, "concentration": {}, "ritual": {}, "ritualCasting": {}, "material": {},
	"verbal": {}, "somatic": {}, "strength": {}, "dexterity": {}, "constitution": {}, "intelligence": {},
	"wisdom": {}, "charisma": {}, "immunities": {}, "resistances": {}, "senses": {},
}

func collectMissingTranslationFields(result, translations map[string]string, key string, value any) {
	switch current := value.(type) {
	case string:
		leaf := key
		if dot := strings.LastIndexByte(key, '.'); dot >= 0 {
			leaf = key[dot+1:]
		}
		if _, prose := translatableRuleFields[leaf]; prose && isTranslationPending(current, translations, key) {
			result[key] = current
		}
	case map[string]any:
		for childKey, child := range current {
			if _, blocked := nonTranslatableRulePaths[childKey]; blocked {
				continue
			}
			collectMissingTranslationFields(result, translations, key+"."+childKey, child)
		}
	case []any:
		for index, child := range current {
			collectMissingTranslationFields(result, translations, fmt.Sprintf("%s.%d", key, index), child)
		}
	}
}

func decodeTranslations(raw json.RawMessage) map[string]string {
	translations := map[string]string{}
	_ = json.Unmarshal(raw, &translations)
	return translations
}

func translationSourceIsProtected(translations map[string]string, key string) bool {
	source := strings.ToLower(strings.TrimSpace(translations[key+".source"]))
	switch source {
	case "official", "manual", "reviewed", "human", "user":
		return true
	default:
		return false
	}
}

func isTranslationPending(source string, translations map[string]string, key string) bool {
	if translationSourceIsProtected(translations, key) || strings.EqualFold(strings.TrimSpace(translations[key+".source"]), "ai") {
		return false
	}
	return isUntranslated(source, translations[key])
}

func isUntranslated(source, translated string) bool {
	source = strings.Join(strings.Fields(strings.TrimSpace(source)), " ")
	translated = strings.Join(strings.Fields(strings.TrimSpace(translated)), " ")
	return source != "" && (translated == "" || strings.EqualFold(source, translated))
}

// UpsertEntries is an idempotent importer for a single entry type. Re-importing a
// corrected file updates its private entries instead of creating duplicates.
func (r *Repository) UpsertEntries(ctx context.Context, campaignID, userID string, items []Entry) (int, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return 0, err
	}
	if role != "gm" {
		return 0, ErrForbidden
	}
	if len(items) == 0 {
		return 0, nil
	}
	var readOnly bool
	err = r.pool.QueryRow(ctx, `select is_read_only from compendium_sources where id=$1 and campaign_id=$2`, items[0].SourceID, campaignID).Scan(&readOnly)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	if readOnly {
		return 0, ErrForbidden
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, item := range items {
		if len(item.Rules) == 0 {
			item.Rules = json.RawMessage(`{}`)
		}
		if len(item.Translations) == 0 {
			item.Translations = json.RawMessage(`{}`)
		}
		_, err = tx.Exec(ctx, `insert into compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (source_id,entry_type,name) do update set summary=excluded.summary,rules=excluded.rules,translations=excluded.translations,is_published=excluded.is_published,updated_at=now()`, campaignID, item.SourceID, item.EntryType, item.Name, item.Summary, item.Rules, item.Translations, item.IsPublished, userID)
		if err != nil {
			return 0, fmt.Errorf("upsert compendium entry: %w", err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(items), nil
}
