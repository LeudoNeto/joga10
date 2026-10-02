"""Match rotation: team records, who stays after a match and the next match.

Rules
-----
- The winner stays and the loser leaves; the team that has been waiting the
  longest enters (ties: fewer matches played, then team order).
- ``wins_to_leave`` (0 = no limit): when the winner completes that many
  consecutive wins it leaves too, together with the loser. With only three
  teams the loser stays, since there is nobody else to come in.
- On a draw the users decide (penalties, rock-paper-scissors...) who stays,
  or both leave (four or more teams).
- With two teams both always stay.
"""

from dataclasses import dataclass
from typing import Optional

from ..models import Match, Team

DRAW_REASON = "Empate: decidam nos pênaltis ou no jokenpô quem fica"


@dataclass
class TeamRecord:
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    streak: int = 0  # consecutive wins while staying on the field
    last_sequence: int = -1  # last match played (-1 = never)


def winner_side(score_a: int, score_b: int) -> Optional[str]:
    if score_a > score_b:
        return "a"
    if score_b > score_a:
        return "b"
    return None


def team_records(finished: list[Match]) -> dict[int, TeamRecord]:
    """Aggregate finished matches (any order) into per-team records."""
    records: dict[int, TeamRecord] = {}
    for match in sorted(finished, key=lambda m: m.sequence):
        sides = (
            ("a", match.team_a_id, match.score_a, match.score_b),
            ("b", match.team_b_id, match.score_b, match.score_a),
        )
        # A team that sat this match out left the field: its streak is over.
        for team_id, record in records.items():
            if team_id not in (match.team_a_id, match.team_b_id):
                record.streak = 0
        for side, team_id, scored, conceded in sides:
            record = records.setdefault(team_id, TeamRecord())
            record.played += 1
            record.goals_for += scored
            record.goals_against += conceded
            record.last_sequence = match.sequence
            if scored > conceded:
                record.wins += 1
            elif scored == conceded:
                record.draws += 1
            else:
                record.losses += 1
            # A draw decided on penalties counts as a win for the rotation.
            won = scored > conceded or (scored == conceded and match.staying == side)
            stayed = match.staying in (side, "both")
            record.streak = record.streak + 1 if won and stayed else 0
    return records


@dataclass
class FinishDecision:
    winner: Optional[str]
    streak_after: int
    options: list[str]
    default: Optional[str]
    reason: str


def finish_decision(
    match: Match,
    records: dict[int, TeamRecord],
    active_teams: int,
    wins_to_leave: int,
) -> FinishDecision:
    """Options for who stays after ``match`` and the one the rules suggest."""
    name = {"a": match.team_a.name, "b": match.team_b.name}
    winner = winner_side(match.score_a, match.score_b)
    team_of = {"a": match.team_a_id, "b": match.team_b_id}
    streak_after = (
        records.get(team_of[winner], TeamRecord()).streak + 1 if winner else 0
    )

    if active_teams <= 2:
        return FinishDecision(
            winner,
            streak_after,
            ["both"],
            "both",
            "Com apenas dois times, os dois seguem jogando",
        )

    options = ["a", "b"] + (["none"] if active_teams >= 4 else [])
    if winner is None:
        return FinishDecision(None, 0, options, None, DRAW_REASON)

    loser = "b" if winner == "a" else "a"
    if wins_to_leave and streak_after >= wins_to_leave:
        if active_teams >= 4:
            return FinishDecision(
                winner,
                streak_after,
                options,
                "none",
                f"{name[winner]} completou {streak_after} vitória(s) seguida(s) "
                f"e sai junto com {name[loser]}",
            )
        return FinishDecision(
            winner,
            streak_after,
            options,
            loser,
            f"{name[winner]} completou {streak_after} vitória(s) seguida(s) e sai; "
            f"{name[loser]} fica por não haver outros times",
        )
    return FinishDecision(
        winner, streak_after, options, winner, f"{name[winner]} venceu e fica em campo"
    )


@dataclass
class Suggestion:
    team_a: Team
    team_b: Team
    reason: str


def suggest_next(
    teams: list[Team], finished: list[Match], records: dict[int, TeamRecord]
) -> Optional[Suggestion]:
    """Next match: whoever stayed after the last match plus the team(s)
    waiting the longest. ``teams`` are the teams able to play, in order."""
    if len(teams) < 2:
        return None
    by_id = {t.id: t for t in teams}
    last = max(finished, key=lambda m: m.sequence) if finished else None

    staying: list[Team] = []
    if last is not None:
        if last.staying in ("a", "both") and last.team_a_id in by_id:
            staying.append(by_id[last.team_a_id])
        if last.staying in ("b", "both") and last.team_b_id in by_id:
            staying.append(by_id[last.team_b_id])

    order = {t.id: i for i, t in enumerate(teams)}

    def waiting_key(team: Team):
        record = records.get(team.id, TeamRecord())
        return (record.last_sequence, record.played, order[team.id])

    waiting = sorted((t for t in teams if t not in staying), key=waiting_key)
    entering = waiting[: 2 - len(staying)]
    picks = staying[:2] + entering
    if len(picks) < 2:
        return None

    if not finished:
        reason = "Primeira partida do evento"
    elif staying and entering:
        reason = (
            f"{staying[0].name} fica; entra {entering[0].name}, "
            "há mais tempo sem jogar"
        )
    elif staying:
        reason = "Os dois times seguem em campo"
    else:
        reason = "Entram os times há mais tempo sem jogar"
    return Suggestion(picks[0], picks[1], reason)
