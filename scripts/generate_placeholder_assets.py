"""生成 retro-film-cam 的胶片纹理贴图（**不含相框**）。

用法（在项目根目录）：
    python scripts/generate_placeholder_assets.py

产物（全部落在 assets/textures/）：
    grain.png          颗粒噪点平铺 tile（512×512，单色亮度）
    dust.png           灰尘与划痕（screen 混合图层）
    vignette.png       暗角（径向 alpha 遮罩）
    light-leak.png     漏光（screen 混合图层）

相框**不在这里**。它在 scripts/generate_frames.py（8 张：纤维相纸 / 拍立得 /
35mm 片边 / 暗房放大 / 幻灯装裱 / 负片片基 / 打样张 / 档案卡）。
那边支持只重画一张：`python scripts/generate_frames.py 相框名`。
本脚本原来也生成过 3 张相框，已经被取代 —— 如果哪天又在这里生成相框，
跑一次就会把 assets/frames/ 里的新图覆盖回旧设计。

（下面留下来的 punch_window / print_window / print_text 是那会儿的通用工具，
现在只有个别地方还在用，留着不碍事。）
"""

from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")
TEXTURES_DIR = os.path.join(ROOT, "assets", "textures")

TRANSPARENT = (0, 0, 0, 0)


def ensure_dirs() -> None:
    os.makedirs(FRAMES_DIR, exist_ok=True)
    os.makedirs(TEXTURES_DIR, exist_ok=True)


def font(size: int) -> ImageFont.ImageFont:
    """Pillow >= 10.1 支持 load_default(size=...)，老版本回退到默认位图字体。"""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - 老 Pillow
        return ImageFont.load_default()


def save(img: Image.Image, path: str) -> None:
    img.save(path, "PNG", optimize=True)
    print(f"  -> {os.path.relpath(path, ROOT)}  {img.size[0]}x{img.size[1]}  {os.path.getsize(path) / 1024:.1f} KB")


def punch_window(img: Image.Image, window: tuple[int, int, int, int]) -> None:
    """把窗口区域挖成完全透明。window = (x, y, w, h)。"""
    x, y, w, h = window
    ImageDraw.Draw(img).rectangle([x, y, x + w - 1, y + h - 1], fill=TRANSPARENT)


def print_window(name: str, size: tuple[int, int], window: tuple[int, int, int, int]) -> None:
    x, y, w, h = window
    W, H = size
    print(
        f"  # {name}: canvas {W}x{H} aspect={W / H:.5f} | window px {window} "
        f"aspect={w / h:.5f}\n"
        f"  #   window: {{ x: {x / W:.6f}, y: {y / H:.6f}, width: {w / W:.6f}, height: {h / H:.6f} }}"
    )


def print_text(
    text: str,
    size: int,
    tracking: int,
    ink: tuple[int, int, int],
    wear: float = 0.14,
    seed: int = 7,
) -> Image.Image:
    """排一行"丝网印刷"字：等宽字距 + 随机磨损（做旧）。

    为什么要自己排而不是 `d.text()`：
      · Pillow 的默认字体没有"细体"字重，想做出"字重变轻"只能靠
        **缩小字号 + 拉开字距 + 降低墨色对比度**三招组合；
      · `tracking`（字距）必须逐字排版才能控制 —— 相框底部那行
        "RT-400 · 36 EXP · C-41" 用的就是宽字距的胶片边缘字；
      · `wear` 随机啃掉一小部分笔画，模拟油墨没印匀的旧印刷品
        （真实做旧感来自"缺损"而不是"模糊"）。

    返回 RGBA 图层，调用方 `img.alpha_composite(layer, (x, y))` 贴上去。
    """
    f = font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    widths = [probe.textlength(ch, font=f) for ch in text]

    total_w = int(sum(widths) + tracking * max(0, len(text) - 1)) + 6
    mask = Image.new("L", (total_w, size * 2 + 10), 0)
    md = ImageDraw.Draw(mask)

    x = 2.0
    for ch, w in zip(text, widths):
        md.text((x, 5), ch, font=f, fill=255)
        x += w + tracking

    if wear > 0:
        rnd = random.Random(seed)
        px = mask.load()
        W, H = mask.size
        for _ in range(int(W * H * wear * 0.012)):
            cx = rnd.randrange(W)
            cy = rnd.randrange(H)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and rnd.random() < 0.62:
                        px[nx, ny] = 0

    layer = Image.new("RGBA", mask.size, (ink[0], ink[1], ink[2], 255))
    layer.putalpha(mask)
    return layer


def paste_text(
    img: Image.Image,
    xy: tuple[int, int],
    text: str,
    size: int,
    tracking: int,
    ink: tuple[int, int, int],
    wear: float = 0.14,
    seed: int = 7,
) -> None:
    """`print_text` 的糖：直接贴到相框上。"""
    img.alpha_composite(print_text(text, size, tracking, ink, wear, seed), xy)


