"""The production ingest has to run every ingestor that belongs on the server.

`seed.py` with no target flags runs everything, but the `ingest` service in
`docker/compose.prod.yml` names its targets one by one — so adding an ingestor
to the pipeline does not add it to the weekly run, and nothing else notices.
That is exactly how `--lineages` shipped without ever being scheduled: the
table was created and stayed empty.

Two targets are missing from that list on purpose. Formula 1 answers this
server's IP with a 403, so lap times and qualifying sectors cannot be fetched
there at all; they arrive off-box through `fastf1.sh`. Everything else should
be in the list, and this fails when it is not.

Parsed out of the file as text rather than with a YAML library: the only
parser available is a transitive dependency of the web stack, and a test is a
poor reason to start depending on it.
"""

import pathlib
import re

import pytest

from scripts.seed import INGESTOR_FLAGS

COMPOSE = pathlib.Path(__file__).resolve().parents[2] / "docker" / "compose.prod.yml"

# Fetched off-box because F1 blocks the server — see `scripts/vps/fastf1.sh`.
OFF_BOX_TARGETS = {"laptimes", "qualifying-sectors"}


def ingest_command_flags() -> set[str]:
    """The flags the `ingest` service passes to seed.py in production."""
    text = COMPOSE.read_text()

    service = re.search(r"^  ingest:\n(.*?)(?=^  \S|\Z)", text, re.S | re.M)
    assert service, f"no `ingest` service in {COMPOSE}"

    command = re.search(r"^\s+command:\s*\n\s*\[(.*?)\]", service.group(1), re.S | re.M)
    assert command, f"the `ingest` service in {COMPOSE} has no command list"

    return set(re.findall(r"'(--[a-z0-9-]+)'", command.group(1)))


@pytest.mark.parametrize("target", sorted(set(INGESTOR_FLAGS) - OFF_BOX_TARGETS))
def test_production_ingest_runs_every_on_box_target(target):
    assert f"--{target}" in ingest_command_flags(), (
        f"`--{target}` is a seed.py target but the ingest service in "
        f"{COMPOSE.name} never passes it, so the weekly run skips it"
    )


@pytest.mark.parametrize("target", sorted(OFF_BOX_TARGETS))
def test_production_ingest_leaves_the_blocked_targets_alone(target):
    """Adding these would make the weekly run grind through a blocked host."""
    assert f"--{target}" not in ingest_command_flags()
