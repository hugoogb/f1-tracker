"""Ingest constructor lineages from f1db's `chronology`.

f1db renames a constructor rather than carrying one row through a rebrand, so
what a fan thinks of as one team — Tyrrell, BAR, Honda, Brawn, Mercedes — is
five constructors with five separate records. `chronology` is f1db's own
description of those chains, and every member of a chain carries the whole
chain, so the same list arrives once per member and is deduplicated here.

A chain is a lineage of *entries*, not an assertion that the teams are the same
outfit. Red Bull sits at the end of Stewart's chain; nothing about the two is
continuous but the entry. That is why nothing here merges records or inherits a
colour — it builds a timeline and stops.
"""

from sqlalchemy import select

from src.db.models import Constructor, ConstructorLineage
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor


def _chain_of(constructor: dict) -> list[dict] | None:
    """A constructor's chronology, ordered, or None when it has no chain.

    A chronology naming only the constructor itself is not a lineage — it says
    the team never changed names — so those are dropped rather than stored as
    one-entry chains nothing would render.
    """
    chronology = constructor.get("chronology")
    if not chronology:
        return None

    entries = [
        entry for entry in chronology if isinstance(entry, dict) and entry.get("constructorId")
    ]
    if len(entries) < 2:
        return None

    return sorted(entries, key=lambda e: (e.get("positionDisplayOrder") or 0, e["constructorId"]))


class ConstructorLineageIngestor(BaseIngestor):
    """Rebuild `constructor_lineages` from the f1db release.

    Runs after `ConstructorIngestor`, because every row points at a constructor.
    The table is derived data with no history of its own, so it is rebuilt from
    scratch each time rather than diffed — a chain that f1db corrects or removes
    then actually disappears, which an upsert would never manage.
    """

    def ingest(self) -> None:
        data = f1db.load()

        known = {ref for ref in self.db.execute(select(Constructor.ref)).scalars().all()}

        # One chain can arrive once per member; keep the first and skip the rest.
        chains: dict[str, list[dict]] = {}
        for constructor in data.constructors:
            chain = _chain_of(constructor)
            if chain is None:
                continue
            lineage_ref = chain[0]["constructorId"]
            chains.setdefault(lineage_ref, chain)

        rows: list[ConstructorLineage] = []
        skipped: set[str] = set()
        for lineage_ref, chain in chains.items():
            for position, entry in enumerate(chain, start=1):
                ref = entry["constructorId"]
                if ref not in known:
                    # A chain can name a constructor the release does not carry
                    # as an entrant. Storing it would break the foreign key, and
                    # the chain is still worth having without it.
                    skipped.add(ref)
                    continue
                rows.append(
                    ConstructorLineage(
                        lineage_ref=lineage_ref,
                        constructor_id=ref,
                        position=position,
                        year_from=entry.get("yearFrom"),
                        year_to=entry.get("yearTo"),
                    )
                )

        self.db.query(ConstructorLineage).delete()
        self.db.add_all(rows)
        self.db.commit()

        if skipped:
            self.log(
                f"WARNING: {len(skipped)} lineage members are not constructors and "
                f"were skipped: {sorted(skipped)[:10]}"
            )
        self.log(f"Ingested {len(chains)} constructor lineages covering {len(rows)} entries")
