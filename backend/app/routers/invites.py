import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_group_admin
from ..models import GroupMembership, Invite, User
from ..schemas import InviteCreate, InviteOut, InvitePreview

router = APIRouter(tags=["invites"])


@router.post(
    "/groups/{group_id}/invites",
    response_model=InviteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    payload: InviteCreate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """RF03: generate a unique invite link granting the chosen role."""
    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=payload.expires_in_days)
    invite = Invite(
        group_id=membership.group_id,
        token=secrets.token_urlsafe(24),
        role=payload.role,
        created_by=membership.user_id,
        max_uses=payload.max_uses,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/groups/{group_id}/invites", response_model=list[InviteOut])
def list_invites(
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Invite)
        .filter_by(group_id=membership.group_id)
        .order_by(Invite.created_at.desc())
        .all()
    )


@router.delete(
    "/groups/{group_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_invite(
    invite_id: int,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    invite = db.get(Invite, invite_id)
    if invite is None or invite.group_id != membership.group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Convite não encontrado")
    invite.active = False
    db.commit()


def _validate(invite: Invite | None) -> tuple[bool, str | None]:
    if invite is None:
        return False, "Convite não encontrado"
    if not invite.active:
        return False, "Este convite foi revogado"
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        return False, "Este convite expirou"
    if invite.max_uses is not None and invite.uses >= invite.max_uses:
        return False, "Este convite atingiu o limite de usos"
    return True, None


@router.get("/invites/{token}", response_model=InvitePreview)
def preview_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(Invite).filter_by(token=token).first()
    valid, reason = _validate(invite)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Convite não encontrado")
    already = (
        db.query(GroupMembership)
        .filter_by(group_id=invite.group_id, user_id=user.id)
        .first()
        is not None
    )
    return InvitePreview(
        token=invite.token,
        group_id=invite.group_id,
        group_name=invite.group.name,
        role=invite.role,
        valid=valid,
        reason=reason,
        already_member=already,
    )


@router.post("/invites/{token}/accept", status_code=status.HTTP_200_OK)
def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Join the invite's group with the role encoded in the link."""
    invite = db.query(Invite).filter_by(token=token).first()
    valid, reason = _validate(invite)
    if not valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason or "Convite inválido")

    existing = (
        db.query(GroupMembership)
        .filter_by(group_id=invite.group_id, user_id=user.id)
        .first()
    )
    if existing:
        return {"group_id": invite.group_id, "role": existing.role, "joined": False}

    membership = GroupMembership(
        group_id=invite.group_id, user_id=user.id, role=invite.role
    )
    db.add(membership)
    invite.uses += 1
    db.commit()
    return {"group_id": invite.group_id, "role": invite.role, "joined": True}
