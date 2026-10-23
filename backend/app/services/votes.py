"""Nota voting: each member rates the other players of the group and the
average of the votes (the "nota dinâmica") is stored on the player, as a
suggestion that admins may apply to the real nota used by the draws.

The helpers below keep ``Player.vote_skill`` / ``vote_count`` in sync with the
votes. They only touch the session; the caller commits.
"""

from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Group, Player, PlayerVote


def refresh_vote_skills(db: Session, player_ids: Iterable[int]) -> None:
    """Recompute the average (ignoring "Não sei") of the given players."""
    ids = set(player_ids)
    if not ids:
        return
    db.flush()  # the session does not autoflush: count pending vote changes
    rows = (
        db.query(PlayerVote.player_id, func.avg(PlayerVote.skill), func.count(PlayerVote.skill))
        .filter(PlayerVote.player_id.in_(ids), PlayerVote.skill.isnot(None))
        .group_by(PlayerVote.player_id)
        .all()
    )
    stats = {player_id: (avg, count) for player_id, avg, count in rows}
    for player in db.query(Player).filter(Player.id.in_(ids)):
        avg, count = stats.get(player.id, (None, 0))
        player.vote_skill = None if avg is None else round(float(avg), 2)
        player.vote_count = count


def drop_votes(
    db: Session, group_id: int, voter_id: int, player_id: Optional[int] = None
) -> None:
    """Delete the votes of a member in a group (only the one on ``player_id``
    when given) and refresh the affected players. Used when the member leaves
    the group, or becomes that player (nobody votes on themselves)."""
    query = db.query(PlayerVote).filter_by(group_id=group_id, voter_id=voter_id)
    if player_id is not None:
        query = query.filter_by(player_id=player_id)
    affected = [pid for (pid,) in query.with_entities(PlayerVote.player_id)]
    if affected:
        query.delete(synchronize_session=False)
        refresh_vote_skills(db, affected)


def clamp_votes(db: Session, group: Group) -> None:
    """Keep the votes inside a new nota range (like the players' notas)."""
    votes = db.query(PlayerVote).filter(PlayerVote.group_id == group.id)
    votes.filter(PlayerVote.skill < group.min_skill).update(
        {PlayerVote.skill: group.min_skill}, synchronize_session=False
    )
    votes.filter(PlayerVote.skill > group.max_skill).update(
        {PlayerVote.skill: group.max_skill}, synchronize_session=False
    )
    refresh_vote_skills(
        db, (pid for (pid,) in db.query(Player.id).filter(Player.group_id == group.id))
    )
