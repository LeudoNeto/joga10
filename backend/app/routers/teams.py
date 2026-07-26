from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_admin, require_event_membership
from ..models import Event, GroupMembership, Player, Team, TeamPlayer
from ..schemas import DrawRequest, TeamOut, TeamPlayerOut
from ..services.draw import build_teams

router = APIRouter(prefix="/events/{event_id}", tags=["teams"])

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


def team_to_out(team: Team) -> TeamOut:
    players = [
        TeamPlayerOut(
            id=tp.player.id,
            name=tp.player.name,
            position=tp.player.position,
            skill=tp.player.skill,
        )
        for tp in team.members
        if tp.player is not None
    ]
    total = sum(p.skill for p in players)
    avg = total / len(players) if players else 0.0
    return TeamOut(
        id=team.id,
        event_id=team.event_id,
        name=team.name,
        color=team.color,
        players=players,
        total_skill=round(total, 2),
        avg_skill=round(avg, 2),
    )


@router.get("/teams", response_model=list[TeamOut])
def list_teams(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    teams = (
        db.query(Team).filter_by(event_id=event.id).order_by(Team.id.asc()).all()
    )
    return [team_to_out(t) for t in teams]


@router.post("/draw", response_model=list[TeamOut])
def draw_teams(
    payload: DrawRequest,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """RF06 / RN04: form teams for the event, either fully random or balanced
    by player skill. Re-drawing replaces the current teams for the event."""
    if payload.player_ids:
        players = (
            db.query(Player)
            .filter(
                Player.id.in_(payload.player_ids),
                Player.group_id == event.group_id,
            )
            .all()
        )
    else:
        players = (
            db.query(Player)
            .filter_by(group_id=event.group_id, active=True)
            .all()
        )

    if len(players) < payload.num_teams:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Número de jogadores insuficiente para formar os times",
        )

    # Clear previous teams (DB-level cascades remove their members).
    db.query(Team).filter_by(event_id=event.id).delete(synchronize_session=False)
    db.flush()

    buckets = build_teams(players, payload.num_teams, payload.mode)
    for index, bucket in enumerate(buckets):
        name, color = TEAM_STYLES[index % len(TEAM_STYLES)]
        team = Team(event_id=event.id, name=name, color=color)
        db.add(team)
        db.flush()
        for player in bucket:
            db.add(TeamPlayer(team_id=team.id, player_id=player.id))

    db.commit()

    teams = (
        db.query(Team).filter_by(event_id=event.id).order_by(Team.id.asc()).all()
    )
    return [team_to_out(t) for t in teams]


@router.delete("/teams", status_code=status.HTTP_204_NO_CONTENT)
def clear_teams(
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    db.query(Team).filter_by(event_id=event.id).delete(synchronize_session=False)
    db.commit()
