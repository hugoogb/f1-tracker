# Data Licence

The Formula 1 dataset used and redistributed by this project — including the
database dump committed at `docker/backups/latest.sql.gz` and everything served
from the `/api/` endpoints — is derived from the
[jolpica-f1 API](https://github.com/jolpica/jolpica-f1), whose data is licensed
under:

**[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/)**

Because this project builds a derived database from that source, the ShareAlike
term applies: **the dataset in this repository is redistributed under the same
CC BY-NC-SA 4.0 licence.**

## What that means for you

If you use this dataset, or any dump/fork of it, you must:

| Term | Obligation |
|------|------------|
| **BY** (Attribution) | Credit jolpica-f1 (and Ergast, its predecessor) as the origin of the data, link the licence, and state that changes were made. This project normalises, reshapes and augments the upstream data, so it **is** a modified version. |
| **NC** (NonCommercial) | You may not use the data for commercial purposes. This includes advertising-supported sites, paid tiers, sponsorships, and paid apps. |
| **SA** (ShareAlike) | Any dataset you derive from it must be distributed under CC BY-NC-SA 4.0 as well. |

## Commercial use

This project is deliberately **non-commercial**. If you want to build something
commercial on F1 data, this dataset is not a lawful starting point. Contact
jolpica-f1 at `admin@jolpi.ca`, and separately license anything you need from
OpenF1 and Formula One Licensing B.V.

## Attribution string

When redistributing the data, include something equivalent to:

> Formula 1 data from the [jolpica-f1 API](https://github.com/jolpica/jolpica-f1)
> (successor to the Ergast Developer API), licensed
> [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
> Modified: reshaped into a relational schema and augmented with derived
> statistics by F1 Tracker.

Images bundled in `apps/web/public/` are **not** covered by this licence — they
carry their own individual licences. See [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
