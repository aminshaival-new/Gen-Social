"""Generates catalogue.html from the product list below. Run render.js afterwards for the PDF."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "images"

# name, file, piece line, details line, detail-crop focus (x, y as fractions), crop zoom
LOOKS = [
    ("Sindoor", "01-sindoor.jpg", "Kaftan Kurta · Straight Pants", "Hand-dotted yoke embroidery", (0.77, 0.38), 4.0),
    ("Haldi", "02-haldi.jpg", "Kurta · Palazzo", "Floral thread work on yoke, cuffs & hem", (0.5, 0.38), 3.6),
    ("Kamal", "03-kamal.jpg", "Kurta · Flared Sharara · Dupatta", "Lotus appliqué, scalloped edges", (0.5, 0.36), 4.2),
    ("Champa", "04-champa.jpg", "Tiered Midi Dress", "Scattered floral embroidery", (0.5, 0.66), 3.0),
    ("Kora", "05-kora.jpg", "Sleeveless Tunic · Pants", "Hand-stitched pocket motifs, frayed trims", (0.57, 0.35), 3.6),
    ("Basanti", "06-basanti.jpg", "Kurta · Dupatta", "Floral appliqué, sheer dupatta", (0.57, 0.44), 3.2),
    ("Reti", "07-reti.jpg", "Sleeveless Top · Wide Pants", "Tonal floral appliqué", (0.42, 0.37), 4.2),
    ("Kattha", "08-kattha.jpg", "Kurta · Pants · Striped Dupatta", "Pintuck yoke, contrast borders", (0.5, 0.31), 3.8),
    ("Gulaal", "09-gulaal.jpg", "Tiered Kurta · Dupatta", "Embroidered yoke, gold borders", (0.40, 0.47), 4.2),
    ("Mehendi", "10-mehendi.jpg", "Kurta · Dupatta", "Beaded floral motifs", (0.42, 0.47), 3.6),
    ("Aasmaan", "11-aasmaan.jpg", "Anarkali · Palazzo · Dupatta", "Embroidered yoke & sleeves", (0.45, 0.34), 4.4),
    ("Rani", "12-rani.jpg", "Anarkali · Pants · Dupatta", "Embroidered neckline, gold trims", (0.55, 0.40), 4.6),
    ("Neelam", "13-neelam.jpg", "Anarkali · Palazzo", "Emerald yoke, gold embroidery", (0.38, 0.34), 4.0),
    ("Panna", "14-panna.jpg", "Tiered Anarkali · Palazzo", "Gold yoke & border", (0.36, 0.33), 4.0),
    ("Jamuni", "16-jamuni.jpg", "Kurta · Pants · Dupatta", "Gold lotus motifs, piped seams", (0.44, 0.42), 3.4),
]

PAGE_W, PAGE_H = 960, 1200  # css px, 10in x 12.5in


def aspect(f):
    w, h = Image.open(IMG / f).size
    return w / h


def bg(f):
    return "images/" + f.rsplit(".", 1)[0] + "-bg.jpg"


def look_page(i, look):
    name, f, pieces, details, (fx, fy), zoom = look
    left_w = 320
    card_h = min(840, round((900 - left_w) / aspect(f)))
    right_w = round(card_h * aspect(f))
    card_w = left_w + right_w
    # detail crop: box 200x260, place the image so (fx, fy) sits in the centre
    bw, bh = 196, 256
    iw = bw * zoom
    ih = iw / aspect(f)
    left = bw / 2 - fx * iw
    top = bh / 2 - fy * ih
    left = min(0, max(bw - iw, left))
    top = min(0, max(bh - ih, top))
    return f"""
<section class="page look">
  <img class="bg" src="{bg(f)}" alt="">
  <div class="veil"></div>
  <div class="card" style="width:{card_w}px;height:{card_h}px">
    <div class="info" style="width:{left_w}px">
      <div class="brand"><img src="images/logo-ink.png" alt="Creative Threads"></div>
      <div class="detail" style="width:{bw}px;height:{bh}px">
        <img src="images/{f}" style="width:{iw:.1f}px;height:{ih:.1f}px;left:{left:.1f}px;top:{top:.1f}px" alt="">
      </div>
      <div class="meta">
        <div class="num">Look {i:02d}</div>
        <h2>{name.upper()}</h2>
        <p>{pieces}</p>
        <p class="sub">{details}</p>
      </div>
      <div class="foot">The Collection</div>
    </div>
    <div class="hero" style="width:{right_w}px"><img src="images/{f}" alt="{name}"></div>
  </div>
</section>"""


def index_page():
    items = "".join(
        f'<div class="it"><div class="th"><img src="images/{l[1]}" alt=""></div>'
        f'<span>{i:02d}</span> {l[0]}</div>'
        for i, l in enumerate(LOOKS, 1)
    )
    return f"""
