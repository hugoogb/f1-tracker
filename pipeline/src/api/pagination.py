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


def paginate_rows(
    db: Session,
    query: Select,
    count_query: Select,
    page: int,
    page_size: int,
    serializer: Callable[[Any, int], dict],
) -> dict:
    """Paginate a query that selects columns rather than whole ORM entities.

    `paginate` above calls `.scalars()`, which keeps only the first column — no
    use to a ranking table that carries a computed value alongside the entity.
    The serializer is handed the row and its rank, which is offset-aware so page
    two starts where page one stopped rather than back at 1.
    """
    offset = (page - 1) * page_size
    total = db.execute(count_query).scalar() or 0
    rows = db.execute(query.offset(offset).limit(page_size)).all()
    return {
        "data": [serializer(row, offset + index + 1) for index, row in enumerate(rows)],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
