"""Umgebungskarten für den Sticky (SPEC „SD-Karte als Bibliothek und Bugout-Sticky“, Schritt 3, Station „Kartentest“).

Holt OSM-Vektordaten über Overpass (kleine Gebiete), zeichnet sie selbst in 1 bpp für 800 × 480 (3,97″, ~9,25 px/mm),
mit 1-km-UTM-Gitter, Maßstab, Nordpfeil und „© OpenStreetMap-Mitwirkende“. Kein GPS am Sticky: Karte zum Orientieren.
Die Abfragen werden zwischengespeichert (OSM-Server schonen, offline weiterzeichnen).

Aufruf:
  python sticky-app/tools/notfallkarten.py              eigene Orte aus privat\\notfall-karten.txt → Handbuch „karten“
  python sticky-app/tools/notfallkarten.py --test       neutrales Testgebiet (Tübingen) → Handbuch „kartentest“
Fehlt die Ortsdatei, legt das Skript eine Vorlage an. Vorschau-PNGs in privat\\karten(-test); mit Sticky am USB wird
aufgespielt und das Dokument gleich geöffnet. Abfragen an Overpass sind auf ein 0,05°-Raster gerundet (verrät den
genauen Ort nicht); Adressen statt Koordinaten gehen an Nominatim (OpenStreetMap).
"""
import argparse, json, math, os, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw

HIER = os.path.dirname(os.path.abspath(__file__))
PRIVAT = os.path.normpath(os.path.join(HIER, '..', '..', '..', '..', 'privat'))
W, H, KOPF = 800, 480, 36
MIN = 22                         # kleinste Schrift: ohne Lesebrille auf Armlänge (Markus, 17.11.2026)
PX_MM = 9.25                     # 3,97″ bei 800 × 480
# wie Bubble Log (SPEC-tempolimit.md „Cache aus Overpass“): kumi.systems gibt es nicht mehr; bei Überlast 10/30/60 s warten
OVERPASS_SERVER = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
OVERPASS_WARTEN = [10, 30, 60]
TEST = ('Tübingen', 48.5203, 9.0536)


def schrift(gr, fett=False):
    from notfallblatt import schrift as s
    return s(gr, fett)


# ---- UTM (WGS84) --------------------------------------------------------------------------------------------------------
def utm(lat, lon, zone=None):
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    if zone is None:
        zone = int((lon + 180) / 6) + 1
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    p, l = math.radians(lat), math.radians(lon)
    n = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    t = math.tan(p) ** 2
    c = ep2 * math.cos(p) ** 2
    A = math.cos(p) * (l - lon0)
    e4, e6 = e2 * e2, e2 ** 3
    m = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * p)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * p) - (35 * e6 / 3072) * math.sin(6 * p))
    e = k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5 / 120) + 500000
    nn = k0 * (m + n * math.tan(p) * (A * A / 2 + (5 - t + 9 * c + 4 * c * c) * A ** 4 / 24
                                       + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6 / 720))
    return zone, e, nn


# ---- Daten --------------------------------------------------------------------------------------------------------------
QUELLE = 'openfreemap'            # Standard seit 17.11.2026 (wie Bubble Log); 'overpass' als Rückfall (--quelle)
RASTER = 0.05                    # Abfragen auf 0,05° runden: der Server sieht ein Rechteck, nicht den Ort in der Mitte


