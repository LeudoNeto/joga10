import secrets

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_group_admin, require_group_staff, require_membership
from ..models import Group, GroupMembership, Player, PlayerPhoto, Role
from ..schemas import (
    BulkResult,
    ImportPreview,
    NameMatchResult,
    ParsedPlayerRow,
    PlayerBulkCreate,
    PlayerCreate,
    PlayerOut,
    PlayerUpdate,
)
from ..services.import_players import (
    ParsedRow,
    SkillRange,
    parse_names,
    parse_players,
    plan_import,
)
from ..services.name_match import match_names
from ..services.photos import MAX_UPLOAD_BYTES, PhotoError, process_photo

router = APIRouter(prefix="/groups/{group_id}/players", tags=["players"])

# Fields a moderator may change (the photo has its own endpoints).
MODERATOR_FIELDS = {"position"}


def _range(group: Group) -> SkillRange:
    return SkillRange(group.min_skill, group.max_skill)


def _check_skill(group: Group, skill: float) -> float:
    if not group.min_skill <= skill <= group.max_skill:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"A nota deve estar entre {group.min_skill:g} e {group.max_skill:g}",
        )
    return skill


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
    group = membership.group
    skill = _range(group).default if payload.skill is None else payload.skill
    player = Player(
        group_id=membership.group_id,
        name=payload.name,
        position=payload.position,
        skill=_check_skill(group, skill),
        active=payload.active,
    )
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


def _group_players(db: Session, group_id: int) -> list[Player]:
    return db.query(Player).filter_by(group_id=group_id).all()


def _read_upload(file: UploadFile | None, limit: int | None = None) -> tuple[str | None, bytes | None]:
    if file is None:
        return None, None
    return file.filename, file.file.read(limit if limit is not None else -1)


@router.post("/import", response_model=ImportPreview)
def import_preview(
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Parse a pasted roster or an uploaded file (.txt/.csv/.xls/.xlsx) and
    preview what confirming does with each row, compared by name with the
    group: update the nota, create the player or ignore the row (ordered in
    that way). Nothing is written yet — the client confirms via /bulk."""
    filename, content = _read_upload(file)
    try:
        parsed = parse_players(filename, content, text, _range(membership.group))
    except Exception as exc:  # malformed spreadsheet, bad encoding, etc.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Não foi possível ler o arquivo: {exc}",
        )
    plan = plan_import(parsed, _group_players(db, membership.group_id))
    rows = [
        ParsedPlayerRow(
            name=p.row.name,
            skill=p.row.skill,
            position=p.row.position,
            error=p.row.error,
            note=p.row.note,
            has_skill=p.row.has_skill,
            action=p.action,
            player_id=p.player_id,
            current_skill=p.current_skill,
            reason=p.reason,
        )
        for p in plan
    ]
    count = {a: sum(1 for r in rows if r.action == a) for a in ("update", "create", "ignore")}
    invalid = sum(1 for r in rows if r.error or not r.name)
    return ImportPreview(
        rows=rows,
        total=len(rows),
        valid=len(rows) - invalid,
        invalid=invalid,
        to_update=count["update"],
        to_create=count["create"],
        ignored=count["ignore"],
    )


@router.post("/bulk", response_model=BulkResult, status_code=status.HTTP_201_CREATED)
def bulk_create(
    payload: PlayerBulkCreate,
    membership: GroupMembership = Depends(require_group_admin),
    db: Session = Depends(get_db),
):
    """Confirm an import: same rules as the preview (matched by name, same
    nota -> ignored, different nota -> updated, unknown -> created). An item
    without ``skill`` only creates (default nota), never updates."""
    rng = _range(membership.group)
    rows = [
        ParsedRow(
            name=item.name.strip(),
            skill=rng.default if item.skill is None else rng.clamp(item.skill),
            position=item.position or None,
            error=None if item.name.strip() else "linha sem nome",
            has_skill=item.skill is not None,
        )
        for item in payload.players
    ]
    existing = {p.id: p for p in _group_players(db, membership.group_id)}
    created: list[Player] = []
    updated = ignored = 0
    for planned in plan_import(rows, list(existing.values())):
        if planned.action == "create":
            player = Player(
                group_id=membership.group_id,
                name=planned.row.name,
                position=planned.row.position,
                skill=planned.row.skill,
                active=True,
            )
            db.add(player)
            created.append(player)
        elif planned.action == "update":
            existing[planned.player_id].skill = planned.row.skill
            updated += 1
        else:
            ignored += 1
    db.commit()
    for player in created:
        db.refresh(player)
    return BulkResult(
        created=len(created),
        updated=updated,
        ignored=ignored,
        players=[PlayerOut.model_validate(p) for p in created],
    )


@router.post("/match-names", response_model=NameMatchResult)
def match_player_names(
    membership: GroupMembership = Depends(require_membership),
    db: Session = Depends(get_db),
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Resolve a list of names (pasted or .txt/.csv/.xls/.xlsx) to players of
    the group, e.g. to select who takes part in a draw. Read-only."""
    filename, content = _read_upload(file)
    try:
        names = parse_names(filename, content, text)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Não foi possível ler o arquivo: {exc}"
        )
    rows = match_names(names, _group_players(db, membership.group_id))
    matched = sum(1 for r in rows if r.status in ("matched", "similar"))
    pending = sum(1 for r in rows if r.status in ("ambiguous", "not_found"))
    return NameMatchResult(rows=rows, matched=matched, pending=pending)


