import itertools

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main as main_module
from app.database import Base, get_db
from app.main import app

_counter = itertools.count(1)


@pytest.fixture()
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _):  # SQLite needs FKs on for the DB cascades
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def client(engine, monkeypatch):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main_module, "init_db", lambda *a, **k: None)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class Api:
    """Tiny helper around the TestClient with per-user tokens."""

    def __init__(self, client: TestClient):
        self.c = client

    def user(self, name="User"):
        n = next(_counter)
        res = self.c.post(
            "/api/auth/signup",
            json={"name": name, "email": f"u{n}@test.dev", "password": "secret123"},
        )
        assert res.status_code == 201, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    def req(self, method, path, auth, expect=None, **kw):
        res = self.c.request(method, f"/api{path}", headers=auth, **kw)
        if expect is not None:
            assert res.status_code == expect, res.text
        return res

    def join(self, group_id, admin, role):
        """New user joining ``group_id`` with ``role`` through an invite."""
        invite = self.req("POST", f"/groups/{group_id}/invites", admin, 201, json={"role": role}).json()
        auth = self.user(role)
        self.req("POST", f"/invites/{invite['token']}/accept", auth, 200)
        return auth

    def group_with_players(self, admin, skills, **group):
        g = self.req("POST", "/groups", admin, 201, json={"name": "Pelada"}).json()
        if group:
            self.req("PATCH", f"/groups/{g['id']}", admin, 200, json=group)
        players = [
            self.req(
                "POST", f"/groups/{g['id']}/players", admin, 201,
                json={"name": f"P{i}", "skill": s},
            ).json()
            for i, s in enumerate(skills)
        ]
        ev = self.req(
            "POST", f"/groups/{g['id']}/events", admin, 201,
            json={"title": "Evento", "date": "2026-10-02"},
        ).json()
        return g, players, ev


@pytest.fixture()
def api(client):
    return Api(client)
