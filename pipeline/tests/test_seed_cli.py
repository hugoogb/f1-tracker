"""seed.py touches the database only, unless asked to restore or back up."""

import pytest

from scripts import seed  # isort: skip


@pytest.fixture()
def calls(monkeypatch):
    log: list[str] = []
    monkeypatch.setattr(seed, "restore_backup", lambda: log.append("restore"))
    monkeypatch.setattr(seed, "create_backup", lambda: log.append("backup"))
    monkeypatch.setattr(seed, "run_full_load", lambda targets, **_: log.append(f"load:{targets}"))
    monkeypatch.setattr(seed, "setup_logging", lambda: None)
    monkeypatch.setattr(seed, "configure_logging", lambda: None)
    monkeypatch.setattr(seed.signal, "signal", lambda *_: None)
    return log


def test_a_targeted_run_neither_restores_nor_backs_up(calls, monkeypatch):
    monkeypatch.setattr("sys.argv", ["seed.py", "--lineages"])
    seed.main()
    assert calls == ["load:{'lineages'}"]


def test_restore_and_backup_are_opt_in(calls, monkeypatch):
    monkeypatch.setattr("sys.argv", ["seed.py", "--restore", "--backup"])
    seed.main()
    assert calls == ["restore", "load:None", "backup"]


def test_the_old_opt_out_flags_are_gone():
    with pytest.raises(SystemExit):
        seed.parse_args(["--no-restore"])