<section class="page intro">
  <img class="logo" src="images/logo-ink.png" alt="Creative Threads">
  <p class="lede">Handcrafted silhouettes, thoughtful embroidery and fabrics made to be lived in &mdash;
  a collection that moves easily from everyday to celebration.</p>
  <div class="rule"></div>
  <div class="grid">{items}</div>
</section>"""


def cover():
    return """
<section class="page cover">
  <img class="full" src="images/03-kamal.jpg" alt="">
  <div class="shade"></div>
  <div class="cv">
    <img src="images/logo-white.png" alt="Creative Threads">
    <div class="tag">THE COLLECTION</div>
  </div>
</section>"""


def closing():
    return """
<section class="page closing">
  <img class="bg" src="images/15-poster-bg.jpg" alt="">
  <div class="veil"></div>
  <div class="frame"><img src="images/15-poster.jpg" alt="Creative Threads exhibition"></div>
</section>"""


CSS = f"""
@page {{ size: {PAGE_W}px {PAGE_H}px; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ background: #f7f1e6; }}
body {{ font-family: 'Jost', sans-serif; color: #342c26; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: {PAGE_W}px; height: {PAGE_H}px; position: relative; overflow: hidden; page-break-after: always; break-after: page; }}
.bg {{ position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; }}
.veil {{ position: absolute; inset: 0; background: rgba(40, 30, 22, .12); }}
.card {{ position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex;
  background: #fbf7ec; border: 7px solid #fffdf8; box-shadow: 0 30px 70px rgba(30, 20, 10, .28); }}
.info {{ position: relative; display: flex; flex-direction: column; align-items: center; padding: 34px 26px; }}
.brand {{ align-self: flex-start; }}
.brand img {{ height: 48px; opacity: .9; }}
.detail {{ position: relative; overflow: hidden; margin: auto 0 0; }}
.detail img {{ position: absolute; max-width: none; }}
.meta {{ text-align: center; margin: 28px 0 auto; }}
.num {{ font-size: 11px; letter-spacing: .32em; text-transform: uppercase; color: #9a8a78; margin-bottom: 10px; }}
h2 {{ font-family: 'Cormorant Garamond', serif; font-weight: 500; font-size: 34px; letter-spacing: .12em; }}
.meta p {{ font-size: 13px; font-weight: 300; margin-top: 10px; line-height: 1.5; letter-spacing: .02em; }}
.meta .sub {{ margin-top: 4px; color: #7d6e60; font-style: italic; font-family: 'Cormorant Garamond', serif; font-size: 16px; }}
.foot {{ position: absolute; bottom: 30px; font-size: 10px; letter-spacing: .4em; text-transform: uppercase; color: #a8998a; }}
.hero {{ height: 100%; }}
.hero img {{ width: 100%; height: 100%; display: block; }}
.cover .full {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }}
.cover .shade {{ position: absolute; inset: 0; background: linear-gradient(to top, rgba(40, 8, 12, .72) 0%, rgba(40, 8, 12, 0) 42%); }}
.cv {{ position: absolute; bottom: 90px; width: 100%; text-align: center; color: #fff; }}
.cv img {{ width: 470px; }}
.tag {{ margin-top: 26px; font-size: 14px; letter-spacing: .6em; font-weight: 300; }}
.intro {{ padding: 90px 80px; text-align: center; }}
.intro .logo {{ width: 360px; opacity: .92; }}
.lede {{ font-family: 'Cormorant Garamond', serif; font-size: 23px; line-height: 1.55; font-style: italic;
  max-width: 600px; margin: 40px auto 0; color: #5a4c40; }}
.rule {{ width: 60px; height: 1px; background: #b9a894; margin: 40px auto; }}
.grid {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 26px 18px; }}
.it {{ font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }}
.it span {{ color: #a08f7c; }}
.th {{ height: 200px; overflow: hidden; margin-bottom: 10px; border: 4px solid #fffdf8; box-shadow: 0 6px 16px rgba(60, 40, 20, .12); }}
.th img {{ width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }}
.closing .frame {{ position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  height: 1020px; border: 8px solid #fffdf8; box-shadow: 0 30px 70px rgba(30, 20, 10, .3); }}
.closing .frame img {{ height: 100%; display: block; }}
"""

html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Creative Threads Catalogue</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400&display=swap">
<style>{CSS}</style></head><body>
{cover()}
{index_page()}
{"".join(look_page(i, l) for i, l in enumerate(LOOKS, 1))}
{closing()}
</body></html>"""

(ROOT / "catalogue.html").write_text(html)
print("wrote", ROOT / "catalogue.html")
