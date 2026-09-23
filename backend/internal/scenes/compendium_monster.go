package scenes

import (
	"bytes"
	"encoding/json"
	"strings"

	"vtt-backend/internal/npcs"
)

// SRD packs historically use hpMax and sometimes encode resistances as text,
// while the campaign NPC model uses hitPointsMax and string slices.
func decodeCompendiumMonsterSheet(raw []byte) (npcs.Sheet, error) {
	var entry struct {
		HitPointsCurrent int             `json:"hitPointsCurrent"`
		HitPointsMax     int             `json:"hitPointsMax"`
		HPMax            int             `json:"hpMax"`
		ArmorClass       int             `json:"armorClass"`
		Initiative       int             `json:"initiative"`
		Size             int             `json:"size"`
		Color            int             `json:"color"`
		ImageURL         string          `json:"imageUrl"`
		CreatureType     string          `json:"creatureType"`
		Challenge        string          `json:"challenge"`
		Speed            string          `json:"speed"`
		Abilities        npcs.Abilities  `json:"abilities"`
		Traits           []npcs.Trait    `json:"traits"`
		Actions          []npcs.Action   `json:"actions"`
		Resistances      json.RawMessage `json:"resistances"`
		Immunities       json.RawMessage `json:"immunities"`
		Senses           string          `json:"senses"`
		Languages        string          `json:"languages"`
	}
	if err := json.Unmarshal(raw, &entry); err != nil {
		return npcs.Sheet{}, err
	}
	if entry.HitPointsMax == 0 {
		entry.HitPointsMax = entry.HPMax
	}
	if entry.HitPointsCurrent == 0 {
		entry.HitPointsCurrent = entry.HitPointsMax
	}
	resistances, err := decodeTextList(entry.Resistances)
	if err != nil {
		return npcs.Sheet{}, err
	}
	immunities, err := decodeTextList(entry.Immunities)
	if err != nil {
		return npcs.Sheet{}, err
	}
	return npcs.Sheet{
		HitPointsCurrent: entry.HitPointsCurrent,
		HitPointsMax:     entry.HitPointsMax,
		ArmorClass:       entry.ArmorClass,
		Initiative:       entry.Initiative,
		Size:             entry.Size,
		Color:            entry.Color,
		ImageURL:         entry.ImageURL,
		CreatureType:     entry.CreatureType,
		Challenge:        entry.Challenge,
		Speed:            entry.Speed,
		Abilities:        entry.Abilities,
		Traits:           entry.Traits,
		Actions:          entry.Actions,
		Resistances:      resistances,
		Immunities:       immunities,
		Senses:           entry.Senses,
		Languages:        entry.Languages,
	}, nil
}

func decodeTextList(raw json.RawMessage) ([]string, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var list []string
	if err := json.Unmarshal(raw, &list); err == nil {
		return list, nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return nil, err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}
	return []string{text}, nil
}
