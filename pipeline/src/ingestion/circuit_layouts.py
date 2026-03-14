"""Ingest circuit layout metadata from f1-circuits-svg data.

Source: https://github.com/julesr0y/f1-circuits-svg (CC-BY-4.0)
Maps f1-circuits-svg circuit IDs to Ergast circuitId (Circuit.ref in our DB).
"""

from sqlalchemy import func, select

from src.db.models import Circuit, CircuitLayout
from src.ingestion.base import BaseIngestor

# Mapping: f1-circuits-svg circuit ID → Ergast circuitId (Circuit.ref)
# Most map directly (with hyphens → underscores). Non-trivial mappings listed explicitly.
SVG_TO_ERGAST: dict[str, str] = {
    # Non-trivial mappings
    "ain-diab": "ain-diab",  # Ergast keeps the hyphen
    "aida": "okayama",
    "austin": "americas",
    "buenos-aires": "galvez",
    "bugatti": "lemans",
    "caesars-palace": "las_vegas",
    "clermont-ferrand": "charade",
    "east-london": "george",
    "las-vegas": "vegas",
    "lusail": "losail",
    "melbourne": "albert_park",
    "mexico-city": "rodriguez",
    "montreal": "villeneuve",
    "mont-tremblant": "tremblant",
    "paul-ricard": "ricard",
    "porto": "boavista",
    "rouen": "essarts",
    "spa-francorchamps": "spa",
    "spielberg": "red_bull_ring",
    # Hyphen-to-underscore conversions
    "brands-hatch": "brands_hatch",
    "long-beach": "long_beach",
    "magny-cours": "magny_cours",
    "marina-bay": "marina_bay",
    "watkins-glen": "watkins_glen",
    "yas-marina": "yas_marina",
}