def overpass(sued, west, nord, ost, cache_ordner, gebaeude):
    os.makedirs(cache_ordner, exist_ok=True)
    sued, west = math.floor(sued / RASTER) * RASTER, math.floor(west / RASTER) * RASTER
    nord, ost = math.ceil(nord / RASTER) * RASTER, math.ceil(ost / RASTER) * RASTER
    name = f'osm_{sued:.4f}_{west:.4f}_{nord:.4f}_{ost:.4f}_{int(gebaeude)}.json'
    pfad = os.path.join(cache_ordner, name)
    if os.path.exists(pfad):
        return json.load(open(pfad, encoding='utf-8'))
    bb = f'({sued},{west},{nord},{ost})'
    q = f"""[out:json][timeout:90];
(
 way["highway"]{bb};
 way["railway"~"^(rail|light_rail|narrow_gauge)$"]{bb};
 way["waterway"~"^(river|stream|canal)$"]{bb};
 way["natural"="water"]{bb}; relation["natural"="water"]{bb};
 way["landuse"="forest"]{bb}; way["natural"="wood"]{bb};
 relation["landuse"="forest"]{bb}; relation["natural"="wood"]{bb};
 {f'way["building"]{bb};' if gebaeude else ''}
 node["amenity"~"^(hospital|pharmacy|drinking_water|shelter|police|fire_station)$"]{bb};
 way["amenity"~"^(hospital|police|fire_station)$"]{bb};
 node["place"~"^(city|town|village|suburb|hamlet|neighbourhood)$"]{bb};
);
out geom;"""
    daten, fehler = None, None
    for versuch in range(3):                     # öffentliche Server sind manchmal überlastet (502/504/429)
        for server in OVERPASS_SERVER:
            anfrage = urllib.request.Request(server, data=urllib.parse.urlencode({'data': q}).encode(),
                                             headers={'User-Agent': 'sticky-notfallkarten/0.1 (personal offline map)'})
            print(f'  Overpass ({urllib.parse.urlparse(server).netloc}) …', flush=True)
            try:
                with urllib.request.urlopen(anfrage, timeout=120) as r:
                    daten = json.loads(r.read().decode('utf-8'))
                break
            except Exception as e:   # noqa: BLE001 – nächster Server
                fehler = e
                print(f'    {e}', flush=True)
        if daten is not None:
            break
        time.sleep(OVERPASS_WARTEN[versuch])
    if daten is None:
        sys.exit(f'Overpass nicht erreichbar: {fehler}')
    json.dump(daten, open(pfad, 'w', encoding='utf-8'))
    time.sleep(1)
    return daten


# ---- Zeichnen -----------------------------------------------------------------------------------------------------------
STRASSE = {   # Klasse → (Breite außen, Breite innen) in px bei 1:25 000; innen 0 = voll schwarz
    'motorway': (9, 5), 'trunk': (9, 5), 'primary': (8, 4), 'secondary': (7, 3), 'tertiary': (6, 2),
    'motorway_link': (5, 1), 'trunk_link': (5, 1), 'primary_link': (5, 1), 'secondary_link': (4, 0),
    'unclassified': (3, 0), 'residential': (3, 0), 'living_street': (2, 0), 'service': (1, 0), 'pedestrian': (2, 0),
}
WEG = {'track', 'path', 'footway', 'cycleway', 'bridleway', 'steps'}


