package characters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

type characterFeatureEntry struct {
	ID           string
	EntryType    string
	Name         string
	Translations map[string]string
	Rules        map[string]any
}

func loadCharacterFeatureEntry(ctx context.Context, tx pgx.Tx, campaignID, entryID string) (characterFeatureEntry, error) {
	var entry characterFeatureEntry
	var translationsRaw, rulesRaw []byte
	err := tx.QueryRow(ctx, `
		select e.id::text,e.entry_type,e.name,e.translations,e.rules
		from srd_catalog_entries e
		join srd_catalog_sources s on s.id=e.source_id
		join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$2
		where e.id::text=$1 and e.entry_type in ('class','subclass') and e.is_published
		union all
		select e.id::text,e.entry_type,e.name,e.translations,e.rules
		from compendium_entries e
		where e.id::text=$1 and e.campaign_id=$2 and e.entry_type in ('class','subclass') and e.is_published
		limit 1`, entryID, campaignID).Scan(&entry.ID, &entry.EntryType, &entry.Name, &translationsRaw, &rulesRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return characterFeatureEntry{}, fmt.Errorf("class feature is not available in this campaign")
	}
	if err != nil {
		return characterFeatureEntry{}, err
	}
	if len(translationsRaw) > 0 {
		if err := json.Unmarshal(translationsRaw, &entry.Translations); err != nil {
			return characterFeatureEntry{}, fmt.Errorf("decode class feature translations: %w", err)
		}
	}
	if len(rulesRaw) > 0 {
		if err := json.Unmarshal(rulesRaw, &entry.Rules); err != nil {
			return characterFeatureEntry{}, fmt.Errorf("decode class feature rules: %w", err)
		}
	}
	return entry, nil
}

