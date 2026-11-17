"""Notfallblatt für den Sticky (SPEC „SD-Karte als Bibliothek und Bugout-Sticky“, FW ≥ 0.40.0).

Liest die private Datei (Standard: Desktop\\Claude\\privat\\notfall.md, nie im Repo), zeichnet das Blatt 800×480 1 bpp in
Braun-Optik und spielt es per USB-Kabel auf die SD-Karte des Sticky (/soll/widgets/notfall/). Ohne Sticky am Kabel bleibt
es bei der Vorschau (PNG neben der privaten Datei).

Aufruf:  python sticky-app/tools/notfallblatt.py [datei.md] [--port COM7] [--nur-vorschau]
Fehlt die private Datei, legt das Skript sie aus der Vorlage an und hört auf (erst ausfüllen).
"""
import argparse, datetime, os, shutil, sys, time
from PIL import Image, ImageDraw, ImageFont

HIER = os.path.dirname(os.path.abspath(__file__))
PRIVAT = os.path.normpath(os.path.join(HIER, '..', '..', '..', '..', 'privat', 'notfall.md'))
VORLAGE = os.path.join(HIER, 'notfall-vorlage.md')
W, H = 800, 480
ST_B, ST_H = 288, 32          # Statuszeile rechts oben (zeichnet der Sticky selbst)


def schrift(gr, fett=False):
    for n in (['arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'] if fett else ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf']):
        try:
            return ImageFont.truetype(n, gr)
        except OSError:
            pass
    return ImageFont.load_default()


def lesen(pfad):
    d = {'Kontakt': [], 'Medizin': []}
    for z in open(pfad, encoding='utf-8'):
        z = z.strip()
        if not z or z.startswith('#') or ':' not in z:
            continue
        k, v = (s.strip() for s in z.split(':', 1))
        if k in d:
            d[k].append(v)
        else:
            d[k] = v
    return d


def passend(g, text, gr, breite, fett=False, min_gr=12):
    """Schrift so klein wie nötig, damit text in breite passt"""
    while gr > min_gr and g.textlength(text, font=schrift(gr, fett)) > breite:
        gr -= 1
    return schrift(gr, fett)


def umbrechen(g, text, f, breite):
    zeilen, z = [], ''
    for w in text.replace(',', ', ').split():
        t = (z + ' ' + w).strip()
        if g.textlength(t, font=f) <= breite:
            z = t
        else:
            if z:
                zeilen.append(z)
            z = w
    if z:
        zeilen.append(z)
    return zeilen


def zeichnen(d):
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    S, Wt = 0, 255
    # Kopf: schwarzer Balken, rechts oben bleibt Platz für die Statuszeile
    g.rectangle([0, 0, W, 56], fill=S)
    g.text((20, 28), 'NOTFALL', font=schrift(30, True), fill=Wt, anchor='lm')
    g.text((200, 30), 'Stand ' + datetime.date.today().strftime('%d.%m.%Y'), font=schrift(15), fill=Wt, anchor='lm')
    links, mitte, rechts = 20, 420, 436
    y = 74
    klein = schrift(14)

    def marke(x, y, text):
        g.text((x, y), text.upper(), font=klein, fill=S)

    if d.get('Name'):
        marke(links, y, 'Name'); y += 20
        g.text((links, y), d['Name'], font=passend(g, d['Name'], 32, mitte - links, True), fill=S); y += 40
        if d.get('Zusatz'):
            g.text((links, y), d['Zusatz'], font=passend(g, d['Zusatz'], 16, mitte - links), fill=S); y += 24
        g.line([links, y + 4, mitte - 10, y + 4], fill=S, width=2); y += 14
    if d['Kontakt']:
        marke(links, y, 'Im Notfall anrufen'); y += 24
        for i, k in enumerate(d['Kontakt'][:3], 1):
            wer, _, nr = (s.strip() for s in k.partition('|'))
            g.ellipse([links, y + 4, links + 30, y + 34], fill=S)
            g.text((links + 15, y + 19), str(i), font=schrift(17, True), fill=Wt, anchor='mm')
            g.text((links + 44, y), wer, font=passend(g, wer, 18, mitte - links - 54), fill=S)
            g.text((links + 44, y + 21), nr, font=passend(g, nr, 22, mitte - links - 54, True), fill=S)
            y += 54
        g.line([links, y, mitte - 10, y], fill=S, width=2); y += 10
    if d.get('Treffpunkt'):
        marke(links, y, 'Treffpunkt'); y += 22
        for z in umbrechen(g, d['Treffpunkt'], schrift(19), mitte - links - 10)[:2]:
            g.text((links, y), z, font=schrift(19), fill=S); y += 24

    # rechts: Medizin im Doppelring (Braun „haupt“), darunter die Box
    y = 74
    if d['Medizin']:
        hoehe = 56 + 30 * min(len(d['Medizin']), 5)
        g.rounded_rectangle([rechts, y, W - 16, y + hoehe], radius=18, outline=S, width=6, fill=Wt)
        g.rounded_rectangle([rechts + 10, y + 10, W - 26, y + hoehe - 10], radius=10, outline=S, width=2)
        g.text((rechts + 24, y + 20), 'MEDIZIN · KURZ', font=klein, fill=S)
        yy = y + 42
        for i, m in enumerate(d['Medizin'][:5]):
            f = passend(g, m, 21, W - 26 - rechts - 34, i == 0)
            g.text((rechts + 24, yy), m, font=f, fill=S); yy += 30
        y += hoehe + 18
    if d.get('Box'):
        marke(rechts, y, 'In der Box'); y += 22
        for z in umbrechen(g, d['Box'], schrift(16), W - 16 - rechts)[:5]:
            g.text((rechts, y), z, font=schrift(16), fill=S); y += 21
    if d.get('Hinweis'):
        g.text((rechts, min(y + 6, 392)), d['Hinweis'], font=passend(g, d['Hinweis'], 15, W - 16 - rechts), fill=S)

    # Fuß: Knöpfe (wirken nur mit Strom)
    g.line([0, 416, W, 416], fill=S, width=2)
    knoepfe = [(20, 428, 220, 472, 'SOS', 'sos'), (236, 428, 436, 472, 'Sparmodus', 'spar')]
    for x0, y0, x1, y1, t, a in knoepfe:
        if a == 'sos':
            g.rounded_rectangle([x0, y0, x1, y1], radius=22, fill=S)
            g.text(((x0 + x1) / 2, (y0 + y1) / 2), t, font=schrift(20, True), fill=Wt, anchor='mm')
        else:
            g.rounded_rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], radius=21, outline=S, width=2)
            g.text(((x0 + x1) / 2, (y0 + y1) / 2), t, font=schrift(18), fill=S, anchor='mm')
    g.text((W - 16, 450), 'Akku leer: Bild bleibt stehen', font=schrift(14), fill=S, anchor='rm')
    # Felder: Knöpfe mit etwas Rand (Finger)
    felder = 'typ notfall\n' + ''.join(f'knopf {x0 - 8} {y0 - 8} {x1 + 8} {min(H, y1 + 8)} {a}\n' for x0, y0, x1, y1, _, a in knoepfe)
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), felder


