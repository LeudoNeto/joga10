from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Role

# Absolute bounds for a group's nota range (each group picks min/max inside).
SKILL_FLOOR = 0.0
SKILL_CEIL = 100.0


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
    min_skill: Optional[float] = Field(default=None, ge=SKILL_FLOOR, le=SKILL_CEIL)
    max_skill: Optional[float] = Field(default=None, ge=SKILL_FLOOR, le=SKILL_CEIL)


class MemberOut(BaseModel):
    user_id: int
    name: str
    email: EmailStr
    role: Role
    joined_at: datetime
    is_creator: bool = False


class MemberRoleUpdate(BaseModel):
    role: Role


class GroupSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    role: Role  # the requesting user's role in this group
    member_count: int
    player_count: int
    event_count: int
    created_at: datetime
    created_by: int
    min_skill: float
    max_skill: float


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
    # None -> middle of the group's range. Validated against the group range.
    skill: Optional[float] = Field(default=None, ge=SKILL_FLOOR, le=SKILL_CEIL)
    active: bool = True


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    position: Optional[str] = Field(default=None, max_length=50)
    skill: Optional[float] = Field(default=None, ge=SKILL_FLOOR, le=SKILL_CEIL)
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
    photo_url: Optional[str] = None


# Bulk import ----------------------------------------------------------------
class ParsedPlayerRow(BaseModel):
    name: str
    skill: float
    position: Optional[str] = None
    error: Optional[str] = None  # fatal: row cannot be imported
    note: Optional[str] = None   # non-fatal adjustment (e.g. clamped nota)
    has_skill: bool = True  # False: no/invalid nota in the input (default used)
    # What confirming does with the row, compared by name with the group:
    action: Literal["update", "create", "ignore"] = "create"
    player_id: Optional[int] = None  # existing player (update / ignore)
    current_skill: Optional[float] = None  # its nota today
    reason: Optional[str] = None  # why it is ignored (or a remark)


class ImportPreview(BaseModel):
    rows: list[ParsedPlayerRow]  # ordered: update, create, ignore
    total: int
    valid: int
    invalid: int
    to_update: int = 0
    to_create: int = 0
    ignored: int = 0


class PlayerBulkItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    skill: Optional[float] = Field(default=None, ge=SKILL_FLOOR, le=SKILL_CEIL)
    position: Optional[str] = Field(default=None, max_length=50)


class PlayerBulkCreate(BaseModel):
    players: list[PlayerBulkItem]


class BulkResult(BaseModel):
    created: int
    updated: int = 0
    ignored: int = 0
    players: list[PlayerOut] = []  # the created ones


# Selection import (names only) ----------------------------------------------
class NameCandidate(BaseModel):
    id: int
    name: str


class NameMatchRow(BaseModel):
    input: str
    # matched: exact name | similar: unique close match | ambiguous: several
    # candidates | not_found | duplicate: same player as an earlier line
    status: Literal["matched", "similar", "ambiguous", "not_found", "duplicate"]
    player_id: Optional[int] = None
    candidates: list[NameCandidate] = []


class NameMatchResult(BaseModel):
    rows: list[NameMatchRow]
    matched: int
    pending: int  # ambiguous or not found


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    date: date


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    date: Optional[date] = None
    wins_to_leave: Optional[int] = Field(default=None, ge=0, le=20)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    title: str
    date: date
    created_at: datetime
    draw_mode: Optional[str] = None
    draw_proven: bool = True
    use_substitutes: bool = False
    wins_to_leave: int = 0


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------
class TeamPlayerOut(BaseModel):
    id: int
    name: str
    position: Optional[str]
    skill: float
    photo_url: Optional[str] = None


class TeamStats(BaseModel):
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    streak: int = 0  # current consecutive wins on the field


class TeamOut(BaseModel):
    id: int
    event_id: int
    name: str
    color: Optional[str]
    active: bool = True
    players: list[TeamPlayerOut]
    total_skill: float
    avg_skill: float
    stats: TeamStats = TeamStats()


class TeamsSave(BaseModel):
    """Teams computed on the client (random / heuristic / optimal balance)."""

    mode: Literal["random", "heuristic", "optimal"]
    proven: bool = True
    use_substitutes: bool = False
    teams: list[list[int]] = Field(min_length=2, max_length=12)


class TeamCreate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------
Side = Literal["a", "b"]
Staying = Literal["a", "b", "none", "both"]


class MatchTeamOut(BaseModel):
    id: int
    name: str
    color: Optional[str]
    active: bool


class MatchOut(BaseModel):
    id: int
    event_id: int
    sequence: int
    status: str
    team_a: MatchTeamOut
    team_b: MatchTeamOut
    score_a: int
    score_b: int
    staying: Optional[Staying] = None
    created_at: datetime
    played_at: Optional[datetime] = None


class MatchStatOut(BaseModel):
    player_id: int
    team_id: Optional[int]
    goals: int
    assists: int


class MatchDetail(MatchOut):
    stats: list[MatchStatOut]


class MatchStart(BaseModel):
    """Both ids empty -> automatic choice (team waiting the longest enters)."""

    team_a_id: Optional[int] = None
    team_b_id: Optional[int] = None


class GoalCreate(BaseModel):
    team_id: int
    scorer_id: int
    assist_id: Optional[int] = None


class StatAdjust(BaseModel):
    team_id: int
    player_id: int
    goals: int = Field(default=0, ge=-50, le=50)  # deltas
    assists: int = Field(default=0, ge=-50, le=50)


class FinishOptions(BaseModel):
    score_a: int
    score_b: int
    winner: Optional[Side]  # None on a draw
    active_teams: int
    wins_to_leave: int
    streak_after: int  # winner's consecutive wins counting this match
    options: list[Staying]
    default: Optional[Staying]  # None: the user must decide (draw)
    reason: str


class MatchFinish(BaseModel):
    staying: Staying


class NextMatchSuggestion(BaseModel):
    team_a_id: int
    team_b_id: int
    reason: str


class FinishResult(BaseModel):
    match: MatchOut
    suggestion: Optional[NextMatchSuggestion] = None


# ---------------------------------------------------------------------------
# Stats / ranking
# ---------------------------------------------------------------------------
class RankingRow(BaseModel):
    rank: int
    player_id: int
    name: str
    position: Optional[str]
    photo_url: Optional[str]
    team_id: Optional[int]
    team_name: Optional[str]
    team_color: Optional[str]
    goals: int
    assists: int
    points: int  # raw points from the formula
    score: int  # 0-100, leader = 100