func loadEnabledCharacterClassEntries(ctx context.Context, tx pgx.Tx, campaignID string) ([]characterFeatureEntry, error) {
	rows, err := tx.Query(ctx, `
		select e.id::text,e.name,e.translations,e.rules
		from srd_catalog_entries e
		join srd_catalog_sources s on s.id=e.source_id
		join campaign_srd_catalog_sources cs on cs.source_id=e.source_id and cs.campaign_id=$1
		where e.entry_type='class' and e.is_published
		union all
		select e.id::text,e.name,e.translations,e.rules
		from compendium_entries e
		where e.campaign_id=$1 and e.entry_type='class' and e.is_published`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]characterFeatureEntry, 0)
	for rows.Next() {
		var entry characterFeatureEntry
		var translationsRaw, rulesRaw []byte
		if err := rows.Scan(&entry.ID, &entry.Name, &translationsRaw, &rulesRaw); err != nil {
			return nil, err
		}
		if len(translationsRaw) > 0 {
			if err := json.Unmarshal(translationsRaw, &entry.Translations); err != nil {
				return nil, fmt.Errorf("decode class translations: %w", err)
			}
		}
		if len(rulesRaw) > 0 {
			if err := json.Unmarshal(rulesRaw, &entry.Rules); err != nil {
				return nil, fmt.Errorf("decode class rules: %w", err)
			}
		}
		entry.EntryType = "class"
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func authorizedFeatureSpellLevel(sheet Sheet, featureEntry characterFeatureEntry, classEntries []characterFeatureEntry, featureID, spellEntryID string) (int, bool) {
	if sheet.Level < 1 || strings.TrimSpace(sheet.Class) == "" || featureID == "" || spellEntryID == "" {
		return 0, false
	}
	currentClassFound := false
	for _, classEntry := range classEntries {
		if !compendiumEntryMatchesClass(classEntry, sheet.Class) {
			continue
		}
		currentClassFound = true
	}
	if !currentClassFound {
		return 0, false
	}

	switch featureEntry.EntryType {
	case "class":
		if !compendiumEntryMatchesClass(featureEntry, sheet.Class) {
			return 0, false
		}
	case "subclass":
		if strings.TrimSpace(sheet.Subclass) == "" || !compendiumEntryMatchesLabel(featureEntry, sheet.Subclass) ||
			!subclassEntryMatchesClass(featureEntry, sheet.Class, classEntries) {
			return 0, false
		}
	default:
		return 0, false
	}

	features, ok := featureEntry.Rules["features"].([]any)
	if !ok {
		return 0, false
	}
	for index, raw := range features {
		feature, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := strings.TrimSpace(stringValue(feature["id"]))
		if id == "" {
			id = fmt.Sprintf("%s:feature:%d", featureEntry.ID, index)
		}
		if id != featureID {
			continue
		}
		level, ok := integerJSONValue(feature["level"])
		if !ok || level < 1 || level > sheet.Level {
			return 0, false
		}
		grants, ok := feature["grants"].([]any)
		if !ok {
			return 0, false
		}
		for _, rawGrant := range grants {
			grant, ok := rawGrant.(map[string]any)
			if ok && grant["type"] == "spell" && strings.TrimSpace(stringValue(grant["spellEntryId"])) == spellEntryID {
				return level, true
			}
		}
		return 0, false
	}
	return 0, false
}

func compendiumEntryMatchesClass(entry characterFeatureEntry, className string) bool {
	if strings.TrimSpace(className) == "" {
		return false
	}
	if canonicalClass(stringValue(entry.Rules["id"])) == canonicalClass(className) {
		return true
	}
	return compendiumEntryMatchesLabel(entry, className)
}

func compendiumEntryMatchesLabel(entry characterFeatureEntry, label string) bool {
	want := normalizeClassReference(label)
	if want == "" {
		return false
	}
	for _, candidate := range append([]string{entry.Name}, translationValues(entry.Translations)...) {
		if normalizeClassReference(candidate) == want || canonicalClass(candidate) == canonicalClass(label) {
			return true
		}
	}
	return false
}

func compendiumEntryClassAliases(entry characterFeatureEntry) []string {
	aliases := []string{entry.ID, entry.Name, stringValue(entry.Rules["id"])}
	return append(aliases, translationValues(entry.Translations)...)
}

func subclassEntryMatchesClass(entry characterFeatureEntry, currentClass string, classEntries []characterFeatureEntry) bool {
	classID := strings.TrimSpace(stringValue(entry.Rules["classId"]))
	if classID != "" {
		if known, matches := characterClassReferenceMatchesCurrent(classID, currentClass, classEntries); known {
			return matches
		}
	}
	className := strings.TrimSpace(stringValue(entry.Rules["className"]))
	if className == "" {
		className = strings.TrimSpace(stringValue(entry.Rules["parentClass"]))
	}
	known, matches := characterClassReferenceMatchesCurrent(className, currentClass, classEntries)
	return known && matches
}

func characterClassReferenceMatchesCurrent(reference, currentClass string, classEntries []characterFeatureEntry) (known, matches bool) {
	reference = normalizeClassReference(reference)
	if reference == "" {
		return false, false
	}
	for _, entry := range classEntries {
		for _, alias := range compendiumEntryClassAliases(entry) {
			normalizedAlias := normalizeClassReference(alias)
			if normalizedAlias == reference || canonicalClass(alias) == canonicalClass(reference) {
				return true, compendiumEntryMatchesClass(entry, currentClass)
			}
		}
	}
	canonical := canonicalClass(reference)
	if !isDNDClassKey(canonical) {
		return false, false
	}
	return true, canonical == canonicalClass(currentClass)
}

func isDNDClassKey(value string) bool {
	switch value {
	case "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard":
		return true
	default:
		return false
	}
}

func translationValues(values map[string]string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, value)
	}
	return result
}

func normalizeClassReference(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func integerJSONValue(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || number < 1 || number > 20 || number != float64(int(number)) {
		return 0, false
	}
	return int(number), true
}
