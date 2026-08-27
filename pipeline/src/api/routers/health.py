from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Circuit, Constructor, Driver, Race, Season

router = APIRouter()


@router.get("/health")
def health_check():
    """Liveness: the process is up. Used by the container HEALTHCHECK."""
    return {"status": "ok"}


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Readiness: the process can reach PostgreSQL.

    Separate from /health so an unreachable database doesn't make the container
    look dead (and get restarted) when the API itself is fine. Deploy scripts
    and uptime checks should hit this one.
    """
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "database": "unreachable",
                "detail": str(exc.__cause__ or exc),
            },
        )
    return {"status": "ok", "database": "ok"}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {
        "seasons": db.execute(select(func.count()).select_from(Season)).scalar(),
        "drivers": db.execute(select(func.count()).select_from(Driver)).scalar(),
        "constructors": db.execute(select(func.count()).select_from(Constructor)).scalar(),
        "races": db.execute(select(func.count()).select_from(Race)).scalar(),
        "circuits": db.execute(select(func.count()).select_from(Circuit)).scalar(),
    }
