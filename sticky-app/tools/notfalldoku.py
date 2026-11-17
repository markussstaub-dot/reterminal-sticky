"""Notfalldokumente mit PIN (SPEC „SD-Karte als Bibliothek und Bugout-Sticky“, Schritt 2, FW ≥ 0.41.0).

Wird von notfallblatt.py mit erledigt, sobald der Ordner Desktop\\Claude\\privat\\notfall-doku Dateien enthält
(PDF, JPG, PNG; Reihenfolge nach Dateiname, „01 Ausweis.pdf“ → „Ausweis“).

- Schlüssel: 32 Zufallsbytes in privat\\notfall-schluessel.bin (beim ersten Mal angelegt; das ist das Backup).
- PIN: 4–6 Ziffern, nur beim ersten Mal bzw. mit --neue-pin am Zenbook eingetippt. Zum Sticky geht nur der verpackte
  Schlüssel: salt(16) | nonce(12) | tag(16) | AES-GCM(Schlüssel) mit PBKDF2-SHA256(PIN, salt, 10 000).
- Seiten: je 800 × 480, 1 bpp (1 = schwarz), als nonce(12) | tag(16) | AES-256-GCM(Bild), AAD „sNNN“.
  s000 ist das Inhaltsverzeichnis (Kacheln springen zur ersten Seite eines Dokuments).
"""
import getpass, hashlib, json, os, re, secrets
from PIL import Image, ImageDraw, ImageOps

W, H = 800, 480
KOPF = 32           # schwarze Kopfzeile je Seite (rechts davon zeichnet der Sticky die Statuszeile)
ITER = 10000


def _schrift(gr, fett=False):
    from notfallblatt import schrift
    return schrift(gr, fett)


# ---- Krypto -------------------------------------------------------------------------------------------------------------
def _gcm():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM


def verschluesseln(key, daten, aad):
    nonce = secrets.token_bytes(12)
    ct = _gcm()(key).encrypt(nonce, daten, aad)
    return nonce + ct[-16:] + ct[:-16]          # nonce | tag | ct (so liest es der Sticky)


def blob(key, pin):
    salt = secrets.token_bytes(16)
    kek = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, ITER, 32)
    return salt + verschluesseln(kek, key, None)


def pin_fragen():
    pin = os.environ.get('NOTFALL_PIN')         # nur für Tests ohne Tastatur
    if pin:
        return pin
    while True:
        a = getpass.getpass('PIN für die Notfalldokumente (4–6 Ziffern): ')
        if not re.fullmatch(r'\d{4,6}', a):
            print('Bitte 4 bis 6 Ziffern.')
            continue
        if getpass.getpass('PIN noch einmal: ') == a:
            return a
        print('Die beiden PINs waren verschieden.')


