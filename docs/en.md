# Kavita

Connect your [Kavita](https://www.kavitareader.com) reading server (books,
comics, manga, self-hosted) to Gladys: the counts of your libraries, your
series in progress and the pages read today, the latest additions with their
covers on the dashboard, and scenes that react when a new series or a new
volume arrives, or when you finish a series.

The integration was tested against a real Kavita 0.9.1.4 server (the official
Docker image), not yet in a real Gladys installation: feedback welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-kavita/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A **Kavita** server reachable from Gladys: on your network, or on the
  Internet behind a reverse proxy. Tested with Kavita 0.9; 0.8 should work.
- The **API key** of your Kavita account: in Kavita, **Settings** → **3rd
  Party Clients** (**Auth Keys** since Kavita 0.9), copy the key. The
  integration sees what this account sees: its libraries, its reading
  progress.
- The key of an **administrator** also gives the volume count and allows the
  library scans; the key of a reader works for everything else.

## Setup

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Server URL** with its port (for example
   `http://192.168.1.20:5000`; behind a reverse proxy,
   `https://example.org/kavita`) and the **API key**.
3. If you wish, choose how often the server is read (every 5 minutes by
   default) and the language of the names.
4. Save, then click **Test the connection**: it shows the version, the
   account (administrator or reader) and the counts it finds.
5. In the **Discovery** tab, add the **Kavita** device.

## Device

**Kavita** (one device for the server, seen through your account):

| Feature                | Meaning                                                    |
| ---------------------- | ---------------------------------------------------------- |
| **Online**             | 1 while the integration reads the server                   |
| **Libraries**          | libraries your account can see                             |
| **Series**             | series of the server (of your libraries with a reader key) |
| **Volumes**            | volumes of the server (administrator key only)             |
| **Series in progress** | series you started and did not finish ("On Deck")          |
| **Pages read today**   | pages you read today, as Kavita counts them                |
| **Version**            | version of Kavita                                          |

## Dashboard

- **Kavita: recently added**: a grid of the last series added, with their
  covers, the date and the library, the number of series and volumes, and
  (administrator key) a **Scan the libraries** button, the same as the scene
  action below.
- **Kavita: continue reading**: your series in progress with their covers,
  the pages read and the progress, the number of series in progress and the
  pages read today.

## Scenes

### Triggers

- **New series added**: a new series (book, comic, manga) appears in a
  library after a scan. Filter: the library, exactly as shown in Kavita.
  Information: series title, library, format (`archive`, `epub`, `pdf`,
  `images`).
- **New volume or chapter**: a new volume or chapter is added to a series
  already in Kavita. Filter: the series you follow, its title exactly as shown
  in Kavita. Information: series title, library.
- **Series read to the end**: you reach the last page of a series, or mark it
  as read. Filter: the library. Information: series title, library, pages.

### Actions

- **Scan Kavita libraries**: Kavita looks for new files in one library (its
  name, any case) or in all of them; it scans in the background, and the new
  series show at the next reading, about a minute later. Administrator key
  only. Result: the number of libraries scanned.
- **Read the latest Kavita additions**: a sentence for a notification or a
  speaker, for example _"2 new series on Kavita in the last 7 days: Quiet
  Morning and Test Comic."_ Results: the sentence, the number of new series,
  the title of the latest one (12 series at most).

### Scene ideas

- **New volume of my manga**: when _New volume or chapter_ with your series,
  send a notification "New volume of {series}".
- **Sunday digest**: every Sunday at 10 am, _Read the latest Kavita
  additions_, then send the sentence as a message.
- **After the download**: every night at 3 am, _Scan Kavita libraries_, so the
  files your download tools dropped show up in the morning.

## Troubleshooting

- **"the server does not answer"**: check the address and the port from the
  Gladys machine. Gladys runs the integration in a container: `localhost` is
  the container itself, use the IP address of the machine.
- **"API key refused"**: the key was reset or deleted in Kavita; copy it
  again.
- **"this API key is not an administrator's"**: the scan needs the key of an
  administrator account.
- **"no Kavita server at this address"** or **"the address redirects"**: a
  server behind a reverse proxy needs its base path
  (`https://example.org/kavita`); a login page of the proxy blocks the API.
- **"certificate refused"**: HTTPS with a self-signed certificate is not
  supported; use the `http://` address of your network.
- No cover: Kavita has none for this series (an EPUB without an image), or
  stores its covers in AVIF, which Gladys does not show (Kavita: Settings →
  Media → Save Media As: PNG or WebP).
- The integration only logs its lifecycle; with `LOG_LEVEL=debug`, it also
  logs each event, with the titles.

## Limitations

- The server is read every 1 to 15 minutes, not pushed: an addition reaches
  Gladys within this interval (and after Kavita's own scan).
- At most 10 events of one kind per reading (a first big scan announces 10
  series, not hundreds). New volumes older than 24 hours are not announced (a
  Gladys stopped two days does not replay them).
- **Series read to the end** follows the 20 series read last, at the level of
  the series (a single volume read to the end is not an event).
- **Pages read today** follows the reading statistics of Kavita (pages read in
  its readers), counted from the first reading of the day: pages read after
  midnight while Gladys or Kavita was stopped are left out.
- One Kavita account and one server per installation of the integration.
- Not affiliated with the Kavita project.