# --------------------------------------------------------------------------- #
# 相框：已搬到 scripts/generate_frames.py
# --------------------------------------------------------------------------- #
# 这里原来放着 classic-white / instant-square / film-35mm 三个生成函数。它们已经被
# scripts/generate_frames.py 里的 8 张新相框取代，**不要再在这里加相框**：
#   · 那边有 paper() / deboss() / punch_ragged() / perf_holes() 这些真正画纸的工具，
#     而且支持 `python scripts/generate_frames.py 相框名` 只重画其中一张；
#   · 更要紧的是：留在这里的话，谁跑一次本脚本就会把 assets/frames/ 里那 8 张新图
#     悄悄覆盖回旧版设计 —— 这是最容易被踩的坑。
# 本脚本从此只负责 assets/textures/ 下的 4 张调色贴图。
# （2026-10-12 又少了一张：chroma-noise.png —— 它是 CCD/DIGI 两款满屏紫绿伪色的来源，
#   已连同它的生成函数一起删除。颗粒只走单色的 grain.png。）


# --------------------------------------------------------------------------- #
# 纹理
# --------------------------------------------------------------------------- #
def _box_mean_torus(a, k: int):
    """在**环面**上做 k×k 盒平均 —— 这是"能无缝平铺"的关键。

    为什么不用 PIL 的 BoxBlur / resize：
      · 那些默认用的是**边缘夹取**（edge clamp），那么 tile 的四条边会被
        "只朝里平均"，和中间的统计特性不一样 → 平铺之后接缝处的颗粒结构断层；
      · 照片窗口最大约 352×466 pt，tile 一旦小于窗口，iOS 就会真的把同一张图
        平铺好几遍，接缝断层会被看成格线。
    环面版没有边界：最右一列在 "x + 1" 时绕回第 0 列，所以生成出来的图
    **天然左右/上下接得上**（第 511 列和第 0 列本来就是邻居）。

    实现：先 `np.pad(mode="wrap")` 把图循环铺出 (k-1) 行 / 列，
    再在**扩展后的数组**上做普通的（不绕圈的）盒求和 —— 因为接缝处已经被真实地补上了
    邻居，所以求和窗口落在任何位置都是对的。最后裁回原尺寸。
    （试过"对前缀和下标取模"那套写法：取模会破坏前缀和的单调性，跨接缝那一列会算出
      负数，等于白写。循环填充没有这个问题。）
    """
    import numpy as np

    pad = k - 1
    padded = np.pad(a, ((0, pad), (0, pad)), mode="wrap")

    # 在扩展图上滑一个 k×k 窗口求和，再裁回原尺寸。窗口数正好是 h × w（因为只补了 k-1），
    # 且第 (h-1)、第 (w-1) 个窗口的尾巴恰好落在"绕回来的那几行/列"上 —— 这就是无缝。
    windows = np.lib.stride_tricks.sliding_window_view(padded, (k, k))
    return windows.sum(axis=(2, 3), dtype=np.float64) / float(k * k)



def make_grain(size: int = 512, sigma: float = 59.0, seed: int = 20261012) -> None:
    """单色颗粒 tile：围绕中灰 128 的**多尺度团簇**噪声，配合 mixBlendMode:'overlay'。

    为什么是 512×512：贴图的一个像素 = 屏幕上的一个**逻辑点**，所以 192 的 tile 在照片窗口
    （最大约 352×466 pt）里会横着重复 2 遍、竖着 4 遍 —— 同一片噪点反复出现，
    眼睛能认出"花纹"，看起来就不是颗粒而是脏。512 比窗口还大，铺一次就够。

    为什么不能是纯高斯白噪声（2026-10-12 重写的原因）：
      捕获发生在 3x 屏幕上，1 个贴图像素最终占 3×3 个输出像素，iOS 做平滑插值 ——
      逐像素的独立白噪声被这么一平均，对比度只剩约 0.35 倍，剩下的全是"电子沙沙声"，
      而真实胶片的颗粒是**银盐团簇**：几个相邻颗粒连成一小块，块与块之间才是空隙。
      所以这里按 1 : 0.5 : 0.25 叠加三个尺度：
        细颗粒（逐像素，负责沙沙感）
        + 2×2 盒平均（负责最小的团簇）
        + 4×4 盒平均（负责更大的团块）
      再 z-score 归一化后映射回 σ=59 的中灰。团块那两部分被 3x 插值吃掉得少，
      所以颗粒在成片里留得下来、而且是"有粗有细"的，不是一层均匀的砂纸。

    为什么 σ=59（不是 30~40）：放大 3 倍后标准差只剩约 0.35 倍，得先把量补回来。
    但**不要借这个理由把值往上抬** —— 59 是按"细腻沉稳的哑光质感"定的，
    预设里那点 grain opacity 再乘上去，中间调只剩几级 —— 刚好是"看得到但不脏"。

    三通道恒等：全程只算**一个**灰度数组，存成 8 位灰度（L）而不是 RGB。
    这既省掉 2/3 体积，也是"绝无红绿紫伪色"的硬保证 —— 根本没有第二、第三条通道。
    """
    import numpy as np

    rng = np.random.default_rng(seed)

    fine = rng.normal(0.0, 1.0, (size, size)).astype(np.float32)
    cluster2 = _box_mean_torus(fine, 2)
    cluster4 = _box_mean_torus(fine, 4)

    noise = 1.0 * fine + 0.5 * cluster2 + 0.25 * cluster4

    std = float(np.std(noise))
    if std > 1e-6:
        noise /= std
    values = np.clip(128.0 + noise * sigma, 0.0, 255.0).astype(np.uint8)

    # 存成 8 位灰度（L）：噪点压不掉，RGB 会白白多占 2/3 体积
    save(Image.fromarray(values, mode="L"), os.path.join(TEXTURES_DIR, "grain.png"))


