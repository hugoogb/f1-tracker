from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.queries import get_season_champions

router = APIRouter()


@router.get("/champions")
def list_champions(db: Session = Depends(get_db)):
    return {"data": get_season_champions(db)}
