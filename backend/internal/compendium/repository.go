package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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
	ID          string          `json:"id"`
	SourceID    string          `json:"sourceId"`
	EntryType   string          `json:"entryType"`
	Name        string          `json:"name"`
	Summary     string          `json:"summary"`
	Rules       json.RawMessage `json:"rules"`
	IsPublished bool            `json:"isPublished"`
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
	_, err := r.pool.Exec(ctx, `insert into compendium_sources(campaign_id,slug,title,kind,version,attribution,license_url,is_read_only) values ($1,'campaign-private','Compêndio privado da campanha','private','','Conteúdo cadastrado privadamente pelo narrador.','',false),($1,'dnd-srd-5-2-1','D&D System Reference Document','srd','5.2.1','Dungeons & Dragons SRD 5.2.1, disponível sob CC-BY-4.0.','https://www.dndbeyond.com/srd',true) on conflict (campaign_id,slug) do nothing`, campaignID)
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
	q := `select id::text,source_id::text,entry_type,name,summary,rules,is_published from compendium_entries where campaign_id=$1`
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
		if err := rows.Scan(&e.ID, &e.SourceID, &e.EntryType, &e.Name, &e.Summary, &e.Rules, &e.IsPublished); err != nil {
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
	err = r.pool.QueryRow(ctx, `insert into compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,is_published,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id::text,source_id::text,entry_type,name,summary,rules,is_published`, campaignID, item.SourceID, item.EntryType, item.Name, item.Summary, item.Rules, item.IsPublished, userID).Scan(&item.ID, &item.SourceID, &item.EntryType, &item.Name, &item.Summary, &item.Rules, &item.IsPublished)
	if err != nil {
		return Entry{}, fmt.Errorf("create compendium entry: %w", err)
	}
	return item, nil
}
