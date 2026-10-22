# Kavita for Gladys Assistant

External integration connecting a [Kavita](https://www.kavitareader.com) server
(self-hosted reading server for books, comics and manga) to
[Gladys Assistant](https://gladysassistant.com), built on the official
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) and the
[integration template](https://github.com/GladysAssistant/integration-template-js).

## Features

| Surface           | What you get                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Kavita device     | Online, libraries, series, volumes (admin key), series in progress, pages read today, version                                 |
| Scene triggers    | `series_added` (filter: library), `chapter_added` (a new volume or chapter of a series; filter: series), `series_finished`    |
| Scene actions     | `scan_library` (one library or all, admin key), `read_latest_additions` (the series of the last 7 days as a sentence)         |
| Dashboard widgets | `recently_added` (cover grid, series and volume counts, "Scan the libraries" button), `continue_reading` (series in progress) |

Texts and documentation in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Kavita server (0.8 or 0.9) reachable from Gladys, on the local network or
  behind a reverse proxy, and the **API key** of a Kavita account (Settings →
  3rd Party Clients, Auth Keys since 0.9). An administrator's key adds the
  volume count and the library scans.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-kavita`
   (or install **Kavita** from the catalog once it is listed).
2. In **Configuration**, enter the address of your server
   (`http://192.168.1.20:5000`, or `https://example.org/kavita` behind a
   reverse proxy) and the API key. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Kavita** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- REST API only. The API key is exchanged for a JWT through the plugin route
  of Kavita (`POST /api/Plugin/authenticate`), renewed when it expires; the
  JWT says whether the account is an administrator.
- One reading every 1 to 15 minutes (5 by default), on a timer of the
  container (`should_poll: false`): libraries, server statistics (admin),
  recently added series, series by last chapter added, "on deck", series by
  last read, and the reading statistics of the user. About eight light
  requests.
- Scene events come from cursors kept in `/data` (highest series id, newest
  `lastChapterAddedUtc`, finished series ids): announced once, also across
  restarts; the first reading of a server is the starting point.
- "Pages read today" is the user's `totalPagesRead` minus its value at local
  midnight (`TZ` of Gladys).
- The covers of the widgets are the thumbnails of Kavita, served through the
  widget image proxy of Gladys: the browser never sees the server nor the key.
- Transport badge: `local` for a private address, `cloud` for a server reached
  over the Internet.
- Quiet logs: the lifecycle and the errors at info, once; titles only at
  debug.

## Checked against a real server

The client, the parsers and the scenarios were checked against **Kavita
0.9.1.4** (the official image `jvmilazz0/kavita`) with generated EPUB and CBZ
files: the answers in `test/fixtures/kavita/` are real, and the integration ran
in its locked-down container (read-only, no capabilities, 256 MB) against that
server: new series and new volume after a scan, a series marked as read, a
reader key, a refused key. It has not yet run in a real Gladys installation:
feedback welcome. Kavita 0.8 is supported from its API (same routes, older
route for the user statistics) but was not run.

## Limitations

- Polling, not push: an addition reaches Gladys within the interval.
- "Series read to the end" works at the level of the series, over the 20
  series read last.
- No reading control, no metadata editing: the integration only reads, and
  asks for scans.
- One server and one Kavita account per installation of the integration.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against a fake Kavita server built from real answers
(`test/fixtures/kavita/`) and the fake Gladys of the SDK; they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Kavita](https://github.com/Kareadita/Kavita) (GPL-3.0) by Joseph Milazzo
  and contributors; its OpenAPI description was read to choose the routes. No
  code was copied from it. The logo of the cover is the official Kavita logo,
  from the `Logo/` folder of that repository.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js), after
  [gladys-audiobookshelf](https://github.com/guim31/gladys-audiobookshelf).

## Disclaimer

Not affiliated with, nor endorsed by, the Kavita project.

## License

[Apache-2.0](LICENSE)
