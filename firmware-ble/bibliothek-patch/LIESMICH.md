# Patch für Seeed_GFX2 (Kritzelblock schneller)

Die Firmware braucht eine leicht geänderte Seeed_GFX2 (Stand 1.0.0). Ohne Patch bricht das Linken ab
(`gfxPartialWachHalten` fehlt) – Absicht, damit es nicht unbemerkt langsam wird.

Was der Patch tut: Nach jedem Teil-Refresh legt die Bibliothek das Panel schlafen und wartet dabei zweimal 100 ms
(Treiber und Panel). Ist `gfxPartialWachHalten` gesetzt (nur im Kritzelblock), sind es 2 ms. Gemessen: 840 → 742 ms
je Strich. Sonst verhält sich die Bibliothek wie das Original.

Ein Wach-Modus ganz ohne Schlafen/Neuwecken war schneller (617 ms), ließ aber das vorige Bild (Notiz-Seite)
durchblitzen – verworfen.

Nach einem Update von Seeed_GFX2 wieder einspielen (im Bibliotheksordner):

    cd "%USERPROFILE%\OneDrive\Dokumente\Arduino\libraries\Seeed_GFX2"
    git apply --unsafe-paths <Pfad zum Repo>\firmware-ble\bibliothek-patch\seeed_gfx2-sticky.patch

oder die zwei Stellen von Hand übernehmen (`delay(100)` in `Driver_SSD1683::sleep()` und `Panel_EPaper::ePaperSleep()`,
dazu `bool gfxPartialWachHalten = false;` oben in `Driver_SSD1683.cpp`).