# ---- Seiten -------------------------------------------------------------------------------------------------------------
def quellen(ordner):
    return sorted(f for f in os.listdir(ordner) if f.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png')))


def _anzeigename(datei):
    n = os.path.splitext(datei)[0]
    return re.sub(r'^\d+[\s._-]*', '', n).strip() or n


def _bilder(pfad):
    """Quelle → Liste von (PIL-Bild L, ist_text)"""
    if pfad.lower().endswith('.pdf'):
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(pfad)
        aus = []
        for i in range(len(pdf)):
            seite = pdf[i]
            breite = seite.get_width()
            aus.append((seite.render(scale=1600 / breite).to_pil().convert('L'), True))
        return aus
    im = ImageOps.exif_transpose(Image.open(pfad)).convert('L')
    return [(im, False)]


def _einpassen(im, text):
    """Ein Quellbild → eine oder mehrere 800 × (480 − KOPF)-Ausschnitte (hochkant: in Streifen mit Überlappung)"""
    hb = H - KOPF
    if im.height > im.width * 0.9:              # hochkant (A4, Ausweis hochkant): volle Breite, in Streifen
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        teile, y, schritt = [], 0, hb - 40
        while True:
            teile.append(im.crop((0, y, W, y + hb)))
            if y + hb >= im.height:
                break
            y += schritt
        return teile
    f = min(W / im.width, hb / im.height)
    klein = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    flaeche = Image.new('L', (W, hb), 255)
    flaeche.paste(klein, ((W - klein.width) // 2, (hb - klein.height) // 2))
    return [flaeche]


def _schwarzweiss(im, text):
    im = ImageOps.autocontrast(im, cutoff=1)
    if text:
        return im.point(lambda v: 255 if v >= 170 else 0).convert('1')
    return im.convert('1')                      # Fotos: Floyd-Steinberg


def _mit_kopf(inhalt, titel):
    seite = Image.new('1', (W, H), 1)
    g = ImageDraw.Draw(seite)
    g.rectangle([0, 0, W, KOPF - 1], fill=0)
    g.text((12, KOPF // 2), titel, font=_schrift(18, True), fill=1, anchor='lm')
    seite.paste(inhalt, (0, KOPF))
    return seite


def seiten_bauen(ordner):
    """→ (seiten: [PIL 1-bpp], kacheln: [(name, erste_seite, anzahl)]); Seite 0 ist das Inhaltsverzeichnis"""
    seiten, kacheln = [None], []
    for datei in quellen(ordner):
        name = _anzeigename(datei)
        teile = []
        for im, text in _bilder(os.path.join(ordner, datei)):
            teile += [_schwarzweiss(t, text) for t in _einpassen(im, text)]
        kacheln.append((name, len(seiten), len(teile)))
        for i, t in enumerate(teile):
            seiten.append(_mit_kopf(t, f'{name}  {i + 1}/{len(teile)}'))
    seiten[0], zonen = inhalt(kacheln)
    return seiten, kacheln, zonen


def inhalt(kacheln):
    """Inhaltsverzeichnis: Kacheln in zwei Spalten; → (Bild, [(x0, y0, x1, y1, seite)])"""
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    g.rectangle([0, 0, W, 56], fill=0)
    g.text((20, 28), 'DOKUMENTE', font=_schrift(30, True), fill=255, anchor='lm')
    zonen = []
    for i, (name, erste, anzahl) in enumerate(kacheln[:12]):
        sp, ze = i % 2, i // 2
        x0, y0 = 20 + sp * 390, 70 + ze * 58
        x1, y1 = x0 + 370, y0 + 50
        g.rounded_rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], radius=24, outline=0, width=2)
        g.text((x0 + 22, (y0 + y1) / 2), name, font=_schrift(20, True), fill=0, anchor='lm')
        g.text((x1 - 22, (y0 + y1) / 2), f'{anzahl} S.', font=_schrift(16), fill=0, anchor='rm')
        zonen.append((x0, y0, x1, y1, erste))
    g.line([0, 440, W, 440], fill=0, width=2)
    g.text((20, 460), '▲/▼ blättern · Kachel antippen · KI = zu · sperrt nach 2 min', font=_schrift(16), fill=0, anchor='lm')
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), zonen


def pin_seite():
    """PIN-Seite (offen, ohne Inhalt): Ziffernfeld rechts, Kästchen links → (Bild, felder.txt)"""
    from notfallblatt import schrift
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    g.rectangle([0, 0, W, 56], fill=0)
    g.text((20, 28), 'DOKUMENTE', font=schrift(30, True), fill=255, anchor='lm')
    g.text((40, 140), 'PIN eingeben', font=schrift(26, True), fill=0, anchor='lm')
    g.text((40, 280), '10 falsche PINs löschen', font=schrift(16), fill=0, anchor='lm')
    g.text((40, 302), 'den Schlüssel im Sticky.', font=schrift(16), fill=0, anchor='lm')
    g.text((40, 440), 'KI = zurück', font=schrift(16), fill=0, anchor='lm')
    felder = ['typ nfpin', 'punkte 40 190']
    tasten = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '⌫', '0', 'OK']
    x0, y0, bw, bh = 432, 66, 120, 103
    for i, t in enumerate(tasten):
        sp, ze = i % 3, i // 3
        x, y = x0 + sp * bw, y0 + ze * bh
        cx, cy, r = x + bw / 2, y + bh / 2, 42
        if t == 'OK':
            g.ellipse([cx - r, cy - r, cx + r, cy + r], outline=0, width=6)
            g.ellipse([cx - r + 10, cy - r + 10, cx + r - 10, cy + r - 10], outline=0, width=2)
            g.text((cx, cy), t, font=schrift(26, True), fill=0, anchor='mm')
            felder.append(f'knopf {x} {y} {x + bw} {y + bh} ok')
        elif t == '⌫':
            g.ellipse([cx - r, cy - r, cx + r, cy + r], outline=0, width=2)
            g.text((cx, cy), '←', font=schrift(30, True), fill=0, anchor='mm')
            felder.append(f'knopf {x} {y} {x + bw} {y + bh} zurueck')
        else:
            g.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
            g.text((cx, cy + 1), t, font=schrift(34, True), fill=255, anchor='mm')
            felder.append(f'knopf {x} {y} {x + bw} {y + bh} ziffer {t}')
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), '\n'.join(felder) + '\n'


