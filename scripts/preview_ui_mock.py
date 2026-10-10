"""把 CameraScreen 的样式表"翻译"成一张静态排版预览图。

⚠️ 这不是真机渲染，是一张**近似示意图**：它按 `src/components/CameraScreen.tsx`
里的数值重排了一遍布局，用来在没有 iPhone 的情况下先看比例、对比度和配色。
真机效果仍以 Expo Go 为准（字体的实际度量、`resizeMode="repeat"` 的接缝、
阴影与透明度叠加都和这里略有出入）。

用法：python scripts/preview_ui_mock.py
输出：assets/ui/_mock-camera-screen.png（临时产物，不进版本库）
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "assets", "ui")
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")

S = 2  # 渲染倍率（点 → 像素）

# ---- iPhone 15/16 Pro 的逻辑尺寸与安全区 ---------------------------------- #
W, H = 393, 852
TOP_INSET, BOT_INSET = 59, 34

# ---- CameraScreen.tsx 里的关键数值 ---------------------------------------- #
PREVIEW_PADDING = 10
DIAL = 44
SHUTTER = 82
TOP_PANEL_H = TOP_INSET + 4 + DIAL + 9
DASH_H = 14 + SHUTTER + 4
LCD_PANEL_H = 6 + 13 + 3 + 13 + 6
LCD_WRAP_H = 9 + LCD_PANEL_H + max(BOT_INSET, 10)
PREVIEW_H = H - TOP_PANEL_H - DASH_H - LCD_WRAP_H

# ---- 颜色（与 CameraScreen.tsx 的 INK / 样式一致） ------------------------ #
AMBER = (210, 139, 42)
AMBER_SOFT = (211, 158, 89)
AMBER_DEEP = (194, 122, 48)
PAPER = (232, 228, 220)
PAPER_DIM = 0.42
PAPER_FAINT = 0.20
PANEL_BG = (10, 10, 9, 87)  # rgba(10,10,9,0.34)
PREVIEW_BG = (10, 10, 11)

FONT_DIR = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
MONO_CANDIDATES = ("consola.ttf", "consolab.ttf", "cour.ttf")
CJK_CANDIDATES = ("msyh.ttc", "msyhl.ttc", "simhei.ttf")


def _load(candidates: tuple[str, ...], size: int) -> ImageFont.FreeTypeFont:
    for name in candidates:
        path = os.path.join(FONT_DIR, name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def mono(pt: float) -> ImageFont.FreeTypeFont:
    return _load(MONO_CANDIDATES, max(6, int(round(pt * S))))


def cjk(pt: float) -> ImageFont.FreeTypeFont:
    return _load(CJK_CANDIDATES, max(6, int(round(pt * S))))


def px(v: float) -> int:
    return int(round(v * S))


def rgba(color, alpha: float):
    return (color[0], color[1], color[2], int(round(255 * alpha)))


def over(base: Image.Image, layer: Image.Image) -> None:
    base.alpha_composite(layer)


# --------------------------------------------------------------------------- #
def draw_backdrop(img: Image.Image) -> None:
    """皮革底纹平铺 + 机身暗色。"""
    tile = Image.open(os.path.join(UI_DIR, "leather-tile.png")).convert("RGB")
    body = Image.new("RGB", (img.width, img.height))
    for y in range(0, img.height, tile.height):
        for x in range(0, img.width, tile.width):
            body.paste(tile, (x, y))
    img.paste(body, (0, 0))


def draw_mock_scene(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    """假的取景器画面：夕阳天空 + 地平线 + 太阳，方便看叠加层是否读得出。"""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    scene = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(scene)
    top = (58, 74, 104)
    mid = (196, 132, 96)
    low = (86, 62, 52)
    for y in range(h):
        t = y / max(1, h - 1)
        if t < 0.62:
            k = t / 0.62
            c = tuple(int(top[i] + (mid[i] - top[i]) * k) for i in range(3))
        else:
            k = (t - 0.62) / 0.38
            c = tuple(int(mid[i] + (low[i] - mid[i]) * k) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    d.ellipse(
        [int(w * 0.60), int(h * 0.30), int(w * 0.60 + w * 0.17), int(h * 0.30 + w * 0.17)],
        fill=(250, 232, 190),
    )
    ground = int(h * 0.74)
    d.rectangle([0, ground, w, h], fill=(38, 32, 30))
    for i in range(7):
        bx = int(w * (0.06 + i * 0.135))
        d.rectangle([bx, ground - int(h * 0.10), bx + int(w * 0.055), ground], fill=(24, 22, 24))
    img.paste(scene, (x0, y0))


def draw_top_panel(img: Image.Image) -> None:
    panel = Image.new("RGBA", (img.width, px(TOP_PANEL_H)), PANEL_BG)
    ImageDraw.Draw(panel).line(
        [(0, panel.height - 1), (panel.width, panel.height - 1)],
        fill=(255, 255, 255, 18),
        width=max(1, S // 2),
    )
    img.alpha_composite(panel, (0, 0))

    cy = TOP_INSET + 4 + DIAL / 2
    left = 14

    # 2pt 琥珀竖线 + 等宽微标签
    rule = Image.new("RGBA", (px(2), px(20)), rgba(AMBER_DEEP, 0.60))
    _paste_at(img, rule, left, cy - 10)
    _text(
        img,
        (left + 2 + 8, cy),
        "白边印刷  ·  2/3  ·  RETRO 400",
        cjk(10),
        rgba(PAPER, PAPER_DIM),
        anchor="lm",
    )

    # 右侧两枚拨轮
    flip_cx = W - 14 - DIAL / 2
    torch_cx = flip_cx - DIAL - 6
    _dial(img, torch_cx, cy, active=False, icon="icon-torch.png")
    _dial(img, flip_cx, cy, active=False, icon="icon-flip.png")


def _paste_at(img: Image.Image, layer: Image.Image, x: float, y: float) -> None:
    img.alpha_composite(layer, (px(x), px(y)))


def _text(img, xy, text, fnt, fill, anchor="la"):
    """xy 用**点**，内部统一换算成像素。"""
    d = ImageDraw.Draw(img)
    d.text((px(xy[0]), px(xy[1])), text, font=fnt, fill=fill, anchor=anchor)


def _dial(img: Image.Image, cx_pt: float, cy_pt: float, *, active: bool, icon: str, size: float = DIAL):
    src = "dial-on.png" if active else "dial.png"
    art = Image.open(os.path.join(UI_DIR, src)).convert("RGBA")
    side = px(size)
    art = art.resize((side, side), Image.LANCZOS)
    _paste_at(img, art, cx_pt - size / 2, cy_pt - size / 2)

    ic = Image.open(os.path.join(UI_DIR, icon)).convert("RGBA")
    iside = px(size * 0.48)
    ic = ic.resize((iside, iside), Image.LANCZOS)
    _paste_at(img, ic, cx_pt - size * 0.24, cy_pt - size * 0.24)


def draw_preview(img: Image.Image) -> tuple[float, float, float, float]:
    top = TOP_PANEL_H
    draw_mock_scene(img, (0, px(top), img.width, px(top + PREVIEW_H)))

    # 相框 canvas：fitBox(aspect=0.75) 到 (W-20, PREVIEW_H-20)
    avail_w, avail_h = W - PREVIEW_PADDING * 2, PREVIEW_H - PREVIEW_PADDING * 2
    cw = avail_w
    ch = cw / 0.75
    if ch > avail_h:
        ch = avail_h
        cw = ch * 0.75
    cx = (W - cw) / 2
    cy = (PREVIEW_H - ch) / 2

    frame = Image.open(os.path.join(FRAMES_DIR, "classic-white.png")).convert("RGBA")
    frame = frame.resize((px(cw), px(ch)), Image.LANCZOS)
    img.alpha_composite(frame, (px(cx), px(top + cy)))

    # 画面窗口（frames.ts 的 classic-white window 归一化值）
    win = (0.055556, 0.05, 0.888889, 0.888333)
    wx = cx + win[0] * cw
    wy = top + cy + win[1] * ch
    ww, wh = win[2] * cw, win[3] * ch

    # 三分线
    grid = Image.new("RGBA", (px(ww), px(wh)), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for k in (1, 2):
        gd.line([(grid.width * k // 3, 0), (grid.width * k // 3, grid.height)], fill=(255, 255, 255, 32), width=S // 2 or 1)
        gd.line([(0, grid.height * k // 3), (grid.width, grid.height * k // 3)], fill=(255, 255, 255, 32), width=S // 2 or 1)
    _paste_at(img, grid, wx, wy)

    # 四角 L 形 + 准星
    corner = max(14, min(ww, wh) * 0.07)
    inset = max(4, ww * 0.014)
    bracket = Image.new("RGBA", (px(ww), px(wh)), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bracket)
    col = (255, 255, 255, 77)
    lw = max(1, S // 2)
    for sx, sy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        ox = inset if sx == 0 else ww - inset - corner
        oy = inset if sy == 0 else wh - inset - corner
        x0, y0, x1, y1 = px(ox), px(oy), px(ox + corner), px(oy + corner)
        # 水平边：上角贴上边、下角贴下边
        bd.line([(x0, y0 if sy == 0 else y1), (x1, y0 if sy == 0 else y1)], fill=col, width=lw)
        # 垂直边：左角贴左边、右角贴右边
        bd.line([(x0 if sx == 0 else x1, y0), (x0 if sx == 0 else x1, y1)], fill=col, width=lw)
    _paste_at(img, bracket, wx, wy)

    RETICLE, GAP = 24, 5
    rcx, rcy = wx + ww / 2, wy + wh / 2
    ret = Image.new("RGBA", (px(RETICLE), px(RETICLE)), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ret)
    rd.line([(0, ret.height // 2), (px(GAP / 2) - 1, ret.height // 2)], fill=(255, 255, 255, 87), width=lw)
    rd.line([(ret.width - px(GAP / 2), ret.height // 2), (ret.width, ret.height // 2)], fill=(255, 255, 255, 87), width=lw)
    rd.line([(ret.width // 2, 0), (ret.width // 2, px(GAP / 2) - 1)], fill=(255, 255, 255, 87), width=lw)
    rd.line([(ret.width // 2, ret.height - px(GAP / 2)), (ret.width // 2, ret.height)], fill=(255, 255, 255, 87), width=lw)
    rd.ellipse(
        [(ret.width - px(GAP)) // 2, (ret.height - px(GAP)) // 2, (ret.width + px(GAP)) // 2, (ret.height + px(GAP)) // 2],
        outline=(255, 255, 255, 128),
        width=lw,
    )
    _paste_at(img, ret, rcx - RETICLE / 2, rcy - RETICLE / 2)

    return wx, wy, ww, wh


def draw_dashboard(img: Image.Image) -> None:
    top = TOP_PANEL_H + PREVIEW_H
    band = Image.new("RGBA", (img.width, px(DASH_H)), PANEL_BG)
    img.alpha_composite(band, (0, px(top)))

    cy = top + 14 + SHUTTER / 2

    # 左：预设拨轮 + 纸标签卡片
    _dial(img, 14 + DIAL / 2, cy, active=False, icon="icon-film.png")
    card_x = 14 + DIAL + 8
    card_w, card_h = 89, 44
    card = Image.new("RGBA", (px(card_w), px(card_h)), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle(
        [0, 0, card.width - 1, card.height - 1],
        radius=px(3),
        outline=rgba(AMBER_DEEP, 0.55),
        width=max(1, S),
        fill=rgba(AMBER_SOFT, 0.075),
    )
    _paste_at(img, card, card_x, cy - card_h / 2)
    _text(img, (card_x + 8, cy - card_h / 2 + 6), "预设 PRESET", mono(7.5), rgba(AMBER_SOFT, 0.62))
    _text(img, (card_x + 8, cy - card_h / 2 + 16), "RETRO 400", mono(12), AMBER_SOFT + (255,))
    _text(img, (card_x + 8, cy - card_h / 2 + 32), "2/5 · 轻触切换", cjk(8.5), rgba(PAPER, PAPER_DIM))

    # 中：快门
    _shutter(img, W / 2, cy)

    # 右：相框切换
    rx = W - 14
    _text(img, (rx, cy - 22), "相框", cjk(9), rgba(PAPER, PAPER_DIM), anchor="ra")
    _text(img, (rx, cy - 2), "‹   2/3   ›", mono(15), PAPER + (235,), anchor="ra")
    _text(img, (rx, cy + 18), "滑动取景器", cjk(8.5), (226, 222, 214, 76), anchor="ra")


def _shutter(img: Image.Image, cx_pt: float, cy_pt: float) -> None:
    size = SHUTTER
    ring = Image.new("RGBA", (px(size), px(size)), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse(
        [0, 0, ring.width - 1, ring.height - 1],
        outline=(236, 232, 224, 97),
        width=max(1, S // 2),
    )
    mid = size - 7 * 2
    inset = (size - mid) / 2
    rd.ellipse(
        [px(inset), px(inset), ring.width - px(inset) - 1, ring.height - px(inset) - 1],
        outline=(244, 240, 232, 224),
        width=px(2),
    )
    _paste_at(img, ring, cx_pt - size / 2, cy_pt - size / 2)

    disc = Image.open(os.path.join(UI_DIR, "shutter-disc.png")).convert("RGBA")
    dside = px(mid - 6 * 2)
    disc = disc.resize((dside, dside), Image.LANCZOS)
    _paste_at(img, disc, cx_pt - (mid - 12) / 2, cy_pt - (mid - 12) / 2)


def draw_lcd(img: Image.Image) -> None:
    top = TOP_PANEL_H + PREVIEW_H + DASH_H + 9
    left, right = 14, W - 14
    panel = Image.new("RGBA", (px(right - left), px(LCD_PANEL_H)), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle(
        [0, 0, panel.width - 1, panel.height - 1],
        radius=px(2),
        outline=rgba(AMBER, 0.20),
        width=max(1, S // 2),
        fill=rgba(AMBER, 0.045),
    )
    _paste_at(img, panel, left, top)

    x = left + 9
    y = top + 6
    sw = Image.new("RGBA", (px(6), px(6)), (255, 138, 0, 255))
    _paste_at(img, sw, x, y + 4)
    _text(img, (x + 13, y + 3), "日期 YY MM DD · 锚点 画面窗口", cjk(10), rgba(AMBER, 0.86))
    _text(img, (x + 13, y + 3 + 16), "颗粒 .16 · 暗角 .28 · 漏光 .12 · 字体 等宽", cjk(10), rgba(AMBER, 0.86))


def main() -> None:
    img = Image.new("RGBA", (px(W), px(H)), (0, 0, 0, 255))
    draw_backdrop(img)
    draw_preview(img)
    draw_top_panel(img)
    draw_dashboard(img)
    draw_lcd(img)

    out = os.path.join(UI_DIR, "_mock-camera-screen.png")
    img.convert("RGB").save(out)
    print(f"mock -> {out}  {img.width}x{img.height}")


if __name__ == "__main__":
    sys.exit(main())
