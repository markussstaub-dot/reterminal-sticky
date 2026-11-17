# Der Sticky als Notfallgerät – Bauanleitung

Der reTerminal Sticky mit der EDC-Firmware (ab 0.43.0) kann im Notfall helfen: Er zeigt ein Notfallblatt auch bei
leerem Akku (e-Ink hält das Bild ohne Strom), piept SOS, hält im Sparmodus lange durch, trägt PIN-geschützte
Dokumente, Umgebungskarten und einen Sonnenkompass. Er ersetzt kein Handy – kein Netz, kein GPS –, aber er zeigt
noch etwas, wenn Strom, Netz und Handy weg sind.

> **Wichtig:** Das ersetzt keinen Erste-Hilfe-Kurs und keine amtliche Warnung. Inhalte (Erste Hilfe, Vorsorge) liefert
> dieses Repo bewusst nicht mit – nur Technik, diese Anleitung und Links zu verlässlichen Quellen.

*English summary at the end.*

## Was du brauchst

- reTerminal Sticky mit EDC-Firmware ≥ 0.43.0 und microSD-Karte
- einen Rechner mit **Chrome oder Edge** (für das Notfallblatt reicht die
  [Sticky-Console](https://markussstaub-dot.github.io/sticky-lab/console/), Reiter „Notfall“) oder **Python 3** mit
  Pillow, pyserial, cryptography und pypdfium2 (für Dokumente und Karten: `sticky-app/tools/`)
- ein USB-C-Kabel (Daten), optional einen SD-Kartenleser für große Mengen

## 1. Notfallblatt

Name, zwei Notfallkontakte, das Lebenswichtige zur Medizin, Treffpunkt, Inhalt der Box. Wer den Sticky findet, kann es
lesen – also nur das, was Helfern nützt und offen stehen darf.

- **Ohne Python:** Sticky-Console → „Notfall“ → Textfeld ausfüllen → „Per USB aufspielen“ (oder „Für SD-Karte laden“
  und beide Dateien nach `/soll/widgets/notfall/` kopieren). Die Daten bleiben im Browser.
- **Mit Python:** `python sticky-app/tools/notfallblatt.py` legt beim ersten Start eine private Datei
  `notfall.md` an (außerhalb des Repos), danach ausfüllen und noch einmal starten.

Am Sticky erscheint die Seite **Notfall** (in der Seitenreihe und im Menü) mit den Knöpfen
**SOS** (Morse über den Summer, eine Taste beendet es), **Sparmodus** (Funk aus, nur stündlich wach, vor jedem Schlaf
steht das Blatt), **Dokumente** und **Sonne**. Bei fast leerem Akku schaltet der Sticky selbst in den Sparmodus und
zeigt das Blatt.

## 2. Papierkarte

Jeder Lauf von `notfallblatt.py` (oder „Papierkarte drucken“ in der Console) erzeugt dieselben Daten als
Scheckkarte zum Falten – für Portemonnaie und Box. In 100 % drucken, ausschneiden, falten, laminieren.

## 3. Dokumente mit PIN

Ausweis, Krankenkassenkarte, Impfpass, Medikamentenplan … als PDF/JPG/PNG in den privaten Ordner `notfall-doku`
legen und `notfallblatt.py` starten. Beim ersten Mal fragt es eine PIN (4–6 Ziffern) ab. Die Seiten liegen
verschlüsselt (AES-256-GCM) auf der Karte, der Schlüssel liegt mit der PIN verpackt im Sticky; zehn falsche PINs
löschen ihn. Den Schlüssel (`notfall-schluessel.bin`) zusätzlich sichern – er ist das Backup.

Grenze, ehrlich: Gegen jemanden, der den Sticky findet, reicht das. Gegen ein Labor mit Werkzeug nicht
(der Flash ist nicht verschlüsselt).

## 4. Karten

`python sticky-app/tools/notfallkarten.py` liest eine private Ortsliste (`notfall-karten.txt`, Koordinaten oder
Adressen) und zeichnet je Ort: Übersicht 1:100.000 → Nahblatt 1:25.000 → vier Lupen 1:12.500 mit Straßennamen,
1-km-UTM-Gitter, Kliniken, Apotheken, Trinkwasser, Schutzhütten. Antippen zoomt hinein. Daten:
OpenStreetMap über [OpenFreeMap](https://openfreemap.org) (© OpenStreetMap-Mitwirkende, ODbL).

## 5. Sonnenkompass

Seite „Sonne“: Sticky drehen, bis der Strahl zur Sonne zeigt – dann zeigt N nach Norden. Dazu Höhe der Sonne,
Auf- und Untergang. Braucht die richtige Uhrzeit (stellt das Handy, sonst Einstellungen → Uhr) und den ungefähren
Ort (schreibt `notfallkarten.py` mit dem ersten Ort; ohne Ort rechnet er mit der Mitte Deutschlands).

## 6. Box (Idee)

Eine kleine gedruckte Box mit Fenster im Deckel (das Blatt bleibt lesbar), Powerbank, faltbares Solarpanel
5–10 W (immer Panel → Powerbank → Sticky, nie direkt), Ersatz-Lesebrille, Lampe, Pfeife, Rettungsdecke, Pflaster,
Bargeld, Papierkarte. Achtung: Der Akku des Sticky lädt nur bei 0–45 °C.

## 7. Pflege

- alle 3 Monate: Sticky und Powerbank laden, SOS kurz testen
- alle 12 Monate: Daten durchsehen (Nummern, Medikamente), neu aufspielen, Karte neu drucken
- einmal im Jahr: ein Wochenende nur mit der Box

## Quellen (nur Links)

- **Vorsorge (DE):** BBK – Ratgeber „Vorsorgen für Krisen und Katastrophen“ und Checklisten:
  <https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/Ratgeber-Checkliste/ratgeber-checkliste_node.html>
- **Warnung (DE):** BBK – Warnung, Warn-App NINA, Cell Broadcast:
  <https://www.bbk.bund.de/DE/Warnung-Vorsorge/warnung-vorsorge_node.html>
- **Erste Hilfe / Wiederbelebung:** ERC-Leitlinien 2025:
  <https://www.erc.edu/science-research/guidelines/guidelines-2025/guidelines-2025-english/> ·
  Deutscher Rat für Wiederbelebung: <https://www.grc-org.de> · **Kurs machen** bei DRK, Johanniter, Malteser oder ASB
- **Trinkwasser:** CDC – How to Make Water Safe in an Emergency: <https://www.cdc.gov/water-emergency/about/>
- **Survival allgemein (EN, gemeinfrei):** US Army ATP 3-50.21 *Survival*: <https://irp.fas.org/doddir/army/atp3-50-21.pdf> ·
  FM 21-76-1: <https://irp.fas.org/doddir/army/fm21-76-1.pdf>
- **Orientierung:** Wikibooks „Orientierung im Gelände“ (CC BY-SA, Community-Text):
  <https://de.wikibooks.org/wiki/Orientierung_im_Gel%C3%A4nde>

Jedes Land hat eigene Notrufnummern und Warnsysteme (EU: 112) – vor Ort nachsehen.

---

## English summary

With EDC firmware ≥ 0.43.0 the Sticky shows an emergency sheet that stays visible with an empty battery, beeps SOS,
has a power-save mode, PIN-protected documents (AES-256-GCM, key wrapped with your PIN inside the device), offline
maps (OpenStreetMap via OpenFreeMap) and a sun compass. Fill in the sheet in the
[Sticky Console](https://markussstaub-dot.github.io/sticky-lab/console/) (tab “Emergency”, upload via USB or download
for the SD card) or with the Python tools in `sticky-app/tools/`. This is no replacement for a first-aid course or
official warnings; the repo ships tools and links only, no content. Sources: BBK *Planning ahead for crises and
disasters* (EN), ERC Guidelines 2025, CDC water safety, US Army ATP 3-50.21 *Survival*.
