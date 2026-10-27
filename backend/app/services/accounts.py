"""Who may set another user's password (group admins, see set_member_password).

A password belongs to the whole account, not to one group. So an admin may set
it only when they outrank the user in *every* active group the user is in: they
must be an admin there, and the group's creator when the user is an admin too.
A group's creator is never reachable: nobody else is the creator of that group.
"""

from typing import Optional

from sqlalchemy.orm import Session

from ..models import Group, GroupMembership, Role

CREATOR = "A senha do criador do grupo não pode ser alterada"
ADMIN = "Apenas o criador do grupo pode alterar a senha de administradores"
ELSEWHERE = "Esta pessoa também participa de outro grupo em que você não pode alterar a senha dela"


def _blocker(
    target: GroupMembership, group: Group, actor_id: int, actor_role: Optional[Role], current_id: int
) -> Optional[str]:
    if group.created_by == target.user_id:
        reason = CREATOR
    elif actor_role != Role.admin:
        reason = ELSEWHERE
    elif target.role == Role.admin and group.created_by != actor_id:
        reason = ADMIN
    else:
        return None
    return reason if group.id == current_id else ELSEWHERE


def password_blockers(
    db: Session, actor_id: int, group_id: int, target_ids: list[int]
) -> dict[int, Optional[str]]:
    """Why ``actor_id``, from group ``group_id``, may not set each target's
    password (None: allowed). The reason in the current group comes first."""
    rows = (
        db.query(GroupMembership, Group)
        .join(Group, Group.id == GroupMembership.group_id)
        .filter(
            Group.deleted_at.is_(None),
            GroupMembership.user_id.in_([actor_id, *target_ids]),
        )
        .all()
    )
    actor_roles = {m.group_id: m.role for m, _ in rows if m.user_id == actor_id}
    blockers: dict[int, Optional[str]] = {}
    for target_id in target_ids:
        groups = sorted(
            ((m, g) for m, g in rows if m.user_id == target_id),
            key=lambda mg: mg[1].id != group_id,  # current group first
        )
        blockers[target_id] = next(
            (
                reason
                for m, g in groups
                if (reason := _blocker(m, g, actor_id, actor_roles.get(g.id), group_id))
            ),
            None,
        )
    return blockers
