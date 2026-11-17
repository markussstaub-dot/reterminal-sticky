"""OSM-Vektorkacheln von OpenFreeMap (OpenMapTiles-Schema) für notfallkarten.py – wie Bubble Logs Sim-Welt
(`bubble-log-app/tools/simwelt.mjs`). Ohne Abhängigkeiten: kleiner MVT-Leser (Protobuf) eingebaut.

Liefert dieselbe Form wie eine Overpass-Antwort ({'elements': [...]} mit ways/nodes und OSM-ähnlichen Tags), damit das
Zeichnen in notfallkarten.py unverändert bleibt. Kacheln (Zoom 14, ~1,6 km) werden im Cache-Ordner aufgehoben.
Daten: © OpenStreetMap-Mitwirkende (ODbL), Kacheln: OpenFreeMap.
"""
import gzip, json, math, os, struct, time, urllib.request

TILEJSON = 'https://tiles.openfreemap.org/planet'
ZOOM = 14
UA = {'User-Agent': 'sticky-notfallkarten/0.1 (personal offline map)'}


# ---- Kachel-Mathematik ------------------------------------------------------------------------------------------------
def kachel_xy(lat, lon, z=ZOOM):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def kachel_lonlat(x, y, z=ZOOM):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


# ---- Protobuf / MVT ---------------------------------------------------------------------------------------------------
def _varint(b, i):
    v = s = 0
    while True:
        c = b[i]; i += 1
        v |= (c & 0x7F) << s
        if c < 0x80:
            return v, i
        s += 7


def _felder(b):
    """Protobuf-Nachricht → [(nummer, typ, wert)]; Länge-begrenzte Felder als bytes"""
    i, aus = 0, []
    while i < len(b):
        k, i = _varint(b, i)
        nr, typ = k >> 3, k & 7
        if typ == 0:
            v, i = _varint(b, i)
        elif typ == 1:
            v = b[i:i + 8]; i += 8
        elif typ == 2:
            l, i = _varint(b, i)
            v = b[i:i + l]; i += l
        elif typ == 5:
            v = b[i:i + 4]; i += 4
        else:
            raise ValueError('Protobuf-Typ unbekannt')
        aus.append((nr, typ, v))
    return aus


def _gepackt(b):
    i, aus = 0, []
    while i < len(b):
        v, i = _varint(b, i)
        aus.append(v)
    return aus


def _wert(b):
    for nr, typ, v in _felder(b):
        if nr == 1: return v.decode('utf-8', 'replace')
        if nr == 2: return struct.unpack('<f', v)[0]
        if nr == 3: return struct.unpack('<d', v)[0]
        if nr in (4, 5): return v
        if nr == 6: return (v >> 1) ^ -(v & 1)
        if nr == 7: return bool(v)
    return None


def _geometrie(cmds):
    """MVT-Befehle → Liste von Linien/Ringen (Kachelkoordinaten)"""
    teile, akt, x, y, i = [], [], 0, 0, 0
    while i < len(cmds):
        c = cmds[i]; i += 1
        op, n = c & 7, c >> 3
        if op == 1:                                   # MoveTo
            for _ in range(n):
                dx, dy = cmds[i], cmds[i + 1]; i += 2
                x += (dx >> 1) ^ -(dx & 1); y += (dy >> 1) ^ -(dy & 1)
                if akt: teile.append(akt)
                akt = [(x, y)]
        elif op == 2:                                 # LineTo
            for _ in range(n):
                dx, dy = cmds[i], cmds[i + 1]; i += 2
                x += (dx >> 1) ^ -(dx & 1); y += (dy >> 1) ^ -(dy & 1)
                akt.append((x, y))
        elif op == 7 and akt:                         # ClosePath
            akt.append(akt[0])
    if akt: teile.append(akt)
    return teile


def mvt_lesen(daten):
    """→ {layername: [(typ, tags, teile)]}"""
    ebenen = {}
    for nr, _, layer in _felder(daten):
        if nr != 3:
            continue
        name, feats, keys, vals, extent = '', [], [], [], 4096
        for n2, _, v in _felder(layer):
            if n2 == 1: name = v.decode()
            elif n2 == 2: feats.append(v)
            elif n2 == 3: keys.append(v.decode())
            elif n2 == 4: vals.append(_wert(v))
            elif n2 == 5: extent = v
        liste = []
        for f in feats:
            tags, typ, geo = {}, 0, []
            for n3, t3, v in _felder(f):
                if n3 == 2:
                    t = _gepackt(v)
                    tags = {keys[t[k]]: vals[t[k + 1]] for k in range(0, len(t) - 1, 2)}
                elif n3 == 3: typ = v
                elif n3 == 4: geo = _gepackt(v)
            liste.append((typ, tags, _geometrie(geo), extent))
        ebenen[name] = liste
    return ebenen


# ---- Laden ------------------------------------------------------------------------------------------------------------
_vorlage = None


