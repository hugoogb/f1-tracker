"""Download circuit track layout SVGs from f1-circuits-svg repository.

Source: https://github.com/julesr0y/f1-circuits-svg (CC-BY-4.0)
Downloads the 'white' style variant for dark-themed UI.
"""

import sys
import time
import urllib.request
from pathlib import Path

REPO_BASE = "https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/circuits"
STYLE = "white"
OUTPUT_DIR = Path(__file__).parent.parent.parent / "apps" / "web" / "public" / "tracks"

# All layout SVG IDs from f1-circuits-svg circuits.json
SVG_IDS = [
    "adelaide-1",
    "aida-1",
    "ain-diab-1",
    "aintree-1",
    "anderstorp-1",
    "austin-1",
    "avus-1",
    "bahrain-1",
    "bahrain-2",
    "bahrain-3",
    "baku-1",
    "brands-hatch-1",
    "brands-hatch-2",
    "bremgarten-1",
    "buddh-1",
    "buenos-aires-1",
    "buenos-aires-2",
    "buenos-aires-3",
    "buenos-aires-4",
    "bugatti-1",
    "caesars-palace-1",
    "catalunya-1",
    "catalunya-2",
    "catalunya-3",
    "catalunya-4",
    "catalunya-5",
    "catalunya-6",
    "clermont-ferrand-1",
    "dallas-1",
    "detroit-1",
    "detroit-2",
    "dijon-1",
    "dijon-2",
    "donington-1",
    "east-london-1",
    "estoril-1",
    "estoril-2",
    "fuji-1",
    "fuji-2",
    "hockenheimring-1",
    "hockenheimring-2",
    "hockenheimring-3",
    "hockenheimring-4",
    "hungaroring-1",
    "hungaroring-2",
    "hungaroring-3",
    "imola-1",
    "imola-2",
    "imola-3",
    "indianapolis-1",
    "indianapolis-2",
    "interlagos-1",
    "interlagos-2",
    "istanbul-1",
    "jacarepagua-1",
    "jarama-1",
    "jarama-2",
    "jeddah-1",
    "jerez-1",
    "jerez-2",
    "kyalami-1",
    "kyalami-2",
    "las-vegas-1",
    "long-beach-1",
    "long-beach-2",
    "long-beach-3",
    "lusail-1",
    "madring-1",
    "magny-cours-1",
    "magny-cours-2",
    "magny-cours-3",
    "marina-bay-1",
    "marina-bay-2",
    "marina-bay-3",
    "marina-bay-4",
    "melbourne-1",
    "melbourne-2",
    "mexico-city-1",
    "mexico-city-2",
    "mexico-city-3",
    "miami-1",
    "monaco-1",
    "monaco-2",
    "monaco-3",
    "monaco-4",
    "monaco-5",
    "monaco-6",
    "monsanto-1",
    "montjuic-1",
    "montreal-1",
    "montreal-2",
    "montreal-3",
    "montreal-4",
    "montreal-5",
    "montreal-6",
    "mont-tremblant-1",
    "monza-1",
    "monza-2",
    "monza-3",
    "monza-4",
    "monza-5",
    "monza-6",
    "monza-7",
    "mosport-1",
    "mugello-1",
    "nivelles-1",
    "nurburgring-1",
    "nurburgring-2",
    "nurburgring-3",
    "nurburgring-4",
    "paul-ricard-1",
    "paul-ricard-2",
    "paul-ricard-3",
    "pedralbes-1",
    "pescara-1",
    "phoenix-1",
    "phoenix-2",
    "portimao-1",
    "porto-1",
    "reims-1",
    "reims-2",
    "riverside-1",
    "rouen-1",
    "rouen-2",
    "sebring-1",
    "sepang-1",
    "shanghai-1",
    "silverstone-1",
    "silverstone-2",
    "silverstone-3",
    "silverstone-4",
    "silverstone-5",
    "silverstone-6",
    "silverstone-7",
    "silverstone-8",
    "sochi-1",
    "spa-francorchamps-1",
    "spa-francorchamps-2",
    "spa-francorchamps-3",
    "spa-francorchamps-4",
    "spielberg-1",
    "spielberg-2",
    "spielberg-3",
    "suzuka-1",
    "suzuka-2",
    "valencia-1",
    "watkins-glen-1",
    "watkins-glen-2",
    "watkins-glen-3",
    "yas-marina-1",
    "yas-marina-2",
    "yeongam-1",
    "zandvoort-1",
    "zandvoort-2",
    "zandvoort-3",
    "zandvoort-4",
    "zandvoort-5",
    "zeltweg-1",
    "zolder-1",
    "zolder-2",
]


def download_svgs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total = len(SVG_IDS)
    downloaded = 0
    skipped = 0
    failed = []

    for i, svg_id in enumerate(SVG_IDS, 1):
        dest = OUTPUT_DIR / f"{svg_id}.svg"
        if dest.exists():
            skipped += 1
            continue

        url = f"{REPO_BASE}/{STYLE}/{svg_id}.svg"
        try:
            urllib.request.urlretrieve(url, dest)
            downloaded += 1
            print(f"[{i}/{total}] Downloaded {svg_id}.svg")
            # Small delay to be respectful to GitHub
            time.sleep(0.2)
        except Exception as e:
            failed.append(svg_id)
            print(f"[{i}/{total}] FAILED {svg_id}.svg: {e}", file=sys.stderr)

    print(f"\nDone: {downloaded} downloaded, {skipped} skipped (already exist)")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    download_svgs()
