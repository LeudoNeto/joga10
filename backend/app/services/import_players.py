"""Parse player rosters from pasted text or uploaded files.

Supported inputs:
- Plain text / .txt : one player per line in the format ``Nome - Nota``.
- .csv              : columns Nome, Nota and (optional) Posição.
- .xlsx / .xls      : same columns as CSV, first worksheet.

Parsing is tolerant: decimal comma is accepted, notas are clamped to 0-10 and a
missing/invalid nota falls back to a default (with a note). Rows without a name
are flagged as errors so the caller can skip them.
"""

import csv
import io
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

DEFAULT_SKILL = 5.0

# Accepted header aliases (accent/case-insensitive) mapped to our fields.
HEADER_ALIASES = {
    "name": {"nome", "name", "jogador", "player", "atleta"},
    "skill": {"nota", "skill", "habilidade", "rating", "nivel", "overall", "media"},
    "position": {"posicao", "position", "pos", "funcao", "posição"},
}

# "Nome <sep> Nota" — captures a trailing number as the nota.
_TEXT_LINE = re.compile(
    r"^(?P<name>.*?)\s*[-–—:;\t|]\s*(?P<skill>-?\d+(?:[.,]\d+)?)\s*$"
)


@dataclass
class ParsedRow:
    name: str
    skill: float
    position: Optional[str]
    error: Optional[str] = None
    note: Optional[str] = None


def _norm(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii")
    return text.strip().lower()


def _parse_skill(raw) -> tuple[float, Optional[str]]:
    if raw is None or str(raw).strip() == "":
        return DEFAULT_SKILL, f"sem nota, usando {DEFAULT_SKILL:g}"
    text = str(raw).strip().replace(",", ".")
    try:
        value = float(text)
    except ValueError:
        return DEFAULT_SKILL, f"nota inválida '{raw}', usando {DEFAULT_SKILL:g}"
    if value < 0:
        return 0.0, "nota negativa ajustada para 0"
    if value > 10:
        return 10.0, "nota acima de 10 ajustada para 10"
    return value, None


def _make_row(name: str, skill_raw, position) -> ParsedRow:
    name = (name or "").strip()
    position = (str(position).strip() or None) if position not in (None, "") else None
    skill, note = _parse_skill(skill_raw)
    error = None if name else "linha sem nome"
    return ParsedRow(name=name, skill=skill, position=position, error=error, note=note)


# ---------------------------------------------------------------------------
# Text / .txt
# ---------------------------------------------------------------------------
def parse_text(text: str) -> list[ParsedRow]:
    rows: list[ParsedRow] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = _TEXT_LINE.match(stripped)
        if match:
            rows.append(_make_row(match.group("name"), match.group("skill"), None))
        else:
            # No separator/number: treat the line as a name-only entry (default
            # nota). Leading separator junk (e.g. "- ") is stripped so a line
            # with no real name is flagged instead of imported.
            cleaned = re.sub(r"^[\s\-–—:;|]+", "", stripped).strip()
            rows.append(_make_row(cleaned, None, None))
    return rows


# ---------------------------------------------------------------------------
# Tabular formats (csv / xlsx / xls)
# ---------------------------------------------------------------------------
def _rows_from_table(table: list[list]) -> list[ParsedRow]:
    # Drop rows that are entirely empty.
    table = [
        row
        for row in table
        if any(str(cell).strip() for cell in row if cell is not None)
    ]
    if not table:
        return []

    header = [_norm(cell) for cell in table[0]]
    columns: dict[str, Optional[int]] = {"name": None, "skill": None, "position": None}
    for index, cell in enumerate(header):
        for field, aliases in HEADER_ALIASES.items():
            if cell in aliases and columns[field] is None:
                columns[field] = index

    if any(v is not None for v in columns.values()):
        data = table[1:]
    else:
        # No recognizable header: assume order name, skill, position.
        width = len(table[0])
        columns = {
            "name": 0,
            "skill": 1 if width > 1 else None,
            "position": 2 if width > 2 else None,
        }
        data = table

    def cell(row, idx):
        if idx is None or idx >= len(row):
            return None
        value = row[idx]
        return None if value is None else str(value).strip()

    rows = []
    for row in data:
        rows.append(
            _make_row(cell(row, columns["name"]), cell(row, columns["skill"]), cell(row, columns["position"]))
        )
    return rows


def parse_csv(content: bytes) -> list[ParsedRow]:
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    return _rows_from_table([list(r) for r in reader])


def parse_xlsx(content: bytes) -> list[ParsedRow]:
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    table = [list(row) for row in sheet.iter_rows(values_only=True)]
    workbook.close()
    return _rows_from_table(table)


def parse_xls(content: bytes) -> list[ParsedRow]:
    import xlrd

    book = xlrd.open_workbook(file_contents=content)
    sheet = book.sheet_by_index(0)
    table = [sheet.row_values(r) for r in range(sheet.nrows)]
    return _rows_from_table(table)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
def parse_players(
    filename: Optional[str], content: Optional[bytes], text: Optional[str]
) -> list[ParsedRow]:
    if text and text.strip():
        return parse_text(text)

    if content is not None and filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "csv":
            return parse_csv(content)
        if ext in ("xlsx", "xlsm"):
            return parse_xlsx(content)
        if ext == "xls":
            return parse_xls(content)
        # txt or anything else: treat as plain text.
        return parse_text(content.decode("utf-8-sig", errors="replace"))

    return []
