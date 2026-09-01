from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routers import (
    champions,
    circuits,
    compare,
    constructors,
    drivers,
    health,
    races,
    records,
    search,
    seasons,
    standings,
)
from src.config import settings

# Interactive docs are a development convenience: they advertise the full schema
# of a public read-only API. Keep them off unless FASTAPI_DEBUG is on.
_docs_enabled = settings.fastapi_debug

app = FastAPI(
    title="F1 Tracker API",
    description="API for Formula 1 historical data and analytics",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(seasons.router, prefix="/api", tags=["seasons"])
app.include_router(drivers.router, prefix="/api", tags=["drivers"])
app.include_router(constructors.router, prefix="/api", tags=["constructors"])
app.include_router(races.router, prefix="/api", tags=["races"])
app.include_router(circuits.router, prefix="/api", tags=["circuits"])
app.include_router(standings.router, prefix="/api", tags=["standings"])
app.include_router(champions.router, prefix="/api", tags=["champions"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(compare.router, prefix="/api", tags=["compare"])
app.include_router(records.router, prefix="/api", tags=["records"])
