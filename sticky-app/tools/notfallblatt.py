"""Notfallblatt für den Sticky (SPEC „SD-Karte als Bibliothek und Bugout-Sticky“, FW ≥ 0.40.0).

Liest die private Datei (Standard: Desktop\\Claude\\privat\\notfall.md, nie im Repo), zeichnet das Blatt 800×480 1 bpp in
Braun-Optik und spielt es per USB-Kabel auf die SD-Karte des Sticky (/soll/widgets/notfall/). Ohne Sticky am Kabel bleibt
es bei der Vorschau (PNG neben der privaten Datei). Jedes Mal entsteht dazu die Papierkarte (Scheckkarte, Vorder- und
Rückseite zum Falten, zweimal auf A4) als PDF neben der privaten Datei: für Portemonnaie und Box.

Aufruf:  python sticky-app/tools/notfallblatt.py [datei.md] [--port COM7] [--nur-vorschau] [--neue-pin]
Fehlt die private Datei, legt das Skript sie aus der Vorlage an und hört auf (erst ausfüllen).
Liegen Dateien in privat\notfall-doku, kommen sie verschlüsselt mit (notfalldoku.py, FW ≥ 0.41.0) und das Blatt bekommt
den Knopf „Dokumente“. Die PIN fragt das Skript beim ersten Mal und mit --neue-pin.
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


GROSS = 22                    # Lesemodus „Groß“ (ohne Brille, Markus 17.11.2026): kleinste Schrift auf Notfallseiten


def zeichnen(d, doku=False):
    """Notfallblatt 800 × 480 im Lesemodus „Groß“ (nichts unter 22 px)"""
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    S, Wt = 0, 255
    G = GROSS
    # Kopf: schwarzer Balken, rechts oben bleibt Platz für die Statuszeile
    g.rectangle([0, 0, W, 56], fill=S)
    g.text((20, 28), 'NOTFALL', font=schrift(30, True), fill=Wt, anchor='lm')
    g.text((190, 30), 'Stand ' + datetime.date.today().strftime('%d.%m.%Y'), font=schrift(G), fill=Wt, anchor='lm')
    links, mitte, rechts = 20, 420, 436
    unten = 404                                   # darunter der Fuß mit den Knöpfen
    y = 66

    def marke(x, y, text):
        g.text((x, y), text, font=schrift(G), fill=S)

    if d.get('Name'):
        g.text((links, y), d['Name'], font=passend(g, d['Name'], 34, mitte - links, True, G), fill=S); y += 42
        if d.get('Zusatz'):                       # bei Bedarf zwei Zeilen statt kleiner Schrift
            for z in umbrechen(g, d['Zusatz'], schrift(G), mitte - links - 10)[:2]:
                g.text((links, y), z, font=schrift(G), fill=S); y += 28
        g.line([links, y + 4, mitte - 10, y + 4], fill=S, width=2); y += 14
    if d['Kontakt']:
        marke(links, y, 'Im Notfall anrufen'); y += 30
        anzahl = 2 if d.get('Treffpunkt') else 3   # Platz: mit Treffpunkt zwei Kontakte
        for i, k in enumerate(d['Kontakt'][:anzahl], 1):
            wer, _, nr = (s.strip() for s in k.partition('|'))
            g.ellipse([links, y + 8, links + 34, y + 42], fill=S)
            g.text((links + 17, y + 25), str(i), font=schrift(G, True), fill=Wt, anchor='mm')
            g.text((links + 46, y), wer, font=passend(g, wer, G, mitte - links - 56, False, G), fill=S)
            g.text((links + 46, y + 25), nr, font=passend(g, nr, 28, mitte - links - 56, True, G), fill=S)
            y += 62
        g.line([links, y, mitte - 10, y], fill=S, width=2); y += 10
    if d.get('Treffpunkt'):
        marke(links, y, 'Treffpunkt'); y += 28
        for z in umbrechen(g, d['Treffpunkt'], schrift(G, True), mitte - links - 10):
            if y + G > unten:
                break
            g.text((links, y), z, font=schrift(G, True), fill=S); y += 28

    # rechts: Medizin im Doppelring (Braun „haupt“), darunter die Box
    y = 66
    if d['Medizin']:
        n = min(len(d['Medizin']), 4)
        hoehe = 60 + 32 * n
        g.rounded_rectangle([rechts, y, W - 16, y + hoehe], radius=18, outline=S, width=6, fill=Wt)
        g.rounded_rectangle([rechts + 10, y + 10, W - 26, y + hoehe - 10], radius=10, outline=S, width=2)
        g.text((rechts + 24, y + 18), 'Medizin', font=schrift(G), fill=S)
        yy = y + 46
        for i, m in enumerate(d['Medizin'][:n]):
            g.text((rechts + 24, yy), m, font=passend(g, m, 24, W - 26 - rechts - 34, i == 0, G), fill=S); yy += 32
        y += hoehe + 12
    platz = (unten - y) // 27                     # Zeilen, die rechts noch passen
    hinweis = umbrechen(g, d['Hinweis'], schrift(G), W - 16 - rechts) if d.get('Hinweis') else []
    box = (['In der Box'] + umbrechen(g, d['Box'], schrift(G), W - 16 - rechts)) if d.get('Box') else []
    if len(box) + len(hinweis) > platz:           # zu lang: Hinweis nur ganz oder gar nicht, die Box-Liste kürzen
        if len(hinweis) > platz // 2:
            hinweis = []
        box = box[:max(0, platz - len(hinweis))]
        if box and len(box) > 1:
            box[-1] = box[-1].rstrip(',') + ' …'
    for z in box + hinweis:
        g.text((rechts, y), z, font=schrift(G), fill=S); y += 27

    # Fuß: Knöpfe (wirken nur mit Strom)
    g.line([0, 416, W, 416], fill=S, width=2)
    knoepfe = [(20, 428, 220, 472, 'SOS', 'sos'), (236, 428, 436, 472, 'Sparmodus', 'spar')]
    if doku:
        knoepfe.append((452, 428, 652, 472, 'Dokumente', 'doku'))
    for x0, y0, x1, y1, t, a in knoepfe:
        if a == 'sos':
            g.rounded_rectangle([x0, y0, x1, y1], radius=22, fill=S)
            g.text(((x0 + x1) / 2, (y0 + y1) / 2), t, font=schrift(26, True), fill=Wt, anchor='mm')
        else:
            g.rounded_rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], radius=21, outline=S, width=2)
            g.text(((x0 + x1) / 2, (y0 + y1) / 2), t, font=schrift(G), fill=S, anchor='mm')
    if not doku:
        g.text((W - 16, 450), 'Akku leer: bleibt stehen', font=schrift(G), fill=S, anchor='rm')
    # Felder: Knöpfe mit etwas Rand (Finger)
    felder = 'typ notfall\n' + ''.join(f'knopf {x0 - 8} {y0 - 8} {x1 + 8} {min(H, y1 + 8)} {a}\n' for x0, y0, x1, y1, _, a in knoepfe)
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), felder


DPI = 600
MM = DPI / 25.4
PT = DPI / 72
KB, KH = round(85.6 * MM), round(54 * MM)     # Scheckkarte (Portemonnaie, Box)


def karte_seiten(d):
    """Vorder- und Rückseite der Papierkarte (Scheckkarte, 600 dpi, schwarz-weiß wie das Blatt)"""
    rand = round(3 * MM)
    vorn, hinten = Image.new('L', (KB, KH), 255), Image.new('L', (KB, KH), 255)
    breite = KB - 2 * rand

    # Vorderseite: Kopf mit Name, Kontakte, Medizin kurz
    g = ImageDraw.Draw(vorn)
    kopf = round(9 * MM)
    g.rectangle([0, 0, KB, kopf], fill=0)
    g.text((rand, kopf / 2), 'NOTFALL', font=schrift(round(11 * PT), True), fill=255, anchor='lm')
    if d.get('Name'):
        x = rand + g.textlength('NOTFALL', font=schrift(round(11 * PT), True)) + round(3 * MM)
        g.text((x, kopf / 2), d['Name'], font=passend(g, d['Name'], round(10 * PT), KB - rand - x), fill=255, anchor='lm')
    y = kopf + round(2 * MM)
    if d.get('Zusatz'):
        g.text((rand, y), d['Zusatz'], font=passend(g, d['Zusatz'], round(6.5 * PT), breite), fill=0); y += round(4 * MM)
    if d['Kontakt']:
        g.text((rand, y), 'IM NOTFALL ANRUFEN', font=schrift(round(5.5 * PT)), fill=0); y += round(3 * MM)
        for k in d['Kontakt'][:3]:
            wer, _, nr = (s.strip() for s in k.partition('|'))
            f = schrift(round(8 * PT), True)
            g.text((rand, y), nr, font=f, fill=0)
            x = rand + g.textlength(nr, font=f) + round(2 * MM)
            g.text((x, y + round(0.6 * MM)), wer, font=passend(g, wer, round(7 * PT), KB - rand - x), fill=0)
            y += round(4.2 * MM)
    if d['Medizin']:
        y += round(0.8 * MM)
        unten = KH - rand
        g.rounded_rectangle([rand, y, KB - rand, unten], radius=round(2 * MM), outline=0, width=round(0.5 * MM))
        zeilen = d['Medizin'][:5]                    # je Angabe eine Zeile, so groß wie der Platz erlaubt
        gr = round(8.5 * PT)
        while len(zeilen) * gr * 1.2 > unten - y - round(5 * MM) and gr > round(5 * PT):
            gr -= 4
        yy = y + round(1.5 * MM)
        g.text((rand + round(2 * MM), yy), 'MEDIZIN', font=schrift(round(5 * PT)), fill=0); yy += round(2.8 * MM)
        for i, z in enumerate(zeilen):
            g.text((rand + round(2 * MM), yy), z, font=passend(g, z, gr, breite - round(4 * MM), i == 0), fill=0); yy += round(gr * 1.2)

    # Rückseite: Treffpunkt, Hinweis, Box, Stand
    g = ImageDraw.Draw(hinten)
    y = rand
    for titel, wert, gr in (('TREFFPUNKT', d.get('Treffpunkt'), 8), ('HINWEIS', d.get('Hinweis'), 7), ('IN DER BOX', d.get('Box'), 6.5)):
        if not wert:
            continue
        g.text((rand, y), titel, font=schrift(round(5.5 * PT)), fill=0); y += round(3 * MM)
        f = schrift(round(gr * PT))
        for z in umbrechen(g, wert, f, breite)[:4]:
            g.text((rand, y), z, font=f, fill=0); y += round(f.size * 1.2)
        y += round(1.5 * MM)
    g.line([rand, KH - rand - round(4 * MM), KB - rand, KH - rand - round(4 * MM)], fill=0, width=round(0.25 * MM))
    g.text((rand, KH - rand), 'Stand ' + datetime.date.today().strftime('%d.%m.%Y') + ' · gleiche Daten wie am Sticky (Seite Notfall)',
           font=schrift(round(5 * PT)), fill=0, anchor='ls')
    return vorn, hinten


def karte_pdf(d, ziel):
    """A4 mit zwei Karten (Portemonnaie + Box), je Vorder- und Rückseite nebeneinander: ausschneiden, in der Mitte
    falten (Vorder- und Rückseite hängen an der Falz zusammen), laminieren. Drucken in 100 %."""
    vorn, hinten = karte_seiten(d)
    a4 = Image.new('L', (round(210 * MM), round(297 * MM)), 255)
    g = ImageDraw.Draw(a4)
    x0 = (a4.width - 2 * KB) // 2
    for i in range(2):
        y0 = round((30 + i * 75) * MM)
        a4.paste(vorn, (x0, y0))
        a4.paste(hinten, (x0 + KB, y0))
        g.rectangle([x0, y0, x0 + 2 * KB, y0 + KH], outline=0, width=2)          # Schnittlinie
        for yy in range(y0, y0 + KH, round(2 * MM)):                              # Falz gestrichelt
            g.line([x0 + KB, yy, x0 + KB, yy + round(1 * MM)], fill=0, width=2)
    g.text((x0, round(20 * MM)), 'Notfallkarte – in 100 % drucken, außen ausschneiden, an der gestrichelten Linie falten, laminieren',
           font=schrift(round(8 * PT)), fill=0)
    a4.point(lambda v: 255 if v >= 128 else 0).convert('1').save(ziel, resolution=DPI)


def bits(bild):
    """1 bpp, MSB zuerst, 1 = schwarz (wie imgBuf im Sticky); PIL packt 1 = weiß, also umdrehen"""
    return bytes(b ^ 0xFF for b in bild.tobytes())


def sticky_port():
    from serial.tools import list_ports
    for p in list_ports.comports():
        if p.vid in (0x1A86, 0x303A):   # CH343-Wandler am Sticky (bzw. Espressif-USB)
            return p.device
    return None


def wer(s):
    """„Wer hängt am Kabel?“ (FW ≥ 0.42.0): → dict mit name, mac, fw, notfall, schluessel – oder None bei älterer Firmware"""
    s.reset_input_buffer()
    s.write(b'WER\n')
    s.flush()
    ende = time.time() + 3
    while time.time() < ende:
        z = s.readline().decode('utf-8', 'replace').strip()
        if z.startswith('WER '):
            t = z.split()
            return {'name': t[1], 'mac': t[2], 'fw': t[4], 'notfall': t[6] == '1', 'schluessel': t[8] == '1'}
    return None


def geraet_pruefen(s, merken):
    """Zeigt, welcher Sticky dranhängt. Mit merken (Pfad): beim ersten Mal still merken, bei einem anderen Gerät fragen."""
    g = wer(s)
    if not g:
        print('  Sticky: Firmware vor 0.42.0 (kennt „WER“ nicht)')
        return
    print(f"  Sticky: {g['name']} · FW {g['fw']}" + (' · hat schon ein Notfallblatt' if g['notfall'] else ''))
    if not merken:
        return
    bisher = open(merken, encoding='utf-8').read().split() if os.path.exists(merken) else []
    if not bisher:
        open(merken, 'w', encoding='utf-8').write(f"{g['mac']} {g['name']}\n")
        return
    if bisher[0] != g['mac']:
        antwort = input(f"  Achtung: Das ist nicht dein Sticky ({bisher[1] if len(bisher) > 1 else bisher[0]}), sondern {g['name']}. "
                        'Trotzdem deine Notfalldaten aufspielen? [j/N] ').strip().lower()
        if antwort not in ('j', 'ja', 'y', 'yes'):
            sys.exit('Abgebrochen, nichts geschrieben.')
        if input('  Soll das ab jetzt dein Sticky sein? [j/N] ').strip().lower() in ('j', 'ja', 'y', 'yes'):
            open(merken, 'w', encoding='utf-8').write(f"{g['mac']} {g['name']}\n")


def aufspielen(port, dateien, merken=None):
    import serial
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 0.2
    s.dtr = False                   # beide aus: kein Reset beim Öffnen
    s.rts = False
    s.open()
    time.sleep(0.3)
    s.reset_input_buffer()
    try:
        geraet_pruefen(s, merken)
        def senden(rel, daten):
            s.reset_input_buffer()
            if rel == 'SCHLUESSEL':                 # verpackter Schlüssel der Notfalldokumente (FW ≥ 0.41.0)
                s.write(f'SCHLUESSEL {daten}\n'.encode())
                kennung = 'SCHLUESSEL '
            else:
                s.write(f'DATEI {rel} {len(daten)}\n'.encode())
                s.flush()
                ende = time.time() + 20           # Handschlag ab FW 0.41.0: erst nach „DATEI BEREIT“ senden (der Sticky
                bereit = False                    # verwirft, was vorher kommt; nach Dokumenten zeichnet er bis zu einigen s)
                while time.time() < ende:
                    z = s.readline().decode('utf-8', 'replace').strip()
                    if z.startswith('DATEI BEREIT'):
                        bereit = True
                        break
                    if z.startswith('DATEI FEHLER'):
                        return z
                if not bereit:
                    return 'DATEI FEHLER kein „bereit“ (Firmware ≥ 0.41.0 nötig)'
                for o in range(0, len(daten), 4096):
                    s.write(daten[o:o + 4096])
                kennung = 'DATEI '
            s.flush()
            ende = time.time() + 15
            while time.time() < ende:
                z = s.readline().decode('utf-8', 'replace').strip()
                if z.startswith(kennung) and not z.startswith('DATEI BEREIT'):
                    return z
            return ''
        for i, (rel, daten) in enumerate(dateien):
            antwort = senden(rel, daten)
            if not antwort and i == 0:   # Sticky beim Öffnen neu gestartet? Kurz warten, noch einmal
                time.sleep(6)
                antwort = senden(rel, daten)
            if ' OK' not in antwort[:16]:
                sys.exit(f'Aufspielen von {rel} fehlgeschlagen: {antwort or "keine Antwort (Firmware ≥ 0.40.0? Karte drin?)"}')
            print(f'  [{i + 1}/{len(dateien)}] ' + antwort)
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
    ap.add_argument('--neue-pin', action='store_true', help='PIN der Notfalldokumente neu setzen (Sticky am USB)')
    a = ap.parse_args()
    if not os.path.exists(a.datei):
        os.makedirs(os.path.dirname(a.datei), exist_ok=True)
        shutil.copy(VORLAGE, a.datei)
        print(f'Neu angelegt: {a.datei}\nBitte ausfüllen und das Skript noch einmal starten.')
        return
    daten = lesen(a.datei)
    privat = os.path.dirname(os.path.abspath(a.datei))
    doku = None
    if not a.nur_vorschau:
        import notfalldoku
        doku = notfalldoku.paket(privat, a.neue_pin, bits)
    bild, felder = zeichnen(daten, doku is not None)
    vorschau = os.path.splitext(a.datei)[0] + '-vorschau.png'
    bild.save(vorschau)
    print('Vorschau:', vorschau)
    karte = os.path.splitext(a.datei)[0] + '-karte.pdf'
    karte_pdf(daten, karte)
    print('Papierkarte:', karte)
    if a.nur_vorschau:
        return
    port = a.port or sticky_port()
    if not port:
        print('Kein Sticky am USB gefunden – nur die Vorschau. (Sticky anstecken oder --port COMx angeben.)')
        return
    print('Aufspielen über', port)
    dateien = [('widgets/notfall/bild.bin', bits(bild)), ('widgets/notfall/felder.txt', felder.encode())]
    if doku:
        doku_dateien, schluessel, kacheln, (standpfad, stand) = doku
        print('Dokumente:', ', '.join(f'{n} ({k} S.)' for n, _, k in kacheln))
        dateien += doku_dateien + ([('SCHLUESSEL', schluessel)] if schluessel else [])
    aufspielen(port, dateien, os.path.join(privat, 'notfall-geraet.txt'))   # merkt sich dein Gerät
    if doku:
        import json
        json.dump(stand, open(standpfad, 'w'))
    print('Fertig. Am Sticky mit ▲/▼ zur Seite „Notfall“ blättern.')


if __name__ == '__main__':
    main()
