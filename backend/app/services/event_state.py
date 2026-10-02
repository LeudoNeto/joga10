"""Queries shared by the teams, matches and stats routers."""

from typing import Optional

from sqlalchemy.orm import Session

from ..models import Match, MatchStatus, Team
from ..schemas import TeamOut, TeamPlayerOut, TeamStats
from .rotation import TeamRecord, team_records

# Distinct, colour-coded team identities (supports up to 12 teams).
TEAM_STYLES = [
    ("Time Vermelho", "#ef4444"),
    ("Time Azul", "#3b82f6"),
    ("Time Verde", "#22c55e"),
    ("Time Amarelo", "#eab308"),
    ("Time Roxo", "#8b5cf6"),
    ("Time Laranja", "#f97316"),
    ("Time Rosa", "#ec4899"),
    ("Time Ciano", "#06b6d4"),
    ("Time Cinza", "#6b7280"),
    ("Time Lima", "#84cc16"),
    ("Time Índigo", "#6366f1"),
    ("Time Marrom", "#92400e"),
]
MAX_TEAMS = len(TEAM_STYLES)


def active_teams(db: Session, event_id: int) -> list[Team]:
    return (
        db.query(Team)
        .filter_by(event_id=event_id, active=True)
        .order_by(Team.id.asc())
        .all()
    )


def playable_teams(db: Session, event_id: int) -> list[Team]:
    """Active teams with at least one player (able to take the field)."""
    return [t for t in active_teams(db, event_id) if t.members]


def current_match(db: Session, event_id: int) -> Optional[Match]:
    return (
        db.query(Match)
        .filter_by(event_id=event_id, status=MatchStatus.in_progress.value)
        .order_by(Match.sequence.desc())
        .first()
    )


def finished_matches(db: Session, event_id: int) -> list[Match]:
    return (
        db.query(Match)
        .filter_by(event_id=event_id, status=MatchStatus.finished.value)
        .order_by(Match.sequence.asc())
        .all()
    )


def event_records(db: Session, event_id: int) -> dict[int, TeamRecord]:
    return team_records(finished_matches(db, event_id))


def team_to_out(team: Team, record: Optional[TeamRecord] = None) -> TeamOut:
    players = [
        TeamPlayerOut(
            id=tp.player.id,
            name=tp.player.name,
            position=tp.player.position,
            skill=tp.player.skill,
            photo_url=tp.player.photo_url,
        )
        for tp in team.members
        if tp.player is not None
    ]
    total = sum(p.skill for p in players)
    avg = total / len(players) if players else 0.0
    record = record or TeamRecord()
    return TeamOut(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        color=team.color,
        active=team.active,
        players=players,
        total_skill=round(total, 2),
        avg_skill=round(avg, 2),
        stats=TeamStats(
            played=record.played,
            wins=record.wins,
            draws=record.draws,
            losses=record.losses,
            goals_for=record.goals_for,
            goals_against=record.goals_against,
            streak=record.streak,
        ),
    )


def teams_out(db: Session, event_id: int) -> list[TeamOut]:
    records = event_records(db, event_id)
    return [team_to_out(t, records.get(t.id)) for t in active_teams(db, event_id)]


def retire_teams(db: Session, event_id: int) -> None:
    """Remove the current teams. Teams that already played are archived (their
    matches and the players' stats reference them); the others are deleted."""
    played: set[int] = set()
    for a, b in db.query(Match.team_a_id, Match.team_b_id).filter_by(event_id=event_id):
        played.update((a, b))
    for team in active_teams(db, event_id):
        if team.id in played:
            team.active = False
        else:
            db.delete(team)
    db.flush()


def next_style(db: Session, event_id: int) -> tuple[str, str]:
    """First team style not used by the active teams."""
    used = {t.name for t in active_teams(db, event_id)}
    for name, color in TEAM_STYLES:
        if name not in used:
            return name, color
    return f"Time {len(used) + 1}", "#6b7280"
