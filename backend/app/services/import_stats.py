"""Parse an event's player statistics (goals and assists) from pasted text or
an uploaded file, for events without matches (manual stats).

- Plain text / .txt : one player per line, ``Nome - Gols - Assistências``
  (assists optional; separators - : ; | / or spaces). Numbering and emojis
  are ignored, as in the selection import (WhatsApp lists).
- .csv / .xls / .xlsx : columns Nome, Gols and Assistências (or that order).

Names are resolved to players by the caller (``name_match.match_names``).
"""

import re
from dataclasses import dataclass
from typing import Optional

from .import_players import clean_name, read_table, table_cell, table_columns

MAX_VALUE = 100  # same bound as a manual stat edit

STAT_ALIASES = {
    "name": {"nome", "name", "jogador", "player", "atleta"},
    "goals": {"gols", "gol", "goals", "goal", "g"},
    "assists": {"assistencias", "assistencia", "assists", "assist", "assis", "ast", "a"},
}

_SEP = r"(?:\s*[-–—:;|/\t]\s*|\s+)"
# "Nome - 3 - 1", "Nome 3 1", "Nome: 3/1", "Nome - 2" (no assists)
_TEXT_LINE = re.compile(rf"^(?P<name>.+?){_SEP}(?P<goals>\d+){_SEP}?(?P<assists>(?<=\D)\d+)?\s*$")


@dataclass
class StatRow:
    name: str
    goals: int = 0
    assists: int = 0
    error: Optional[str] = None  # line not understood: ignored


def _number(raw, label: str) -> tuple[int, Optional[str]]:
    text = str(raw or "").strip().replace(",", ".")
    if not text:
        return 0, None
    try:
        value = float(text)
    except ValueError:
        return 0, f"{label} inválido ({raw})"
    if value < 0 or value != int(value):
        return 0, f"{label} inválido ({raw})"
    if value > MAX_VALUE:
        return 0, f"{label} acima de {MAX_VALUE}"
    return int(value), None


def _row(name, goals_raw, assists_raw) -> StatRow:
    name = clean_name(str(name or ""))
    goals, goals_error = _number(goals_raw, "gols")
    assists, assists_error = _number(assists_raw, "assistências")
    error = goals_error or assists_error or (None if name else "linha sem nome")
    return StatRow(name=name, goals=goals, assists=assists, error=error)


def _text_rows(text: str) -> list[StatRow]:
    rows: list[StatRow] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = _TEXT_LINE.match(stripped)
        if match:
            rows.append(_row(match.group("name"), match.group("goals"), match.group("assists")))
        else:
            # A title or a name without numbers: shown as ignored.
            rows.append(StatRow(name=clean_name(stripped) or stripped, error="sem gols/assistências"))
    return rows


def parse_stats(
    filename: Optional[str], content: Optional[bytes], text: Optional[str]
) -> list[StatRow]:
    if text and text.strip():
        return _text_rows(text)
    if content is None or not filename:
        return []
    table = read_table(filename, content)
    if table is None:
        return _text_rows(content.decode("utf-8-sig", errors="replace"))
    if not table:
        return []
    columns, data = table_columns(table, STAT_ALIASES)
    return [
        _row(
            table_cell(row, columns["name"]),
            table_cell(row, columns["goals"]),
            table_cell(row, columns["assists"]),
        )
        for row in data
    ]
