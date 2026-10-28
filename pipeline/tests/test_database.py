from src.db.database import engine


def test_engine_checks_connections_before_use():
    """A restart of Postgres or PgBouncer kills every pooled connection, and
    without pre-ping the pool keeps handing those dead connections out: the
    API answers /health but every query fails ("server closed the connection
    unexpectedly") until the process restarts. pool_pre_ping tests each
    connection on checkout and replaces a dead one transparently."""
    assert engine.pool._pre_ping is True
