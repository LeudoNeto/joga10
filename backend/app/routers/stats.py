from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_membership
from ..models import Event, GroupMembership, Match, MatchStat, Player, Team
from ..schemas import RankingRow
from ..services.event_state import active_teams
from ..services.ranking import raw_points, scale

router = APIRouter(prefix="/events/{event_id}", tags=["stats"])


@router.get("/stats", response_model=list[RankingRow])
def event_ranking(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Per-player ranking of the event (goals, assists, 0-100 score). Counts
    every match of the event, including the one in progress; players who left
    their team keep their numbers."""
    team_of: dict[int, Team] = {}
    for team in active_teams(db, event.id):
        for member in team.members:
            team_of[member.player_id] = team

    totals = {
        player_id: (int(goals or 0), int(assists or 0))
        for player_id, goals, assists in (
            db.query(
                MatchStat.player_id, func.sum(MatchStat.goals), func.sum(MatchStat.assists)
            )
            .join(Match, Match.id == MatchStat.match_id)
            .filter(Match.event_id == event.id)
            .group_by(MatchStat.player_id)
        )
    }
    ids = set(team_of) | set(totals)
    players = db.query(Player).filter(Player.id.in_(ids)).all() if ids else []

    entries = []
    for player in players:
        goals, assists = totals.get(player.id, (0, 0))
        entries.append((player, goals, assists, raw_points(goals, assists, player.position)))
    entries.sort(key=lambda e: (-e[3], -e[1], -e[2], e[0].name.lower()))
    top = entries[0][3] if entries else 0

    rows: list[RankingRow] = []
    previous = None
    for position, (player, goals, assists, points) in enumerate(entries, start=1):
        key = (points, goals, assists)
        rank = rows[-1].rank if previous == key else position  # ties share a rank
        previous = key
        team = team_of.get(player.id)
        rows.append(
            RankingRow(
                rank=rank,
                player_id=player.id,
                name=player.name,
                position=player.position,
                photo_url=player.photo_url,
                team_id=team.id if team else None,
                team_name=team.name if team else None,
                team_color=team.color if team else None,
                goals=goals,
                assists=assists,
                points=points,
                score=scale(points, top),
            )
        )
    return rows
