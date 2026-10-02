"""Player ranking score (0-100) from goals, assists and position.

Inspired by fantasy football scoring: an assist is worth 3 points and a goal
4 points, plus 1 for midfielders and 2 for defenders/goalkeepers (a goal from
the back is rarer). Raw points are then scaled so the leader gets 100.
"""

import re
import unicodedata
from typing import Optional

ASSIST_POINTS = 3
GOAL_POINTS = {"goalkeeper": 6, "defender": 6, "midfielder": 5, "forward": 4}
DEFAULT_GOAL_POINTS = 4

# line -> (word prefixes, exact abbreviations); checked in this order, so
# "Meia-atacante" is a midfielder. Covers field and futsal names.
_LINES = [
    ("goalkeeper", ("gol", "arqueiro", "keeper"), ("gk",)),
    ("defender", ("zag", "lat", "def", "beque", "fixo", "back"), ("cb", "lb", "rb")),
    ("midfielder", ("vol", "mei", "arm", "ala", "mid", "medio"), ("cm", "dm", "am", "cdm", "cam")),
    ("forward", ("ata", "pont", "centro", "piv", "artilh", "seg"), ("st", "cf", "fw")),
]


def position_line(position: Optional[str]) -> Optional[str]:
    if not position:
        return None
    text = unicodedata.normalize("NFKD", position)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    words = [w for w in re.split(r"[^a-z]+", text) if w]
    for line, prefixes, exact in _LINES:
        if any(w in exact or w.startswith(prefixes) for w in words):
            return line
    return None


def raw_points(goals: int, assists: int, position: Optional[str]) -> int:
    per_goal = GOAL_POINTS.get(position_line(position), DEFAULT_GOAL_POINTS)
    return goals * per_goal + assists * ASSIST_POINTS


def scale(points: int, top: int) -> int:
    return round(100 * points / top) if top > 0 else 0
