package compendium

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSubclassClassAssociationsMigrationIntegration(t *testing.T) {
	databaseURL := os.Getenv("REALTIME_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("REALTIME_TEST_DATABASE_URL is not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	const sourceSlug = "dnd-srd"
	const sourceVersion = "5.2.1"
	const otherVersion = "5.2.2"
	seedSource := func(version string) string {
		t.Helper()
		_, err := tx.Exec(ctx, `
			insert into public.srd_catalog_sources (slug, version, revision, title)
			values ($1, $2, 'migration-test', 'Subclass migration test')
			on conflict (slug, version) do nothing
		`, sourceSlug, version)
		if err != nil {
			t.Fatal(err)
		}
		var sourceID string
		if err := tx.QueryRow(ctx, `select id::text from public.srd_catalog_sources where slug=$1 and version=$2`, sourceSlug, version).Scan(&sourceID); err != nil {
			t.Fatal(err)
		}
		return sourceID
	}

	sourceID := seedSource(sourceVersion)
	otherSourceID := seedSource(otherVersion)

	type expectedSubclass struct {
		classID   string
		className string
	}
	expected := map[string]expectedSubclass{
		"Draconic Sorcery":         {classID: "sorcerer", className: "Sorcerer"},
		"Evoker":                   {classID: "wizard", className: "Wizard"},
		"Fiend Patron":             {classID: "warlock", className: "Warlock"},
		"Hunter":                   {classID: "ranger", className: "Ranger"},
		"Oath of Devotion":         {classID: "paladin", className: "Paladin"},
		"Thief":                    {classID: "rogue", className: "Rogue"},
		"Warrior of the Open Hand": {classID: "monk", className: "Monk"},
	}
	const sentinelTimeText = "2001-01-01T00:00:00Z"
	sentinelTime, err := time.Parse(time.RFC3339, sentinelTimeText)
	if err != nil {
		t.Fatal(err)
	}
	seedEntry := func(entrySourceID, entryType, name string, rules map[string]any) {
		t.Helper()
		rulesJSON, err := json.Marshal(rules)
		if err != nil {
			t.Fatal(err)
		}
		_, err = tx.Exec(ctx, `
			insert into public.srd_catalog_entries
				(source_id, entry_type, name, summary, rules, updated_at)
			values ($1, $2, $3, 'Synthetic migration fixture', $4::jsonb, $5)
			on conflict (source_id, entry_type, name) do update
			set rules=excluded.rules, updated_at=excluded.updated_at
		`, entrySourceID, entryType, name, string(rulesJSON), sentinelTime)
		if err != nil {
			t.Fatalf("seed %s (%s): %v", name, entryType, err)
		}
	}

	for name := range expected {
		rules := map[string]any{"fixtureMarker": "preserve-" + name}
		if name == "Evoker" {
			// A class-name-only association is already meaningful and must not be
			// rewritten to classId by the migration.
			rules["className"] = "Wizard"
			rules["parentClass"] = "Wizard"
		}
		if name == "Thief" {
			// An existing classId must also be left untouched.
			rules["classId"] = "rogue"
		}
		seedEntry(sourceID, "subclass", name, rules)
	}
	seedEntry(sourceID, "subclass", "Synthetic Unlisted Subclass", map[string]any{"fixtureMarker": "unlisted"})
	seedEntry(sourceID, "feat", "Oath of Devotion", map[string]any{"fixtureMarker": "wrong-type"})
	seedEntry(otherSourceID, "subclass", "Draconic Sorcery", map[string]any{"fixtureMarker": "wrong-version"})

	migrationSQL, err := readSubclassAssociationMigration()
	if err != nil {
		t.Fatal(err)
	}

	runMigration := func() int64 {
		t.Helper()
		commandTag, err := tx.Exec(ctx, string(migrationSQL))
		if err != nil {
			t.Fatalf("execute subclass association migration: %v", err)
		}
		return commandTag.RowsAffected()
	}
	if got := runMigration(); got != int64(len(expected)-2) {
		t.Fatalf("first migration updated %d rows, want %d (five blank associations; Evoker and Thief already have links)", got, len(expected)-2)
	}

	readRules := func(entrySourceID, entryType, name string) (map[string]any, time.Time) {
		t.Helper()
		var raw []byte
		var updatedAt time.Time
		if err := tx.QueryRow(ctx, `
			select rules, updated_at from public.srd_catalog_entries
			where source_id=$1 and entry_type=$2 and name=$3
		`, entrySourceID, entryType, name).Scan(&raw, &updatedAt); err != nil {
			t.Fatalf("read %s (%s): %v", name, entryType, err)
		}
		var rules map[string]any
		if err := json.Unmarshal(raw, &rules); err != nil {
			t.Fatalf("decode %s rules: %v", name, err)
		}
		return rules, updatedAt
	}

	for name, want := range expected {
		rules, updatedAt := readRules(sourceID, "subclass", name)
		if name == "Evoker" {
			if rules["classId"] != nil || rules["className"] != want.className || rules["parentClass"] != want.className {
				t.Errorf("prefilled %s association changed: %#v", name, rules)
			}
		} else if rules["classId"] != want.classID {
			t.Errorf("%s classId = %#v, want %q", name, rules["classId"], want.classID)
		}
		if (name == "Evoker" || name == "Thief") && !updatedAt.Equal(sentinelTime) {
			t.Errorf("migration changed updated_at for prefilled %s association: %s", name, updatedAt)
		}
		if rules["fixtureMarker"] != "preserve-"+name {
			t.Errorf("%s existing rules were not preserved: %#v", name, rules)
		}
		associatedClass := rules["classId"]
		if associatedClass == nil {
			associatedClass = rules["className"]
		}
		if associatedClass == nil || (associatedClass != want.classID && associatedClass != want.className) {
			t.Errorf("%s has no association to expected class %q: %#v", name, want.className, rules)
		}
	}

	for _, decoy := range []struct {
		sourceID, entryType, name, marker string
	}{
		{sourceID, "subclass", "Synthetic Unlisted Subclass", "unlisted"},
		{sourceID, "feat", "Oath of Devotion", "wrong-type"},
		{otherSourceID, "subclass", "Draconic Sorcery", "wrong-version"},
	} {
		rules, updatedAt := readRules(decoy.sourceID, decoy.entryType, decoy.name)
		if len(rules) != 1 || rules["fixtureMarker"] != decoy.marker || !updatedAt.Equal(sentinelTime) {
			t.Errorf("migration changed out-of-scope %s (%s): rules=%#v updated_at=%s", decoy.name, decoy.entryType, rules, updatedAt.Format(time.RFC3339))
		}
	}

	// Force a visible timestamp marker so the second application proves it does
	// not touch already-associated rows, independent of PostgreSQL transaction time.
	secondRunTime := sentinelTime.Add(time.Hour)
	if _, err := tx.Exec(ctx, `update public.srd_catalog_entries set updated_at=$1 where source_id=$2 and entry_type='subclass' and name = any($3)`, secondRunTime, sourceID, expectedNames(expected)); err != nil {
		t.Fatal(err)
	}
	if got := runMigration(); got != 0 {
		t.Fatalf("second migration updated %d rows, want 0", got)
	}
	for name := range expected {
		_, updatedAt := readRules(sourceID, "subclass", name)
		if !updatedAt.Equal(secondRunTime) {
			t.Errorf("second migration changed updated_at for %s: got %s, want %s", name, updatedAt, secondRunTime)
		}
	}
}

func expectedNames[T any](values map[string]T) []string {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	return names
}

func readSubclassAssociationMigration() ([]byte, error) {
	dir, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	for {
		path := filepath.Join(dir, "supabase", "migrations", "20261107125223_link_srd_2024_subclasses_to_classes.sql")
		if migration, err := os.ReadFile(path); err == nil {
			return migration, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return nil, errors.New("could not find subclass association migration from package working directory")
}
