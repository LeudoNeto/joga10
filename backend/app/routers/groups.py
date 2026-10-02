from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_group_admin, require_membership
from ..models import Event, Group, GroupMembership, Player, Role, User
from ..schemas import (
    GroupCreate,
    GroupDetail,
    GroupSummary,
    GroupUpdate,
    MemberOut,
    MemberRoleUpdate,
)

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
        if m.group is not None:
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
    return _detail(db, group, Role.admin)


def _detail(db: Session, group: Group, role: Role) -> GroupDetail:
    summary = _summary(db, group, role)
    members = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id)
        .join(User, User.id == GroupMembership.user_id)
        .all()
    )
    member_out = [
        MemberOut(
            user_id=m.user_id,
            name=m.user.name,
            email=m.user.email,
            role=m.role,
            joined_at=m.joined_at,
            is_creator=m.user_id == group.created_by,
        )
        for m in members
    ]
    return GroupDetail(**summary.model_dump(), members=member_out)


@router.get("/{group_id}", response_model=GroupDetail)
def get_group_detail(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    return _detail(db, membership.group, membership.role)


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
    db.commit()
    db.refresh(group)
    return _detail(db, group, membership.role)


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
    return _detail(db, group, membership.role)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    group = membership.group
    if group.created_by != membership.user_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Apenas o criador do grupo pode excluí-lo",
        )
    db.delete(group)
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
    db.delete(membership)
    db.commit()
