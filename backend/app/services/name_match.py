"""Match a pasted list of names against the group's players.

Comparison ignores accents, case and punctuation. Each name is resolved, in
order, by: exact name; token containment ("Afonso" -> "Afonso (Dylan)",
"Lucas" -> "Lucas H."); and finally string similarity for typos. A name that
fits several players is reported as ambiguous so the user can pick one.
"""

import difflib
import re
import unicodedata

from ..models import Player
from ..schemas import NameCandidate, NameMatchRow

_SIMILARITY_CUTOFF = 0.82


def normalize(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _candidates(key: str, players: list[Player], index: dict[int, str]) -> list[Player]:
    exact = [p for p in players if index[p.id] == key]
    if exact:
        return exact
    tokens = set(key.split())
    if tokens:
        contained = [
            p
            for p in players
            if tokens <= set(index[p.id].split()) or set(index[p.id].split()) <= tokens
        ]
        if contained:
            return contained
    names = {index[p.id] for p in players}
    close = set(difflib.get_close_matches(key, names, n=3, cutoff=_SIMILARITY_CUTOFF))
    return [p for p in players if index[p.id] in close]


def match_names(names: list[str], players: list[Player]) -> list[NameMatchRow]:
    index = {p.id: normalize(p.name) for p in players}
    taken: set[int] = set()
    rows: list[NameMatchRow] = []
    for name in names:
        key = normalize(name)
        found = _candidates(key, players, index) if key else []
        exact = len(found) == 1 and index[found[0].id] == key
        if len(found) == 1:
            player = found[0]
            if player.id in taken:
                rows.append(
                    NameMatchRow(input=name, status="duplicate", player_id=player.id)
                )
                continue
            taken.add(player.id)
            rows.append(
                NameMatchRow(
                    input=name,
                    status="matched" if exact else "similar",
                    player_id=player.id,
                )
            )
        elif found:
            rows.append(
                NameMatchRow(
                    input=name,
                    status="ambiguous",
                    candidates=[NameCandidate(id=p.id, name=p.name) for p in found],
                )
            )
        else:
            rows.append(NameMatchRow(input=name, status="not_found"))
    return rows
