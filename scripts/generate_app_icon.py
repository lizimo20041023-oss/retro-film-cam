#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 App 图标（1024x1024，iOS 要求：正方形、**不带透明通道**、不要自己画圆角）。

用法：
    python scripts/generate_app_icon.py

输出：
    assets/icon.png                 App 图标本体（RGB，无 alpha）
    assets/ui/_icon-check-40.png    缩到 40x40 再放大回来的自查图（下划线开头，已 gitignore）
    assets/ui/_icon-check-60.png    同上，60x60

设计：**一个真实的物体**，不是一张缩小的照片。

上一版是"奶白胶片 + 四段渐变天空 + 太阳 + 液晶日期"，那其实是把小照片塞进图标，
缩到桌面尺寸只剩一团糊。这一版换成印刷式的写法：一枚**站立的 35mm 胶卷暗盒**
（银盖 + 橙标 + 筒身），下方压一个**六片叶片的光圈**记号 —— 两个形状在 40px 下
都还有清晰剪影，而且"胶卷 + 光圈"一眼就是相机应用。

**纯平涂**：整张图只用了 4 个色（底色 / 暗盒 / 银 / 橙），没有渐变、噪点、
投影、倒角、复古滤镜。渐变小图会糊，投影小图会脏；平涂缩下去只是"变简单"。

**4 倍超采样**：Pillow 的 `rounded_rectangle()` 是不做抗锯齿的，直接画 1024 会在
银盖的圆角上留下锯齿；而 `line(..., joint="curve")` 又自带抗锯齿，两种边会打架。
所以整张图按 4096 画完再 LANCZOS 缩回 1024 —— 四条边一个品质，
这也是系统把 1024 主图缩到 180pt 时做的事。
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
SS = 4  # 超采样倍率：按 SIZE*SS 画，再缩回 SIZE
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)
OUT_PATH = os.path.join(PROJECT_ROOT, "assets", "icon.png")
UI_DIR = os.path.join(PROJECT_ROOT, "assets", "ui")

# --------------------------------------------------------------------------- #
# 调色板：**只有四个色**（含文字用的背景色）。想加第五个色之前先想清楚，
# 桌面图标上的颜色越少越硬气。
# --------------------------------------------------------------------------- #
BG = (20, 21, 24)  # #141518 底色（近黑，和 App 的深色主题同族）
BODY = (42, 44, 49)  # #2A2C31 暗盒筒身（塑料黑）
SILVER = (200, 204, 210)  # #C8CCD2 银盖 / 光圈（拉丝铝）
ORANGE = (232, 85, 31)  # #E8551F 标签橙（和 App 里那颗橙色日期同一个色号）

# --------------------------------------------------------------------------- #
# 几何：全部按 1024 画布写死，改比例只要动这一段
# --------------------------------------------------------------------------- #
CAN_X0, CAN_X1 = 322, 702  # 筒身左右（宽 380）
CAN_Y0, CAN_Y1 = 140, 680  # 筒身上下（高 540，约 1:1.4 —— 真暗盒是 25x50mm 的 1:2，
#                            这里压矮一点，好给下面的光圈让出位置）
CAP_X0, CAP_X1 = 312, 712  # 银盖比筒身略宽：真暗盒的盖是压在筒口上的
CAP_Y0, CAP_Y1 = 92, 188  # 银盖高 96
BAND_Y0, BAND_Y1 = 270, 380  # 橙标带高 110
IRIS_CX, IRIS_CY = 512, 762  # 光圈中心
IRIS_R = 170  # 六边形外接圆半径（比筒身窄一点，既能看出"光圈挡在暗盒前面"，
#               又不会在 40px 下缩成一个看不清角的小圆点 —— 试过 150，太小）
IRIS_W = 28  # 叶片线宽（40px 下只剩 1px，不能再细）


def load_font(size: int) -> ImageFont.FreeTypeFont:
    """优先用等宽粗体（`ISO 400` 那种印在标签上的字），找不到就退回 Pillow 自带的。"""
    for name in ("consolab.ttf", "consola.ttf", "courbd.ttf", "cour.ttf"):
        path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def hexagon(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    """正六边形（尖角朝上）。真光圈是六片叶片，缩到桌面尺寸就是这样一个六边形。"""
    return [
        (cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a)))
        for a in range(0, 360, 60)
    ]


