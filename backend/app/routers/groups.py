from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import STAFF_ONLY, get_current_user, require_group_admin, require_membership
from ..models import STAFF_ROLES, Event, Group, GroupMembership, Player, Role, User
from ..schemas import (
    GroupCreate,
    GroupDetail,
    GroupSummary,
    GroupUpdate,
    MemberOut,
    MemberPasswordUpdate,
    MemberPlayerUpdate,
    MemberRoleUpdate,
)
from ..security import hash_password
from ..services.accounts import password_blockers
from ..services.votes import clamp_votes, drop_votes

router = APIRouter(prefix="/groups", tags=["groups"])


def _summary(db: Session, group: Group, role: Role) -> GroupSummary:
    member_count = (
        db.query(GroupMembership).filter_by(group_id=group.id).count()
    )
    player_count = db.query(Player).filter_by(group_id=group.id).count()
    event_count = db.query(Event).filter_by(group_id=group.id).count()
    return GroupSummary(
        id=group.id,
        name=group.name,
        description=group.description,
        role=role,
        member_count=member_count,
        player_count=player_count,
        event_count=event_count,
        created_at=group.created_at,
        created_by=group.created_by,
        min_skill=group.min_skill,
        max_skill=group.max_skill,
    )


@router.get("", response_model=list[GroupSummary])
def list_my_groups(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """RF02: list every group the current user participates in."""
    memberships = (
        db.query(GroupMembership).filter_by(user_id=user.id).all()
    )
    result = []
    for m in memberships:
        if m.group is not None and m.group.deleted_at is None:
            result.append(_summary(db, m.group, m.role))
    return result


@router.post("", response_model=GroupDetail, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """RF02: the creator automatically becomes an admin of the new group."""
    group = Group(
        name=payload.name, description=payload.description, created_by=user.id
    )
    db.add(group)
    db.flush()
    membership = GroupMembership(
        group_id=group.id, user_id=user.id, role=Role.admin
    )
    db.add(membership)
    db.commit()
    db.refresh(group)
    return _detail(db, group, membership)


def _detail(db: Session, group: Group, viewer: GroupMembership) -> GroupDetail:
    summary = _summary(db, group, viewer.role)
    members = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id)
        .join(User, User.id == GroupMembership.user_id)
        .all()
    )
    others = [m.user_id for m in members if m.user_id != viewer.user_id]
    blockers = (
        password_blockers(db, viewer.user_id, group.id, others)
        if viewer.role == Role.admin
        else {}
    )
    member_out = [
        MemberOut(
            user_id=m.user_id,
            name=m.user.name,
            email=m.user.email,
            role=m.role,
            joined_at=m.joined_at,
            is_creator=m.user_id == group.created_by,
            player_id=m.player.id if m.player else None,
            player_name=m.player.name if m.player else None,
            player_photo_url=m.player.photo_url if m.player else None,
            can_set_password=m.user_id in blockers and blockers[m.user_id] is None,
        )
        for m in members
    ]
    return GroupDetail(**summary.model_dump(), members=member_out)


@router.get("/{group_id}", response_model=GroupDetail)
def get_group_detail(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    return _detail(db, membership.group, membership)


@router.patch("/{group_id}", response_model=GroupDetail)
def update_group(
    payload: GroupUpdate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    group = membership.group
    if payload.name is not None:
        group.name = payload.name
    if payload.description is not None:
        group.description = payload.description

    new_min = payload.min_skill if payload.min_skill is not None else group.min_skill
    new_max = payload.max_skill if payload.max_skill is not None else group.max_skill
    if new_min >= new_max:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "A nota mínima deve ser menor que a nota máxima",
        )
    if (new_min, new_max) != (group.min_skill, group.max_skill):
        group.min_skill, group.max_skill = new_min, new_max
        # Keep every player inside the new range (clamped to the nearest limit).
        players = db.query(Player).filter(Player.group_id == group.id)
        players.filter(Player.skill < new_min).update(
            {Player.skill: new_min}, synchronize_session=False
        )
        players.filter(Player.skill > new_max).update(
            {Player.skill: new_max}, synchronize_session=False
        )
        clamp_votes(db, group)
    db.commit()
    db.refresh(group)
    return _detail(db, group, membership)


@router.patch("/{group_id}/members/{user_id}", response_model=GroupDetail)
def update_member_role(
    user_id: int,
    payload: MemberRoleUpdate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Promote/demote a member (admin, moderator or member)."""
    group = membership.group
    target = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id, user_id=user_id)
        .first()
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membro não encontrado")
    if user_id == group.created_by:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O papel do criador do grupo não pode ser alterado",
        )
    if user_id == membership.user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Você não pode alterar o seu próprio papel"
        )
    target.role = payload.role
    db.commit()
    return _detail(db, group, membership)


@router.put("/{group_id}/members/{user_id}/player", response_model=GroupDetail)
def set_member_player(
    user_id: int,
    payload: MemberPlayerUpdate,
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    """Link a member to the group's Player that represents them.

    Any member may choose their *own* player once (it cannot be changed
    afterwards). Admins and moderators may set, change or clear the player of
    any member, including themselves.
    """
    group = membership.group
    target = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id, user_id=user_id)
        .first()
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membro não encontrado")

    if membership.role not in STAFF_ROLES:
        if user_id != membership.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, STAFF_ONLY)
        if target.player_id is not None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Seu jogador já foi definido. Apenas administradores ou "
                "moderadores podem alterá-lo",
            )
        if payload.player_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escolha um jogador")

    if payload.player_id is not None:
        player = db.get(Player, payload.player_id)
        if player is None or player.group_id != group.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
        owner = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.player_id == player.id,
                GroupMembership.id != target.id,
            )
            .first()
        )
        if owner is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Este jogador já está associado a {owner.user.name}",
            )
    target.player_id = payload.player_id
    if payload.player_id is not None:
        # Nobody votes on their own nota: discard a vote cast before the link.
        drop_votes(db, group.id, target.user_id, payload.player_id)
    db.commit()
    return _detail(db, group, membership)


@router.put("/{group_id}/members/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def set_member_password(
    user_id: int,
    payload: MemberPasswordUpdate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Admins set a new password for a member of the group (e.g. a forgotten
    one). The creator reaches admins too; see services.accounts for the rule
    across the other groups of the member."""
    group = membership.group
    target = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id, user_id=user_id)
        .first()
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membro não encontrado")
    if user_id == membership.user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Para alterar a sua própria senha, use o menu do seu usuário",
        )
    reason = password_blockers(db, membership.user_id, group.id, [user_id])[user_id]
    if reason:
        raise HTTPException(status.HTTP_403_FORBIDDEN, reason)
    target.user.password_hash = hash_password(payload.new_password)
    db.commit()


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Logical delete: the group and its data stay in the database, hidden."""
    group = membership.group
    if group.created_by != membership.user_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Apenas o criador do grupo pode excluí-lo",
        )
    group.deleted_at = datetime.utcnow()
    db.commit()


@router.delete("/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_group(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    if membership.group.created_by == membership.user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O criador não pode sair do próprio grupo; exclua-o se necessário",
        )
    drop_votes(db, membership.group_id, membership.user_id)
    db.delete(membership)
    db.commit()
