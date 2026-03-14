from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Circuit, Constructor, Driver, Race, Season

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return {
        "seasons": db.execute(select(func.count()).select_from(Season)).scalar(),
        "drivers": db.execute(select(func.count()).select_from(Driver)).scalar(),
        "constructors": db.execute(select(func.count()).select_from(Constructor)).scalar(),
        "races": db.execute(select(func.count()).select_from(Race)).scalar(),
        "circuits": db.execute(select(func.count()).select_from(Circuit)).scalar(),
    }
