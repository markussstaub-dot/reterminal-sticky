# Gehäuse für den reTerminal Sticky

Baukasten aus einem Grundmodell (SPEC „Baukasten mit zwei Varianten“):

| Datei | Was |
|---|---|
| `sticky_masse.scad` | Grundmodell: Maße, Tasten, microSD, USB-C, Reset, Mikro, Ösen; Gerät und Hohlraum mit Spiel |
| `sticky_sleeve.scad` | **Sticky-Sleeve** (Alltag/EDC/Bugout), oben offen zum Einschieben, Touch frei, Rückenfenster für den Magnetring |
| `sticky_sleeve.stl` | daraus exportiert (OpenSCAD 2021.01) |
| *(später)* `sticky_sleeve_dive.scad` | **Sticky-Sleeve-Dive** (40 m, POM gefräst, Fenster, Tastenstößel) |

## Drucken (Sleeve, erster Passform-Test)

- PETG oder PLA, 0,2 mm Schicht, 3 Wände, 15 % Füllung, **ohne Stütze**
- **Rücken aufs Bett** (wie die STL liegt); die Frontlippe ragt nur 1 mm nach innen
- Prüfen: gleitet der Sticky von oben hinein, sitzt er ohne Klappern, liegen Tasten, USB-C, microSD frei, geht der Touch
  bis an den Rand? Spiel anpassen in `sticky_masse.scad` (`SPIEL_XY`, `SPIEL_Z`)

## Maße und Lizenz

Die Gerätemaße stammen aus dem Lanyard Case von **Kenta IDA** (<https://github.com/ciniml/epaper-enclosures>, Ordner
`sticky`, **CC BY 4.0**), dort aus Seeeds Hardware-Übersicht und an einer Referenzhülle abgeglichen; Gegenprobe an Seeeds
„Sticky Case Simple“. Die Modelle hier stehen unter der Lizenz des Repos (MIT); die Maße bitte mit Nennung von Kenta IDA
weitergeben.