def gesperrt_seite(seiten, zonen):
    from notfallblatt import schrift
    bild = Image.new('L', (W, H), 255)
    g = ImageDraw.Draw(bild)
    g.rectangle([0, 0, W, 56], fill=0)
    g.text((20, 28), 'DOKUMENTE', font=schrift(30, True), fill=255, anchor='lm')
    g.text((W / 2, 230), 'gesperrt', font=schrift(40, True), fill=0, anchor='mm')
    g.text((W / 2, 290), 'Auf dem Notfallblatt „Dokumente“ tippen und die PIN eingeben.', font=schrift(18), fill=0, anchor='mm')
    felder = ['typ nfdoku', f'seiten {seiten}', 'taste up blatt -1', 'taste down blatt 1']
    felder += [f'knopf {x0} {y0} {x1} {y1} seite {s}' for x0, y0, x1, y1, s in zonen]
    return bild.point(lambda v: 255 if v >= 128 else 0).convert('1'), '\n'.join(felder) + '\n'


def paket(privat_ordner, neue_pin=False, bits=None):
    """Alles für den Sticky: → (dateien [(rel, bytes)], schluessel_hex | None, kacheln) oder None ohne Dokumente.
    Unveränderte Seiten (gleicher Inhalt, gleicher Schlüssel) werden nicht noch einmal geschickt."""
    ordner = os.path.join(privat_ordner, 'notfall-doku')
    if not os.path.isdir(ordner) or not quellen(ordner):
        return None
    kpfad = os.path.join(privat_ordner, 'notfall-schluessel.bin')
    neu = not os.path.exists(kpfad)
    if neu:
        key = secrets.token_bytes(32)
        print('Neuer Schlüssel für die Notfalldokumente.')
        pin = pin_fragen()
        with open(kpfad, 'wb') as f:
            f.write(key)
    else:
        key = open(kpfad, 'rb').read()
        pin = pin_fragen() if neue_pin else None
    seiten, kacheln, zonen = seiten_bauen(ordner)
    standpfad = os.path.join(privat_ordner, 'notfall-doku-stand.json')
    try:
        stand = json.load(open(standpfad))
    except (OSError, ValueError):
        stand = {}
    kennung = hashlib.sha256(key).hexdigest()[:16]
    if stand.get('schluessel') != kennung:
        stand = {'schluessel': kennung}
    dateien = []
    for i, s in enumerate(seiten):
        roh = bits(s)
        h = hashlib.sha256(roh).hexdigest()[:16]
        if stand.get(f's{i:03d}') == h:
            continue
        dateien.append((f'notfall/doku/s{i:03d}.bin', verschluesseln(key, roh, f's{i:03d}'.encode())))
        stand[f's{i:03d}'] = h
    pbild, pfelder = pin_seite()
    gbild, gfelder = gesperrt_seite(len(seiten), zonen)
    dateien += [('widgets/nf-pin/bild.bin', bits(pbild)), ('widgets/nf-pin/felder.txt', pfelder.encode()),
                ('widgets/nf-doku/bild.bin', bits(gbild)), ('widgets/nf-doku/felder.txt', gfelder.encode())]
    schluessel = blob(key, pin).hex() if pin else None
    return dateien, schluessel, kacheln, (standpfad, stand)
