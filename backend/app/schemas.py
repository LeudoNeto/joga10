from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Role


# ---------------------------------------------------------------------------
# Auth / Users
# ---------------------------------------------------------------------------
class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None


class MemberOut(BaseModel):
    user_id: int
    name: str
    email: EmailStr
    role: Role
    joined_at: datetime


class GroupSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    role: Role  # the requesting user's role in this group
    member_count: int
    player_count: int
    event_count: int
    created_at: datetime


class GroupDetail(GroupSummary):
    members: list[MemberOut]


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------
class InviteCreate(BaseModel):
    role: Role = Role.member
    max_uses: Optional[int] = Field(default=None, ge=1)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    role: Role
    max_uses: Optional[int]
    uses: int
    expires_at: Optional[datetime]
    active: bool
    created_at: datetime


class InvitePreview(BaseModel):
    token: str
    group_id: int
    group_name: str
    role: Role
    valid: bool
    reason: Optional[str] = None
    already_member: bool = False


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------
class PlayerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    position: Optional[str] = Field(default=None, max_length=50)
    skill: float = Field(default=5.0, ge=0, le=10)
    active: bool = True


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    position: Optional[str] = Field(default=None, max_length=50)
    skill: Optional[float] = Field(default=None, ge=0, le=10)
    active: Optional[bool] = None


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    name: str
    position: Optional[str]
    skill: float
    active: bool
    created_at: datetime


# Bulk import ----------------------------------------------------------------
class ParsedPlayerRow(BaseModel):
    name: str
    skill: float
    position: Optional[str] = None
    error: Optional[str] = None  # fatal: row cannot be imported
    note: Optional[str] = None   # non-fatal adjustment (e.g. clamped nota)


class ImportPreview(BaseModel):
    rows: list[ParsedPlayerRow]
    total: int
    valid: int
    invalid: int


class PlayerBulkItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    skill: float = Field(default=5.0, ge=0, le=10)
    position: Optional[str] = Field(default=None, max_length=50)


class PlayerBulkCreate(BaseModel):
    players: list[PlayerBulkItem]


class BulkResult(BaseModel):
    created: int


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    date: date


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    date: Optional[date] = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    title: str
    date: date
    created_at: datetime


# ---------------------------------------------------------------------------
# Teams / Draw
# ---------------------------------------------------------------------------
class TeamPlayerOut(BaseModel):
    id: int
    name: str
    position: Optional[str]
    skill: float


class TeamOut(BaseModel):
    id: int
    event_id: int
    name: str
    color: Optional[str]
    players: list[TeamPlayerOut]
    total_skill: float
    avg_skill: float


class DrawRequest(BaseModel):
    mode: Literal["random", "balanced"] = "balanced"
    num_teams: int = Field(default=2, ge=2, le=12)
    # Optional explicit selection of players; when omitted all active players
    # of the group take part in the draw.
    player_ids: Optional[list[int]] = None
