"""生成 retro-film-cam 的胶片纹理贴图（**不含相框**）。

用法（在项目根目录）：
    python scripts/generate_placeholder_assets.py

产物（全部落在 assets/textures/）：
    grain.png          颗粒噪点平铺 tile（512×512，彩度中性）
    chroma-noise.png   CCD 彩色噪点 tile（256×256，块状色斑）
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
        "RETRO 400 · 36 EXP · C-41" 用的就是宽字距的胶片边缘字；
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
# 本脚本从此只负责 assets/textures/ 下的 5 张调色贴图。


# --------------------------------------------------------------------------- #
# 纹理
# --------------------------------------------------------------------------- #
def make_grain(size: int = 512, sigma: float = 62.0, seed: int = 20261010) -> None:
    """单色颗粒 tile：围绕中灰 128 的噪点，配合 mixBlendMode:'overlay' 使用。

    为什么是 512×512：贴图的一个像素 = 屏幕上的一个**逻辑点**，所以 192 的 tile 在照片窗口
    （约 349×466 pt）里会横着重复 2 遍、竖着 4 遍 —— 同一片噪点反复出现，
    眼睛能认出"花纹"，看起来就不是颗粒而是脏。512 比窗口还大，铺一次就够。

    为什么 σ 要取到 62（不是 40 上下）：
    捕获发生在 3x 屏幕上，所以 1 个贴图像素最终占 3×3 个输出像素，iOS 会做平滑插值。
    实测（scripts/preview_grade.py 量的）：纯白噪声被放大 3 倍后标准差只剩 **0.35 倍**，
    σ=42 落到画面上只有约 15 级，配 opacity 0.16 后中间调只剩 ±2.5 级 —— 等于没有。
    σ=62 补偿到约 22 级，预设里再用 0.2~0.5 的 opacity，中间调有 ±5~11 级，才看得出颗粒。
    （代价是约 5% 的像素被裁到 [8,248] 两端，那点"椒盐"反而更像银盐团簇。）

    为什么不是纯白噪声：真实胶片颗粒是"银盐团簇"，有粗有细。
    这里把逐像素高频噪声和 1/3 分辨率的团簇噪声按 78:22 掺起来再拉伸到目标 σ。
    团簇那部分被插值抹掉的少，负责"结块感"；高频那部分负责"沙沙感"。
    """
    import numpy as np

    rng = np.random.default_rng(seed)
    fine = rng.normal(0.0, 1.0, (size, size)).astype(np.float32)

    coarse_size = max(2, size // 3)
    coarse_small = rng.normal(0.0, 1.0, (coarse_size, coarse_size)).astype(np.float32)
    coarse = np.asarray(
        Image.fromarray(coarse_small, mode="F").resize((size, size), Image.BICUBIC),
        dtype=np.float32,
    )

    noise = 0.78 * fine + 0.22 * coarse
    std = float(np.std(noise))
    if std > 1e-6:
        noise /= std
    values = np.clip(128.0 + noise * sigma, 8.0, 248.0).astype(np.uint8)

    # 存成 8 位灰度（L）而不是 RGB：噪点压不掉，RGB 会白白多占 2/3 体积
    save(Image.fromarray(values, mode="L"), os.path.join(TEXTURES_DIR, "grain.png"))


def make_chroma_noise(
    size: int = 512,
    block: int = 2,
    sigma: float = 34.0,
    seed: int = 90210,
) -> None:
    """CCD 特有的彩色噪点：品红 / 绿交替的色斑，围绕中灰 128，配合 'overlay'。

    为什么和亮度颗粒分开做：CCD 的色度通道采样率远低于亮度通道，所以它的色噪
    **更粗、更块状**（这里是 block×block 个逻辑点的块），而胶片没有这种东西。
    想要"CCD 味"就靠它 + 分离色调 + 硬高光，而不是靠把颗粒调大。

    tile 取 512（和颗粒一样大于照片窗口）→ 不重复；块尺寸 2 pt = 6 个输出像素，
    这正是小 DC 色噪的粗细。

    存成 48 色调色板 PNG：24 位真彩的彩色噪点会撑到 700 KB 以上，调色板只要几十 KB。
    """
    import numpy as np

    cells = max(2, size // block)
    rng = np.random.default_rng(seed)
    d = np.clip(rng.normal(0.0, sigma, (cells, cells)), -70.0, 70.0)
    d = np.repeat(np.repeat(d, block, axis=0), block, axis=1)[:size, :size]

    base = np.full((size, size), 128.0, dtype=np.float32)
    r = np.clip(base + d, 0.0, 255.0)
    g = np.clip(base - d * 0.85, 0.0, 255.0)
    b = np.clip(base + d * 0.45, 0.0, 255.0)
    rgb = np.dstack([r, g, b]).astype(np.uint8)

    paletted = Image.fromarray(rgb, mode="RGB").convert("P", palette=Image.ADAPTIVE, colors=48)
    save(paletted, os.path.join(TEXTURES_DIR, "chroma-noise.png"))


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
    make_chroma_noise()
    make_dust()
    make_vignette()
    make_light_leak()
    print("done.")


if __name__ == "__main__":
    main()
