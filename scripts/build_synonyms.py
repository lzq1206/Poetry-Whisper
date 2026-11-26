#!/usr/bin/env python3
"""Build and validate the structured classical poetry synonym lexicon.

Inputs:
  - scripts/lexicon_parts/*.py
  - data/pingshui-tone.json (for Pingshui tone audit)

Output:
  - data/classical-synonyms.json
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lexicon_parts import (  # noqa: E402
    part1_nature,
    part2_flora_fauna,
    part3_emotion_action,
    part4_desc_color,
    part5_culture_life,
    part6_single_chars,
    part7_poetic_scenes_and_vernacular,
)

CATEGORIES = [
    {"id": "tianxiang", "name": "天象"},
    {"id": "shiling", "name": "时令"},
    {"id": "shanshui", "name": "山水"},
    {"id": "caomu", "name": "草木"},
    {"id": "niaoshou", "name": "鸟兽"},
    {"id": "qingzhi", "name": "情志"},
    {"id": "dongzuo", "name": "动作"},
    {"id": "xingmao", "name": "形貌"},
    {"id": "secai", "name": "色彩"},
    {"id": "qishi", "name": "器室"},
    {"id": "renwu", "name": "人物"},
    {"id": "renshi", "name": "人事"},
    {"id": "fangwei", "name": "方位"},
    {"id": "xuci", "name": "虚词"},
]

CJK_WORD_RE = re.compile(r"^[\u3400-\u9fff]{1,5}$")
CJK_TRIGGER_RE = re.compile(r"^[\u3400-\u9fff]{1,8}$")


def parse_tokens(raw: str, is_trigger: bool = False) -> list[str]:
    pattern = CJK_TRIGGER_RE if is_trigger else CJK_WORD_RE
    seen: set[str] = set()
    out: list[str] = []
    for token in raw.split():
        token = token.strip()
        if not token:
            continue
        if not pattern.match(token):
            raise ValueError(f"Invalid CJK token: {token!r}")
        if token not in seen:
            seen.add(token)
            out.append(token)
    return out


def tone_pattern(word: str, tones: dict[str, str]) -> str | None:
    parts = []
    for ch in word:
        t = tones.get(ch)
        if not t:
            return None
        parts.append("A" if "/" in t else t)
    return "".join(parts)


def main() -> None:
    tones = json.loads((ROOT / "data/pingshui-tone.json").read_text(encoding="utf-8"))
    cat_ids = {c["id"] for c in CATEGORIES}

    all_raw = (
        part1_nature.GROUPS
        + part2_flora_fauna.GROUPS
        + part3_emotion_action.GROUPS
        + part4_desc_color.GROUPS
        + part5_culture_life.GROUPS
        + part6_single_chars.GROUPS
        + part7_poetic_scenes_and_vernacular.GROUPS
    )

    groups = []
    unique_words: set[str] = set()
    unique_triggers: set[str] = set()
    all_keys: set[str] = set()
    len_counts: Counter[int] = Counter()
    cat_counts: Counter[str] = Counter()
    missing_tone_chars: set[str] = set()
    two_char_coverage: Counter[int] = Counter()

    for idx, (cat, label, triggers_raw, words_raw) in enumerate(all_raw):
        if cat not in cat_ids:
            raise ValueError(f"Unknown category {cat!r} in group {label!r}")
        words = parse_tokens(words_raw)
        triggers = [t for t in parse_tokens(triggers_raw, is_trigger=True) if t not in set(words)]
        if not words:
            raise ValueError(f"Empty word list in group {label!r}")

        cat_counts[cat] += 1
        two_patterns: set[str] = set()
        for w in words:
            unique_words.add(w)
            all_keys.add(w)
            for ch in w:
                if ch not in tones:
                    missing_tone_chars.add(ch)
            if len(w) == 2:
                tp = tone_pattern(w, tones)
                if tp:
                    # Expand ambiguous A to both P and Z for coverage estimate
                    opts = [""]
                    for ch_t in tp:
                        if ch_t == "A":
                            opts = [o + "P" for o in opts] + [o + "Z" for o in opts]
                        else:
                            opts = [o + ch_t for o in opts]
                    two_patterns.update(opts)
        for t in triggers:
            unique_triggers.add(t)
            all_keys.add(t)

        if any(len(w) == 2 for w in words):
            two_char_coverage[len(two_patterns)] += 1

        entry = {"c": cat, "l": label, "w": words}
        if triggers:
            entry["t"] = triggers
        groups.append(entry)

    for w in unique_words:
        len_counts[len(w)] += 1

    payload = {
        "version": 2,
        "categories": CATEGORIES,
        "groups": groups,
    }

    out_path = ROOT / "data/classical-synonyms.json"
    out_text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    out_path.write_text(out_text, encoding="utf-8")

    print(f"Built {out_path.relative_to(ROOT)} ({len(out_text.encode('utf-8')) / 1024:.1f} KB)")
    print(f"Categories: {len(CATEGORIES)} | Groups: {len(groups)}")
    print(f"Unique classical words: {len(unique_words)} (by length: {dict(sorted(len_counts.items()))})")
    print(f"Unique vernacular-only triggers: {len(unique_triggers)}")
    print(f"Total indexed lookup keys (bidirectional + triggers): {len(all_keys)}")
    print(f"2-char synset tonal-pattern coverage (out of 4 PP/PZ/ZP/ZZ): {dict(sorted(two_char_coverage.items()))}")
    print(f"Groups per category: {dict(cat_counts)}")
    if missing_tone_chars:
        print(f"WARNING: {len(missing_tone_chars)} chars missing from pingshui-tone.json: {sorted(missing_tone_chars)}")
    else:
        print("Tone audit: 100% of classical word characters exist in pingshui-tone.json!")


if __name__ == "__main__":
    main()
