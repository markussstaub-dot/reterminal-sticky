"""Spickzettel der Strichschrift als PNG (für Handy/Ausdruck): jedes Zeichen mit Startpunkt und Richtungspfeil.
Liest die Vorlagen direkt aus src/strichschrift.js, damit Bild und Erkenner nie auseinanderlaufen.
Aufruf: python tools/spickzettel-schrift.py [ziel.png]"""
import math, os, re, sys
from PIL import Image, ImageDraw, ImageFont

HIER = os.path.dirname(os.path.abspath(__file__))
QUELLE = os.path.join(HIER, '..', 'src', 'strichschrift.js')
ZIEL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HIER, '..', '..', 'spickzettel-strichschrift.png')

def block(name, js):
    m = re.search(r'export const ' + name + r' = \{(.*?)\n\};', js, re.S)
    aus = []
    for zeile in m.group(1).split('\n'):
        t = re.match(r"\s*'?([^':\s]+)'?:\s*(\[\[.*?\]\]),", zeile)
        if t:
            aus.append((t.group(1), [tuple(map(float, p.split(','))) for p in re.findall(r'\[([-\d.]+,\s*[-\d.]+)\]', t.group(2))]))
    return aus

js = open(QUELLE, encoding='utf-8').read()
buchstaben, ziffern, zweit = block('BUCHSTABEN', js), block('ZIFFERN', js), block('ZWEITFORMEN', js)
gesten = [('→ Leer', [(0, 0.5), (1, 0.5)]), ('← weg', [(1, 0.5), (0, 0.5)]), ('• Tipp', None)]

def schrift(gr, fett=False):
    for n in (['arialbd.ttf', 'Arial Bold.ttf'] if fett else ['arial.ttf', 'Arial.ttf']):
        try: return ImageFont.truetype(n, gr)
        except OSError: pass
    return ImageFont.load_default()

SP, ZW, ZH, RAND = 8, 180, 200, 40
abschnitte = [('Buchstaben (linkes Feld)', buchstaben), ('Zweitformen – gehen auch', [(z + '²', p) for z, p in zweit]),
              ('Ziffern (rechtes Feld)', ziffern), ('Gesten (beide Felder)', gesten)]
zeilen = sum(math.ceil(len(a) / SP) for _, a in abschnitte)
B, H = RAND * 2 + SP * ZW, RAND * 2 + 120 + len(abschnitte) * 60 + zeilen * ZH
img = Image.new('RGB', (B, H), (251, 251, 248))
d = ImageDraw.Draw(img)
d.text((RAND, RAND), 'Strichschrift – ein Strich je Zeichen', font=schrift(46, True), fill=(20, 20, 20))
d.text((RAND, RAND + 58), 'Punkt = Anfang, Pfeil = Richtung. Tipp nach A/O/U/S = Ä/Ö/Ü/ß, sonst Punkt.', font=schrift(26), fill=(90, 90, 90))
y = RAND + 120

def pfeil(d, a, b, farbe):
    w = math.atan2(b[1] - a[1], b[0] - a[0])
    for s in (2.6, -2.6):
        d.line([b, (b[0] + 22 * math.cos(w + s), b[1] + 22 * math.sin(w + s))], fill=farbe, width=6)

for titel, liste in abschnitte:
    d.text((RAND, y + 12), titel, font=schrift(30, True), fill=(94, 70, 55))
    y += 60
    for i, (z, p) in enumerate(liste):
        x0, y0 = RAND + (i % SP) * ZW, y + (i // SP) * ZH
        d.rounded_rectangle([x0 + 6, y0 + 6, x0 + ZW - 6, y0 + ZH - 6], radius=18, outline=(200, 200, 195), width=2, fill=(255, 255, 255))
        d.text((x0 + 18, y0 + 12), z, font=schrift(30, True), fill=(20, 20, 20))
        if p is None:
            d.ellipse([x0 + ZW / 2 - 12, y0 + 105 - 12, x0 + ZW / 2 + 12, y0 + 105 + 12], fill=(240, 166, 58))
            continue
        s, ox, oy = 110, x0 + (ZW - 110) / 2 + 10, y0 + 55
        pts = [(ox + px * s, oy + py * s) for px, py in p]
        d.line(pts, fill=(20, 20, 20), width=7, joint='curve')
        pfeil(d, pts[-2], pts[-1], (20, 20, 20))
        sx, sy = pts[0]
        d.ellipse([sx - 11, sy - 11, sx + 11, sy + 11], fill=(240, 166, 58), outline=(20, 20, 20), width=2)
    y += math.ceil(len(liste) / SP) * ZH
img.save(ZIEL)
print(os.path.abspath(ZIEL), img.size)
