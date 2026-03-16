from collections.abc import Callable
from typing import Any

from sqlalchemy import Select
from sqlalchemy.orm import Session


def paginate(
    db: Session,
    query: Select,
    count_query: Select,
    page: int,
    page_size: int,
    serializer: Callable[[Any], dict],
) -> dict:
    offset = (page - 1) * page_size
    total = db.execute(count_query).scalar()
    items = db.execute(query.offset(offset).limit(page_size)).scalars().all()
    return {
        "data": [serializer(item) for item in items],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
