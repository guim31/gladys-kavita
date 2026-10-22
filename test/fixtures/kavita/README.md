# Kavita fixtures

Real answers of a **Kavita 0.9.1.4** server (official image `jvmilazz0/kavita`),
captured on 2026-10-22 from a test library of generated files: two comic
series in CBZ (`Test Comic`, two volumes; `Other Manga`) and one EPUB without
a cover image (`Quiet Morning` by Jane Doe), in a `Comics` and a `Books`
library. No token, key or address of a real installation.

| File                    | Route                                                          |
| ----------------------- | -------------------------------------------------------------- |
| `libraries.json`        | `GET /api/Library/libraries`                                   |
| `recently-added.json`   | `POST /api/Series/recently-added-v2` (sort 2, created)         |
| `recently-updated.json` | `POST /api/Series/all-v2` (sort 4, last chapter added)         |
| `recently-read.json`    | `POST /api/Series/all-v2` (sort 7, read progress)              |
| `on-deck.json`          | `POST /api/Series/on-deck` (Test Comic, 3 pages of 9 read)     |
| `server-stats.json`     | `GET /api/Stats/server/stats` (administrator)                  |
| `user-read.json`        | `GET /api/Stats/user-read?userId=1`                            |
| `cover-series-2.png`    | `GET /api/Image/series-cover?seriesId=2` (320 × 455 thumbnail) |
