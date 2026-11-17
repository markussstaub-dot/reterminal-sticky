// Grundmodell reTerminal Sticky – gemeinsame Maße für Sticky-Sleeve und Sticky-Sleeve-Dive (SPEC „Baukasten“).
// Maße aus dem Lanyard Case von Kenta IDA (github.com/ciniml/epaper-enclosures, Ordner sticky, CC BY 4.0),
// dort aus Seeeds Hardware-Übersicht und an einer Referenzhülle abgeglichen. Gegenprobe 17.11.2026 an Seeeds
// „Sticky Case Simple“ (innen 67,0 × 107,0 mm inkl. Spiel) – passt.
//
// Koordinaten: Hochformat. x = Breite (Mitte 0), y = Länge (Mitte 0, +y = oben, USB-C unten), z = Dicke (0 = Rücken,
// +z = Display). „rechts“ = +x (Tasten KI/▲/▼), „links“ = −x (microSD).

B = 65.5;            // Breite
L = 106.0;           // Länge
D = 7.3;             // Dicke
R = 2.0;             // Eckradius (angenommen)

SPIEL_XY = 0.25;     // Spiel je Seite
SPIEL_Z  = 0.2;      // Spiel in der Tiefe

// rechts: Tastenleiste (KI, ▲, ▼) ab 27,5 mm von oben, 39 mm lang, 6,2 mm hoch, mittig in der Dicke
TASTEN_Y0 = L / 2 - 27.5 - 39.0;
TASTEN_Y1 = L / 2 - 27.5;
TASTEN_H  = 6.2;
TASTEN_ZM = D / 2;

// links: microSD ab 87 mm von oben, 16 × 6 mm, Mitte 4,2 mm vom Rücken
SD_Y0 = L / 2 - 87.0 - 16.0;
SD_Y1 = L / 2 - 87.0;
SD_H  = 6.0;
SD_ZM = 4.2;

// unten (x von der Mitte): Reset, Mikrofon (je Ø 3,2), Ösen (3,0 × 4,8), USB-C mit Lade-LED (18,5 × 5,8)
UNTEN_ZM  = D / 2;
RESET_X   = -19.4;
MIKRO_X   = -14.2;
LOCH_D    = 3.2;
OESEN_X   = [-2.45, 2.05];
OESE_B    = 3.0;
OESE_H    = 4.8;
USB_X     = 14.75;
USB_B     = 18.5;
USB_H     = 5.8;

$fn = 48;

// abgerundetes Rechteck b × l, Höhe h, ab z = 0
module abgerundet(b, l, h, r) {
    linear_extrude(h) offset(r = r) offset(delta = -r) square([b, l], center = true);
}

// das Gerät selbst (zum Prüfen der Passform, Darstellung)
module sticky() {
    color("dimgray") abgerundet(B, L, D, R);
    color("white") translate([0, 0, D - 0.01]) abgerundet(B - 6, L - 16, 0.02, 1);   // Display, nur Andeutung
}

// Hohlraum für das Gerät inkl. Spiel (z ab 0)
module sticky_raum() {
    abgerundet(B + 2 * SPIEL_XY, L + 2 * SPIEL_XY, D + SPIEL_Z, R + SPIEL_XY);
}
