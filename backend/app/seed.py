"""Optional demo seed. Run inside the backend container with:

    docker compose exec backend python -m app.seed

Creates a demo admin user, a group and a handful of players so the app can be
explored immediately. Safe to run more than once (it is idempotent by email).
"""

from datetime import date

from .database import Base, SessionLocal, engine
from .models import Event, Group, GroupMembership, Player, Role, User
from .security import hash_password

DEMO_EMAIL = "admin@joga10.dev"
DEMO_PASSWORD = "joga10123"


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=DEMO_EMAIL).first()
        if user is None:
            user = User(
                name="Admin Demo",
                email=DEMO_EMAIL,
                password_hash=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            db.flush()

        group = db.query(Group).filter_by(name="Pelada da Firma").first()
        if group is None:
            group = Group(
                name="Pelada da Firma",
                description="Grupo de demonstração do Joga10",
                created_by=user.id,
            )
            db.add(group)
            db.flush()
            db.add(
                GroupMembership(
                    group_id=group.id, user_id=user.id, role=Role.admin
                )
            )
            db.add(
                Event(
                    group_id=group.id,
                    title="Pelada de estreia",
                    date=date.today(),
                )
            )
            roster = [
                ("Ronaldo", "Atacante", 9.5),
                ("Zico", "Meia", 9.0),
                ("Cafu", "Lateral", 8.0),
                ("Roberto Carlos", "Lateral", 8.5),
                ("Dida", "Goleiro", 7.5),
                ("Dunga", "Volante", 7.0),
                ("Rivaldo", "Meia", 8.8),
                ("Bebeto", "Atacante", 8.2),
                ("Julio Cesar", "Goleiro", 7.8),
                ("Lucio", "Zagueiro", 7.6),
                ("Gilberto", "Volante", 6.9),
                ("Adriano", "Atacante", 8.4),
            ]
            for name, position, skill in roster:
                db.add(
                    Player(
                        group_id=group.id,
                        name=name,
                        position=position,
                        skill=skill,
                    )
                )

        db.commit()
        print("Seed concluído.")
        print(f"  Login: {DEMO_EMAIL}")
        print(f"  Senha: {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
