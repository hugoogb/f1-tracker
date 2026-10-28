from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from src.config import settings

# pool_pre_ping: a restart of Postgres or PgBouncer (a minor-version bump, a
# host reboot) kills every pooled connection, and without it the pool keeps
# handing those out -- /health stays green while every query fails with
# "server closed the connection unexpectedly" until the process restarts.
# The ping costs one round trip per checkout and replaces a dead connection
# transparently. It is safe through PgBouncer's transaction pooling.
engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