def bits(bild):
    """1 bpp, MSB zuerst, 1 = schwarz (wie imgBuf im Sticky); PIL packt 1 = weiß, also umdrehen"""
    return bytes(b ^ 0xFF for b in bild.tobytes())


def sticky_port():
    from serial.tools import list_ports
    for p in list_ports.comports():
        if p.vid in (0x1A86, 0x303A):   # CH343-Wandler am Sticky (bzw. Espressif-USB)
            return p.device
    return None


def aufspielen(port, dateien):
    import serial
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 0.2
    s.dtr = False                   # beide aus: kein Reset beim Öffnen
    s.rts = False
    s.open()
    time.sleep(0.3)
    s.reset_input_buffer()
    try:
        def senden(rel, daten):
            s.reset_input_buffer()
            s.write(f'DATEI {rel} {len(daten)}\n'.encode())
            s.flush()
            for o in range(0, len(daten), 4096):
                s.write(daten[o:o + 4096])
            s.flush()
            ende = time.time() + 15
            while time.time() < ende:
                z = s.readline().decode('utf-8', 'replace').strip()
                if z.startswith('DATEI '):
                    return z
            return ''
        for i, (rel, daten) in enumerate(dateien):
            antwort = senden(rel, daten)
            if not antwort and i == 0:   # Sticky beim Öffnen neu gestartet? Kurz warten, noch einmal
                time.sleep(6)
                antwort = senden(rel, daten)
            if not antwort.startswith('DATEI OK'):
                sys.exit(f'Aufspielen von {rel} fehlgeschlagen: {antwort or "keine Antwort (Firmware ≥ 0.40.0? Karte drin?)"}')
            print('  ' + antwort)
    finally:
        s.close()


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')   # Windows-Konsole (cp1252) kennt ▲/▼ nicht
    except AttributeError:
        pass
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('datei', nargs='?', default=PRIVAT)
    ap.add_argument('--port')
    ap.add_argument('--nur-vorschau', action='store_true')
    a = ap.parse_args()
    if not os.path.exists(a.datei):
        os.makedirs(os.path.dirname(a.datei), exist_ok=True)
        shutil.copy(VORLAGE, a.datei)
        print(f'Neu angelegt: {a.datei}\nBitte ausfüllen und das Skript noch einmal starten.')
        return
    bild, felder = zeichnen(lesen(a.datei))
    vorschau = os.path.splitext(a.datei)[0] + '-vorschau.png'
    bild.save(vorschau)
    print('Vorschau:', vorschau)
    if a.nur_vorschau:
        return
    port = a.port or sticky_port()
    if not port:
        print('Kein Sticky am USB gefunden – nur die Vorschau. (Sticky anstecken oder --port COMx angeben.)')
        return
    print('Aufspielen über', port)
    aufspielen(port, [('widgets/notfall/bild.bin', bits(bild)), ('widgets/notfall/felder.txt', felder.encode())])
    print('Fertig. Am Sticky mit ▲/▼ zur Seite „Notfall“ blättern.')


if __name__ == '__main__':
    main()