def _muster(art):
    m = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(m)
    if art == 'wald':                      # lockere Punkte
        for y in range(0, H, 5):
            for x in range((y // 5 % 2) * 3, W, 6):
                g.point((x, y), 0)
    elif art == 'wasser':                  # waagrechte Schraffur
        for y in range(0, H, 3):
            g.line([0, y, W, y], fill=0)
    elif art == 'haus':
        g.rectangle([0, 0, W, H], fill=0)
    return m


def blatt(name, lat, lon, massstab, variante, cache_ordner, daten=None, zusatz=''):
    """Ein Kartenblatt (PIL 1 bpp) um (lat, lon) im Maßstab 1:massstab; variante: 'klar' | 'haeuser' | 'uebersicht'"""
    m_px = massstab / 1000 / PX_MM                        # Meter je Pixel
    zone, e0, n0 = utm(lat, lon)
    hb = H - KOPF
    breite_m, hoehe_m = W * m_px, hb * m_px
    # Begrenzung in Grad (großzügig)
    dlat = hoehe_m / 2 / 111320 * 1.15
    dlon = breite_m / 2 / (111320 * math.cos(math.radians(lat))) * 1.15
    if daten is None:                                    # Lupe: nimmt die Daten des Nahblatts (größeres Gebiet)
        if QUELLE == 'openfreemap':
            import osmkacheln
            daten = osmkacheln.holen(lat - dlat, lon - dlon, lat + dlat, lon + dlon, cache_ordner)
        else:
            daten = overpass(round(lat - dlat, 4), round(lon - dlon, 4), round(lat + dlat, 4), round(lon + dlon, 4),
                             cache_ordner, variante == 'haeuser')
    staerke = 25000 / massstab                           # Linien im Übersichtsblatt dünner

    def xy(pt):
        _, e, n = utm(pt['lat'], pt['lon'], zone)
        return ((e - e0) / m_px + W / 2, (n0 - n) / m_px + hb / 2)

    bild = Image.new('L', (W, hb), 255)
    g = ImageDraw.Draw(bild)
    flaechen = {'wald': Image.new('L', (W, hb), 0), 'wasser': Image.new('L', (W, hb), 0), 'haus': Image.new('L', (W, hb), 0)}
    fg = {k: ImageDraw.Draw(v) for k, v in flaechen.items()}
    elemente = daten.get('elements', [])

    def ringe(el):
        if el['type'] == 'way' and 'geometry' in el:
            yield [xy(p) for p in el['geometry']]
        elif el['type'] == 'relation':
            for m in el.get('members', []):
                if m.get('role') == 'outer' and 'geometry' in m:
                    yield [xy(p) for p in m['geometry']]

    for el in elemente:
        t = el.get('tags', {})
        art = ('wald' if t.get('landuse') == 'forest' or t.get('natural') == 'wood' else
               'wasser' if t.get('natural') == 'water' else
               'haus' if 'building' in t and variante == 'haeuser' else None)
        if art:
            for r in ringe(el):
                if len(r) > 2:
                    fg[art].polygon(r, fill=255)
    for art in ('wald', 'wasser', 'haus'):
        bild.paste(_muster(art).crop((0, 0, W, hb)), (0, 0), flaechen[art])

    for el in elemente:                                  # Wasserläufe
        t = el.get('tags', {})
        if el['type'] == 'way' and t.get('waterway') and 'geometry' in el:
            b = 4 if t['waterway'] in ('river', 'canal') else 2
            g.line([xy(p) for p in el['geometry']], fill=0, width=max(1, round(b * staerke)))

    wege, strassen = [], []
    for el in elemente:
        t = el.get('tags', {})
        if el['type'] != 'way' or 'geometry' not in el or 'highway' not in t:
            continue
        hw = t['highway']
        if hw in STRASSE:
            strassen.append((hw, [xy(p) for p in el['geometry']]))
        elif hw in WEG and variante != 'uebersicht':
            wege.append([xy(p) for p in el['geometry']])
    for linie in wege:                                   # Wege gestrichelt
        for i in range(len(linie) - 1):
            (x0, y0), (x1, y1) = linie[i], linie[i + 1]
            lang = math.hypot(x1 - x0, y1 - y0)
            for s in range(0, int(lang), 6):
                a, b = s / max(lang, 1), min(1, (s + 3) / max(lang, 1))
                g.line([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b], fill=0, width=1)
    rang = list(STRASSE)
    strassen.sort(key=lambda s: -rang.index(s[0]))
    if variante == 'uebersicht':                         # Übersicht: nur Netz, volle Linien nach Rang
        UEB = {'motorway': 4, 'trunk': 4, 'primary': 3, 'secondary': 2, 'tertiary': 2, 'unclassified': 1}
        for hw, linie in strassen:
            if hw in UEB:
                g.line(linie, fill=0, width=UEB[hw], joint='curve')
    else:
        for hw, linie in strassen:                       # außen schwarz
            g.line(linie, fill=0, width=max(1, round(STRASSE[hw][0] * staerke)), joint='curve')
        for hw, linie in strassen:                       # innen weiß (große Straßen als Doppellinie)
            innen = STRASSE[hw][1]
            if innen:
                g.line(linie, fill=255, width=innen, joint='curve')

    for el in elemente:                                  # Bahn: Linie mit Querstrichen
        t = el.get('tags', {})
        if el['type'] == 'way' and t.get('railway') and 'geometry' in el:
            linie = [xy(p) for p in el['geometry']]
            g.line(linie, fill=0, width=2)
            if variante == 'uebersicht' or t.get('service'):   # Übersicht und Gleisfelder: ohne Querstriche
                continue
            for i in range(len(linie) - 1):
                (x0, y0), (x1, y1) = linie[i], linie[i + 1]
                lang = math.hypot(x1 - x0, y1 - y0)
                if lang < 1:
                    continue
                nx, ny = -(y1 - y0) / lang * 3, (x1 - x0) / lang * 3
                for s in range(0, int(lang), 12):
                    px, py = x0 + (x1 - x0) * s / lang, y0 + (y1 - y0) * s / lang
                    g.line([px - nx, py - ny, px + nx, py + ny], fill=0, width=1)

    # 1-km-Gitter (UTM), Beschriftung am Rand mit den km-Ziffern wie auf topografischen Karten
    schritt = 1000 if massstab <= 50000 else 2000
    e_min, e_max = e0 - breite_m / 2, e0 + breite_m / 2
    n_min, n_max = n0 - hoehe_m / 2, n0 + hoehe_m / 2
    klein = schrift(MIN, True)
    for e in range(int(e_min // schritt + 1) * schritt, int(e_max) + 1, schritt):
        x = (e - e0) / m_px + W / 2
        for y in range(0, hb, 5):
            g.line([x, y, x, y + 2], fill=0, width=2)
        g.text((x + 3, 2), f'{e // 1000 % 100:02d}', font=klein, fill=0, anchor='lt', stroke_width=3, stroke_fill=255)
    for n in range(int(n_min // schritt + 1) * schritt, int(n_max) + 1, schritt):
        y = (n0 - n) / m_px + hb / 2
        for x in range(0, W, 5):
            g.line([x, y, x + 2, y], fill=0, width=2)
        g.text((3, y - 2), f'{n // 1000 % 100:02d}', font=klein, fill=0, anchor='ld', stroke_width=3, stroke_fill=255)

    # Symbole
    def symbol(x, y, art):
        r = 13                                            # halbe Symbolgröße (1,5-fach gegenüber dem ersten Test)
        if not (r < x < W - r and r < y < hb - r):
            return
        if art == 'hospital':
            g.rectangle([x - r, y - r, x + r, y + r], fill=255, outline=0, width=3)
            g.text((x, y + 1), 'H', font=schrift(MIN, True), fill=0, anchor='mm')
        elif art == 'pharmacy':
            g.ellipse([x - r + 2, y - r + 2, x + r - 2, y + r - 2], fill=255, outline=0, width=3)
            g.line([x - 6, y, x + 6, y], fill=0, width=3); g.line([x, y - 6, x, y + 6], fill=0, width=3)
        elif art == 'drinking_water':
            g.polygon([(x, y - 12), (x - 8, y + 3), (x + 8, y + 3)], fill=0)
            g.ellipse([x - 8, y - 3, x + 8, y + 11], fill=0)
        elif art == 'shelter':
            g.line([(x - 12, y + 3), (x, y - 10), (x + 12, y + 3)], fill=0, width=3)
            g.line([x - 8, y + 2, x - 8, y + 11], fill=0, width=3); g.line([x + 8, y + 2, x + 8, y + 11], fill=0, width=3)
        elif art in ('police', 'fire_station'):
            g.ellipse([x - r, y - r, x + r, y + r], fill=0)
            g.text((x, y + 1), 'P' if art == 'police' else 'F', font=schrift(MIN - 2, True), fill=255, anchor='mm')

    for el in elemente:
        t = el.get('tags', {})
        if 'amenity' not in t:
            continue
        if el['type'] == 'node':
            symbol(*xy(el), t['amenity'])
        elif el['type'] == 'way' and 'geometry' in el:
            pts = [xy(p) for p in el['geometry']]
            symbol(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), t['amenity'])

    # Ortsnamen mit weißem Rand
    groesse = {'city': 32, 'town': 30, 'village': 26, 'suburb': 24, 'hamlet': MIN, 'neighbourhood': MIN}
    zeigen = {'uebersicht': ('city', 'town', 'village', 'hamlet'), 'klar': ('city', 'town', 'village', 'suburb', 'hamlet', 'neighbourhood'),
              'haeuser': ('city', 'town', 'village', 'suburb', 'hamlet', 'neighbourhood')}[variante]
    # Straßennamen (Lupe: ab Wohnstraße, Nahblatt: nur Hauptstraßen), waagrecht mit weißem Rand, ohne Überlappung;
    # Ortsnamen haben Vorrang (ihre Kästen sind vorab belegt)
    belegt = []
    for el in elemente:
        t = el.get('tags', {})
        if el['type'] == 'node' and t.get('place') in zeigen and t.get('name'):
            x, y = xy(el)
            belegt.append(g.textbbox((x, y), t['name'], font=schrift(groesse[t['place']], True), anchor='mm', stroke_width=4))
    def frei(box):
        return all(box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3] for b in belegt)
    namen_ab = {'primary', 'secondary', 'tertiary', 'trunk'} if massstab >= 20000 else set(STRASSE) - {'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'}
    if variante != 'uebersicht':
        fs = schrift(MIN - 2, True)
        gesehen = set()
        for el in sorted((e for e in elemente if e['type'] == 'way' and e.get('tags', {}).get('highway') in namen_ab
                          and e['tags'].get('name') and 'geometry' in e),
                         key=lambda e: rang.index(e['tags']['highway'])):
            n = el['tags']['name']
            if n in gesehen:
                continue
            pts = [xy(p) for p in el['geometry']]
            besten = max(range(len(pts) - 1), key=lambda i: math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]), default=None)
            if besten is None:
                continue
            (x0, y0), (x1, y1) = pts[besten], pts[besten + 1]
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            b = g.textbbox((mx, my), n, font=fs, anchor='mm', stroke_width=3)
            if b[0] < 0 or b[2] > W or b[1] < 0 or b[3] > hb - 40 or not frei(b):
                continue
            g.text((mx, my), n, font=fs, fill=0, anchor='mm', stroke_width=3, stroke_fill=255)
            belegt.append(b)
            gesehen.add(n)

    for el in elemente:
        t = el.get('tags', {})
        if el['type'] == 'node' and t.get('place') in zeigen and t.get('name'):
            x, y = xy(el)
            if 0 < x < W and 0 < y < hb:
                g.text((x, y), t['name'], font=schrift(groesse[t['place']], True), fill=0, anchor='mm', stroke_width=4, stroke_fill=255)

    # Mitte markieren (Bezugspunkt des Blatts), Nordpfeil, Maßstabsleiste, Quelle
    cx, cy = W / 2, hb / 2
    g.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], outline=0, width=3)
    g.polygon([(W - 34, hb - 92), (W - 48, hb - 58), (W - 34, hb - 66), (W - 20, hb - 58)], fill=0)
    g.text((W - 34, hb - 96), 'N', font=schrift(MIN, True), fill=0, anchor='md', stroke_width=3, stroke_fill=255)
    leiste_m = 500 if massstab <= 15000 else 1000 if massstab <= 50000 else 2000
    lpx = leiste_m / m_px
    x0, y0 = 40, hb - 30
    g.rectangle([x0 - 6, y0 - 26, x0 + lpx + 80, y0 + 12], fill=255)
    g.rectangle([x0, y0, x0 + lpx / 2, y0 + 6], fill=0)
    g.rectangle([x0, y0, x0 + lpx, y0 + 6], outline=0, width=2)
    g.text((x0 + lpx + 6, y0 + 3), (f'{leiste_m // 1000} km' if leiste_m >= 1000 else f'{leiste_m} m'), font=schrift(MIN, True), fill=0, anchor='lm')
    g.text((x0, y0 - 4), f'1:{massstab:,}'.replace(',', '.'), font=schrift(MIN - 4), fill=0, anchor='ld')
    quelle = '© OpenStreetMap-Mitwirkende (ODbL)'
    g.text((W - 6, hb - 4), quelle, font=schrift(14), fill=0, anchor='rd', stroke_width=2, stroke_fill=255)

    seite = Image.new('L', (W, H), 255)
    sg = ImageDraw.Draw(seite)
    sg.rectangle([0, 0, W, KOPF - 1], fill=0)
    titel = f'{name}{zusatz} · 1:{massstab:,}'.replace(',', '.') + f' · Gitter {schritt // 1000} km'
    sg.text((10, KOPF // 2), titel, font=schrift(MIN, True), fill=255, anchor='lm')
    seite.paste(bild, (0, KOPF))
    seite = seite.point(lambda v: 255 if v >= 128 else 0).convert('1')
    seite.daten = daten
    return seite


def legende():
    """Eine Seite Zeichenerklärung"""
    from notfallblatt import schrift as s
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    g.rectangle([0, 0, W, KOPF - 1], fill=0)
    g.text((10, KOPF // 2), 'Karten · Zeichen', font=s(MIN, True), fill=255, anchor='lm')
    zeilen = ['H Krankenhaus · Kreuz Apotheke · Tropfen Wasser',
              'Dach Schutzhütte · P Polizei · F Feuerwehr',
              'Punkte Wald · Schraffur Wasser',
              'Doppellinie Hauptstraße · gestrichelt Weg',
              'Querstriche Bahn · Netz 1 km (Zahlen am Rand)',
              'Kreis in der Mitte = Bezugspunkt · kein GPS',
              'Auf der Karte tippen = näher ran · ▲/▼ blättern']
    for i, z in enumerate(zeilen):
        g.text((24, 70 + i * 56), z, font=s(26, i == 6), fill=0, anchor='lm')
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1')


def kette(name, lat, lon, cache, basis=0):
    """Zoom-Kette (Markus 17.11.: „einstellbarer Zoom?“): Zeichen · Übersicht 1:100.000 · Nah 1:25.000 · 4 Lupen
    1:12.500. Tippfelder (Handbuch-Index „f s x0 y0 x1 y1 ziel“): Übersicht Mitte → Nah, Nah-Viertel → Lupe, Lupe → Nah.
    „mit Häusern“ fiel im Vergleich durch."""
    nah = blatt(name, lat, lon, 25000, 'klar', cache)
    seiten = [blatt(name, lat, lon, 100000, 'uebersicht', cache), nah]   # basis = Index der Übersicht im Dokument
    hb = H - KOPF
    m25 = 25000 / 1000 / PX_MM
    U, N = basis, basis + 1
    felder = [(U, W * 3 // 8, KOPF + hb * 3 // 8, W * 5 // 8, KOPF + hb * 5 // 8, N)]   # Übersicht: Nah-Gebiet
    for i, (sx, sy, kurz) in enumerate([(-1, -1, 'NW'), (1, -1, 'NO'), (-1, 1, 'SW'), (1, 1, 'SO')]):
        dx, dy = sx * W / 4 * m25, sy * hb / 4 * m25          # Viertelmitte in Metern (y nach Süden positiv)
        la = lat - dy / 111320
        lo = lon + dx / (111320 * math.cos(math.radians(lat)))
        seiten.append(blatt(name, la, lo, 12500, 'klar', cache, daten=nah.daten, zusatz=f' · Lupe {kurz}'))
        x0, y0 = (0 if sx < 0 else W // 2), (KOPF if sy < 0 else KOPF + hb // 2)
        felder.append((N, x0, y0, x0 + W // 2, y0 + hb // 2, N + 1 + i))     # Nah: Viertel → Lupe
        felder.append((N + 1 + i, 0, KOPF, W, H, N))                          # Lupe: zurück zum Nahblatt
    return seiten, felder


ORTE_VORLAGE = """# Kartenorte für den Sticky (privat, nie ins Repo). Je Zeile „Name: Breite, Länge“ –
# z. B. in Google Maps lange auf den Ort drücken und die Zahlen kopieren – oder „Name: Adresse“
# (die Adresse wird dann bei OpenStreetMap/Nominatim nachgeschlagen und geht dabei an diesen Dienst).
# Zeilen mit # werden übersprungen. Mehr als 6 Orte werden nicht gezeichnet.
Zuhause:
Arbeit:
Fluchtziel:
"""


def orte_lesen(pfad):
    """→ [(name, lat, lon)]; Adressen über Nominatim (1 Abfrage je Ort, mit Pause)"""
    orte = []
    for z in open(pfad, encoding='utf-8'):
        z = z.strip()
        if not z or z.startswith('#') or ':' not in z:
            continue
        name, wert = (t.strip() for t in z.split(':', 1))
        if not wert:
            continue
        try:
            lat, lon = (float(t) for t in wert.replace(';', ',').split(',')[:2])
        except ValueError:
            url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': wert, 'format': 'json', 'limit': 1})
            anfrage = urllib.request.Request(url, headers={'User-Agent': 'sticky-notfallkarten/0.1 (personal offline map)'})
            with urllib.request.urlopen(anfrage, timeout=30) as r:
                treffer = json.loads(r.read().decode('utf-8'))
            time.sleep(1.1)
            if not treffer:
                print(f'  {name}: Adresse nicht gefunden, übersprungen')
                continue
            lat, lon = float(treffer[0]['lat']), float(treffer[0]['lon'])
            print(f'  {name}: Adresse gefunden ({lat:.5f}, {lon:.5f}) – gern so in die Datei schreiben')
        orte.append((name, lat, lon))
    return orte[:6]


def ortsinhalt(orte, erste):
    """Seite 0 des Dokuments „karten“: eine Kachel je Ort (→ dessen Übersicht) und „Zeichen“ (→ Erklärung)"""
    from notfallblatt import schrift as s
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    g.rectangle([0, 0, W, 56], fill=0)
    g.text((20, 28), 'KARTEN', font=s(30, True), fill=255, anchor='lm')
    felder = []
    kacheln = [(n, erste[i]) for i, (n, _, _) in enumerate(orte)] + [('Zeichen', 1)]
    for i, (name, ziel) in enumerate(kacheln):
        sp, ze = i % 2, i // 2
        x0, y0 = 20 + sp * 390, 72 + ze * 84
        x1, y1 = x0 + 370, y0 + 72
        if name == 'Zeichen':
            g.rounded_rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], radius=34, outline=0, width=2)
        else:
            g.rounded_rectangle([x0, y0, x1, y1], radius=34, fill=0)
        g.text(((x0 + x1) / 2, (y0 + y1) / 2), name, font=s(30, name != 'Zeichen'), fill=255 if name != 'Zeichen' else 0, anchor='mm')
        felder.append((0, x0, y0, x1, y1, ziel))
    g.text((20, 456), 'Ort antippen · ▲/▼ blättert · auf Karten tippen = näher', font=s(MIN), fill=0, anchor='lm')
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), felder


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--test', action='store_true', help='Vergleichsblätter für ein neutrales Gebiet (Tübingen)')
    ap.add_argument('--aus')
    ap.add_argument('--quelle', choices=['openfreemap', 'overpass'], default=QUELLE)
    ap.add_argument('--port')
    ap.add_argument('--nur-vorschau', action='store_true')
    a = ap.parse_args()
    globals()['QUELLE'] = a.quelle
    if a.test:
        dok, orte = 'kartentest', [TEST]
        aus = a.aus or os.path.join(PRIVAT, 'karten-test')
    else:
        dok, aus = 'karten', a.aus or os.path.join(PRIVAT, 'karten')
        pfad = os.path.join(PRIVAT, 'notfall-karten.txt')
        if not os.path.exists(pfad):
            os.makedirs(PRIVAT, exist_ok=True)
            open(pfad, 'w', encoding='utf-8').write(ORTE_VORLAGE)
            print(f'Neu angelegt: {pfad}\nBitte Orte eintragen und das Skript noch einmal starten.')
            return
        orte = orte_lesen(pfad)
        if not orte:
            sys.exit(f'Keine Orte in {pfad} eingetragen.')
    cache = os.path.join(aus, 'cache')
    os.makedirs(aus, exist_ok=True)
    # Dokument: 0 Inhalt (Orte), 1 Zeichen, dann je Ort Übersicht · Nah · 4 Lupen
    seiten, felder, erste = [None, legende()], [], []
    for name, lat, lon in orte:
        print(f'{name} …', flush=True)
        erste.append(len(seiten))
        s_, f_ = kette(name, lat, lon, cache, len(seiten))
        seiten += s_
        felder += f_
    seiten[0], f0 = ortsinhalt([(n, 0, 0) for n, _, _ in orte], erste)
    felder = f0 + felder
    for i, s in enumerate(seiten):
        s.save(os.path.join(aus, f'karte-{i:02d}.png'))
    print('Vorschau:', aus)
    if a.nur_vorschau:
        return
    import notfallblatt
    port = a.port or notfallblatt.sticky_port()
    if not port:
        print('Kein Sticky am USB – nur die Vorschau.')
        return
    dateien = [(f'doku/{dok}/{i:02d}.bin', notfallblatt.bits(s)) for i, s in enumerate(seiten)]
    index = f'seiten={len(seiten)}\ntoc=-1\n' + ''.join(f'f {s} {x0} {y0} {x1} {y1} {z}\n' for s, x0, y0, x1, y1, z in felder)
    dateien.append((f'doku/{dok}/index.txt', index.encode()))
    dateien.append(('doku/sprung.txt', f'{dok} 0\n'.encode()))   # FW ≥ 0.41.1: öffnet das Dokument gleich
    notfallblatt.aufspielen(port, dateien, None if a.test else os.path.join(PRIVAT, 'notfall-geraet.txt'))
    print(f'Am Sticky: „{dok}“ ist offen (Ort antippen, ▲/▼ blättert).')


if __name__ == '__main__':
    main()
