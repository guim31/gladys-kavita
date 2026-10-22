# Kavita

Verbinde deinen [Kavita](https://www.kavitareader.com)-Leseserver (Bücher,
Comics, Manga, selbst gehostet) mit Gladys: die Zahlen deiner Bibliotheken,
deine laufenden Serien und die heute gelesenen Seiten, die neuesten Zugänge mit
ihren Covern auf dem Dashboard und Szenen, die reagieren, wenn eine neue Serie
oder ein neuer Band ankommt oder du eine Serie beendest.

Die Integration wurde mit einem echten Kavita-0.9.1.4-Server (dem offiziellen
Docker-Image) getestet, noch nicht in einer echten Gladys-Installation:
Rückmeldungen sind im [Gladys-Forum](https://community.gladysassistant.com)
oder in den [Issues](https://github.com/guim31/gladys-kavita/issues)
willkommen.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Ein **Kavita**-Server, den Gladys erreicht: in deinem Netzwerk oder im
  Internet hinter einem Reverse Proxy. Getestet mit Kavita 0.9; 0.8 sollte funktionieren.
- Der **API-Schlüssel** deines Kavita-Kontos: in Kavita unter
  **Einstellungen** → **3rd Party Clients** (**Auth Keys** seit Kavita 0.9)
  den Schlüssel kopieren. Die Integration sieht, was dieses Konto sieht: seine
  Bibliotheken, seinen Lesefortschritt.
- Der Schlüssel eines **Administrators** liefert zusätzlich die Bandanzahl
  und erlaubt die Bibliotheks-Scans; der Schlüssel eines Lesers reicht für
  alles andere.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Server-URL** mit Port ein (zum Beispiel
   `http://192.168.1.20:5000`; hinter einem Reverse Proxy
   `https://example.org/kavita`) und den **API-Schlüssel**.
3. Wähle bei Bedarf, wie oft der Server gelesen wird (standardmäßig alle 5
   Minuten), und die Sprache der Namen.
4. Speichere und klicke auf **Verbindung testen**: Du siehst die Version, das
   Konto (Administrator oder Leser) und die gefundenen Zahlen.
5. Füge im Tab **Erkennung** das Gerät **Kavita** hinzu.

## Gerät

**Kavita** (ein Gerät für den Server, aus Sicht deines Kontos):

| Funktion                  | Bedeutung                                                    |
| ------------------------- | ------------------------------------------------------------ |
| **Online**                | 1, solange die Integration den Server liest                  |
| **Bibliotheken**          | Bibliotheken, die dein Konto sieht                           |
| **Serien**                | Serien des Servers (deiner Bibliotheken bei Leser-Schlüssel) |
| **Bände**                 | Bände des Servers (nur mit Administrator-Schlüssel)          |
| **Laufende Serien**       | begonnene, nicht beendete Serien („On Deck“)                 |
| **Heute gelesene Seiten** | heute gelesene Seiten, wie Kavita sie zählt                  |
| **Version**               | Version von Kavita                                           |

## Dashboard

- **Kavita: neu hinzugefügt**: ein Raster der zuletzt hinzugefügten Serien mit
  Covern, Datum und Bibliothek, die Zahl der Serien und Bände und (mit
  Administrator-Schlüssel) ein Knopf **Bibliotheken scannen**, derselbe wie
  die Szenenaktion unten.
- **Kavita: weiterlesen**: deine laufenden Serien mit Covern, gelesenen Seiten
  und Fortschritt, die Zahl der laufenden Serien und die heute gelesenen
  Seiten.

## Szenen

### Auslöser

- **Neue Serie hinzugefügt**: Eine neue Serie (Buch, Comic, Manga) erscheint
  nach einem Scan in einer Bibliothek. Filter: die Bibliothek, genau wie in
  Kavita angezeigt. Informationen: Titel der Serie, Bibliothek, Format
  (`archive`, `epub`, `pdf`, `images`).
- **Neuer Band oder neues Kapitel**: Ein neuer Band oder ein neues Kapitel
  kommt zu einer Serie hinzu, die schon in Kavita ist. Filter: die Serie, der
  du folgst, ihr Titel genau wie in Kavita. Informationen: Titel der Serie,
  Bibliothek.
- **Serie zu Ende gelesen**: Du erreichst die letzte Seite einer Serie oder
  markierst sie als gelesen. Filter: die Bibliothek. Informationen: Titel der
  Serie, Bibliothek, Seiten.

### Aktionen

- **Kavita-Bibliotheken scannen**: Kavita sucht neue Dateien in einer
  Bibliothek (ihr Name, Groß- und Kleinschreibung egal) oder in allen; der
  Scan läuft im Hintergrund, die neuen Serien erscheinen beim nächsten Lesen,
  etwa eine Minute später. Nur mit Administrator-Schlüssel. Ergebnis: die Zahl
  der gescannten Bibliotheken.
- **Neueste Kavita-Zugänge vorlesen**: ein Satz für eine Benachrichtigung oder
  einen Lautsprecher, zum Beispiel _„2 neue Serie(n) auf Kavita in den letzten
  7 Tagen: Quiet Morning und Test Comic.“_ Ergebnisse: der Satz, die Zahl der
  neuen Serien, der Titel der neuesten (höchstens 12 Serien).

### Szenen-Ideen

- **Neuer Band meines Mangas**: bei _Neuer Band oder neues Kapitel_ mit deiner
  Serie die Benachrichtigung „Neuer Band von {series}“ senden.
- **Sonntags-Übersicht**: jeden Sonntag um 10 Uhr _Neueste Kavita-Zugänge
  vorlesen_ und den Satz als Nachricht senden.
- **Nach den Downloads**: jede Nacht um 3 Uhr _Kavita-Bibliotheken scannen_,
  damit die Dateien deiner Download-Werkzeuge am Morgen da sind.

## Fehlerbehebung

- **„der Server antwortet nicht“**: Prüfe Adresse und Port von der
  Gladys-Maschine aus. Gladys führt die Integration in einem Container aus:
  `localhost` ist der Container selbst, nimm die IP-Adresse der Maschine.
- **„API-Schlüssel abgelehnt“**: Der Schlüssel wurde in Kavita zurückgesetzt
  oder gelöscht; kopiere ihn erneut.
- **„dieser API-Schlüssel gehört keinem Administrator“**: Der Scan braucht den
  Schlüssel eines Administrator-Kontos.
- **„kein Kavita-Server unter dieser Adresse“** oder **„die Adresse leitet
  um“**: Ein Server hinter einem Reverse Proxy braucht seinen Basispfad
  (`https://example.org/kavita`); eine Anmeldeseite des Proxys blockiert die
  API.
- **„Zertifikat abgelehnt“**: HTTPS mit selbst signiertem Zertifikat wird
  nicht unterstützt; verwende die `http://`-Adresse in deinem Netzwerk.
- Kein Cover: Kavita hat keins für diese Serie (ein EPUB ohne Bild) oder
  speichert seine Cover als AVIF, das Gladys nicht anzeigt (Kavita:
  Einstellungen → Media → Save Media As: PNG oder WebP).
- Die Integration protokolliert nur ihren Lebenszyklus; mit
  `LOG_LEVEL=debug` protokolliert sie auch jedes Ereignis mit den Titeln.

## Einschränkungen

- Der Server wird alle 1 bis 15 Minuten gelesen, nicht gepusht: Ein Zugang
  erreicht Gladys innerhalb dieses Intervalls (und nach dem Scan von Kavita
  selbst).
- Höchstens 10 Ereignisse einer Art pro Lesen (ein erster großer Scan meldet
  10 Serien, nicht Hunderte). Bände, die vor mehr als 24 Stunden hinzukamen,
  werden nicht gemeldet (ein zwei Tage gestopptes Gladys spielt sie nicht
  nach).
- **Serie zu Ende gelesen** verfolgt die 20 zuletzt gelesenen Serien, auf
  Ebene der Serie (ein einzelner zu Ende gelesener Band ist kein Ereignis).
- **Heute gelesene Seiten** folgt der Lesestatistik von Kavita (in seinen
  Readern gelesene Seiten), gezählt ab dem ersten Lesen des Tages: Seiten, die
  nach Mitternacht gelesen wurden, während Gladys oder Kavita gestoppt war,
  fehlen.
- Ein Kavita-Konto und ein Server pro Installation der Integration.
- Nicht mit dem Kavita-Projekt verbunden.
