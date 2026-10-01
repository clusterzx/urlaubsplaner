# Urlaubsplaner

Web-App, die Urlaub, EZA (Extrazeitausgleich) und Gleittage für ein Jahr so verteilt, dass Feiertage und Brückentage möglichst gut genutzt werden. Sie schlägt mehrere Szenarien vor, berücksichtigt feste Termine und exportiert den Plan als PDF.

## Funktionen

- **Jahr, Bundesland, Kontingente:** Jahr und Bundesland wählen, dazu Urlaubstage (Standard 30), EZA-Tage (Standard 14) und vorhandene Überstunden. Überstunden werden in Gleittage umgerechnet (Standard 7,6 h = 1 freier Tag, einstellbar).
- **Feiertage aller 16 Bundesländer:** werden aus dem Jahr berechnet (Ostern nach Gauß, Buß- und Bettag usw.), inklusive jahresabhängiger Regeln (z. B. Frauentag in Berlin ab 2019 und in MV ab 2023, Reformationstag im Norden ab 2018). Regionale Feiertage lassen sich zuschalten (z. B. Mariä Himmelfahrt in Bayern, Augsburger Friedensfest, Fronleichnam in Teilen von Sachsen und Thüringen).
- **Szenarien:**
  - *Brückentage-Maximum*: möglichst viele freie Tage pro eingesetztem Tag
  - *Ausgewogen*: 2 Wochen Haupturlaub im Wunschzeitraum plus die besten Brückentage
  - *Großer Haupturlaub*: 3 Wochen am Stück, dazu wenige lange Auszeiten
  - *Viele lange Wochenenden*: Auszeiten von höchstens 3 Arbeitstagen
  - *Eigenes Szenario*: max. Anzahl Blöcke, Länge des Haupturlaubs und max. Blocklänge frei wählbar
- **Feste Zeiträume:** Termine, die dir wichtig sind, werden immer eingeplant, wahlweise als Urlaub, EZA, Gleitzeit oder automatisch. *Sperrzeiten* (z. B. Projektphasen) bleiben frei von Urlaub.
- **Getrennte Übersicht** für Urlaub, EZA und Gleitzeit: verplant, Rest und Überstunden-Restkonto.
- **„Zu beantragen“:** je Urlaubsblock die konkreten Zeiträume pro Kontingent, zum Übertragen in den Urlaubsantrag.
- **Manuell anpassen:** Ein Klick auf einen Arbeitstag im Kalender wechselt zwischen Urlaub, EZA, Gleitzeit und Arbeitstag. Alle Zahlen rechnen sofort mit.
- **Beste Brückentage:** Übersicht der lohnendsten Kombinationen rund um jeden Feiertag.
- **PDF-Export** (A4 quer): Jahresübersicht im Stil eines Wandplaners plus Blockliste, Feiertage und Grundlagen. Wahlweise das aktive Szenario oder alle Szenarien in einem PDF.
- **Weitere Einstellungen:** Arbeitstage (z. B. 4-Tage-Woche), Heiligabend/Silvester als halbe oder freie Tage, Reserve, Wunschzeitraum für den Haupturlaub, Reihenfolge beim Verbuchen (z. B. Gleitzeit → EZA → Urlaub) und ob einzelne Brückentage bevorzugt mit Gleitzeit abgedeckt werden.

Alle Berechnungen laufen lokal im Browser. Eingaben werden nur im `localStorage` des Geräts gespeichert.

## Starten

Es gibt keinen Build-Schritt und keine Abhängigkeiten zur Laufzeit.

- **Direkt:** `index.html` im Browser öffnen.
- **Lokaler Server (optional):** `npx serve .` oder `python3 -m http.server` und dann `http://localhost:3000` bzw. `:8000` aufrufen.
- **GitHub Pages:** In den Repository-Einstellungen unter *Pages* „Deploy from a branch“ wählen, Branch und Ordner `/ (root)` angeben.
- **Docker:** siehe unten, die App läuft dann auf Port **6533**.

## Docker

Das Image basiert auf `nginxinc/nginx-unprivileged` (nginx ohne Root-Rechte) und liefert die App auf Port **6533** aus.

