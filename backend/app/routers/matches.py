"""Matches of an event (RF07 / RF08 / RN05): the current match with its live
goals and assists, the rotation of teams and the match history."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_event, require_event_membership, require_event_staff
from ..models import Event, GroupMembership, Match, MatchStat, MatchStatus, Player, Role, Team
from ..schemas import (
    FinishOptions,
    FinishResult,
    GoalCreate,
    MatchDetail,
    MatchFinish,
    MatchOut,
    MatchStart,
    MatchStatOut,
    MatchTeamOut,
    NextMatchSuggestion,
    StatAdjust,
)
from ..services.event_state import (
    current_match,
    event_records,
    finished_matches,
    playable_teams,
)
from ..services.rotation import finish_decision, suggest_next

router = APIRouter(prefix="/events/{event_id}/matches", tags=["matches"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _team_ref(team: Team) -> MatchTeamOut:
    return MatchTeamOut(id=team.id, name=team.name, color=team.color, active=team.active)


def _match_out(match: Match) -> MatchOut:
    return MatchOut(
        id=match.id,
        event_id=match.event_id,
        sequence=match.sequence,
        status=match.status,
        team_a=_team_ref(match.team_a),
        team_b=_team_ref(match.team_b),
        score_a=match.score_a,
        score_b=match.score_b,
        staying=match.staying,
        created_at=match.created_at,
        played_at=match.played_at,
    )


def _match_detail(match: Match) -> MatchDetail:
    stats = [
        MatchStatOut(
            player_id=s.player_id, team_id=s.team_id, goals=s.goals, assists=s.assists
        )
        for s in match.stats
    ]
    return MatchDetail(**_match_out(match).model_dump(), stats=stats)


def _get_match(db: Session, event: Event, match_id: int) -> Match:
    match = db.get(Match, match_id)
    if match is None or match.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partida não encontrada")
    return match


def _ensure_in_progress(match: Match) -> None:
    if match.status != MatchStatus.in_progress.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A partida já foi finalizada")


def _ensure_side(match: Match, team_id: int) -> None:
    if team_id not in (match.team_a_id, match.team_b_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O time não está nesta partida")


def _ensure_player(db: Session, event: Event, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.group_id != event.group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
    return player


def _stat_for(match: Match, team_id: int, player_id: int) -> MatchStat:
    for stat in match.stats:
        if stat.team_id == team_id and stat.player_id == player_id:
            return stat
    stat = MatchStat(
        event_id=match.event_id,
        player_id=player_id,
        team_id=team_id,
        goals=0,
        assists=0,
    )
    match.stats.append(stat)
    return stat


def _refresh_score(match: Match) -> None:
    """The scoreboard is always the sum of the players' goals per side."""
    match.score_a = sum(s.goals for s in match.stats if s.team_id == match.team_a_id)
    match.score_b = sum(s.goals for s in match.stats if s.team_id == match.team_b_id)


def _suggestion(db: Session, event: Event) -> Optional[NextMatchSuggestion]:
    finished = finished_matches(db, event.id)
    suggestion = suggest_next(
        playable_teams(db, event.id), finished, event_records(db, event.id)
    )
    if suggestion is None:
        return None
    return NextMatchSuggestion(
        team_a_id=suggestion.team_a.id,
        team_b_id=suggestion.team_b.id,
        reason=suggestion.reason,
    )


