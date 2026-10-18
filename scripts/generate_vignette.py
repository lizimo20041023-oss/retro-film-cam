#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""光学暗角贴图生成器（v1.8.5 M2，v1.9.0 重标定，v1.9.1 去雾手术，v1.9.2 再收）

重新生成 assets/textures/vignette.png：一张 1024x1024 RGBA 的径向暗角遮罩。

设计口径（v1.9.2 用户 m09093 规范，替代 v1.9.1 的 70% 口径）：
  - 中心到 **80%** 半径（按短边一半归一化）alpha 恒为 0：画面主体（山体/海湾/
    人像/白衬衫）所在的中心区零遮挡 —— 用户明确要求「中心 100% 透明区扩到 80%」；
  - 80% -> 100% 半径用 smoothstep 平滑升到 alpha 255：只压四角最后 20% 过渡带；
  - 四角 rho>1 按 1 处理（满不透明度）；
  - RGB 恒为 (4, 12, 20) 深青黑，不随半径变化（半径只控制 alpha）。
  - 渲染侧 opacity 由预设 `vignette` 决定，v1.9.2 值域收敛到 0.08~0.15。

渲染侧（gradeLayers.ts）以 `blendMode:'multiply'` + `opacity = preset.vignette`
叠加该贴图。multiply 之所以安全：中心 alpha=0（没有任何上层像素参与混合，白不变灰），
四角是深青黑乘上去（纯白/纯黑两端恒等），比 normal 的"盖一层黑纱"保留更多中间调。
贴图 alpha 只负责"遮挡比例"，最终不透明度由预设值决定。

生成方式（零新依赖：本机 python 自带 Pillow）：
  python scripts/generate_vignette.py

输出：
  assets/textures/vignette.png   1024x1024 RGBA
并打印尺寸 / 字节数 / sha256 / 半径->alpha 剖面（便于探针或人工核对）。
"""

import hashlib
import math
import os
import struct
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - 运行环境缺 Pillow 时给出明确指令
    sys.exit("需要 Pillow：请用仓库约定的 python 运行（该运行时自带 Pillow）")

# --- 冻结常量 -------------------------------------------------------------
SIZE = 1024                 # 契约建议 1024x1024：够大不糊，文件仍是普通 PNG
INNER_RADIUS = 0.80         # 中心透明半径（相对短边一半；v1.9.2 用户规范 80%）
OUTER_RADIUS = 1.0          # 到边中点为满不透明度
RGB = (4, 12, 20)           # 深青黑，恒定的暗角颜色（v1.9.0 用户指定 rgba(4,12,20)）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_PATH = os.path.join(REPO_ROOT, "assets", "textures", "vignette.png")


def smoothstep(t: float) -> float:
    """t in [0,1] -> 3t^2 - 2t^3（两端导数为 0，无硬边）。"""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def alpha_at(dist: float) -> int:
    """按像素到中心的距离（像素）算 alpha。"""
    half = SIZE / 2.0
    rho = min(1.0, dist / half)
    t = (rho - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS)
    return int(round(255.0 * smoothstep(t)))


def build_rows() -> list:
    """逐行构造 RGBA 字节（用 bytes 直接拼，避免逐像素 putpixel 过慢）。"""
    half = SIZE / 2.0
    rows = []
    for y in range(SIZE):
        dy = (y + 0.5) - half
        row = bytearray()
        for x in range(SIZE):
            dx = (x + 0.5) - half
            a = alpha_at(math.hypot(dx, dy))
            row += bytes((RGB[0], RGB[1], RGB[2], a))
        rows.append(bytes(row))
    return rows


def png_chunks(rows: list) -> bytes:
    """手写最小 PNG 编码（RGBA8、filter 0），不依赖 Pillow 之外的 PNG 参数。"""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", 0)  # 占位，稍后补 CRC
        )

    import zlib

    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8bit RGBA
    raw = b"".join(b"\x00" + row for row in rows)              # filter 0
    out = bytearray()
    out += b"\x89PNG\r\n\x1a\n"
    for tag, data in ((b"IHDR", ihdr), (b"IDAT", zlib.compress(raw, 9)), (b"IEND", b"")):
        out += struct.pack(">I", len(data)) + tag + data
        out += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return bytes(out)


def main() -> int:
    rows = build_rows()
    png = png_chunks(rows)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "wb") as fh:
        fh.write(png)

    # 用 Pillow 回读自检：尺寸/模式/中心透明/边中点满 alpha/四角满 alpha
    img = Image.open(OUT_PATH)
    assert img.size == (SIZE, SIZE), img.size
    assert img.mode == "RGBA", img.mode
    assert img.getpixel((SIZE // 2, SIZE // 2)) == (*RGB, 0), img.getpixel((SIZE // 2, SIZE // 2))
    edge = img.getpixel((SIZE - 1, SIZE // 2))
    corner = img.getpixel((SIZE - 1, SIZE - 1))
    assert edge[3] == 255, edge
    assert corner[3] == 255, corner

    print("vignette.png ->", OUT_PATH)
    print("size=%dx%d mode=%s bytes=%d" % (img.size[0], img.size[1], img.mode, len(png)))
    print("sha256=" + hashlib.sha256(png).hexdigest())
    print("center alpha=0, edge-mid alpha=255, corner alpha=255")
    print("alpha 剖面 (按短边一半归一化):")
    for rho in (0.0, 0.30, 0.50, 0.60, 0.70, 0.80, 0.86, 0.94, 1.0):
        dist = rho * (SIZE / 2.0)
        print("  rho=%.2f  alpha=%3d" % (rho, alpha_at(dist)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
