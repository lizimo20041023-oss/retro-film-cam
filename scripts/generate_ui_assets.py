"""生成 UI 的"实体质感"素材（皮革底纹 / 机械拨轮 / 快门盘 / 线性图标）。

用法（在项目根目录）：
    python scripts/generate_ui_assets.py

产物（全部落在 assets/ui/）：
    leather-tile.png      可平铺的暗色皮革/磨砂底纹（resizeMode="repeat"）
    dial.png              44pt 机械防滑拨轮（关闭态）
    dial-on.png           44pt 机械防滑拨轮（点亮态，琥珀色）
    shutter-disc.png      快门内盘：径向渐变 + 内阴影（"物理按键"手感）
    icon-torch.png        极细线性图标：补光（闪电）
    icon-torch-on.png     同上，琥珀色（点亮）
    icon-flip.png         极细线性图标：镜头反转（循环箭头）
    icon-film.png         极细线性图标：预设（电影胶片条）
    icon-settings.png     极细线性图标：设置（三档推子）

为什么这些也要用 PNG：
    RN 在 iOS 上没有径向渐变（`backgroundImage` 的
    `experimental_backgroundPosition/Size` 是实验性 API，本项目刻意不碰），
    而"金属防滑纹""皮革毛孔""按键高光"本质上都是**美术资源**，
    做成 PNG 既能精准控制，又能让用户直接换图改风格 —— 和相框/纹理是同一套思路。
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UI_DIR = os.path.join(ROOT, "assets", "ui")

TRANSPARENT = (0, 0, 0, 0)

# ── 调色板（和 CameraScreen 的 styles 保持一致，改这里记得同步那边） ──────────
INK_AMBER = (210, 139, 42)       # #D28B2A 琥珀：LCD / 点亮态
DIAL_TOP = (46, 45, 43)          # #2E2D2B 拨轮顶面
DIAL_BOTTOM = (22, 21, 20)       # #161514 拨轮底面
DIAL_KNURL_LIGHT = (60, 58, 54)
DIAL_KNURL_DARK = (16, 15, 14)
ICON_IDLE = (196, 192, 184)      # 暗白 / 微灰：未点亮的线性图标


def save(img: Image.Image, path: str) -> None:
    img.save(path, "PNG", optimize=True)
    print(f"  -> {os.path.relpath(path, ROOT)}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path) / 1024:.1f} KB")


# --------------------------------------------------------------------------- #
# 底纹：可平铺的暗色皮革 / 磨砂金属
# --------------------------------------------------------------------------- #
def make_leather_tile(size: int = 320, base: int = 23, seed: int = 20261010) -> None:
    """低对比度的皮革底纹。

    两层噪声叠加：
      · 低频（1/8 分辨率的正态噪声，双三次放大）→ 皮革的"块状"斑驳；
      · 高频（逐像素）→ 磨砂颗粒；
      · 再加一层稀疏的"毛孔"（深色小点）。
    三层都刻意压到 ±2.5/255 以内 —— 远看是纯色，近看才有质感。

    尺寸取 320 而不是 160：这个图是 `resizeMode="repeat"` 平铺的，
    在 393pt 宽的屏幕上 160 的 tile 会横向重复 2.5 次，接缝看得出来；
    320 只重复 1.2 次，配合这么低的振幅就完全看不出周期了。

    这里是"底纹"不是"壁纸"：一旦看得出花纹，取景器里的画面就被抢了。
    """
    rng = np.random.default_rng(seed)

    low_small = rng.normal(0.0, 1.7, (size // 8, size // 8)).astype(np.float32)
    low = np.asarray(
        Image.fromarray(low_small, mode="F").resize((size, size), Image.BICUBIC),
        dtype=np.float32,
    )
    high = rng.normal(0.0, 1.1, (size, size)).astype(np.float32)
    pores = (rng.random((size, size)) < 0.003).astype(np.float32) * rng.normal(
        -5.0, 1.2, (size, size)
    ).astype(np.float32)

    field = base + low + high + pores
    # 极轻的暖调偏移，避免"死灰"
    tint = np.array([1.6, 0.6, -1.2], dtype=np.float32)
    rgb = np.clip(field[..., None] + tint, 0.0, 255.0)
    # 量化到 2 的倍数：人眼看不出，PNG 体积能小一大截
    rgb = (np.round(rgb / 2.0) * 2.0).astype(np.uint8)

    save(Image.fromarray(rgb, mode="RGB"), os.path.join(UI_DIR, "leather-tile.png"))


# --------------------------------------------------------------------------- #
# 机械拨轮
# --------------------------------------------------------------------------- #
def _linear_gradient_disc(size: int, radius: float, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """竖直渐变填充的圆盘（RGBA，圆外透明），带 1px 羽化边缘。"""
    ys = np.arange(size, dtype=np.float32)[:, None]
    t = np.clip(ys / max(1.0, size - 1.0), 0.0, 1.0)
    rgb = np.stack(
        [top[c] + (bottom[c] - top[c]) * t for c in range(3)],
        axis=-1,
    )
    rgb = np.repeat(rgb, size, axis=1)

    c = (size - 1) / 2.0
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.hypot(xx - c, yy - c)
    alpha = np.clip(radius + 0.5 - dist, 0.0, 1.0) * 255.0

    rgba = np.concatenate([rgb, alpha[..., None]], axis=-1).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def make_dial(size: int = 176, lit: bool = False) -> None:
    """机械防滑拨轮：竖直渐变的金属盘 + 一圈放射状滚花 + 内圈高光。

    size=176 表示 44pt @4x。渲染时把 PNG 缩到 44 逻辑点即可，永远是高清的。
    """
    r_out = size / 2.0 - 2.0
    img = _linear_gradient_disc(size, r_out, DIAL_TOP, DIAL_BOTTOM)
    d = ImageDraw.Draw(img)

    c = (size - 1) / 2.0

    # ── 滚花：外圈一圈放射状细齿，亮暗交替 ──────────────────────────────
    teeth = 48
    r_inner = r_out - 11.0
    for i in range(teeth):
        a0 = (i / teeth) * 2.0 * math.pi
        a1 = ((i + 0.5) / teeth) * 2.0 * math.pi
        lit_tooth = i % 2 == 0
        col = DIAL_KNURL_LIGHT if lit_tooth else DIAL_KNURL_DARK
        alpha = 58 if lit_tooth else 150
        d.polygon(
            [
                (c + math.cos(a0) * r_inner, c + math.sin(a0) * r_inner),
                (c + math.cos(a0) * r_out, c + math.sin(a0) * r_out),
                (c + math.cos(a1) * r_out, c + math.sin(a1) * r_out),
                (c + math.cos(a1) * r_inner, c + math.sin(a1) * r_inner),
            ],
            fill=(col[0], col[1], col[2], alpha),
        )

    # ── 顶缘高光：只画上半圈，模拟光从上方来；点亮时改成琥珀色发光 ──────
    rim_col = (INK_AMBER[0], INK_AMBER[1], INK_AMBER[2], 165) if lit else (255, 250, 240, 78)
    d.arc(
        [c - r_out + 1, c - r_out + 1, c + r_out - 1, c + r_out - 1],
        start=196,
        end=344,
        fill=rim_col,
        width=3,
    )
    # ── 底缘暗边 ────────────────────────────────────────────────────────
    d.arc(
        [c - r_out + 1, c - r_out + 1, c + r_out - 1, c + r_out - 1],
        start=16,
        end=164,
        fill=(0, 0, 0, 130),
        width=3,
    )

    # ── 内圈压痕（把"盘面"和"滚花边缘"分开） ──────────────────────────
    r_face = r_inner - 3.0
    d.ellipse([c - r_face, c - r_face, c + r_face, c + r_face], outline=(0, 0, 0, 120), width=2)
    d.ellipse(
        [c - r_face + 1, c - r_face + 1, c + r_face - 1, c + r_face - 1],
        outline=(255, 255, 255, 22),
        width=1,
    )

    # ── 盘面：中心偏上的柔光；点亮时换成琥珀色内发光 ────────────────────
    glow = Image.new("RGBA", (size, size), TRANSPARENT)
    gd = ImageDraw.Draw(glow)
    inner_r = r_face - 2.0
    if lit:
        gd.ellipse(
            [c - inner_r, c - inner_r, c + inner_r, c + inner_r],
            fill=(INK_AMBER[0], INK_AMBER[1], INK_AMBER[2], 34),
        )
    gd.ellipse(
        [c - inner_r * 0.72, c - inner_r * 0.86, c + inner_r * 0.72, c + inner_r * 0.28],
        fill=(255, 252, 245, 16 if not lit else 26),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(9))
    # 只在盘内叠加，别糊到滚花上
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        [c - inner_r, c - inner_r, c + inner_r, c + inner_r], fill=255
    )
    img = Image.composite(Image.alpha_composite(img, glow), img, mask)

    name = "dial-on.png" if lit else "dial.png"
    save(img, os.path.join(UI_DIR, name))


# --------------------------------------------------------------------------- #
# 快门内盘
# --------------------------------------------------------------------------- #
def make_shutter_disc(size: int = 240) -> None:
    """快门内盘：奶油色 + 左上偏移的径向渐变 + 底缘内阴影。

    "物理按键"的观感全在这张图里：高光偏左上（光从上方来），
    靠近边缘有一圈由透明渐变到半透明的暗环（内阴影），
    最外 2px 做羽化，缩放到 78pt 时不会有锯齿。
    """
    c = (size - 1) / 2.0
    r_disc = size / 2.0 - 4.0

    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.hypot(xx - c, yy - c)

    # 高光中心偏左上（注意用 np.hypot：math.hypot 不接受数组）
    hl = np.hypot(xx - (c - r_disc * 0.34), yy - (c - r_disc * 0.42))
    t = np.clip(hl / (r_disc * 1.62), 0.0, 1.0)

    light = np.array([253, 252, 249], dtype=np.float32)   # 高光处
    dark = np.array([196, 190, 180], dtype=np.float32)    # 边缘处
    rgb = light[None, None, :] + (dark - light)[None, None, :] * (t ** 1.25)[..., None]

    # 底缘内阴影：从 0.74R 开始往边缘压暗，右下更重
    shadow = np.clip((dist / r_disc - 0.74) / 0.26, 0.0, 1.0)
    directional = np.clip(0.45 + 0.55 * ((yy - c) / r_disc * 0.5 + (xx - c) / r_disc * 0.5 + 0.5), 0.0, 1.0)
    rgb *= (1.0 - 0.30 * (shadow ** 1.6) * directional)[..., None]

    # 盘外一圈极淡的投影（让按键"浮"在机身上）
    alpha = np.clip(r_disc + 0.5 - dist, 0.0, 1.0) * 255.0

    rgba = np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], axis=-1).astype(np.uint8)
    img = Image.fromarray(rgba, mode="RGBA").filter(ImageFilter.GaussianBlur(0.6))
    save(img, os.path.join(UI_DIR, "shutter-disc.png"))


# --------------------------------------------------------------------------- #
# 极细线性图标
# --------------------------------------------------------------------------- #
def _icon_canvas(size: int = 168) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """4x 超采样画布：168 = 42pt @4x。"""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    return img, ImageDraw.Draw(img)


def _stroke(img: Image.Image, draw_fn, color: tuple[int, int, int], width: int) -> Image.Image:
    """先画成白色遮罩，再用目标颜色着色 —— 这样换色只要改一个元组。"""
    mask = Image.new("L", img.size, 0)
    draw_fn(ImageDraw.Draw(mask))
    # 2x 超采样 + 缩小 → 抗锯齿的细线
    mask = mask.resize((img.size[0] * 2, img.size[1] * 2), Image.LANCZOS).resize(
        img.size, Image.LANCZOS
    )
    tinted = Image.new("RGBA", img.size, (color[0], color[1], color[2], 255))
    tinted.putalpha(mask)
    return tinted


def make_icon_torch(size: int = 168) -> None:
    """补光：细线闪电（只描边、不填充）。"""
    for lit, filename in ((False, "icon-torch.png"), (True, "icon-torch-on.png")):
        img, _ = _icon_canvas(size)
        s = size / 168.0
        pts = [
            (98 * s, 20 * s),
            (54 * s, 90 * s),
            (82 * s, 90 * s),
            (70 * s, 148 * s),
            (116 * s, 74 * s),
            (86 * s, 74 * s),
        ]

        def draw(d: ImageDraw.ImageDraw, pts=pts) -> None:
            d.line(pts + [pts[0]], fill=255, width=int(9 * s), joint="curve")

        color = INK_AMBER if lit else ICON_IDLE
        img = Image.alpha_composite(img, _stroke(img, draw, color, 9))
        save(img, os.path.join(UI_DIR, filename))


def make_icon_flip(size: int = 168) -> None:
    """镜头反转：两段带箭头的循环弧。

    早前的版本中间还套了一个"镜头圆"，但图标在界面上只占 21pt
    （`DialButton` 的 `size * 0.48`），圆 + 弧 + 两个箭头挤在一起，
    缩到真实尺寸后会读成"刷新"而不是"翻转"。去掉内圈、加粗弧线、
    把箭头做大，让它在 21pt 下的轮廓仍然清楚。
    """
    img, _ = _icon_canvas(size)
    s = size / 168.0
    c = 84 * s
    r_ring = 47 * s
    w = int(12 * s)

    def draw(d: ImageDraw.ImageDraw) -> None:
        box = [c - r_ring, c - r_ring, c + r_ring, c + r_ring]
        # 上下两段弧，左右各留出箭头的位置
        d.arc(box, start=204, end=338, fill=255, width=w)
        d.arc(box, start=24, end=158, fill=255, width=w)

        def arrowhead(angle_deg: float, along: float) -> None:
            a = math.radians(angle_deg)
            tipx, tipy = c + math.cos(a) * r_ring, c + math.sin(a) * r_ring
            tang = a + math.pi / 2.0 * along
            span = 19 * s
            back = 26 * s
            p1 = (tipx, tipy)
            p2 = (
                tipx - math.cos(tang) * back + math.cos(a) * span,
                tipy - math.sin(tang) * back + math.sin(a) * span,
            )
            p3 = (
                tipx - math.cos(tang) * back - math.cos(a) * span,
                tipy - math.sin(tang) * back - math.sin(a) * span,
            )
            d.polygon([p1, p2, p3], fill=255)

        arrowhead(338, 1)
        arrowhead(158, -1)

    img = Image.alpha_composite(img, _stroke(img, draw, ICON_IDLE, w))
    save(img, os.path.join(UI_DIR, "icon-flip.png"))


def make_icon_film(size: int = 168) -> None:
    """预设拨轮：细线胶片条（外框 + 两侧齿孔）。"""
    img, _ = _icon_canvas(size)
    s = size / 168.0

    def draw(d: ImageDraw.ImageDraw) -> None:
        w = int(8 * s)
        # 片基外框
        d.rounded_rectangle([30 * s, 22 * s, 138 * s, 146 * s], radius=9 * s, outline=255, width=w)
        # 两侧齿孔：上下各 4 个
        for i in range(4):
            top = (36 + i * 28) * s
            for cx in (46 * s, 122 * s):
                d.rounded_rectangle(
                    [cx - 7 * s, top, cx + 7 * s, top + 15 * s],
                    radius=3 * s,
                    outline=255,
                    width=max(3, int(6 * s)),
                )

    img = Image.alpha_composite(img, _stroke(img, draw, ICON_IDLE, 8))
    save(img, os.path.join(UI_DIR, "icon-film.png"))


def make_icon_settings(size: int = 168) -> None:
    """设置：三档推子（滑轨 + 错开的滑块）。

    为什么不用齿轮：图标在界面上只占 21pt（`DialButton` 的 `size * 0.48`），
    齿轮的齿缩到 21pt 会糊成一圈毛边，读起来像"太阳/加载中"。
    三根横轨 + 三个错开的滑块，在 21pt 下仍然是"可调参数"的清晰轮廓，
    而且和机身那几枚机械拨轮是同一套视觉语言。
    """
    img, _ = _icon_canvas(size)
    s = size / 168.0

    def draw(d: ImageDraw.ImageDraw) -> None:
        w = int(9 * s)
        # (滑轨 y, 滑块中心 x)：滑块刻意错开，比三根对齐的更像"各调各的"
        rows = ((46, 104), (84, 58), (122, 116))
        for y, kx in rows:
            d.line([(32 * s, y * s), (136 * s, y * s)], fill=255, width=w)
            hw, hh = 9 * s, 16 * s
            d.rounded_rectangle(
                [kx * s - hw, y * s - hh, kx * s + hw, y * s + hh],
                radius=4 * s,
                fill=255,
            )

    img = Image.alpha_composite(img, _stroke(img, draw, ICON_IDLE, 9))
    save(img, os.path.join(UI_DIR, "icon-settings.png"))


# --------------------------------------------------------------------------- #
def main() -> None:
    os.makedirs(UI_DIR, exist_ok=True)
    print("ui:")
    make_leather_tile()
    make_dial(lit=False)
    make_dial(lit=True)
    make_shutter_disc()
    make_icon_torch()
    make_icon_flip()
    make_icon_film()
    make_icon_settings()
    print("done.")


if __name__ == "__main__":
    main()
