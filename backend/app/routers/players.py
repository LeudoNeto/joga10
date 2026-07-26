from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_group_admin, require_membership
from ..models import GroupMembership, Player
from ..schemas import (
    BulkResult,
    ImportPreview,
    ParsedPlayerRow,
    PlayerBulkCreate,
    PlayerCreate,
    PlayerOut,
    PlayerUpdate,
)
from ..services.import_players import parse_players

router = APIRouter(prefix="/groups/{group_id}/players", tags=["players"])


@router.get("", response_model=list[PlayerOut])
def list_players(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
):
    """RN03: any member can read the roster."""
    return (
        db.query(Player)
        .filter_by(group_id=membership.group_id)
        .order_by(Player.name.asc())
        .all()
    )


@router.post("", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
def create_player(
    payload: PlayerCreate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """RF04 / RN03: only admins may register players."""
    player = Player(
        group_id=membership.group_id,
        name=payload.name,
        position=payload.position,
        skill=payload.skill,
        active=payload.active,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.post("/import", response_model=ImportPreview)
async def import_preview(
    membership: GroupMembership = Depends(require_group_admin),
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Parse a pasted roster or an uploaded file (.txt/.csv/.xls/.xlsx) and
    return a preview. Nothing is written yet — the client confirms via /bulk."""
    content = await file.read() if file is not None else None
    filename = file.filename if file is not None else None
    try:
        parsed = parse_players(filename, content, text)
    except Exception as exc:  # malformed spreadsheet, bad encoding, etc.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Não foi possível ler o arquivo: {exc}",
        )
    rows = [
        ParsedPlayerRow(
            name=r.name,
            skill=r.skill,
            position=r.position,
            error=r.error,
            note=r.note,
        )
        for r in parsed
    ]
    valid = sum(1 for r in rows if not r.error and r.name)
    return ImportPreview(
        rows=rows, total=len(rows), valid=valid, invalid=len(rows) - valid
    )


@router.post("/bulk", response_model=BulkResult, status_code=status.HTTP_201_CREATED)
def bulk_create(
    payload: PlayerBulkCreate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Insert a validated batch of players (used to confirm an import)."""
    created = 0
    for item in payload.players:
        name = item.name.strip()
        if not name:
            continue
        db.add(
            Player(
                group_id=membership.group_id,
                name=name,
                position=(item.position or None),
                skill=max(0.0, min(10.0, item.skill)),
                active=True,
            )
        )
        created += 1
    db.commit()
    return BulkResult(created=created)


def _get_owned_player(db: Session, group_id: int, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.group_id != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
    return player


@router.put("/{player_id}", response_model=PlayerOut)
def update_player(
    player_id: int,
    payload: PlayerUpdate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    player = _get_owned_player(db, membership.group_id, player_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(player, field, value)
    db.commit()
    db.refresh(player)
    return player


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    player_id: int,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    player = _get_owned_player(db, membership.group_id, player_id)
    db.delete(player)
    db.commit()
