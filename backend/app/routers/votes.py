from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import check_skill, require_group_admin, require_membership
from ..models import GroupMembership, Player, PlayerVote
from ..schemas import PlayerOut, VoteApply, VoteOut, VotesSave, VoteSummary, VoteSummaryRow
from ..services.votes import refresh_vote_skills

router = APIRouter(prefix="/groups/{group_id}/votes", tags=["votes"])


def _my_votes(db: Session, membership: GroupMembership) -> list[PlayerVote]:
    return (
        db.query(PlayerVote)
        .filter_by(group_id=membership.group_id, voter_id=membership.user_id)
        .all()
    )


def _group_players(db: Session, group_id: int, ids) -> list[Player]:
    """The players ``ids`` of the group; 404 when any of them is missing."""
    ids = set(ids)
    players = db.query(Player).filter(Player.group_id == group_id, Player.id.in_(ids)).all()
    if len(players) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
    return players


@router.get("", response_model=list[VoteOut])
def my_votes(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    """The current member's votes ("Não sei" has ``skill`` None). Votes are
    private: nobody else can read them, admins only see the averages."""
    return _my_votes(db, membership)


@router.put("", response_model=list[VoteOut])
def save_votes(
    payload: VotesSave,
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    """Create or change the current member's votes and refresh the nota
    dinâmica of the players involved. Players left out keep their vote."""
    if membership.player_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Escolha o seu jogador antes de votar"
        )
    group = membership.group
    items = {v.player_id: v.skill for v in payload.votes}  # last one wins
    if membership.player_id in items:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Você não pode votar na sua própria nota"
        )
    _group_players(db, group.id, items)
    for skill in items.values():
        if skill is not None:
            check_skill(group, skill)

    existing = {
        v.player_id: v
        for v in db.query(PlayerVote).filter(
            PlayerVote.voter_id == membership.user_id,
            PlayerVote.player_id.in_(items),
        )
    }
    for player_id, skill in items.items():
        vote = existing.get(player_id)
        if vote is None:
            db.add(
                PlayerVote(
                    group_id=group.id,
                    voter_id=membership.user_id,
                    player_id=player_id,
                    skill=skill,
                )
            )
        elif vote.skill != skill:
            vote.skill = skill
    refresh_vote_skills(db, items)
    db.commit()
    return _my_votes(db, membership)


@router.get("/summary", response_model=VoteSummary)
def votes_summary(
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Current nota and vote average of every player, for the admin to apply."""
    group_id = membership.group_id
    unknown = dict(
        db.query(PlayerVote.player_id, func.count())
        .filter(PlayerVote.group_id == group_id, PlayerVote.skill.is_(None))
        .group_by(PlayerVote.player_id)
        .all()
    )
    voters = (
        db.query(func.count(func.distinct(PlayerVote.voter_id)))
        .filter(PlayerVote.group_id == group_id, PlayerVote.skill.isnot(None))
        .scalar()
    )
    players = db.query(Player).filter_by(group_id=group_id).order_by(Player.name.asc())
    return VoteSummary(
        voters=voters or 0,
        players=[
            VoteSummaryRow(
                player_id=p.id,
                name=p.name,
                position=p.position,
                photo_url=p.photo_url,
                active=p.active,
                skill=p.skill,
                vote_skill=p.vote_skill,
                vote_count=p.vote_count,
                unknown_count=unknown.get(p.id, 0),
            )
            for p in players
        ],
    )


@router.post("/apply", response_model=list[PlayerOut])
def apply_votes(
    payload: VoteApply,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Set the real nota of the chosen players: the vote average accepted by
    the admin or a value typed by them. Players left out keep their nota."""
    group = membership.group
    items = {u.player_id: check_skill(group, u.skill) for u in payload.updates}
    players = _group_players(db, group.id, items)
    for player in players:
        player.skill = items[player.id]
    db.commit()
    for player in players:
        db.refresh(player)
    return players
