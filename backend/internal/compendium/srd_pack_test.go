package compendium

import (
	"encoding/json"
	"testing"
)

func TestSRDPackHasCompleteSpellIndex(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatalf("loadSRDPack() error = %v", err)
	}
	if pack.Version != "5.2.1" || pack.Revision == "" || pack.Attribution == "" {
		t.Fatalf("SRD attribution/version missing: %#v", pack)
	}
	spells := 0
	foundWish := false
	foundFireBolt := false
	for _, entry := range pack.Entries {
		if entry.EntryType != "spell" {
			continue
		}
		spells++
		foundWish = foundWish || entry.Name == "Wish"
		foundFireBolt = foundFireBolt || entry.Name == "Fire Bolt"
	}
	if spells != 336 || !foundWish || !foundFireBolt {
		t.Fatalf("unexpected spell index: spells=%d wish=%t fireBolt=%t", spells, foundWish, foundFireBolt)
	}
}

func TestSRDPackIncludesPlayerFacingCatalog(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, entry := range pack.Entries {
		got[entry.EntryType+":"+entry.Name] = true
	}
	for _, key := range []string{
		"class:Wizard", "subclass:Evoker", "background:Acolyte", "species:Dragonborn",
		"feat:Alert", "item:Longsword", "item:Plate Armor", "item:Thieves' Tools",
	} {
		if !got[key] {
			t.Errorf("missing SRD entry %q", key)
		}
	}
}

func TestSRDPackIndexesOpenSRDMonstersAndMagicItems(t *testing.T) {
	pack, err := loadSRDPack()
	if err != nil {
		t.Fatal(err)
	}
	monsters, magicItems := 0, 0
	usableMonsters := 0
	for _, entry := range pack.Entries {
		if entry.EntryType != "other" {
			continue
		}
		var rules struct {
			Catalog string `json:"catalog"`
		}
		if err := json.Unmarshal(entry.Rules, &rules); err != nil {
			t.Fatal(err)
		}
		switch rules.Catalog {
		case "monster":
			monsters++
			var stats struct {
				HPMax      int `json:"hpMax"`
				ArmorClass int `json:"armorClass"`
				Initiative int `json:"initiative"`
			}
			if err := json.Unmarshal(entry.Rules, &stats); err != nil {
				t.Fatal(err)
			}
			if stats.HPMax > 0 && stats.ArmorClass >= 0 {
				usableMonsters++
			}
		case "magic-item":
			magicItems++
		}
	}
	if monsters != 330 || usableMonsters != monsters || magicItems != 248 {
		t.Fatalf("unexpected SRD index: monsters=%d usable=%d magicItems=%d", monsters, usableMonsters, magicItems)
	}
}
