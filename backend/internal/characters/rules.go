package characters

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"

	"vtt-backend/internal/systems"
)

var (
	leadingArmorClass = regexp.MustCompile(`^(\d+(?:\.\d+)?)`)
	dexterityCap      = regexp.MustCompile(`max\s*(?:dex(?:terity)?\s*)?(\d+)`)
	firstSignedNumber = regexp.MustCompile(`[+-]?\d+(?:\.\d+)?`)
)

// normalizeDerivedFields keeps the server authoritative for values derived
// from the character's level, abilities, and equipped inventory. The browser
// may show a local preview while editing, but values sent by clients are not
// trusted when the sheet is persisted or used for a roll.
func normalizeDerivedFields(sheet Sheet) Sheet {
	sheet.ProficiencyBonus = proficiencyBonus(sheet.Level)
	sheet.ArmorClass = calculateArmorClass(sheet)
	sheet.PassivePerception = passivePerception(sheet)
	return sheet
}

func proficiencyBonus(level int) int {
	return systems.DefaultCharacterRules().ProficiencyBonus(level)
}

func passivePerception(sheet Sheet) int {
	bonus := abilityModifier(sheet.AbilityScores.Wisdom)
	if containsNormalized(sheet.SkillProficiencies, "percepcao") {
		bonus += proficiencyBonus(sheet.Level)
	}
	if containsNormalized(sheet.SkillExpertise, "percepcao") {
		bonus += proficiencyBonus(sheet.Level)
	}
	return 10 + bonus
}

func calculateArmorClass(sheet Sheet) int {
	dexterity := abilityModifier(sheet.AbilityScores.Dexterity)
	equipped := make([]inventoryRules, 0, len(sheet.Inventory))
	for _, item := range sheet.Inventory {
		if !item.Equipped {
			continue
		}
		rules := decodeInventoryRules(item.Rules)
		equipped = append(equipped, inventoryRules{
			name: normalizeRuleText(item.Name), category: normalizeRuleText(rules.Category),
			expression: strings.TrimSpace(rules.AC), rules: rules,
		})
	}

	var armor *inventoryRules
	for index := range equipped {
		item := &equipped[index]
		category := canonicalArmorCategory(item.category)
		isArmor := category == "light" || category == "medium" || category == "heavy" ||
			(category == "armor" && item.expression != "" && !strings.Contains(item.name, "shield") && !strings.Contains(item.name, "escudo"))
		if !isArmor {
			continue
		}
		if armor == nil || armorBase(item.expression, item.rules.ArmorClassBonus) > armorBase(armor.expression, armor.rules.ArmorClassBonus) {
			armor = item
		}
	}

	total := float64(10 + dexterity)
	if armor != nil {
		category := canonicalArmorCategory(armor.category)
		base := armorBase(armor.expression, armor.rules.ArmorClassBonus)
		capMatch := dexterityCap.FindStringSubmatch(armor.expression)
		includesDexterity := strings.Contains(strings.ToLower(armor.expression), "dex") || category == "light" || category == "medium"
		dexBonus := 0
		if includesDexterity {
			if category == "medium" || capMatch != nil {
				cap := 2
				if capMatch != nil {
					cap = parseInteger(capMatch[1], cap)
				}
				dexBonus = min(dexterity, cap)
			} else {
				dexBonus = dexterity
			}
		}
		total = base + float64(dexBonus)
	} else {
		switch canonicalClass(sheet.Class) {
		case "barbarian":
			total += float64(abilityModifier(sheet.AbilityScores.Constitution))
		case "monk":
			total += float64(abilityModifier(sheet.AbilityScores.Wisdom))
		}
	}

	for _, item := range equipped {
		if item.category == "shield" || strings.Contains(item.name, "shield") || strings.Contains(item.name, "escudo") {
			bonus := firstNumber(item.expression)
			if bonus == 0 {
				bonus = item.rules.ArmorClassBonus
			}
			if bonus == 0 {
				bonus = 2
			}
			total += bonus
			break
		}
	}

	for _, item := range equipped {
		total += item.rules.ACBonus + item.rules.ArmorBonus + item.rules.EnhancementBonus + item.rules.MagicBonus
	}
	return max(0, int(math.Round(total)))
}

type inventoryRules struct {
	name, category, expression string
	rules                      parsedInventoryRules
}

type parsedInventoryRules struct {
	Category         string
	AC               string
	ArmorClassBonus  float64
	ACBonus          float64
	ArmorBonus       float64
	EnhancementBonus float64
	MagicBonus       float64
}

func decodeInventoryRules(raw json.RawMessage) parsedInventoryRules {
	var rules parsedInventoryRules
	var values map[string]json.RawMessage
	if json.Unmarshal(raw, &values) != nil {
		return rules
	}
	_ = json.Unmarshal(values["category"], &rules.Category)
	rules.AC = rawText(values["ac"])
	if rules.AC == "" {
		rules.AC = rawText(values["armorClass"])
	}
	rules.ArmorClassBonus = rawNumber(values["armorClassBonus"])
	rules.ACBonus = rawNumber(values["acBonus"])
	rules.ArmorBonus = rawNumber(values["armorBonus"])
	rules.EnhancementBonus = rawNumber(values["enhancementBonus"])
	rules.MagicBonus = rawNumber(values["magicBonus"])
	return rules
}

func rawText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}
	return strings.Trim(string(raw), `"`)
}

func rawNumber(raw json.RawMessage) float64 {
	if len(raw) == 0 || string(raw) == "null" {
		return 0
	}
	var number float64
	if json.Unmarshal(raw, &number) == nil {
		return number
	}
	number, _ = strconv.ParseFloat(rawText(raw), 64)
	return number
}

func canonicalArmorCategory(category string) string {
	switch normalizeRuleText(category) {
	case "leve", "light":
		return "light"
	case "media", "medio", "medium":
		return "medium"
	case "pesada", "pesado", "heavy":
		return "heavy"
	default:
		return normalizeRuleText(category)
	}
}

func armorBase(expression string, fallback float64) float64 {
	if match := leadingArmorClass.FindStringSubmatch(expression); match != nil {
		return rawNumber(json.RawMessage(match[1]))
	}
	if fallback != 0 {
		return fallback
	}
	return 10
}

func firstNumber(expression string) float64 {
	if match := firstSignedNumber.FindString(expression); match != "" {
		return rawNumber(json.RawMessage(match))
	}
	return 0
}

func parseInteger(value string, fallback int) int {
	if parsed, err := strconv.Atoi(value); err == nil {
		return parsed
	}
	return fallback
}

func containsNormalized(values []string, expected string) bool {
	for _, value := range values {
		if normalizeRuleText(value) == expected {
			return true
		}
	}
	return false
}

func normalizeRuleText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	return strings.NewReplacer("á", "a", "à", "a", "ã", "a", "â", "a", "é", "e", "ê", "e", "í", "i", "ó", "o", "ô", "o", "õ", "o", "ú", "u", "ü", "u", "ç", "c").Replace(value)
}