# Layout metadata from f1-circuits-svg circuits.json
# Format: { svg_circuit_id: [ (layout_number, svg_id, seasons_active), ... ] }
LAYOUT_DATA: dict[str, list[tuple[int, str, str]]] = {
    "adelaide": [(1, "adelaide-1", "1985-1995")],
    "aida": [(1, "aida-1", "1994-1995")],
    "ain-diab": [(1, "ain-diab-1", "1958")],
    "aintree": [(1, "aintree-1", "1955,1957,1959,1961-1962")],
    "anderstorp": [(1, "anderstorp-1", "1973-1978")],
    "austin": [(1, "austin-1", "2012-2019,2021-2026")],
    "avus": [(1, "avus-1", "1959")],
    "bahrain": [
        (1, "bahrain-1", "2004-2009,2011-2026"),
        (2, "bahrain-2", "2010"),
        (3, "bahrain-3", "2020"),
    ],
    "baku": [(1, "baku-1", "2016-2019,2021-2026")],
    "brands-hatch": [
        (1, "brands-hatch-1", "1964,1966,1968,1970,1972,1974"),
        (2, "brands-hatch-2", "1976,1978,1980,1982-1986"),
    ],
    "bremgarten": [(1, "bremgarten-1", "1950-1954")],
    "buddh": [(1, "buddh-1", "2011-2013")],
    "buenos-aires": [
        (1, "buenos-aires-1", "1953-1958,1960"),
        (2, "buenos-aires-2", "1972-1973"),
        (3, "buenos-aires-3", "1974-1975,1977-1981"),
        (4, "buenos-aires-4", "1995-1998"),
    ],
    "bugatti": [(1, "bugatti-1", "1967")],
    "caesars-palace": [(1, "caesars-palace-1", "1981-1982")],
    "catalunya": [
        (1, "catalunya-1", "1991-1994"),
        (2, "catalunya-2", "1995-2003"),
        (3, "catalunya-3", "2004-2006"),
        (4, "catalunya-4", "2007-2020"),
        (5, "catalunya-5", "2021-2022"),
        (6, "catalunya-6", "2023-2026"),
    ],
    "clermont-ferrand": [(1, "clermont-ferrand-1", "1965,1969-1970,1972")],
    "dallas": [(1, "dallas-1", "1984")],
    "detroit": [
        (1, "detroit-1", "1982"),
        (2, "detroit-2", "1983-1988"),
    ],
    "dijon": [
        (1, "dijon-1", "1974"),
        (2, "dijon-2", "1977,1979,1981-1982,1984"),
    ],
    "donington": [(1, "donington-1", "1993")],
    "east-london": [(1, "east-london-1", "1962-1963,1965")],
    "estoril": [
        (1, "estoril-1", "1984-1993"),
        (2, "estoril-2", "1994-1996"),
    ],
    "fuji": [
        (1, "fuji-1", "1976-1977"),
        (2, "fuji-2", "2007-2008"),
    ],
    "hockenheimring": [
        (1, "hockenheimring-1", "1970,1977-1981"),
        (2, "hockenheimring-2", "1982-1984,1986-1991"),
        (3, "hockenheimring-3", "1992-2001"),
        (4, "hockenheimring-4", "2002-2006,2008,2010,2012,2014,2016,2018-2019"),
    ],
    "hungaroring": [
        (1, "hungaroring-1", "1986-1988"),
        (2, "hungaroring-2", "1989-2002"),
        (3, "hungaroring-3", "2003-2026"),
    ],
    "imola": [
        (1, "imola-1", "1980-1994"),
        (2, "imola-2", "1995-2006"),
        (3, "imola-3", "2020-2025"),
    ],
    "indianapolis": [
        (1, "indianapolis-1", "1950-1960"),
        (2, "indianapolis-2", "2000-2007"),
    ],
    "interlagos": [
        (1, "interlagos-1", "1973-1977,1979-1980"),
        (2, "interlagos-2", "1990-2026"),
    ],
    "istanbul": [(1, "istanbul-1", "2005-2011,2020-2021")],
    "jacarepagua": [(1, "jacarepagua-1", "1978,1981-1989")],
    "jarama": [
        (1, "jarama-1", "1968,1970,1972,1974,1976-1979"),
        (2, "jarama-2", "1981"),
    ],
    "jeddah": [(1, "jeddah-1", "2021-2026")],
    "jerez": [
        (1, "jerez-1", "1986-1990"),
        (2, "jerez-2", "1994,1997"),
    ],
    "kyalami": [
        (1, "kyalami-1", "1967-1980,1982-1985"),
        (2, "kyalami-2", "1992-1993"),
    ],
    "las-vegas": [(1, "las-vegas-1", "2023-2026")],
    "long-beach": [
        (1, "long-beach-1", "1976-1981"),
        (2, "long-beach-2", "1982"),
        (3, "long-beach-3", "1983"),
    ],
    "lusail": [(1, "lusail-1", "2021,2023-2026")],
    "madring": [(1, "madring-1", "2026")],
    "magny-cours": [
        (1, "magny-cours-1", "1991"),
        (2, "magny-cours-2", "1992-2002"),
        (3, "magny-cours-3", "2003-2008"),
    ],
    "marina-bay": [
        (1, "marina-bay-1", "2008-2012"),
        (2, "marina-bay-2", "2013-2014"),
        (3, "marina-bay-3", "2015-2019,2022"),
        (4, "marina-bay-4", "2023-2026"),
    ],
    "melbourne": [
        (1, "melbourne-1", "1996-2019"),
        (2, "melbourne-2", "2022-2026"),
    ],
    "mexico-city": [
        (1, "mexico-city-1", "1963-1970"),
        (2, "mexico-city-2", "1986-1992"),
        (3, "mexico-city-3", "2015-2019,2021-2026"),
    ],
    "miami": [(1, "miami-1", "2022-2026")],
    "monaco": [
        (1, "monaco-1", "1950"),
        (2, "monaco-2", "1955-1972"),
        (3, "monaco-3", "1973-1975"),
        (4, "monaco-4", "1976-1985"),
        (5, "monaco-5", "1986-2002"),
        (6, "monaco-6", "2003-2019,2021-2026"),
    ],
    "monsanto": [(1, "monsanto-1", "1959")],
    "montjuic": [(1, "montjuic-1", "1969,1971,1973,1975")],
    "montreal": [
        (1, "montreal-1", "1978"),
        (2, "montreal-2", "1979-1986"),
        (3, "montreal-3", "1988-1993"),
        (4, "montreal-4", "1994-1995"),
        (5, "montreal-5", "1996-2001"),
        (6, "montreal-6", "2002-2019,2022-2026"),
    ],
    "mont-tremblant": [(1, "mont-tremblant-1", "1968,1970")],
    "monza": [
        (1, "monza-1", "1950-1954"),
        (2, "monza-2", "1955-1956,1960-1961"),
        (3, "monza-3", "1957-1959,1962-1971"),
        (4, "monza-4", "1972-1973"),
        (5, "monza-5", "1974-1975"),
        (6, "monza-6", "1976-1979,1981-1999"),
        (7, "monza-7", "2000-2026"),
    ],
    "mosport": [(1, "mosport-1", "1967,1969,1971-1974,1976-1977")],
    "mugello": [(1, "mugello-1", "2020")],
    "nivelles": [(1, "nivelles-1", "1972,1974")],
    "nurburgring": [
        (1, "nurburgring-1", "1951-1958,1961-1969,1971-1976"),
        (2, "nurburgring-2", "1984-1985"),
        (3, "nurburgring-3", "1995-2001"),
        (4, "nurburgring-4", "2002-2007,2009,2011,2013,2020"),
    ],
    "paul-ricard": [
        (1, "paul-ricard-1", "1971,1973,1975-1976,1978,1980,1982-1983,1985"),
        (2, "paul-ricard-2", "1986-1990"),
        (3, "paul-ricard-3", "2018-2019,2021-2022"),
    ],
    "pedralbes": [(1, "pedralbes-1", "1951,1954")],
    "pescara": [(1, "pescara-1", "1957")],
    "phoenix": [
        (1, "phoenix-1", "1989-1990"),
        (2, "phoenix-2", "1991"),
    ],
    "portimao": [(1, "portimao-1", "2020-2021")],
    "porto": [(1, "porto-1", "1958,1960")],
    "reims": [
        (1, "reims-1", "1950-1951"),
        (2, "reims-2", "1953-1954,1956,1958-1961,1963,1966"),
    ],
    "riverside": [(1, "riverside-1", "1960")],
    "rouen": [
        (1, "rouen-1", "1952"),
        (2, "rouen-2", "1957,1962,1964,1968"),
    ],
    "sebring": [(1, "sebring-1", "1959")],
    "sepang": [(1, "sepang-1", "1999-2017")],
    "shanghai": [(1, "shanghai-1", "2004-2019,2026")],
    "silverstone": [
        (1, "silverstone-1", "1950-1954,1956,1958,1960,1963,1965,1967,1969,1971,1973"),
        (2, "silverstone-2", "1975,1977,1979,1981,1983,1985"),
        (3, "silverstone-3", "1987-1990"),
        (4, "silverstone-4", "1991-1993"),
        (5, "silverstone-5", "1994-1995"),
        (6, "silverstone-6", "1996"),
        (7, "silverstone-7", "1997-2009"),
        (8, "silverstone-8", "2010-2026"),
    ],
    "sochi": [(1, "sochi-1", "2014-2021")],
    "spa-francorchamps": [
        (1, "spa-francorchamps-1", "1950-1956,1958-1968,1970"),
        (2, "spa-francorchamps-2", "1983,1985-2002"),
        (3, "spa-francorchamps-3", "2004-2005"),
        (4, "spa-francorchamps-4", "2007-2026"),
    ],
    "spielberg": [
        (1, "spielberg-1", "1970-1976"),
        (2, "spielberg-2", "1977-1987"),
        (3, "spielberg-3", "1997-2003,2014-2026"),
    ],
    "suzuka": [
        (1, "suzuka-1", "1987-2002"),
        (2, "suzuka-2", "2003-2006,2009-2019,2022-2026"),
    ],
    "valencia": [(1, "valencia-1", "2008-2012")],
    "watkins-glen": [
        (1, "watkins-glen-1", "1961-1970"),
        (2, "watkins-glen-2", "1971-1974"),
        (3, "watkins-glen-3", "1975-1980"),
    ],
    "yas-marina": [
        (1, "yas-marina-1", "2009-2020"),
        (2, "yas-marina-2", "2021-2026"),
    ],
    "yeongam": [(1, "yeongam-1", "2010-2013")],
    "zandvoort": [
        (1, "zandvoort-1", "1952-1953,1955,1958-1971"),
        (2, "zandvoort-2", "1973-1978"),
        (3, "zandvoort-3", "1979"),
        (4, "zandvoort-4", "1980-1985"),
        (5, "zandvoort-5", "2021-2026"),
    ],
    "zeltweg": [(1, "zeltweg-1", "1964")],
    "zolder": [
        (1, "zolder-1", "1973"),
        (2, "zolder-2", "1975-1982,1984"),
    ],
}


