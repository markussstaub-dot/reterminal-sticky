// Sticky-Sleeve (Alltag/EDC/Bugout) – erste Fassung zum Prüfen der Passform auf der X1C (PETG oder PLA).
// Oben offen: der Sticky gleitet von oben hinein, Lippen vorn und hinten halten ihn. Vorn bleibt der Touch frei,
// hinten ein Fenster (Magnetring für den Microlino-Halter). Ausgespart: Tasten, microSD, USB-C, Reset, Mikro, Ösen.
// Maße: sticky_masse.scad (CC BY 4.0, Kenta IDA / ciniml). Dieses Modell: MIT wie das Repo.
include <sticky_masse.scad>

WAND        = 1.6;   // Seitenwand
LIPPE_HINTEN = 1.2;  // Dicke der Rückenlippe
UEBER_HINTEN = 2.0;  // so weit greift sie über den Rand
LIPPE_VORN  = 0.8;   // Dicke der Frontlippe
UEBER_VORN  = 1.0;
RAND        = 1.0;   // Zugabe um Aussparungen
GEGENSTAND  = false; // true = Sticky zur Ansicht mit einblenden

Bi = B + 2 * SPIEL_XY;
Li = L + 2 * SPIEL_XY;
Di = D + SPIEL_Z;
Ba = Bi + 2 * WAND;
La = Li + 2 * WAND;
H  = LIPPE_HINTEN + Di + LIPPE_VORN;

module sleeve() {
    difference() {
        translate([0, 0, -LIPPE_HINTEN]) abgerundet(Ba, La, H, R + WAND);
        sticky_raum();
        // Fenster vorn (Touch frei) und hinten
        translate([0, 0, Di - 0.01]) abgerundet(Bi - 2 * UEBER_VORN, Li - 2 * UEBER_VORN, LIPPE_VORN + 1, R);
        translate([0, 0, -LIPPE_HINTEN - 1]) abgerundet(Bi - 2 * UEBER_HINTEN, Li - 2 * UEBER_HINTEN, LIPPE_HINTEN + 1.01, R);
        // oben offen zum Einschieben: Stirnwand und beide Lippen am oberen Ende weg
        translate([-Bi / 2, Li / 2 - 0.01, 0]) cube([Bi, WAND + 1, Di]);
        // rechts: Tastenleiste
        translate([Bi / 2 - 1, TASTEN_Y0 - RAND, TASTEN_ZM - TASTEN_H / 2 - RAND])
            cube([WAND + 2, TASTEN_Y1 - TASTEN_Y0 + 2 * RAND, TASTEN_H + 2 * RAND]);
        // links: microSD
        translate([-Bi / 2 - WAND - 1, SD_Y0 - RAND, SD_ZM - SD_H / 2 - RAND / 2])
            cube([WAND + 2, SD_Y1 - SD_Y0 + 2 * RAND, SD_H + RAND]);
        // unten: USB-C mit LED, Reset, Mikro, Ösen
        translate([USB_X - USB_B / 2 - RAND, -Li / 2 - WAND - 1, UNTEN_ZM - USB_H / 2 - RAND / 2])
            cube([USB_B + 2 * RAND, WAND + 2, USB_H + RAND]);
        for (x = [RESET_X, MIKRO_X])
            translate([x, -Li / 2 + 1, UNTEN_ZM]) rotate([90, 0, 0]) cylinder(d = LOCH_D + RAND, h = WAND + 2);
        for (x = OESEN_X)
            translate([x - OESE_B / 2 - 0.5, -Li / 2 - WAND - 1, UNTEN_ZM - OESE_H / 2 - 0.5]) cube([OESE_B + 1, WAND + 2, OESE_H + 1]);
    }
}

sleeve();
if (GEGENSTAND) translate([0, 0, SPIEL_Z / 2]) %sticky();
