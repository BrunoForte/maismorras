package compendium

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

// The JSON file is generated from the official SRD 5.2.1 PDF. It is embedded
// into the API image, so importing a campaign never depends on a third-party
// API being online. The source material is CC-BY-4.0; its required attribution
// is kept alongside the data and persisted with every campaign source.
//
//go:embed packs/srd_5_2_1.json
var srdPackJSON []byte

type srdPack struct {
	Version     string     `json:"version"`
	Revision    string     `json:"revision"`
	Attribution string     `json:"attribution"`
	Entries     []srdEntry `json:"entries"`
}

func uniqueEntries(entries []srdEntry) []srdEntry {
	seen := make(map[string]struct{}, len(entries))
	unique := make([]srdEntry, 0, len(entries))
	for _, entry := range entries {
		key := entry.EntryType + "\x00" + entry.Name
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, entry)
	}
	return unique
}

type srdEntry struct {
	EntryType    string          `json:"entryType"`
	Name         string          `json:"name"`
	Summary      string          `json:"summary"`
	Translations json.RawMessage `json:"translations"`
	Rules        json.RawMessage `json:"rules"`
}

var (
	srdOnce   sync.Once
	srdLoaded srdPack
	srdErr    error
)

func loadSRDPack() (srdPack, error) {
	srdOnce.Do(func() {
		srdErr = json.Unmarshal(srdPackJSON, &srdLoaded)
		if srdErr != nil {
			return
		}
		srdLoaded.Entries = append(srdLoaded.Entries, srdIndexEntries()...)
	})
	return srdLoaded, srdErr
}

// srdIndexEntries covers the non-spell player-facing SRD index. Rules with
// richer automation can be added incrementally without changing entry IDs;
// existing non-empty rules in the database are deliberately preserved.
func srdIndexEntries() []srdEntry {
	entries := make([]srdEntry, 0, 180)
	add := func(kind string, names string) {
		for _, name := range strings.Split(names, "|") {
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			entries = append(entries, srdEntry{
				EntryType: kind, Name: name,
				Summary:      "Entrada do System Reference Document 5.2.1.",
				Translations: json.RawMessage(`{"pt-BR":"` + name + `"}`),
				Rules:        json.RawMessage(`{}`),
			})
		}
	}
	add("class", "Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard")
	add("subclass", "Path of the Berserker|College of Lore|Life Domain|Circle of the Land|Champion|Warrior of the Open Hand|Oath of Devotion|Hunter|Thief|Draconic Sorcery|Fiend Patron|Evoker")
	add("background", "Acolyte|Criminal|Sage|Soldier")
	add("species", "Dragonborn|Dwarf|Elf|Gnome|Goliath|Halfling|Human|Orc|Tiefling")
	add("feat", "Alert|Magic Initiate|Savage Attacker|Skilled|Ability Score Improvement|Grappler|Archery|Defense|Great Weapon Fighting|Two-Weapon Fighting|Boon of Combat Prowess|Boon of Dimensional Travel|Boon of Fate|Boon of Irresistible Offense|Boon of Spell Recall|Boon of the Night Spirit|Boon of Truesight")
	add("item", "Club|Dagger|Greatclub|Handaxe|Javelin|Light Hammer|Mace|Quarterstaff|Sickle|Spear|Dart|Light Crossbow|Shortbow|Sling|Battleaxe|Flail|Glaive|Greataxe|Greatsword|Halberd|Lance|Longsword|Maul|Morningstar|Pike|Rapier|Scimitar|Shortsword|Trident|Warhammer|War Pick|Whip|Blowgun|Hand Crossbow|Heavy Crossbow|Longbow|Musket|Pistol|Padded Armor|Leather Armor|Studded Leather Armor|Hide Armor|Chain Shirt|Scale Mail|Breastplate|Half Plate Armor|Ring Mail|Chain Mail|Splint Armor|Plate Armor|Shield")
	add("item", "Acid|Alchemist's Fire|Ammunition|Antitoxin|Arcane Focus|Backpack|Ball Bearings|Barrel|Basket|Bedroll|Bell|Blanket|Block and Tackle|Book|Bottle, Glass|Bucket|Burglar's Pack|Caltrops|Candle|Case, Crossbow Bolt|Case, Map or Scroll|Chain|Chest|Climber's Kit|Clothes, Fine|Clothes, Traveler's|Component Pouch|Costume|Crowbar|Diplomat's Pack|Druidic Focus|Dungeoneer's Pack|Entertainer's Pack|Explorer's Pack|Flask|Grappling Hook|Healer's Kit|Holy Symbol|Holy Water|Hunting Trap|Ink|Ink Pen|Jug|Ladder|Lamp|Lantern, Bullseye|Lantern, Hooded|Lock|Magnifying Glass|Manacles|Map|Mirror|Net|Oil|Paper|Parchment|Perfume|Poison, Basic|Pole|Pot, Iron|Potion of Healing|Pouch|Priest's Pack|Quiver|Ram, Portable|Rations|Robe|Rope|Sack|Scholar's Pack|Shovel|Signal Whistle|Spell Scroll (Cantrip)|Spell Scroll (Level 1)|Spikes, Iron|Spyglass|String|Tent|Tinderbox|Torch|Vial|Waterskin")
	add("item", "Alchemist's Supplies|Brewer's Supplies|Calligrapher's Supplies|Carpenter's Tools|Cartographer's Tools|Cobbler's Tools|Cook's Utensils|Glassblower's Tools|Jeweler's Tools|Leatherworker's Tools|Mason's Tools|Painter's Supplies|Potter's Tools|Smith's Tools|Tinker's Tools|Weaver's Tools|Woodcarver's Tools|Disguise Kit|Forgery Kit|Gaming Set|Herbalism Kit|Musical Instrument|Navigator's Tools|Poisoner's Kit|Thieves' Tools")
	return entries
}
