from __future__ import annotations


MOJIBAKE_MARKERS = ("â", "Ã", "Â", "ã", "ä", "å", "æ", "ç", "è", "é", "\u0080", "\u0099", "\u009c", "\u009d")

KNOWN_MOJIBAKE_REPLACEMENTS = {
    "è·³è\x87³ä¸»è¦\x81å §å®¹": "跳至主要內容",
    "ç¶²ç«\x99æ\x8c\x87å\x8d\x97": "網站指南",
}


def repair_mojibake(value: str) -> str:
    if value in KNOWN_MOJIBAKE_REPLACEMENTS:
        return KNOWN_MOJIBAKE_REPLACEMENTS[value]

    if not any(marker in value for marker in MOJIBAKE_MARKERS):
        return value

    best = value
    best_score = _mojibake_score(value)
    for encoding in ("latin1", "cp1252"):
        try:
            candidate = value.encode(encoding).decode("utf-8")
        except UnicodeError:
            continue
        score = _mojibake_score(candidate)
        if score < best_score:
            best = candidate
            best_score = score
    return best


def _mojibake_score(value: str) -> int:
    return sum(value.count(marker) for marker in MOJIBAKE_MARKERS)
