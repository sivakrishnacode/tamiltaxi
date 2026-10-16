#!/usr/bin/env python3
"""Google Play store graphics for the rider app: framed phone and tablet screenshots, feature graphic, icon.

Inputs (docs/play-store/raw/):
  <name>.png        phone captures, 1080 × 2392, of Design gallery frames (seed data) with real Google Maps:
                      home P-07, choose-ride P-10, driver-on-the-way P-13, ride-safety P-16, pay-driver P-19,
                      parcel PP-01. To retake them on an Android phone:
                      1. scripts/flutter.sh build apk --release --target-platform android-arm64 \
                           --dart-define=TT_LIVE_API=false --dart-define=TT_DESIGN_GALLERY=true; adb install -r …
                      2. adb shell pm revoke com.tamiltaxi.passenger android.permission.ACCESS_FINE_LOCATION
                         (and ..._COARSE_...): without location the pickup is the seed place, not where the phone
                         is. Sign in (any number and code in mock mode), "Enter location manually".
                      3. Clean status bar: adb shell settings put global sysui_demo_allowed 1, then
                         am broadcast -a com.android.systemui.demo -e command enter / clock / battery / network;
                         heads_up_notifications_enabled 0 so no banner lands on a shot.
                      4. Account › Design gallery › search the frame ID › open it, wait ~8 s for the map, then
                         adb exec-out screencap -p > docs/play-store/raw/<name>.png
                      Afterwards reinstall the normal build and undo steps 2 and 3.
  feature-art.png   ChatGPT (Codex CLI) background art for the feature graphic: no text, empty on the left.

Outputs (docs/play-store/passenger/):
  phone/NN-<name>.png        1440 × 2560 (9:16)
  tablet-7in/NN-<name>.png   1920 × 1080 (16:9)
  tablet-10in/NN-<name>.png  2560 × 1440 (16:9)
  feature-graphic.png        1024 × 500
  icon-512.png               copy of docs/design/assets/app-icon/tamil-taxi-512.png

Run: python3 scripts/store_screenshots.py
"""
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "docs/play-store/raw"
OUT = ROOT / "docs/play-store/passenger"
FONTS = ROOT / "packages/tamiltaxi_ui/assets/google_fonts"
LOGO = ROOT / "docs/design/assets/logo/tamil-taxi.png"
ICON = ROOT / "docs/design/assets/app-icon/tamil-taxi-512.png"

NAVY = (30, 41, 59)
SLATE = (71, 85, 105)
CORAL = (216, 67, 21)
BG_TOP = (255, 246, 241)
BG_BOTTOM = (255, 226, 214)
FRAME = (15, 23, 42)

# Raw capture, caption (*word* = coral), subline. In listing order.
SHOTS = [
    ("home", "Bike, auto or cab\nin *two taps*", "Rides across Coimbatore"),
    ("choose-ride", "See the fare\n*before you book*", "Locked when you book. No surprises"),
    ("driver-on-the-way", "Watch your driver\n*arrive live*", "Call or chat, start with your ride OTP"),
    ("ride-safety", "Ride safe with\n*SOS and trip sharing*", "Share your live trip with family"),
    ("pay-driver", "Drivers keep *100%*\nof your fare", "0% commission. Pay by cash or UPI"),
    ("parcel", "Send parcels\n*across town*", "Bike to truck, plus Packers & Movers"),
]

# Notification icons right of the clock on the capture phone (its demo mode doesn't hide them), in 1080-wide
# capture pixels: covered with the empty status-bar strip just right of them.
ICONS_BOX = (178, 28, 305, 98)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def gradient(w: int, h: int, vertical: bool = True) -> Image.Image:
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    n = h if vertical else w
    for i in range(n):
        t = i / max(n - 1, 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM))
        d.line([(0, i), (w, i)] if vertical else [(i, 0), (i, h)], fill=c)
    return img


def clean_status_bar(shot: Image.Image) -> Image.Image:
    """Covers [ICONS_BOX] with the strip to its right, blended in over a few pixels on the left."""
    shot = shot.convert("RGB")
    x1, y1, x2, y2 = ICONS_BOX
    w = x2 - x1
    patch = shot.crop((x2, y1, x2 + w, y2))
    mask = Image.new("L", patch.size, 255)
    for x in range(12):
        ImageDraw.Draw(mask).line([(x, 0), (x, patch.height)], fill=round(255 * x / 12))
    shot.paste(patch, (x1, y1), mask)
    return shot


def phone(shot: Image.Image, screen_w: int) -> Image.Image:
    """The capture in a dark phone frame with rounded corners and a soft shadow (RGBA, shadow included)."""
    screen_h = round(screen_w * shot.height / shot.width)
    bezel = round(screen_w * 0.028)
    r_screen = round(screen_w * 0.075)
    fw, fh = screen_w + 2 * bezel, screen_h + 2 * bezel
    pad = round(screen_w * 0.12)  # room for the shadow
    out = Image.new("RGBA", (fw + 2 * pad, fh + 2 * pad), (0, 0, 0, 0))

    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [pad, pad + bezel * 2, pad + fw, pad + fh + bezel * 2], r_screen + bezel, fill=(120, 40, 10, 70))
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(pad * 0.4)))

    d = ImageDraw.Draw(out)
    d.rounded_rectangle([pad, pad, pad + fw, pad + fh], r_screen + bezel, fill=FRAME)
    screen = shot.convert("RGB").resize((screen_w, screen_h), Image.LANCZOS)
    mask = Image.new("L", (screen_w, screen_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, screen_w - 1, screen_h - 1], r_screen, fill=255)
    out.paste(screen, (pad + bezel, pad + bezel), mask)
    return out


