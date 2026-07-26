import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .config import settings
from .database import Base, engine
from .routers import (
    auth,
    events,
    groups,
    invites,
    players,
    teams,
)

logger = logging.getLogger("joga10")
logging.basicConfig(level=logging.INFO)


def init_db(retries: int = 15, delay: float = 3.0) -> None:
    """Wait for the database to be reachable, then create the schema.

    MySQL can take a few seconds to accept connections after the container
    starts, so we retry before giving up.
    """
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            logger.info("Database ready; schema ensured.")
            return
        except OperationalError as exc:  # pragma: no cover - startup timing
            last_error = exc
            logger.warning(
                "Database not ready (attempt %s/%s): %s", attempt, retries, exc
            )
            time.sleep(delay)
    raise RuntimeError(f"Could not connect to the database: {last_error}")


app = FastAPI(title="Joga10 API", version="1.0.0")

origins = (
    ["*"]
    if settings.cors_origins.strip() == "*"
    else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}


# All application routes live under /api (nginx proxies /api to this service).
api_prefix = "/api"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(groups.router, prefix=api_prefix)
app.include_router(invites.router, prefix=api_prefix)
app.include_router(players.router, prefix=api_prefix)
app.include_router(events.group_router, prefix=api_prefix)
app.include_router(events.event_router, prefix=api_prefix)
app.include_router(teams.router, prefix=api_prefix)
