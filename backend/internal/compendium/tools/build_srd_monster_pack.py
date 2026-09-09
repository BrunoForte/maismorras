#!/usr/bin/env python3
"""Populate the SRD 5.2.1 monster cards from the official CC-BY PDF.

The PDF is intentionally an input outside the repository.  This tool writes
only compact, structured game data to the embedded JSON pack; it never stores
or serves the upstream document itself.  Run it with the official download:

python build_srd_monster_pack.py SRD_CC_v5.2.1.pdf ../packs/srd_5_2_1.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader

EXPECTED_MONSTERS = 330
STAT_START = re.compile(
    r"(?m)^([^\n]+)\n"
    r"((?:Tiny|Small|Medium|Large|Huge|Gargantuan)[^\n]*)\n"
    r"AC\s+([^\n]*?)\s+Initiative\s+([^\n]*)\n"
    r"HP\s+([^\n]*)\n"
    r"Speed\s+([^\n]*)"
)


def first_number(value: str) -> int:
    match = re.search(r"\d+", value)
    if not match:
        raise ValueError(f"Expected a number in {value!r}")
    return int(match.group())


def initiative(value: str) -> int:
    match = re.search(r"[+−-]?\d+", value)
    if not match:
        raise ValueError(f"Expected initiative modifier in {value!r}")
    return int(match.group().replace("−", "-"))


def grid_size(size_line: str) -> int:
    size = size_line.split(maxsplit=1)[0]
    return {"Tiny": 1, "Small": 1, "Medium": 1, "Large": 2, "Huge": 3, "Gargantuan": 4}[size]


def find_line(block: str, label: str) -> str:
    match = re.search(rf"(?m)^{re.escape(label)}\s+([^\n]+)", block)
    return match.group(1).strip() if match else ""


def ability(block: str, label: str) -> int | None:
    match = re.search(rf"\b{label}\s+(\d+)", block)
    return int(match.group(1)) if match else None


def parse_monsters(pdf_path: Path) -> list[dict]:
    pages = PdfReader(pdf_path).pages
    # The Monsters chapter starts at PDF page 258 and ends with Animals at 364.
    text = "\n".join((page.extract_text() or "") for page in pages[257:364])
    monsters: list[dict] = []
    for match in STAT_START.finditer(text):
        name, kind, ac, ini, hp, speed = match.groups()
        # The rules immediately following the fixed header contain all compact
        # data the VTT needs to create a token and present a readable card.
        block = text[match.start() : match.start() + 1800]
        cr = find_line(block, "CR").split("(", 1)[0].strip()
        abilities = {
            "strength": ability(block, "Str"),
            "dexterity": ability(block, "Dex"),
            "constitution": ability(block, "Con"),
            "intelligence": ability(block, "Int"),
            "wisdom": ability(block, "WIS"),
            "charisma": ability(block, "Cha"),
        }
        if not cr or any(value is None for value in abilities.values()):
            raise ValueError(f"Incomplete stat block for {name}")
        monsters.append(
            {
                "entryType": "other",
                "name": name,
                "summary": "Criatura do System Reference Document 5.2.1; bloco de estatísticas oficial sob CC-BY-4.0.",
                "translations": {"pt-BR": name},
                "rules": {
                    "catalog": "monster",
                    "source": "D&D SRD 5.2.1",
                    "creatureType": kind,
                    "challenge": cr,
                    "hpMax": first_number(hp),
                    "armorClass": first_number(ac),
                    "initiative": initiative(ini),
                    "size": grid_size(kind),
                    "speed": speed,
                    "abilities": abilities,
                    "resistances": find_line(block, "Resistances"),
                    "immunities": find_line(block, "Immunities"),
                    "senses": find_line(block, "Senses"),
                    "languages": find_line(block, "Languages"),
                },
            }
        )
    names = [monster["name"] for monster in monsters]
    if len(monsters) != EXPECTED_MONSTERS or len(names) != len(set(names)):
        raise ValueError(f"Expected {EXPECTED_MONSTERS} unique SRD monster stat blocks, found {len(monsters)}")
    return monsters


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("pack", type=Path)
    args = parser.parse_args()

    pack = json.loads(args.pack.read_text(encoding="utf-8"))
    monsters = parse_monsters(args.pdf)
    # Replace stale index-only entries as a complete group. This makes the pack
    # deterministic and prevents a prior SRD version from masquerading as 5.2.1.
    pack["entries"] = [
        entry
        for entry in pack["entries"]
        if not (entry.get("entryType") == "other" and entry.get("rules", {}).get("catalog") == "monster")
    ] + monsters
    args.pack.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {len(monsters)} SRD 5.2.1 monster stat blocks in {args.pack}")


if __name__ == "__main__":
    main()
