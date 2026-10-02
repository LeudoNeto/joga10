from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import STAFF_ROLES, Event, Group, GroupMembership, Role, User
from .security import decode_token

STAFF_ONLY = "Apenas administradores ou moderadores do grupo podem realizar esta ação"

# tokenUrl is informational (used by the OpenAPI docs "Authorize" button).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=True)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = decode_token(token)
    if subject is None:
        raise cred_exc
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise cred_exc
    user = db.get(User, user_id)
    if user is None:
        raise cred_exc
    return user


# ---------------------------------------------------------------------------
# Group-scoped guards (used by routers with a `group_id` path parameter)
# ---------------------------------------------------------------------------
def get_group(group_id: int, db: Session = Depends(get_db)) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    return group


def require_membership(
    group: Group = Depends(get_group),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupMembership:
    membership = (
        db.query(GroupMembership)
        .filter_by(group_id=group.id, user_id=user.id)
        .first()
    )
    if membership is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Você não faz parte deste grupo"
        )
    return membership


def require_group_admin(
    membership: GroupMembership = Depends(require_membership),
) -> GroupMembership:
    """RN03: only group admins may perform write operations."""
    if membership.role != Role.admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Apenas administradores do grupo podem realizar esta ação",
        )
    return membership


def require_group_staff(
    membership: GroupMembership = Depends(require_membership),
) -> GroupMembership:
    """Admins and moderators (photos, positions and match stats)."""
    if membership.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, STAFF_ONLY)
    return membership


# ---------------------------------------------------------------------------
# Event-scoped guards (used by routers with an `event_id` path parameter)
# ---------------------------------------------------------------------------
def get_event(event_id: int, db: Session = Depends(get_db)) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento não encontrado")
    return event


def require_event_membership(
    event: Event = Depends(get_event),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupMembership:
    membership = (
        db.query(GroupMembership)
        .filter_by(group_id=event.group_id, user_id=user.id)
        .first()
    )
    if membership is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Você não faz parte deste grupo"
        )
    return membership


def require_event_admin(
    membership: GroupMembership = Depends(require_event_membership),
) -> GroupMembership:
    if membership.role != Role.admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Apenas administradores do grupo podem realizar esta ação",
        )
    return membership


def require_event_staff(
    membership: GroupMembership = Depends(require_event_membership),
) -> GroupMembership:
    """Admins and moderators may register match stats and run the matches."""
    if membership.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, STAFF_ONLY)
    return membership
