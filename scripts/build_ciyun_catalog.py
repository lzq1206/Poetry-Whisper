#!/usr/bin/env python3
"""Build compact browser data from the MIT-licensed Couyun corpus.

Inputs: a temporary shallow clone of https://github.com/hulbji/couyun
Outputs: data/ci-catalog.json and data/pingshui-tone.json
"""
from __future__ import annotations

import ast
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

SOURCE = "https://github.com/hulbji/couyun.git"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"


def compact_pattern(raw: str) -> str:
    return "".join({"平": "P", "仄": "Z", "中": "A"}.get(char, "") for char in raw)


def build_catalog(source_root: Path) -> None:
    index = json.loads((source_root / "couyun/ci_pu/ci_index.json").read_text(encoding="utf-8"))
    result = []
    for item in index:
        file = source_root / "couyun/ci_pu/ci_list" / f"cipai_{item['idx']}.json"
        variants = json.loads(file.read_text(encoding="utf-8"))
        result.append({
            "id": f"ci-{item['idx']}",
            "name": item["names"][0],
            "aliases": item["names"],
            "type": item["display_s"],
            "variants": [
                {
                    "label": f"格{number + 1}",
                    "lines": [compact_pattern(line) for line in variant["ge_lyu_sep"]],
                    "rhyme_pos": variant["rhyme_pos"],
                }
                for number, variant in enumerate(variants)
            ],
        })
    (OUT / "ci-catalog.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"ci catalog: {len(result)} titles, {sum(len(x['variants']) for x in result)} patterns")


def build_tone_map(source_root: Path) -> None:
    # Each Couyun list stores characters at index 0 and a signed Pingshui class at index 2.
    module = ast.parse((source_root / "couyun/hanzi/hanzi_class.py").read_text(encoding="utf-8"))
    tones: dict[str, set[str]] = {}
    for node in module.body:
        if not isinstance(node, ast.Assign):
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, SyntaxError):
            continue
        if not (isinstance(value, list) and len(value) >= 3 and isinstance(value[0], str) and isinstance(value[2], int)):
            continue
        tone = "P" if value[2] > 0 else "Z"
        for char in value[0]:
            tones.setdefault(char, set()).add(tone)
    output = {char: "/".join(sorted(values)) for char, values in tones.items()}
    (OUT / "pingshui-tone.json").write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"pingshui tone map: {len(output)} characters")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="poetry-whisper-couyun-") as temp:
        checkout = Path(temp) / "couyun"
        subprocess.run(["git", "clone", "--depth", "1", SOURCE, str(checkout)], check=True)
        build_catalog(checkout)
        build_tone_map(checkout)


if __name__ == "__main__":
    main()
