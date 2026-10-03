"""Lightweight, idempotent schema upgrades.

The schema is created with ``Base.metadata.create_all``, which only creates
missing *tables*: columns added to existing tables (and new enum values) would
never reach databases created by older versions. ``run_migrations`` inspects
the live schema and applies the missing pieces, so it is safe to run on every
startup and on fresh databases (where it simply finds nothing to do).
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger("joga10.migrations")

# (table, column, DDL used to add it)
_COLUMNS = [
    ("grupos", "min_skill", "FLOAT NOT NULL DEFAULT 0"),
    ("grupos", "max_skill", "FLOAT NOT NULL DEFAULT 10"),
    ("players", "photo_key", "VARCHAR(64) NULL"),
    ("events", "draw_mode", "VARCHAR(20) NULL"),
    ("events", "draw_proven", "BOOLEAN NOT NULL DEFAULT 1"),
    ("events", "use_substitutes", "BOOLEAN NOT NULL DEFAULT 0"),
    ("events", "wins_to_leave", "INTEGER NOT NULL DEFAULT 0"),
    ("teams", "active", "BOOLEAN NOT NULL DEFAULT 1"),
    ("matches", "staying", "VARCHAR(10) NULL"),
    ("match_stats", "event_id", "INTEGER NULL"),
    ("group_memberships", "player_id", "INTEGER NULL"),
    ("players", "card_template", "VARCHAR(50) NULL"),
]

# (table, column, DDL): created when no existing index starts with the column.
_INDEXES = [
    ("players", "photo_key", "CREATE UNIQUE INDEX ix_players_photo_key ON players (photo_key)"),
    ("match_stats", "event_id", "CREATE INDEX ix_match_stats_event_id ON match_stats (event_id)"),
    (
        "group_memberships",
        "player_id",
        "CREATE UNIQUE INDEX ix_group_memberships_player_id ON group_memberships (player_id)",
    ),
]

_ROLE_ENUM = "ENUM('admin','moderator','member')"


def _pending_statements(engine: Engine) -> list[str]:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    columns = {t: {c["name"]: c for c in insp.get_columns(t)} for t in tables}
    statements: list[str] = []

    for table, column, ddl in _COLUMNS:
        if table in tables and column not in columns[table]:
            statements.append(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    for table, column, ddl in _INDEXES:
        if table not in tables:
            continue
        indexed = {
            (i.get("column_names") or [None])[0] for i in insp.get_indexes(table)
        }
        if column not in indexed:
            statements.append(ddl)

    # MySQL stores roles as a native ENUM: new values need an ALTER. Other
    # dialects (SQLite) store a plain VARCHAR and need nothing.
    if engine.dialect.name == "mysql":
        for table in ("group_memberships", "invites"):
            role = columns.get(table, {}).get("role")
            enums = getattr(role["type"], "enums", None) if role else None
            if enums is not None and "moderator" not in enums:
                statements.append(
                    f"ALTER TABLE {table} MODIFY COLUMN role {_ROLE_ENUM} NOT NULL"
                )
    return statements


def run_migrations(engine: Engine) -> list[str]:
    """Apply missing schema changes. Returns the statements executed."""
    statements = _pending_statements(engine)
    if not statements:
        return []
    with engine.begin() as conn:
        for statement in statements:
            logger.info("Migration: %s", statement)
            conn.execute(text(statement))
    return statements