def make_dust(size: int = 512, seed: int = 4242) -> None:
    """胶片扫描的灰尘与划痕：稀疏白点 + 几条细划痕，配合 mixBlendMode:'screen'。

    只有 alpha > 0 的地方会提亮，所以图层 opacity 就是"灰尘多少"的总开关。
    存 RGBA：RGB 固定暖白，信息全在 alpha 上 —— 这样 PNG 压得极小。
    """
    rnd = random.Random(seed)

    speck = Image.new("L", (size, size), 0)
    sd = ImageDraw.Draw(speck)
    for _ in range(260):
        x = rnd.randrange(size)
        y = rnd.randrange(size)
        r = 1 if rnd.random() < 0.75 else rnd.randint(2, 3)
        sd.ellipse([x, y, x + r, y + r], fill=rnd.randint(120, 240))

    scratch = Image.new("L", (size, size), 0)
    sc = ImageDraw.Draw(scratch)
    for _ in range(7):
        if rnd.random() < 0.6:
            x = rnd.randrange(size)
            sc.line([(x, 0), (x + rnd.randint(-14, 14), size)], fill=rnd.randint(40, 90), width=1)
        else:
            y = rnd.randrange(size)
            sc.line([(0, y), (size, y + rnd.randint(-10, 10))], fill=rnd.randint(30, 70), width=1)

    dust = Image.new("RGBA", (size, size), (255, 250, 240, 0))
    dust.putalpha(ImageChops.lighter(speck, scratch))
    save(dust, os.path.join(TEXTURES_DIR, "dust.png"))


def make_vignette(size: int = 512, inner: float = 0.42, gamma: float = 1.75, max_alpha: int = 210) -> None:
    """径向黑色 alpha 遮罩；配合 mixBlendMode:'multiply'，强度由图层 opacity 控制。"""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    px = img.load()
    c = (size - 1) / 2.0
    max_r = math.hypot(c, c)
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - c, y - c) / max_r
            t = (r - inner) / (1.0 - inner)
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            a = int((t ** gamma) * max_alpha)
            if a:
                px[x, y] = (0, 0, 0, a)
    save(img, os.path.join(TEXTURES_DIR, "vignette.png"))


def make_light_leak(w: int = 768, h: int = 768) -> None:
    """右上角渗入的暖色漏光；配合 mixBlendMode:'screen'。"""
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    px = img.load()
    rnd = random.Random(1987)
    for y in range(h):
        v = y / h
        for x in range(w):
            u = x / w
            # 角落光晕
            glow = math.exp(-(((u - 1.02) ** 2) / 0.30 + ((v - 0.02) ** 2) / 0.42))
            # 两条斜向 streak
            d1 = abs(v - (0.10 + 0.70 * u)) / 0.20
            s1 = max(0.0, 1.0 - d1 * d1)
            d2 = abs(v - (0.58 + 0.34 * u)) / 0.30
            s2 = max(0.0, 1.0 - d2 * d2) * 0.45
            a = min(1.0, glow + s1 * 0.8 + s2)
            if a <= 0.004:
                continue
            a *= 0.55 + 0.45 * rnd.random()   # 斑驳感
            a *= max(0.0, 1.0 - 0.62 * u)     # 越往左越淡（从右上渗入）
            if a <= 0.004:
                continue
            r = 255
            g = int(120 + 78 * a)
            b = int(18 + 96 * a)
            px[x, y] = (r, g, b, int(min(255.0, a * 235)))
    img = img.filter(ImageFilter.GaussianBlur(5))
    save(img, os.path.join(TEXTURES_DIR, "light-leak.png"))


def main() -> None:
    ensure_dirs()
    print("textures:")
    make_grain()
    make_dust()
    make_vignette()
    make_light_leak()
    print("done.")


if __name__ == "__main__":
    main()