def draw_caption(img: Image.Image, text: str, box_x: int, y: int, size: int, align: str, max_w: int) -> int:
    """Draws [text] (lines split on \\n, *word* in coral) and returns the y below it."""
    d = ImageDraw.Draw(img)
    f = font("Poppins-Bold.ttf", size)
    line_h = round(size * 1.22)
    for line in text.split("\n"):
        parts = [(p, i % 2 == 1) for i, p in enumerate(line.split("*")) if p]
        width = sum(d.textlength(p, font=f) for p, _ in parts)
        assert width <= max_w, f"caption too wide: {line!r}"
        x = box_x + (max_w - width) / 2 if align == "center" else box_x
        for p, coral in parts:
            d.text((x, y), p, font=f, fill=CORAL if coral else NAVY)
            x += d.textlength(p, font=f)
        y += line_h
    return y


def draw_sub(img: Image.Image, text: str, box_x: int, y: int, size: int, align: str, max_w: int) -> int:
    d = ImageDraw.Draw(img)
    f = font("Inter-Medium.ttf", size)
    w = d.textlength(text, font=f)
    assert w <= max_w, f"subline too wide: {text!r}"
    d.text((box_x + (max_w - w) / 2 if align == "center" else box_x, y), text, font=f, fill=SLATE)
    return y + round(size * 1.4)


def phone_shot(shot: Image.Image, caption: str, sub: str) -> Image.Image:
    W, H = 1440, 2560
    img = gradient(W, H)
    y = draw_caption(img, caption, 0, 140, 92, "center", W - 160)
    draw_sub(img, sub, 0, y + 24, 46, "center", W - 160)
    p = phone(shot, 840)
    img.paste(p, ((W - p.width) // 2, H - p.height + round(p.width * 0.035)), p)
    return img


def tablet_shot(shot: Image.Image, caption: str, sub: str, W: int, H: int) -> Image.Image:
    s = H / 1440
    img = gradient(W, H, vertical=False)
    left = round(170 * s)
    text_w = round(W * 0.5) - left
    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((round(logo.width * 190 * s / logo.height), round(190 * s)), Image.LANCZOS)
    top = round(400 * s)
    img.paste(logo, (left, top), logo)
    y = draw_caption(img, caption, left, top + logo.height + round(70 * s), round(104 * s), "left", text_w)
    draw_sub(img, sub, left, y + round(26 * s), round(50 * s), "left", text_w)
    p = phone(shot, round(565 * s))
    img.paste(p, (round(W * 0.73) - p.width // 2, (H - p.height) // 2 + round(30 * s)), p)
    return img


def feature_graphic() -> Image.Image:
    W, H = 1024, 500
    art = Image.open(RAW / "feature-art.png").convert("RGB")
    # The art at 56% of its size against the right edge (vehicles clear of the text), its cream left edge
    # stretched over the rest.
    scale = 0.56
    band_h = round(H / scale)
    top = (art.height - band_h) // 2
    art = art.crop((0, top, art.width, top + band_h)).resize((round(art.width * scale), H), Image.LANCZOS)
    img = Image.new("RGB", (W, H))
    img.paste(art.crop((0, 0, 1, H)).resize((W - art.width, H)), (0, 0))
    img.paste(art, (W - art.width, 0))
    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((round(logo.width * 160 / logo.height), 160), Image.LANCZOS)
    img.paste(logo, (64, 64), logo)
    y = draw_caption(img, "Rides & parcels\nwith *0% commission*", 64, 262, 36, "left", 420)
    draw_sub(img, "Bike · Auto · Cab · Parcel · Coimbatore", 64, y + 8, 19, "left", 420)
    return img


def main() -> None:
    for d in ("phone", "tablet-7in", "tablet-10in"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    for i, (name, caption, sub) in enumerate(SHOTS, 1):
        shot = clean_status_bar(Image.open(RAW / f"{name}.png"))
        stem = f"{i:02d}-{name}.png"
        phone_shot(shot, caption, sub).save(OUT / "phone" / stem, optimize=True)
        tablet_shot(shot, caption, sub, 1920, 1080).save(OUT / "tablet-7in" / stem, optimize=True)
        tablet_shot(shot, caption, sub, 2560, 1440).save(OUT / "tablet-10in" / stem, optimize=True)
        print("framed", stem)
    if (RAW / "feature-art.png").exists():
        feature_graphic().save(OUT / "feature-graphic.png", optimize=True)
        print("feature-graphic.png")
    shutil.copyfile(ICON, OUT / "icon-512.png")


if __name__ == "__main__":
    main()
