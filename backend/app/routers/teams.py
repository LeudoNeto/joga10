from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_admin, require_event_membership
from ..models import Event, GroupMembership, Match, Player, Team, TeamPlayer
from ..schemas import TeamCreate, TeamOut, TeamsSave
from ..services.event_state import (
    MAX_TEAMS,
    TEAM_STYLES,
    active_teams,
    current_match,
    next_style,
    retire_teams,
    teams_out,
)

router = APIRouter(prefix="/events/{event_id}", tags=["teams"])

MATCH_IN_PROGRESS = (
    "Finalize ou cancele a partida em andamento antes de refazer os times"
)


def _ensure_no_match(db: Session, event: Event) -> None:
    if current_match(db, event.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, MATCH_IN_PROGRESS)


def _get_team(db: Session, event: Event, team_id: int) -> Team:
    team = db.get(Team, team_id)
    if team is None or team.event_id != event.id or not team.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time não encontrado")
    return team


def _get_player(db: Session, event: Event, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.group_id != event.group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
    return player


@router.get("/teams", response_model=list[TeamOut])
def list_teams(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    return teams_out(db, event.id)


@router.put("/teams", response_model=list[TeamOut])
def save_teams(
    payload: TeamsSave,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """RF06 / RN04: store the teams drawn on the client (random, heuristic or
    optimal balance), replacing the current ones. Teams that already played
    are archived so the match history and stats are kept."""
    _ensure_no_match(db, event)
    ids = [pid for team in payload.teams for pid in team]
    if any(not team for team in payload.teams):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Todos os times precisam de jogadores")
    if len(ids) != len(set(ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jogador repetido em mais de um time")
    found = {
        p.id
        for p in db.query(Player.id).filter(
            Player.id.in_(ids), Player.group_id == event.group_id
        )
    }
    if found != set(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jogador não pertence ao grupo")

    retire_teams(db, event.id)
    for index, members in enumerate(payload.teams):
        name, color = TEAM_STYLES[index % len(TEAM_STYLES)]
        team = Team(event_id=event.id, name=name, color=color)
        team.members = [TeamPlayer(player_id=pid) for pid in members]
        db.add(team)
    event.draw_mode = payload.mode
    event.draw_proven = payload.proven
    event.use_substitutes = payload.use_substitutes and payload.mode != "random"
    db.commit()
    return teams_out(db, event.id)


@router.delete("/teams", status_code=status.HTTP_204_NO_CONTENT)
def clear_teams(
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    _ensure_no_match(db, event)
    retire_teams(db, event.id)
    event.draw_mode = None
    db.commit()


@router.post("/teams", response_model=list[TeamOut], status_code=status.HTTP_201_CREATED)
def add_team(
    payload: TeamCreate,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Add an empty team during the event (e.g. more players arrived)."""
    if len(active_teams(db, event.id)) >= MAX_TEAMS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Máximo de {MAX_TEAMS} times")
    name, color = next_style(db, event.id)
    db.add(Team(event_id=event.id, name=payload.name or name, color=color))
    db.commit()
    return teams_out(db, event.id)


@router.delete("/teams/{team_id}", response_model=list[TeamOut])
def remove_team(
    team_id: int,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    team = _get_team(db, event, team_id)
    match = current_match(db, event.id)
    if match is not None and team.id in (match.team_a_id, match.team_b_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Este time está jogando a partida atual"
        )
    played = (
        db.query(Match)
        .filter(Match.event_id == event.id)
        .filter((Match.team_a_id == team.id) | (Match.team_b_id == team.id))
        .first()
    )
    if played is not None:
        team.active = False  # keep it for the history
    else:
        db.delete(team)
    db.commit()
    return teams_out(db, event.id)


@router.put("/teams/{team_id}/players/{player_id}", response_model=list[TeamOut])
def put_player_in_team(
    team_id: int,
    player_id: int,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Add a player to a team, moving them out of any other active team.
    Stats already recorded stay with the team the player played for."""
    team = _get_team(db, event, team_id)
    player = _get_player(db, event, player_id)
    for other in active_teams(db, event.id):
        for member in list(other.members):
            if member.player_id == player.id and other.id != team.id:
                other.members.remove(member)
    if not any(m.player_id == player.id for m in team.members):
        team.members.append(TeamPlayer(player_id=player.id))
    db.commit()
    return teams_out(db, event.id)


@router.delete("/teams/{team_id}/players/{player_id}", response_model=list[TeamOut])
def remove_player_from_team(
    team_id: int,
    player_id: int,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    team = _get_team(db, event, team_id)
    for member in list(team.members):
        if member.player_id == player_id:
            team.members.remove(member)
    db.commit()
    return teams_out(db, event.id)
