"""Team draw algorithms (RF06 / RN04)."""

import math
import random

from ..models import Player


def draw_random(players: list[Player], num_teams: int) -> list[list[Player]]:
    """100% random draw: shuffle and deal players round-robin into teams."""
    shuffled = list(players)
    random.shuffle(shuffled)
    teams: list[list[Player]] = [[] for _ in range(num_teams)]
    for index, player in enumerate(shuffled):
        teams[index % num_teams].append(player)
    return teams


def draw_balanced(players: list[Player], num_teams: int) -> list[list[Player]]:
    """Balanced draw (RN04).

    Sorts players by skill (descending) and greedily assigns each one to the
    team that currently has the lowest accumulated skill, while keeping team
    sizes even (difference of at most one player). This keeps the sum/average
    skill of every team as close as possible.
    """
    ordered = sorted(players, key=lambda p: p.skill, reverse=True)
    teams: list[list[Player]] = [[] for _ in range(num_teams)]
    totals = [0.0] * num_teams
    max_size = math.ceil(len(ordered) / num_teams) if ordered else 0

    for player in ordered:
        # Only consider teams that still have room, so sizes stay balanced.
        candidates = [i for i in range(num_teams) if len(teams[i]) < max_size]
        # Among those, pick the one with the least accumulated skill.
        # Random tiebreak avoids always favouring the first team.
        best = min(candidates, key=lambda i: (totals[i], random.random()))
        teams[best].append(player)
        totals[best] += player.skill

    return teams


def build_teams(
    players: list[Player], num_teams: int, mode: str
) -> list[list[Player]]:
    if mode == "random":
        return draw_random(players, num_teams)
    return draw_balanced(players, num_teams)
