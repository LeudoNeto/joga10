from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_membership, require_event_staff
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
from ..schemas import (
    ManualStatUpdate,
    RankingRow,
    StatImportApply,
    StatImportPreview,
    StatImportRow,
)
from ..services.event_state import active_teams
from ..services.import_stats import MAX_VALUE, parse_stats
from ..services.name_match import match_names
from ..services.ranking import raw_points, scale

router = APIRouter(prefix="/events/{event_id}", tags=["stats"])


def _team_of(db: Session, event: Event) -> dict[int, Team]:
    team_of: dict[int, Team] = {}
    for team in active_teams(db, event.id):
        for member in team.members:
            team_of[member.player_id] = team
    return team_of


def _ranking(db: Session, event: Event) -> list[RankingRow]:
    team_of = _team_of(db, event)
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


def _ensure_no_matches(db: Session, event: Event) -> None:
    if db.query(Match).filter(Match.event_id == event.id).count() > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Não é permitido alterar estatísticas manuais quando já existem partidas cadastradas no evento.",
        )


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
    return _ranking(db, event)


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
    _ensure_no_matches(db, event)

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

    pts = raw_points(stat.goals, stat.assists, player.position)
    team = _team_of(db, event).get(player.id)
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


@router.post("/stats/import", response_model=StatImportPreview)
def preview_stats_import(
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Read goals and assists from a pasted list or a .txt/.csv/.xls/.xlsx
    file and resolve the names to the group's players. Nothing is written yet
    (the client confirms via /stats/bulk). Same roles as editing the stats of
    other players, and only while the event has no matches."""
    _ensure_no_matches(db, event)
    try:
        parsed = parse_stats(file.filename if file else None, file.file.read() if file else None, text)
    except Exception as exc:  # malformed spreadsheet, bad encoding, etc.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Não foi possível ler o arquivo: {exc}")
    valid = [r for r in parsed if not r.error]
    players = db.query(Player).filter_by(group_id=event.group_id).all()
    matched = iter(match_names([r.name for r in valid], players))
    rows = []
    for r in parsed:
        match = None if r.error else next(matched)
        rows.append(
            StatImportRow(
                input=r.name,
                goals=r.goals,
                assists=r.assists,
                error=r.error,
                status=match.status if match else None,
                player_id=match.player_id if match else None,
                candidates=match.candidates if match else [],
            )
        )
    return StatImportPreview(rows=rows)


@router.post("/stats/bulk", response_model=list[RankingRow])
def import_stats(
    payload: StatImportApply,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Confirm a stats import (see StatImportApply.mode); returns the ranking."""
    _ensure_no_matches(db, event)
    ids = [item.player_id for item in payload.stats]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jogador repetido na importação.")
    found = {
        pid
        for (pid,) in db.query(Player.id).filter(
            Player.id.in_(ids), Player.group_id == event.group_id
        )
    }
    if found != set(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado neste grupo.")

    current = {
        s.player_id: s
        for s in db.query(EventManualStat).filter(EventManualStat.event_id == event.id)
    }
    if payload.mode == "replace":
        for player_id, stat in current.items():
            if player_id not in found:
                db.delete(stat)
    for item in payload.stats:
        stat = current.get(item.player_id)
        if stat is None:
            stat = EventManualStat(event_id=event.id, player_id=item.player_id, goals=0, assists=0)
            db.add(stat)
        if payload.mode == "add":
            stat.goals = min(stat.goals + item.goals, MAX_VALUE)
            stat.assists = min(stat.assists + item.assists, MAX_VALUE)
        else:
            stat.goals, stat.assists = item.goals, item.assists
    db.commit()
    return _ranking(db, event)