def _url(z, x, y):
    global _vorlage
    if _vorlage is None:
        with urllib.request.urlopen(urllib.request.Request(TILEJSON, headers=UA), timeout=30) as r:
            _vorlage = json.loads(r.read().decode())['tiles'][0]
    return _vorlage.replace('{z}', str(z)).replace('{x}', str(x)).replace('{y}', str(y))


def kachel(z, x, y, cache):
    pfad = os.path.join(cache, f'ofm_{z}_{x}_{y}.pbf')
    if os.path.exists(pfad):
        roh = open(pfad, 'rb').read()
    else:
        for versuch in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(_url(z, x, y), headers=UA), timeout=60) as r:
                    roh = r.read()
                break
            except Exception as e:   # noqa: BLE001
                if versuch == 2:
                    raise
                print(f'    Kachel {x}/{y}: {e}, neuer Versuch', flush=True)
                time.sleep(5 * (versuch + 1))
        os.makedirs(cache, exist_ok=True)
        open(pfad, 'wb').write(roh)
    if roh[:2] == b'\x1f\x8b':
        roh = gzip.decompress(roh)
    return roh


# ---- Umsetzen in Overpass-Form ----------------------------------------------------------------------------------------
STRASSE = {'motorway': 'motorway', 'trunk': 'trunk', 'primary': 'primary', 'secondary': 'secondary',
           'tertiary': 'tertiary', 'minor': 'residential', 'service': 'service', 'track': 'track', 'path': 'path'}
POI = {'hospital', 'pharmacy', 'drinking_water', 'shelter', 'police', 'fire_station'}


def holen(sued, west, nord, ost, cache):
    """Alle Kacheln über dem Rechteck laden → {'elements': [...]} wie Overpass"""
    x0, y1 = kachel_xy(sued, west)
    x1, y0 = kachel_xy(nord, ost)
    elemente = []
    kacheln = [(x, y) for x in range(int(x0), int(x1) + 1) for y in range(int(y0), int(y1) + 1)]
    neu = sum(not os.path.exists(os.path.join(cache, f'ofm_{ZOOM}_{x}_{y}.pbf')) for x, y in kacheln)
    if neu:
        print(f'  OpenFreeMap: {neu} Kacheln laden …', flush=True)
    for x, y in kacheln:
        ebenen = mvt_lesen(kachel(ZOOM, x, y, cache))

        def punkte(teil, extent):
            out = []
            for px, py in teil:
                la, lo = kachel_lonlat(x + px / extent, y + py / extent)
                out.append({'lat': la, 'lon': lo})
            return out

        def weg(tags, teil, extent):
            elemente.append({'type': 'way', 'tags': tags, 'geometry': punkte(teil, extent)})

        for typ, t, teile, ext in ebenen.get('transportation', []):
            klasse = t.get('class')
            if klasse in STRASSE:
                tags = {'highway': t.get('subclass') if klasse == 'path' and t.get('subclass') else STRASSE[klasse]}
                for teil in teile: weg(tags, teil, ext)
            elif klasse in ('rail', 'transit'):
                for teil in teile: weg({'railway': 'rail' if klasse == 'rail' else 'light_rail',
                                        **({'service': 'yard'} if t.get('service') else {})}, teil, ext)
        for typ, t, teile, ext in ebenen.get('transportation_name', []):
            if t.get('name') and t.get('class') in STRASSE:
                for teil in teile: weg({'highway': STRASSE[t['class']], 'name': t['name'], 'nur_name': '1'}, teil, ext)
        for typ, t, teile, ext in ebenen.get('water', []):
            for teil in teile: weg({'natural': 'water'}, teil, ext)
        for typ, t, teile, ext in ebenen.get('waterway', []):
            if t.get('class') in ('river', 'stream', 'canal'):
                for teil in teile: weg({'waterway': t['class']}, teil, ext)
        for typ, t, teile, ext in ebenen.get('landcover', []):
            if t.get('class') == 'wood':
                for teil in teile: weg({'natural': 'wood'}, teil, ext)
        for typ, t, teile, ext in ebenen.get('building', []):
            for teil in teile: weg({'building': 'yes'}, teil, ext)
        for typ, t, teile, ext in ebenen.get('place', []):
            if t.get('name') and teile:
                la, lo = kachel_lonlat(x + teile[0][0][0] / ext, y + teile[0][0][1] / ext)
                elemente.append({'type': 'node', 'lat': la, 'lon': lo, 'tags': {'place': t.get('class'), 'name': t['name']}})
        for typ, t, teile, ext in ebenen.get('poi', []):
            art = t.get('subclass') if t.get('subclass') in POI else t.get('class') if t.get('class') in POI else None
            if art and teile:
                la, lo = kachel_lonlat(x + teile[0][0][0] / ext, y + teile[0][0][1] / ext)
                elemente.append({'type': 'node', 'lat': la, 'lon': lo, 'tags': {'amenity': art, 'name': t.get('name', '')}})
    return {'elements': elemente}