def draw_canister(d: ImageDraw.ImageDraw, k: int) -> None:
    """站立的胶卷暗盒：筒身 + 银盖 + 橙标。三段都是平涂，没有明暗。"""
    d.rounded_rectangle(
        [CAN_X0 * k, CAN_Y0 * k, CAN_X1 * k, CAN_Y1 * k],
        radius=34 * k,
        fill=BODY,
    )
    d.rounded_rectangle(
        [CAP_X0 * k, CAP_Y0 * k, CAP_X1 * k, CAP_Y1 * k],
        radius=30 * k,
        fill=SILVER,
    )
    # 橙标带：贴在筒身上的标签，是绕着圆筒贴的一圈，所以左右齐筒身、上下是直边
    d.rectangle(
        [CAN_X0 * k, BAND_Y0 * k, CAN_X1 * k, BAND_Y1 * k], fill=ORANGE
    )


def draw_label(d: ImageDraw.ImageDraw, k: int) -> None:
    """橙标上的 `ISO 400`。字用**底色**画（不是黑），这样整张图仍然只有 4 个色。

    字号只求"看得出是个标记"：真印在标签上的字就这么小，而且 40px 下任何字都
    读不出来 —— 它只需要让橙带看起来"有内容"，不是一块纯色。
    """
    font = load_font(64 * k)
    text = "ISO 400"
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    x = (CAN_X0 + CAN_X1) / 2 * k - tw / 2 - box[0]
    y = (BAND_Y0 + BAND_Y1) / 2 * k - th / 2 - box[1]
    d.text((x, y), text, font=font, fill=BG)


def draw_iris(d: ImageDraw.ImageDraw, k: int) -> None:
    """光圈：六片叶片围出的六边形开口，只描边不填色。

    用 `line()` 收尾闭合成环（`polygon()` 不吃 `joint=`）—— 折角处不补圆的话，
    26px 的线在六个尖角会各啃出一个缺口，缩到 40px 就是六个豁口。
    """
    pts = hexagon(IRIS_CX * k, IRIS_CY * k, IRIS_R * k)
    d.line(pts + [pts[0]], fill=SILVER, width=IRIS_W * k, joint="curve")


def unique_colors(img: Image.Image) -> int:
    """数一下到底用了多少种颜色（`getdata()` 在 Pillow 13 起弃用，改走 getcolors）。"""
    got = img.convert("RGB").getcolors(maxcolors=1 << 24)
    return len(got) if got else -1


def main() -> None:
    # RGB（不是 RGBA）：iOS 会因为图标带透明通道而拒收；底色铺满整张画布
    big = Image.new("RGB", (SIZE * SS, SIZE * SS), BG)
    d = ImageDraw.Draw(big)

    draw_canister(d, SS)
    draw_label(d, SS)
    draw_iris(d, SS)  # 后画：光圈压在暗盒下沿上，两者叠成一个"相机"记号

    canvas = big.resize((SIZE, SIZE), Image.LANCZOS)
    canvas.save(OUT_PATH, format="PNG", optimize=True)
    print(
        f"已生成 {OUT_PATH}  ({os.path.getsize(OUT_PATH) / 1024:.1f} KB, "
        f"{SIZE}x{SIZE} {canvas.mode}, 无 alpha, 设计用色 4 种 / 实际 {unique_colors(canvas)} 种含抗锯齿)"
    )

    # ---- 自查：缩到桌面尺寸再放大回来，看剪影还认不认得出来 ----
    os.makedirs(UI_DIR, exist_ok=True)
    for px in (40, 60):
        small = canvas.resize((px, px), Image.LANCZOS)
        check = small.resize((px * 8, px * 8), Image.NEAREST)
        path = os.path.join(UI_DIR, f"_icon-check-{px}.png")
        check.save(path, format="PNG", optimize=True)
        print(
            f"已生成 {path}  ({px}x{px} -> NEAREST 放大 8x 共 {check.size[0]}x{check.size[1]})"
        )


if __name__ == "__main__":
    main()
