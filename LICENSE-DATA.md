# Data Licence

Most of the Formula 1 dataset used and redistributed by this project — the
database dump at `docker/backups/latest.sql.gz` and everything served from the
`/api/` endpoints, bar the session timing covered at the end of this file —
derives from [f1db](https://github.com/f1db/f1db), licensed:

**[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)**

## What that means for you

One obligation: **credit f1db**. That's it.

| Term | Obligation |
|------|------------|
| **BY** (Attribution) | Credit f1db as the source, link the licence, and note that changes were made. This project reshapes the data into a relational schema and derives additional statistics, so it **is** a modified version. |

There is **no NonCommercial term** and **no ShareAlike term**. You may use this
data commercially, and you are not required to license your own work under
CC BY 4.0.

> This project previously sourced its data from the jolpica-f1 API under
> CC BY-NC-SA 4.0, which forbade commercial use and imposed share-alike on any
> derived dataset. Migrating to f1db removed both restrictions.

## Attribution string

When redistributing the data, include something equivalent to:

> Formula 1 data from [f1db](https://github.com/f1db/f1db), licensed
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: reshaped
> into a relational schema and augmented with derived statistics by F1 Tracker.

## Fast-F1 is the other half

Lap-by-lap timing and qualifying sector times (2018+) come from
[Fast-F1](https://github.com/theOehrly/Fast-F1), not f1db — see
[ATTRIBUTIONS.md](ATTRIBUTIONS.md). `docker/backups/latest.sql.gz` is a full
database dump, so it carries that data (`lap_times` and the sector columns on
`qualifying_results`) alongside the f1db-derived tables. Fast-F1 itself is MIT;
the timing originates from Formula 1's own systems and is used here for
editorial and analytical purposes, under the trademark disclaimer reproduced in
[ATTRIBUTIONS.md](ATTRIBUTIONS.md) and shown to end users in the site footer.