def _get_owned_player(db: Session, group_id: int, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.group_id != group_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado")
    return player


@router.put("/{player_id}", response_model=PlayerOut)
def update_player(
    player_id: int,
    payload: PlayerUpdate,
    membership: GroupMembership = Depends(require_group_staff),
    db: Session = Depends(get_db),
):
    """Admins edit everything; moderators only the position."""
    player = _get_owned_player(db, membership.group_id, player_id)
    data = payload.model_dump(exclude_unset=True)
    if membership.role == Role.moderator and set(data) - MODERATOR_FIELDS:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Moderadores só podem alterar a posição e a foto dos jogadores",
        )
    if data.get("skill") is not None:
        _check_skill(membership.group, data["skill"])
    for field, value in data.items():
        if field == "position" and value is not None:
            value = value.strip() or None
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
    # Migrated databases lack the ON DELETE SET NULL FK: unlink explicitly.
    db.query(GroupMembership).filter(GroupMembership.player_id == player.id).update(
        {GroupMembership.player_id: None}, synchronize_session=False
    )
    db.delete(player)
    db.commit()


@router.post("/{player_id}/photo", response_model=PlayerOut)
def upload_photo(
    player_id: int,
    file: UploadFile = File(...),
    membership: GroupMembership = Depends(require_group_staff),
    db: Session = Depends(get_db),
):
    """Set/replace the (optional) player photo. Admins and moderators."""
    player = _get_owned_player(db, membership.group_id, player_id)
    _, content = _read_upload(file, MAX_UPLOAD_BYTES + 1)
    try:
        data, content_type = process_photo(content)
    except PhotoError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    if player.photo is None:
        player.photo = PlayerPhoto(data=data, content_type=content_type)
    else:
        player.photo.data = data
        player.photo.content_type = content_type
    # New key on every upload: old URLs stop working and caches never go stale.
    player.photo_key = secrets.token_urlsafe(24)
    db.commit()
    db.refresh(player)
    return player


@router.delete("/{player_id}/photo", response_model=PlayerOut)
def delete_photo(
    player_id: int,
    membership: GroupMembership = Depends(require_group_staff),
    db: Session = Depends(get_db),
):
    player = _get_owned_player(db, membership.group_id, player_id)
    player.photo = None
    player.photo_key = None
    db.commit()
    db.refresh(player)
    return player
