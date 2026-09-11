package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
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
	ID           string          `json:"id"`
	SourceID     string          `json:"sourceId"`
	EntryType    string          `json:"entryType"`
	Name         string          `json:"name"`
	Summary      string          `json:"summary"`
	Rules        json.RawMessage `json:"rules"`
	Translations json.RawMessage `json:"translations"`
	IsPublished  bool            `json:"isPublished"`
}
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool} }
func (r *Repository) role(ctx context.Context, campaignID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx, `select role::text from campaign_members where campaign_id=$1 and user_id=$2`, campaignID, userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrForbidden
	}
	return role, err
}

// This creates a private source and a read-only SRD attribution marker. It never
// claims that paid-book content is shipped with the VTT.
func (r *Repository) ensureDefaults(ctx context.Context, campaignID string) error {
	pack, err := loadSRDPack()
	if err != nil {
		return fmt.Errorf("load SRD pack: %w", err)
	}
	sourceVersion := pack.Version
	if pack.Revision != "" {
		sourceVersion += " · " + pack.Revision
	}
	_, err = r.pool.Exec(ctx, `insert into compendium_sources(campaign_id,slug,title,kind,version,attribution,license_url,is_read_only) values ($1,'campaign-private','Compêndio privado da campanha','private','','Conteúdo cadastrado privadamente pelo narrador.','',false),($1,'dnd-srd-5-2-1','D&D System Reference Document','srd',$2,$3,'https://www.dndbeyond.com/srd',true) on conflict (campaign_id,slug) do nothing`, campaignID, sourceVersion, pack.Attribution)
	if err != nil {
		return err
	}
	var sourceID, ownerID, storedVersion string
	if err = r.pool.QueryRow(ctx, `select s.id::text,c.owner_id::text,s.version from compendium_sources s join campaigns c on c.id=s.campaign_id where s.campaign_id=$1 and s.slug='dnd-srd-5-2-1'`, campaignID).Scan(&sourceID, &ownerID, &storedVersion); err != nil {
		return err
	}
	entries := uniqueEntries(pack.Entries)
	// Importing the pack is a one-time operation for a given data revision. A
	// changed revision deliberately replays the idempotent upsert once, allowing
	// existing campaigns to replace index-only SRD cards with usable stat blocks.
	var importedCount int
	if err = r.pool.QueryRow(ctx, `select count(*) from compendium_entries where source_id=$1`, sourceID).Scan(&importedCount); err != nil {
		return err
	}
	if storedVersion == sourceVersion && importedCount >= len(entries) {
		return nil
	}
	batch := &pgx.Batch{}
	for _, entry := range entries {
		if len(entry.Rules) == 0 {
			entry.Rules = json.RawMessage(`{}`)
		}
		if len(entry.Translations) == 0 {
			entry.Translations = json.RawMessage(`{}`)
		}
		batch.Queue(`insert into compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by) values($1,$2,$3,$4,$5,$6,$7,true,$8) on conflict (source_id,entry_type,name) do update set summary=excluded.summary,translations=excluded.translations,rules=case when compendium_entries.rules='{}'::jsonb or (excluded.rules->>'catalog'='monster' and not (compendium_entries.rules ? 'hpMax')) then excluded.rules else compendium_entries.rules end,updated_at=now()`, campaignID, sourceID, entry.EntryType, entry.Name, entry.Summary, entry.Rules, entry.Translations, ownerID)
	}
	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()
	for range entries {
		if _, err = br.Exec(); err != nil {
			return fmt.Errorf("import SRD: %w", err)
		}
	}
	_, err = r.pool.Exec(ctx, `update compendium_sources set version=$1,attribution=$2,license_url='https://www.dndbeyond.com/srd' where id=$3`, sourceVersion, pack.Attribution, sourceID)
	return err
}
func (r *Repository) List(ctx context.Context, campaignID, userID string) ([]Source, []Entry, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return nil, nil, err
	}
	if err = r.ensureDefaults(ctx, campaignID); err != nil {
		return nil, nil, fmt.Errorf("ensure compendium: %w", err)
	}
	srcRows, err := r.pool.Query(ctx, `select id::text,slug,title,kind,version,attribution,license_url,is_read_only from compendium_sources where campaign_id=$1 order by is_read_only,title`, campaignID)
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
	q := `select id::text,source_id::text,entry_type,name,summary,rules,translations,is_published from compendium_entries where campaign_id=$1`
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
	return sources, entries, rows.Err()
}
func (r *Repository) CreateEntry(ctx context.Context, campaignID, userID string, item Entry) (Entry, error) {
	role, err := r.role(ctx, campaignID, userID)
	if err != nil {
		return Entry{}, err
	}
	if role != "gm" {
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
	if _, err := r.requireGM(ctx, campaignID, userID); err != nil {
		return nil, err
	}
	item, err := r.entryForGM(ctx, campaignID, entryID)
	if err != nil {
		return nil, err
	}
	translations := map[string]string{}
	_ = json.Unmarshal(item.Translations, &translations)
	fields := map[string]string{}
	if strings.TrimSpace(translations["pt-BR"]) == "" {
		fields["pt-BR"] = item.Name
	}
	if strings.TrimSpace(item.Summary) != "" && strings.TrimSpace(translations["pt-BR.summary"]) == "" {
		fields["pt-BR.summary"] = item.Summary
	}
	var ruleData any
	if json.Unmarshal(item.Rules, &ruleData) == nil {
		collectMissingTranslationFields(fields, translations, "pt-BR.rules", ruleData)
	}
	return fields, nil
}

func (r *Repository) SaveAITranslations(ctx context.Context, campaignID, entryID, userID string, translated map[string]string) (Entry, error) {
	if _, err := r.requireGM(ctx, campaignID, userID); err != nil {
		return Entry{}, err
	}
	item, err := r.entryForGM(ctx, campaignID, entryID)
	if err != nil {
		return Entry{}, err
	}
	translations := map[string]string{}
	_ = json.Unmarshal(item.Translations, &translations)
	allowed, err := r.TranslationFields(ctx, campaignID, entryID, userID)
	if err != nil {
		return Entry{}, err
	}
	for key := range allowed {
		if value := strings.TrimSpace(translated[key]); value != "" {
			translations[key] = value
			if key == "pt-BR" {
				translations["pt-BR.source"] = "ai"
			} else {
				translations[key+".source"] = "ai"
			}
		}
	}
	encoded, err := json.Marshal(translations)
	if err != nil {
		return Entry{}, fmt.Errorf("encode translations: %w", err)
	}
	err = r.pool.QueryRow(ctx, `update compendium_entries set translations=$1,updated_at=now() where campaign_id=$2 and id=$3 returning id::text,source_id::text,entry_type,name,summary,rules,translations,is_published`, encoded, campaignID, entryID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.Translations, &item.IsPublished)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, ErrNotFound
	}
	return item, err
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

func collectMissingTranslationFields(result, translations map[string]string, key string, value any) {
	switch current := value.(type) {
	case string:
		if strings.TrimSpace(current) != "" && strings.TrimSpace(translations[key]) == "" {
			result[key] = current
		}
	case map[string]any:
		for childKey, child := range current {
			collectMissingTranslationFields(result, translations, key+"."+childKey, child)
		}
	case []any:
		for index, child := range current {
			collectMissingTranslationFields(result, translations, fmt.Sprintf("%s.%d", key, index), child)
		}
	}
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
