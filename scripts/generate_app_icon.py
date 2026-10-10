#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 App 图标（1024x1024，iOS 要求：正方形、无透明通道、不要自己画圆角）。

用法：
    python scripts/generate_app_icon.py

输出：
    assets/icon.png

设计说明：手机桌面上图标只有 ~60px 大，所以只保留三块高对比色块
（深色底 / 奶白胶片 / 暖橙画面），细节一律砍掉。
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
OUT_PATH = os.path.join(PROJECT_ROOT, "assets", "icon.png")

# 配色（跟 App 里的 presets.ts / presets 里那个橙色日期保持一致）
BG_TOP = (42, 36, 28)
BG_BOTTOM = (14, 12, 10)
FILM = (242, 235, 221)          # 奶白胶片
FILM_EDGE = (214, 203, 184)     # 胶片描边
HOLE = (24, 21, 18)             # 齿孔
SKY_TOP = (255, 201, 118)       # 画面：天空
SKY_MID = (255, 138, 61)
SKY_LOW = (150, 58, 36)
SKY_BOTTOM = (74, 28, 22)
SUN = (255, 233, 176)
LCD = (255, 138, 0)             # 液晶日期橙


def load_font(size: int) -> ImageFont.FreeTypeFont:
    """找一个等宽字体来画液晶日期，找不到就用 Pillow 自带的。"""
    for name in ("consolab.ttf", "consola.ttf", "courbd.ttf", "cour.ttf"):
        path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int],
                      bottom: tuple[int, int, int]) -> Image.Image:
    """竖直渐变。逐行画，1024 行很快。"""
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)
    return img


def radial_glow(size: int, color: tuple[int, int, int], strength: float) -> Image.Image:
    """中心暖光，叠在背景上让画面不那么死板。"""
    small = 128
    img = Image.new("L", (small, small))
    px = img.load()
    c = (small - 1) / 2
    for y in range(small):
        for x in range(small):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c
            px[x, y] = max(0, round(255 * strength * (1 - d) ** 2))
    img = img.resize((size, size), Image.LANCZOS)
    layer = Image.new("RGB", (size, size), color)
    return layer, img


def main() -> None:
    canvas = vertical_gradient((SIZE, SIZE), BG_TOP, BG_BOTTOM).convert("RGB")

    # 背景暖光
    glow_layer, glow_mask = radial_glow(SIZE, (255, 160, 70), 0.30)
    canvas.paste(glow_layer, (0, 0), glow_mask)

    draw = ImageDraw.Draw(canvas)

    # ---- 胶片主体（奶白）----
    film = (128, 112, 896, 880)
    draw.rounded_rectangle(film, radius=30, fill=FILM)
    draw.rounded_rectangle(film, radius=30, outline=FILM_EDGE, width=4)

    # ---- 两侧齿孔 ----
    hole_w, hole_h = 48, 62
    left_x, right_x = 156, 820
    y = 168
    while y + hole_h <= 856:
        draw.rounded_rectangle((left_x, y, left_x + hole_w, y + hole_h), radius=12, fill=HOLE)
        draw.rounded_rectangle((right_x, y, right_x + hole_w, y + hole_h), radius=12, fill=HOLE)
        y += 96

    # ---- 画面窗口（暖橙渐变 + 太阳）----
    win = (224, 160, 800, 680)
    win_w, win_h = win[2] - win[0], win[3] - win[1]
    photo = Image.new("RGB", (win_w, win_h))
    pdraw = ImageDraw.Draw(photo)
    stops = [SKY_TOP, SKY_MID, SKY_LOW, SKY_BOTTOM]
    seg = win_h / (len(stops) - 1)
    for yy in range(win_h):
        idx = min(int(yy / seg), len(stops) - 2)
        t = (yy - idx * seg) / seg
        color = tuple(round(stops[idx][i] + (stops[idx + 1][i] - stops[idx][i]) * t) for i in range(3))
        pdraw.line([(0, yy), (win_w, yy)], fill=color)
    # 太阳
    sun_r = 92
    sun_cx, sun_cy = win_w * 0.68, win_h * 0.46
    pdraw.ellipse((sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r), fill=SUN)
    canvas.paste(photo, (win[0], win[1]))

    # ---- 液晶日期 ----
    # 字号和右边距都要留够：两侧 x=156..204 / x=820..868 是齿孔区，日期不能压上去
    font = load_font(112)
    text = "26 10 10"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    strip_top, strip_bottom = win[3], film[3]
    tx = 790 - tw
    ty = strip_top + (strip_bottom - strip_top - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=LCD)

    canvas.save(OUT_PATH, format="PNG", optimize=True)
    print(f"已生成 {OUT_PATH}  ({os.path.getsize(OUT_PATH) / 1024:.1f} KB, {SIZE}x{SIZE} RGB)")


if __name__ == "__main__":
    main()
