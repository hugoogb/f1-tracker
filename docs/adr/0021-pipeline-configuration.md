# 0021 — Pipeline configuration

Settings, the database engine, logging and the shared CLI helpers in `pipeline/src/`.

### Settings load the repo-root .env by absolute path

Where: `pipeline/src/config.py` — `Settings`

The root .env is resolved absolutely (two directories up from `config.py`) so it loads regardless of the working directory.

### Settings ignore undeclared env keys

Where: `pipeline/src/config.py` — `Settings` config

The root .env is shared by frontend, backend and scripts, so keys the model does not declare are ignored; in Docker there is no .env at all and a missing env_file is not an error.

### Connections are pre-pinged

Where: `pipeline/src/db/database.py` — engine

pool_pre_ping is on because a Postgres or PgBouncer restart kills pooled connections and /health would stay green while queries fail; it costs one round trip per checkout and is safe through PgBouncer transaction pooling.

### Alembic env imports every model

Where: `pipeline/alembic/env.py` — `from src.db.models import *`

The star import of `src.db.models` looks unused (it carries `noqa: F401`), but it is what registers every table on `Base.metadata`, which is `target_metadata`. If it is removed, `alembic revision --autogenerate` compares the database against an empty schema and generates a migration that drops every table.
