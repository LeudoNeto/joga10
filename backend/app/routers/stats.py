from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_membership
from ..models import (
    STAFF_ROLES,
    Event,
    EventManualStat,
    GroupMembership,
    Match,
    MatchStat,
    Player,
    Team,
)
from ..schemas import ManualStatUpdate, RankingRow
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
    their team keep their numbers.
    If no matches exist yet, loads from manual event statistics."""
    team_of: dict[int, Team] = {}
    for team in active_teams(db, event.id):
        for member in team.members:
            team_of[member.player_id] = team

    match_count = db.query(Match).filter(Match.event_id == event.id).count()
    if match_count > 0:
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
    else:
        totals = {
            s.player_id: (s.goals, s.assists)
            for s in db.query(EventManualStat).filter(EventManualStat.event_id == event.id).all()
        }

    ids = set(team_of) | set(totals)
    if match_count == 0:
        # Include all active players of the group when no matches exist
        group_players = db.query(Player).filter(Player.group_id == event.group_id, Player.active == True).all()
        ids = ids | {p.id for p in group_players}

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
                card_template=player.card_template,
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


@router.put("/stats/{player_id}", response_model=RankingRow)
def update_manual_stat(
    player_id: int,
    payload: ManualStatUpdate,
    membership: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Allows updating player stats (goals, assists) manually ONLY when no matches are registered.
    Regular members can only update their own linked player.
    Admins and moderators can update any player in the group."""
    match_count = db.query(Match).filter(Match.event_id == event.id).count()
    if match_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Não é permitido alterar estatísticas manuais quando já existem partidas cadastradas no evento.",
        )

    is_staff = membership.role in STAFF_ROLES
    is_self = membership.player_id == player_id

    if not is_staff and not is_self:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Você só pode alterar as estatísticas do seu próprio jogador.",
        )

    player = db.get(Player, player_id)
    if player is None or player.group_id != event.group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado neste grupo.")

    stat = (
        db.query(EventManualStat)
        .filter(EventManualStat.event_id == event.id, EventManualStat.player_id == player_id)
        .first()
    )
    if not stat:
        stat = EventManualStat(
            event_id=event.id,
            player_id=player_id,
            goals=payload.goals,
            assists=payload.assists,
        )
        db.add(stat)
    else:
        stat.goals = payload.goals
        stat.assists = payload.assists

    db.commit()

    team_of: dict[int, Team] = {}
    for team in active_teams(db, event.id):
        for member in team.members:
            team_of[member.player_id] = team

    pts = raw_points(stat.goals, stat.assists, player.position)
    team = team_of.get(player.id)
    return RankingRow(
        rank=1,
        player_id=player.id,
        name=player.name,
        position=player.position,
        photo_url=player.photo_url,
        card_template=player.card_template,
        team_id=team.id if team else None,
        team_name=team.name if team else None,
        team_color=team.color if team else None,
        goals=stat.goals,
        assists=stat.assists,
        points=pts,
        score=pts,
    )