Mit Docker Compose:

```bash
docker compose up -d --build
```

Oder direkt mit Docker:

```bash
docker build -t urlaubsplaner .
docker run -d --name urlaubsplaner -p 6533:6533 --restart unless-stopped urlaubsplaner
```

Danach ist die App unter `http://localhost:6533` bzw. `http://<server>:6533` erreichbar.

- **Anderer Port auf dem Host:** nur die linke Seite der Port-Zuordnung ändern, z. B. `-p 8080:6533` bzw. `"8080:6533"` in `docker-compose.yml`.
- **Healthcheck:** `GET /healthz` liefert `ok`. Docker prüft das automatisch (`docker ps` zeigt `healthy`).
- **Update:** `git pull && docker compose up -d --build`
- **Hinter einem Reverse-Proxy** (Traefik, Caddy, nginx) einfach auf `http://urlaubsplaner:6533` weiterleiten.
- In `docker ps` taucht zusätzlich `8080/tcp` auf. Das stammt aus dem Basis-Image und wird nicht genutzt.

Die Daten der Nutzer (Eingaben, feste Zeiträume) liegen im Browser, nicht im Container. Ein Volume ist daher nicht nötig.

## Tests

```bash
npm test
```

Die Tests (Node ≥ 18, `node:test`) prüfen Feiertage und Osterdaten, Kalenderwochen, die Umrechnung der Überstunden sowie den Optimierer: Kontingent wird eingehalten, keine Buchungen auf Sperrzeiten, feste Zeiträume, Haupturlaub im Wunschzeitraum, halbe Tage und ein Abgleich mit einer Brute-Force-Suche.

## So rechnet der Planer

1. Der Kalender des Jahres wird aufgebaut (plus zwei Wochen Rand, damit Blöcke über den Jahreswechsel richtig gezählt werden). Jeder Arbeitstag kostet einen Tag, Heiligabend/Silvester optional einen halben.
2. Für jede Folge von Arbeitstagen, die an ein Wochenende, einen Feiertag oder einen festen Termin grenzt, wird berechnet, wie viele Tage am Stück frei werden.
3. Eine dynamische Programmierung wählt je Szenario die Kombination nicht überlappender Blöcke, die bei gegebenem Budget die meisten freien Tage am Stück ergibt, unter Beachtung von maximaler Blockanzahl, maximaler Blocklänge und ggf. Pflicht-Haupturlaub im Wunschzeitraum.
4. Gleichwertige Blöcke ohne Feiertag werden gleichmäßig übers Jahr verteilt.
5. Die gebuchten Tage werden auf Gleitzeit, EZA und Urlaub verteilt: zuerst feste Termine mit gewählter Art, dann optional einzelne Brückentage mit Gleitzeit, dann der Rest chronologisch in der gewählten Reihenfolge.

**Faktor** = freie Tage am Stück je eingesetztem Urlaubs-, EZA- oder Gleittag.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seitengerüst und Formular |
| `css/styles.css` | Gestaltung inkl. Dunkelmodus und Handy-Ansicht |
| `js/holidays.js` | Datumsfunktionen, Feiertage aller Bundesländer, Kalenderwoche |
| `js/optimizer.js` | Kalender, Kandidaten, Optimierung, Verteilung auf Kontingente, Auswertung |
| `js/pdf.js` | PDF-Export mit jsPDF |
| `js/app.js` | Oberfläche und Speicherung |
| `vendor/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 (MIT-Lizenz, siehe `vendor/jspdf.LICENSE`) |
| `tests/` | Automatische Tests |
| `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf` | Container-Image mit nginx auf Port 6533 |

## Hinweise

Angaben ohne Gewähr. Regionale Feiertage, Betriebsvereinbarungen (z. B. zu Heiligabend/Silvester) und Regeln zur Übertragung von Resturlaub bitte im eigenen Betrieb prüfen. Schulferien sind nicht hinterlegt. Wer sie berücksichtigen möchte, trägt sie als festen Zeitraum ein oder passt den Wunschzeitraum für den Haupturlaub an.
