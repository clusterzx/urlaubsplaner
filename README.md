# Urlaubsplaner

Web-App, die für ein gewähltes Jahr und Bundesland die besten Urlaubs-Konstellationen berechnet:
Feiertage und Brückentage werden optimal ausgenutzt, Urlaub, **EZA (Extrazeitausgleich)** und
**Gleitzeit (Überstundenabbau)** werden getrennt verbucht und ausgewiesen. Der fertige Plan lässt
sich als PDF exportieren.

## Funktionen

- **Eingaben:** Jahr, Bundesland (inkl. regionaler Feiertage wie Mariä Himmelfahrt oder Augsburger
  Friedensfest), Urlaubstage (Standard 30), EZA-Tage (Standard 14), vorhandene Überstunden und
  Stunden pro Tag (Standard 7,6 h = 1 freier Tag).
- **Gleitzeit:** Überstunden werden in ganze freie Tage umgerechnet (z. B. 45,6 h ÷ 7,6 h = 6 Tage);
  ein Rest unter einem Tag wird angezeigt.
- **Schulferien** (2024–2030 mitgeliefert, spätere Jahre werden – sobald veröffentlicht – live von
  der OpenHolidays API geladen):
  - Ferien eines frei wählbaren Bundeslandes einblenden (Standard: wie Arbeitsort; z. B. Arbeit in
    Bayern, Schule in Baden-Württemberg).
  - Zusätzlich den **bundesweiten Ferienzeitraum** je Ferienart einblenden: frühester Beginn bis
    spätestes Ende über alle 16 Länder (z. B. Sommerferien 28.06.–13.09.2027).
  - Bei der Planung: *nur anzeigen*, *Urlaub bevorzugt in den Ferien* (z. B. für Eltern), *Urlaub nur
    in den Ferien* oder *Ferien meiden* (leerer & günstiger). Bei „bevorzugt“/„nur“ liegt der
    Sommerurlaub der Szenarien in den Sommerferien.
- **Feste Zeiten & Wünsche:** feste Urlaube (optional mit festem Konto), Urlaubssperren und
  zusätzliche arbeitsfreie Tage (z. B. Betriebsruhe). Feste Urlaube werden in jedem Szenario genau so
  übernommen, in Sperren wird nie geplant.
- **Vier Szenarien:**
  - *Ausgewogen* – beste Feiertags-Konstellationen plus Sommerurlaub von mindestens zwei Wochen
  - *Maximale Effizienz* – rechnerisch die meisten freien Tage pro eingesetztem Tag
  - *Lange Auszeiten* – wenige, lange Urlaube rund um Feiertage
  - *Regelmäßig erholen* – alle paar Wochen mindestens 9 Tage am Stück frei
- **Übersicht:** Urlaub, EZA und Gleitzeit getrennt (verplant / verfügbar / Rest, Gleitzeit auch in
  Stunden), freie Tage am Stück und Faktor (freie Tage je eingesetztem Tag).
- **Jahreskalender zum Bearbeiten:** Klick auf einen Arbeitstag bucht ihn um (Urlaub → EZA →
  Gleitzeit → Arbeit) oder gezielt mit einem gewählten „Pinsel“.
- **Brückentage-Finder:** die lohnendsten Konstellationen je Feiertag, mit einem Klick übernehmbar.
- **PDF-Export:** A4 quer mit Jahresübersicht, Kontenstand, Liste der Auszeiten und Feiertagen.
- Alle Eingaben bleiben lokal im Browser gespeichert (localStorage), es gibt kein Backend.

Weitere Einstellungen: Resturlaub aus dem Vorjahr, Reserve-Tage, Arbeitstage (z. B. Teilzeit Mo–Do),
24.12./31.12. arbeitsfrei, Pflicht zu zwei Wochen am Stück (§ 7 BUrlG), Reihenfolge der Konten bei der
automatischen Zuordnung.

## Start mit Docker

Die App läuft im Container auf Port **6534**.

```bash
docker compose up -d --build
# → http://localhost:6534
```

oder ohne Compose:

```bash
docker build -t urlaubsplaner .
docker run -d --name urlaubsplaner -p 6534:6534 --restart unless-stopped urlaubsplaner
```

Das Image wird mehrstufig gebaut: Node baut die App (die Tests laufen dabei mit), nginx liefert
anschließend nur die statischen Dateien aus. Ein Healthcheck ist eingebaut.

## Entwicklung

Voraussetzung: Node.js 22

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Vitest)
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run update-ferien            # Schulferien aktualisieren (aktuelles Jahr −1 bis +5)
npm run update-ferien 2026 2032  # … oder für einen bestimmten Zeitraum
```

Die Schulferien stammen von der [OpenHolidays API](https://www.openholidaysapi.org) und liegen in
`src/data/school-holidays.json`. Berücksichtigt werden die landesweiten Termine der allgemeinbildenden
Schulen; Sonderregeln (z. B. Nordseeinseln) und bewegliche Ferientage einzelner Schulen nicht.

## So rechnet der Optimierer

Jeder Arbeitstag wird entweder gearbeitet oder frei genommen. Frei genommene Arbeitstage bilden
zusammen mit angrenzenden Wochenenden, Feiertagen und arbeitsfreien Tagen eine *Auszeit*. Bewertet
wird die Summe der Auszeit-Längen – also wie viele freie Tage am Stück aus den eingesetzten Tagen
entstehen. Die Szenarien unterscheiden sich durch Nebenbedingungen (Mindestlänge einer Auszeit,
Höchstzahl an Auszeiten, Sommerurlaub, gleichmäßige Abstände). Gelöst wird exakt per dynamischer
Programmierung über alle Arbeitstage des Jahres; Auszeiten über den Jahreswechsel werden korrekt
berücksichtigt.

Anschließend werden die Tage den Konten zugeordnet: zuerst feste Zeiten mit vorgegebenem Konto,
danach standardmäßig kurze Auszeiten (Brückentage) aus Gleitzeit und EZA, lange Urlaube aus dem
Urlaubskonto. Reihenfolge und Verfahren sind einstellbar.

## Projektstruktur

```
src/
  lib/          Logik ohne UI (Feiertage, Schulferien, Kalender, Optimierer, Konten, PDF) + Tests
  data/         mitgelieferte Schulferien
  components/   React-Komponenten
  App.tsx       Zustand und Seitenaufbau
docker/         nginx-Konfiguration für das Container-Image
scripts/        Aktualisierung der Schulferien
```

## Hinweise

Alle Angaben ohne Gewähr. Regionale Feiertage (z. B. Fronleichnam in Teilen Sachsens/Thüringens) und
betriebliche Regelungen bitte im Einzelfall prüfen.