# ---------------------------------------------------------------------------
# collection
# ---------------------------------------------------------------------------
@router.get("", response_model=list[MatchOut])
def list_matches(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    matches = (
        db.query(Match).filter_by(event_id=event.id).order_by(Match.sequence.asc()).all()
    )
    return [_match_out(m) for m in matches]


@router.get("/current", response_model=Optional[MatchDetail])
def get_current_match(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    match = current_match(db, event.id)
    return _match_detail(match) if match else None


@router.get("/suggestion", response_model=Optional[NextMatchSuggestion])
def get_next_suggestion(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """RF08: automatic next match (the team waiting the longest enters)."""
    return _suggestion(db, event)


@router.post("", response_model=MatchDetail, status_code=status.HTTP_201_CREATED)
def start_match(
    payload: MatchStart,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Start the next match: automatic when no team is given, else manual."""
    if current_match(db, event.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe uma partida em andamento")
    teams = {t.id: t for t in playable_teams(db, event.id)}

    if payload.team_a_id is None and payload.team_b_id is None:
        suggestion = _suggestion(db, event)
        if suggestion is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "São necessários ao menos dois times com jogadores",
            )
        team_a_id, team_b_id = suggestion.team_a_id, suggestion.team_b_id
    else:
        team_a_id, team_b_id = payload.team_a_id, payload.team_b_id
        if team_a_id is None or team_b_id is None or team_a_id == team_b_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escolha dois times diferentes")
        if team_a_id not in teams or team_b_id not in teams:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Os times precisam ser do evento e ter jogadores",
            )

    last = db.query(func.max(Match.sequence)).filter_by(event_id=event.id).scalar()
    match = Match(
        event_id=event.id,
        team_a_id=team_a_id,
        team_b_id=team_b_id,
        score_a=0,
        score_b=0,
        status=MatchStatus.in_progress.value,
        sequence=(last or 0) + 1,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return _match_detail(match)


# ---------------------------------------------------------------------------
# single match
# ---------------------------------------------------------------------------
@router.get("/{match_id}", response_model=MatchDetail)
def get_match(
    match_id: int,
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    return _match_detail(_get_match(db, event, match_id))


@router.post("/{match_id}/goals", response_model=MatchDetail)
def register_goal(
    match_id: int,
    payload: GoalCreate,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """RF07: a goal for ``team_id`` by ``scorer_id`` (optionally assisted)."""
    match = _get_match(db, event, match_id)
    _ensure_in_progress(match)
    _ensure_side(match, payload.team_id)
    _ensure_player(db, event, payload.scorer_id)
    if payload.assist_id is not None:
        if payload.assist_id == payload.scorer_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "O autor do gol não pode dar a assistência para si mesmo",
            )
        _ensure_player(db, event, payload.assist_id)
    _stat_for(match, payload.team_id, payload.scorer_id).goals += 1
    if payload.assist_id is not None:
        _stat_for(match, payload.team_id, payload.assist_id).assists += 1
    _refresh_score(match)
    db.commit()
    return _match_detail(match)


@router.post("/{match_id}/stats", response_model=MatchDetail)
def adjust_stats(
    match_id: int,
    payload: StatAdjust,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Manual +/- of goals and assists (deltas). With both deltas at zero it
    just adds the player to that side's lineup (a player lent to the team)."""
    match = _get_match(db, event, match_id)
    _ensure_in_progress(match)
    _ensure_side(match, payload.team_id)
    _ensure_player(db, event, payload.player_id)
    stat = _stat_for(match, payload.team_id, payload.player_id)
    stat.goals = max(0, stat.goals + payload.goals)
    stat.assists = max(0, stat.assists + payload.assists)
    _refresh_score(match)
    db.commit()
    return _match_detail(match)


@router.delete("/{match_id}/stats/{player_id}", response_model=MatchDetail)
def remove_from_lineup(
    match_id: int,
    player_id: int,
    team_id: int = Query(...),
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Remove a lent player that has no goals/assists in the match."""
    match = _get_match(db, event, match_id)
    _ensure_in_progress(match)
    for stat in list(match.stats):
        if stat.player_id == player_id and stat.team_id == team_id:
            if stat.goals or stat.assists:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Zere os gols e assistências do jogador antes de removê-lo",
                )
            match.stats.remove(stat)
    db.commit()
    return _match_detail(match)


@router.get("/{match_id}/finish-options", response_model=FinishOptions)
def get_finish_options(
    match_id: int,
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Who may stay after the match and what the rotation rules suggest."""
    match = _get_match(db, event, match_id)
    _ensure_in_progress(match)
    active = len(playable_teams(db, event.id))
    decision = finish_decision(
        match, event_records(db, event.id), active, event.wins_to_leave
    )
    return FinishOptions(
        score_a=match.score_a,
        score_b=match.score_b,
        winner=decision.winner,
        active_teams=active,
        wins_to_leave=event.wins_to_leave,
        streak_after=decision.streak_after,
        options=decision.options,
        default=decision.default,
        reason=decision.reason,
    )


@router.post("/{match_id}/finish", response_model=FinishResult)
def finish_match(
    match_id: int,
    payload: MatchFinish,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    match = _get_match(db, event, match_id)
    _ensure_in_progress(match)
    _refresh_score(match)
    decision = finish_decision(
        match,
        event_records(db, event.id),
        len(playable_teams(db, event.id)),
        event.wins_to_leave,
    )
    if payload.staying not in decision.options:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Opção inválida para esta partida")
    match.status = MatchStatus.finished.value
    match.staying = payload.staying
    match.played_at = datetime.utcnow()
    db.commit()
    return FinishResult(match=_match_out(match), suggestion=_suggestion(db, event))


@router.post("/{match_id}/reopen", response_model=MatchDetail)
def reopen_match(
    match_id: int,
    _m: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Undo a finish by mistake: only the last match, with no match running."""
    if current_match(db, event.id) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Finalize ou cancele a partida em andamento antes de reabrir outra",
        )
    match = _get_match(db, event, match_id)
    latest = db.query(func.max(Match.sequence)).filter_by(event_id=event.id).scalar()
    if match.sequence != latest:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Só é possível reabrir a última partida")
    if not (match.team_a.active and match.team_b.active):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Os times desta partida já foram substituídos"
        )
    match.status = MatchStatus.in_progress.value
    match.staying = None
    match.played_at = None
    db.commit()
    return _match_detail(match)


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: int,
    membership: GroupMembership = Depends(require_event_staff),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    """Cancel the current match (staff) or delete a finished one (admin)."""
    match = _get_match(db, event, match_id)
    if match.status == MatchStatus.finished.value and membership.role != Role.admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Apenas administradores podem excluir partidas finalizadas",
        )
    db.delete(match)
    db.commit()
