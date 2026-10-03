import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.orm import relationship

from .database import Base


class Role(str, enum.Enum):
    """Role scoped to a single group (RN02)."""

    admin = "admin"
    # Member with extra write access: player photos/positions and match stats.
    moderator = "moderator"
    member = "member"


# Roles allowed to operate matches (register goals/assists, finish, next match)
# and to change player photos and positions.
STAFF_ROLES = (Role.admin, Role.moderator)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    memberships = relationship(
        "GroupMembership", back_populates="user", cascade="all, delete-orphan"
    )


class Group(Base):
    # "groups" is a reserved word in MySQL 8.0 (window functions), so the
    # physical table uses the Portuguese domain name to avoid quoting issues.
    __tablename__ = "grupos"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Allowed range for player notas in this group (e.g. 0-10 or 0-5).
    min_skill = Column(Float, default=0.0, nullable=False, server_default=text("0"))
    max_skill = Column(Float, default=10.0, nullable=False, server_default=text("10"))

    memberships = relationship(
        "GroupMembership", back_populates="group", cascade="all, delete-orphan"
    )
    players = relationship(
        "Player", back_populates="group", cascade="all, delete-orphan"
    )
    events = relationship("Event", back_populates="group", cascade="all, delete-orphan")
    invites = relationship(
        "Invite", back_populates="group", cascade="all, delete-orphan"
    )


class GroupMembership(Base):
    """Links a User to a Group with a role. A user may hold different roles in
    different groups (RN02)."""

    __tablename__ = "group_memberships"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(Role), default=Role.member, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    # The group's Player that represents this user ("Seu Jogador"). A player
    # can be claimed by a single member. Members choose it once; afterwards
    # only admins/moderators can change it.
    player_id = Column(
        Integer,
        ForeignKey("players.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    group = relationship("Group", back_populates="memberships")
    user = relationship("User", back_populates="memberships")
    player = relationship("Player")


class Invite(Base):
    """Shareable invite link that grants a given role when accepted (RF03)."""

    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(64), unique=True, index=True, nullable=False)
    role = Column(Enum(Role), default=Role.member, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    max_uses = Column(Integer, nullable=True)  # None == unlimited
    uses = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("Group", back_populates="invites")


class Player(Base):
    """A logical player profile inside a group. Not tied to auth credentials
    (RN01)."""

    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    position = Column(String(50), nullable=True)
    skill = Column(Float, default=5.0, nullable=False)  # nota (within the group range)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Random, unguessable key of the current photo (changes on every upload),
    # used as a capability URL so <img> tags can load it without a token.
    photo_key = Column(String(64), unique=True, index=True, nullable=True)
    card_template = Column(String(50), nullable=True)

    group = relationship("Group", back_populates="players")
    photo = relationship(
        "PlayerPhoto",
        uselist=False,
        back_populates="player",
        cascade="all, delete-orphan",
    )

    @property
    def photo_url(self) -> str | None:
        return f"/api/photos/{self.photo_key}" if self.photo_key else None


class PlayerPhoto(Base):
    """Optional player photo, stored in the database (normalized JPEG)."""

    __tablename__ = "player_photos"

    player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), primary_key=True
    )
    content_type = Column(String(50), nullable=False)
    data = Column(LargeBinary().with_variant(MEDIUMBLOB(), "mysql"), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    player = relationship("Player", back_populates="photo")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("grupos.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(160), nullable=False)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Settings of the last draw (random | heuristic | optimal).
    draw_mode = Column(String(20), nullable=True)
    draw_proven = Column(Boolean, default=True, nullable=False, server_default=text("1"))
    use_substitutes = Column(
        Boolean, default=False, nullable=False, server_default=text("0")
    )
    # Consecutive wins after which a team leaves the field (0 = no limit).
    wins_to_leave = Column(Integer, default=0, nullable=False, server_default=text("0"))

    group = relationship("Group", back_populates="events")
    teams = relationship("Team", back_populates="event", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="event", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    color = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Teams replaced by a new draw are archived (not deleted) when they already
    # played, so the match history and the players' stats are preserved.
    active = Column(Boolean, default=True, nullable=False, server_default=text("1"))

    event = relationship("Event", back_populates="teams")
    members = relationship(
        "TeamPlayer", back_populates="team", cascade="all, delete-orphan"
    )


class TeamPlayer(Base):
    __tablename__ = "team_players"
    __table_args__ = (UniqueConstraint("team_id", "player_id", name="uq_team_player"),)

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)

    team = relationship("Team", back_populates="members")
    player = relationship("Player")


class MatchStatus(str, enum.Enum):
    in_progress = "in_progress"
    finished = "finished"


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    team_a_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    team_b_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    score_a = Column(Integer, default=0, nullable=False)
    score_b = Column(Integer, default=0, nullable=False)
    status = Column(String(20), default=MatchStatus.in_progress.value, nullable=False)
    sequence = Column(Integer, default=0, nullable=False)  # order within the event
    played_at = Column(DateTime, nullable=True)  # when the match was finished
    created_at = Column(DateTime, default=datetime.utcnow)  # when it started
    # Who stays on the field after the match: "a", "b", "none" (both leave) or
    # "both" (only two teams in the event).
    staying = Column(String(10), nullable=True)

    event = relationship("Event", back_populates="matches")
    team_a = relationship("Team", foreign_keys=[team_a_id])
    team_b = relationship("Team", foreign_keys=[team_b_id])
    stats = relationship(
        "MatchStat", back_populates="match", cascade="all, delete-orphan"
    )


class MatchStat(Base):
    """Individual per-match contribution: goals and assists (RF07).

    One row per (match, player, team): ``team_id`` is the side the player was
    playing for, so a player lent to another team for a match still counts for
    the right side of the scoreboard.
    """

    __tablename__ = "match_stats"

    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(
        Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=True, index=True
    )
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    goals = Column(Integer, default=0, nullable=False)
    assists = Column(Integer, default=0, nullable=False)

    match = relationship("Match", back_populates="stats")
    player = relationship("Player")