def _resolve_ref(svg_circuit_id: str) -> str:
    """Convert f1-circuits-svg circuit ID to Ergast circuitId (Circuit.ref)."""
    if svg_circuit_id in SVG_TO_ERGAST:
        return SVG_TO_ERGAST[svg_circuit_id]
    # Default: hyphens become underscores
    return svg_circuit_id.replace("-", "_")


class CircuitLayoutIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(CircuitLayout))
        if count and count > 0:
            self.log(f"Skipping — {count} circuit layouts already loaded")
            return

        self.log(f"Loading layout data for {len(LAYOUT_DATA)} circuits...")

        # Build ref → circuit_id lookup
        circuits = self.db.execute(select(Circuit.id, Circuit.ref)).all()
        ref_to_id: dict[str, str] = {ref: cid for cid, ref in circuits}

        created = 0
        missing = []

        for svg_circuit_id, layouts in LAYOUT_DATA.items():
            ergast_ref = _resolve_ref(svg_circuit_id)
            circuit_id = ref_to_id.get(ergast_ref)

            if not circuit_id:
                missing.append(f"{svg_circuit_id} → {ergast_ref}")
                continue

            for layout_number, svg_id, seasons_active in layouts:
                layout = CircuitLayout(
                    circuit_id=circuit_id,
                    layout_number=layout_number,
                    svg_id=svg_id,
                    seasons_active=seasons_active,
                )
                self.db.add(layout)
                created += 1

        self.db.commit()

        if missing:
            self.log(f"Warning: {len(missing)} circuits not in DB: {missing}")
        self.log(f"Created {created} layout entries")
