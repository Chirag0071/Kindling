from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def acquire_db_session():
    """
    Short-lived session for code paths that can't use FastAPI's Depends()
    injection (e.g. inside a WebSocket message loop, where Depends only
    resolves once at connection time, not per message).

    Holding one pooled connection for a WebSocket's entire lifetime
    exhausts the pool at low concurrency (found via load testing: ~15
    concurrent chats was enough to lock out new connections entirely).
    Acquiring per message instead returns the connection to the pool
    between messages, when the socket is otherwise just idle.

    Respects app.dependency_overrides for get_db when set, so tests using
    the transactional-rollback session override still see this code path
    the same way they see every other endpoint. Imported lazily to avoid
    a circular import (main.py imports the chat router, which needs this).
    """
    try:
        from app.main import app
        override = app.dependency_overrides.get(get_db)
    except ImportError:
        override = None

    gen = (override or get_db)()
    db = next(gen)
    try:
        yield db
    finally:
        try:
            next(gen)
        except StopIteration:
            pass
