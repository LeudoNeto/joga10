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
    db.commit()
    db.refresh(group)
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
