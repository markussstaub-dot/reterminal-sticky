// Handgriff-Spickzettel (SPEC „Handgriff-Spickzettel“): was einmal gelöst ist, wird eine Spickzettel-Karte.
// Seit den Dokumenten (15.11.2026) einmalig in den Spickzettel übernommen (dokumenteSeite.js), kein eigenes Feld mehr.
// Format wie der Spickzettel: „## Titel“, darunter Zeilen, „!“ am Anfang = fett. Nichts Privates hier (Repo ist öffentlich).

export const HANDGRIFFE_STANDARD = `## Bose-Earbuds koppeln #unterwegs
!Neues Gerät (z. B. Zenbook), Fold bleibt dran
Earbuds ins Case, Deckel offen lassen
Taste hinten am Case halten, bis es blau blinkt
oder: Bose-App → Earbuds → Gerät hinzufügen
Am Gerät: Bluetooth → Gerät hinzufügen
„Bose QC Ultra Earbuds“ wählen
!Multipoint: zwei Geräte gleichzeitig

## Fold ans Zenbook (adb) #lab
USB-Kabel mit Daten (kein reines Ladekabel)
Fold entsperren
„USB-Debugging zulassen?“ → Zulassen
Erscheint nichts: Kabel tauschen, neu stecken
!Prüfen: adb devices zeigt das Fold

## Sticky klemmt (Flashen) #lab
!„Failed to connect … No serial data“
USB vom Sticky ab- und wieder anstecken
dann noch einmal flashen
Ursache: GPIO0 ist I2C-Takt und Boot-Pin
!Werte eingefroren? Bus-Rettung ab FW 0.12.1
`;
