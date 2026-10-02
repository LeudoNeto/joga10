from sqlalchemy import create_engine, inspect, text

from app.database import Base
from app.migrations import run_migrations
from app.services.import_players import parse_names
from app.services.ranking import position_line, raw_points

# Tables as created by the first version of the app (before this upgrade).
OLD_SCHEMA = [
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(120), email VARCHAR(255), password_hash VARCHAR(255), created_at DATETIME)",
    "CREATE TABLE grupos (id INTEGER PRIMARY KEY, name VARCHAR(120), description TEXT, created_by INTEGER, created_at DATETIME)",
    "CREATE TABLE group_memberships (id INTEGER PRIMARY KEY, group_id INTEGER, user_id INTEGER, role VARCHAR(6), joined_at DATETIME)",
    "CREATE TABLE players (id INTEGER PRIMARY KEY, group_id INTEGER, name VARCHAR(120), position VARCHAR(50), skill FLOAT, active BOOLEAN, created_at DATETIME)",
    "CREATE TABLE events (id INTEGER PRIMARY KEY, group_id INTEGER, title VARCHAR(160), date DATE, created_at DATETIME)",
    "CREATE TABLE teams (id INTEGER PRIMARY KEY, event_id INTEGER, name VARCHAR(80), color VARCHAR(20), created_at DATETIME)",
    "CREATE TABLE matches (id INTEGER PRIMARY KEY, event_id INTEGER, team_a_id INTEGER, team_b_id INTEGER, score_a INTEGER, score_b INTEGER, status VARCHAR(20), sequence INTEGER, played_at DATETIME, created_at DATETIME)",
    "CREATE TABLE match_stats (id INTEGER PRIMARY KEY, match_id INTEGER, player_id INTEGER, team_id INTEGER, goals INTEGER, assists INTEGER)",
    "INSERT INTO grupos (id, name, created_by) VALUES (1, 'Antigo', 1)",
    "INSERT INTO teams (id, event_id, name) VALUES (1, 1, 'Time Vermelho')",
]


def test_migrations_upgrade_old_schema_and_are_idempotent():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        for statement in OLD_SCHEMA:
            conn.execute(text(statement))
    Base.metadata.create_all(engine)  # adds only the new tables
    assert run_migrations(engine)
    cols = {t: {c["name"] for c in inspect(engine).get_columns(t)} for t in ("grupos", "events", "teams", "match_stats")}
    assert {"min_skill", "max_skill"} <= cols["grupos"]
    assert {"draw_mode", "use_substitutes", "wins_to_leave"} <= cols["events"]
    assert "active" in cols["teams"] and "event_id" in cols["match_stats"]
    with engine.connect() as conn:
        assert conn.execute(text("SELECT min_skill, max_skill FROM grupos")).one() == (0, 10)
        assert conn.execute(text("SELECT active FROM teams")).scalar() == 1
    assert run_migrations(engine) == []  # second run: nothing to do


def test_fresh_schema_needs_no_migration():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    assert run_migrations(engine) == []


def test_parse_names_from_roll_call():
    text = "⚽ Pelada 20h ⚽\n1. Neto ✅\n2) Pedro Vital 👍🏽\n#3 Igor\n- Cauã\n\n5 - Marco - 3,50"
    assert parse_names(None, None, text) == ["Pelada 20h", "Neto", "Pedro Vital", "Igor", "Cauã", "Marco"]


def test_ranking_points_by_position():
    assert position_line("Goleiro") == "goalkeeper"
    assert position_line("Lateral esquerdo") == "defender"
    assert position_line("Meia-atacante") == "midfielder"
    assert position_line("Centroavante") == "forward"
    assert position_line(None) is None
    assert raw_points(2, 1, "Atacante") == 2 * 4 + 3
    assert raw_points(2, 1, "Zagueiro") == 2 * 6 + 3
    assert raw_points(2, 1, None) == 2 * 4 + 3
