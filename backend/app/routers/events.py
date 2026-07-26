from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import (
    get_event,
    require_event_admin,
    require_event_membership,
    require_group_admin,
    require_membership,
)
from ..models import Event, GroupMembership
from ..schemas import EventCreate, EventOut, EventUpdate

# Group-scoped: create / list events for a group
group_router = APIRouter(prefix="/groups/{group_id}/events", tags=["events"])
# Event-scoped: operate on a single event
event_router = APIRouter(prefix="/events/{event_id}", tags=["events"])


@group_router.get("", response_model=list[EventOut])
def list_events(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    return (
        db.query(Event)
        .filter_by(group_id=membership.group_id)
        .order_by(Event.date.desc(), Event.id.desc())
        .all()
    )


@group_router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """RF05 / RN03: only admins create events."""
    event = Event(
        group_id=membership.group_id, title=payload.title, date=payload.date
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@event_router.get("", response_model=EventOut)
def read_event(
    _m: GroupMembership = Depends(require_event_membership),
    event: Event = Depends(get_event),
):
    return event


@event_router.patch("", response_model=EventOut)
def update_event(
    payload: EventUpdate,
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    if payload.title is not None:
        event.title = payload.title
    if payload.date is not None:
        event.date = payload.date
    db.commit()
    db.refresh(event)
    return event


@event_router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    _m: GroupMembership = Depends(require_event_admin),
    event: Event = Depends(get_event),
    db: Session = Depends(get_db),
):
    db.delete(event)
    db.commit()
