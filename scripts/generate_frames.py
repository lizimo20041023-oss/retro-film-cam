"""生成 FretroCam 的 8 张相框 PNG。

用法（在项目根目录）：
    python scripts/generate_frames.py            # 全部重画
    python scripts/generate_frames.py darkroom   # 只重画一张（改一张不用等全部）

产物在 `assets/frames/`，脚本会打印每张的**归一化镂空窗口** —— 那组数字直接抄进
`src/constants/frames.ts` 就是新相框，核心逻辑一行都不用改。

设计原则（为什么不是"白色圆角 + 一行英文"那种常见滤镜框）：
  1. **每张都对应一种真实的物理产物**，而不是一种"滤镜风格"：
     纤维相纸、宝丽来涂层、35mm 片边、暗房放大、幻灯装裱卡、
     彩色负片的橙色片基、印刷打样张、牛皮档案卡。
     真实产物自带不规则的细节，那些细节就是"不俗"的来源。
  2. **留白不说话。** 上一版每张底下都印一行 `RETRO 400 · 36 EXP · C-41`，
     那是滤镜的语言。真实的相纸底下是空的，字只在真的有信息的地方出现
     （片边代号、打样色标、档案编号）。
  3. **纸要像纸。** 加低频"不匀"而不是逐像素噪点 —— 不是怕体积
     （`save()` 里的调色板量化已经解决了体积），而是逐像素噪点
     在成片里会被当成"照片本身的颗粒"，低频不匀才是"纸"。

注意：本脚本**只画相框**。颗粒/暗角/漏光那些纹理在
`scripts/generate_placeholder_assets.py` 里，两者互不影响。
"""

from __future__ import annotations

import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")

TRANSPARENT = (0, 0, 0, 0)

# --------------------------------------------------------------------------- #
# 调色板：8 张相框所有用色都在这里，想统一换风格改这一段就够
# --------------------------------------------------------------------------- #
PAPER_FIBER = (250, 249, 245)  # 纤维相纸（暖白，比纯白低 2 度）
PAPER_POLAROID = (247, 245, 240)  # 宝丽来相纸（更暖，涂层感）
FILM_BASE = (22, 23, 26)  # 35mm 片基（近黑，带一点蓝）
FILM_EDGE = (10, 11, 13)  # 片基最外圈
FILM_PERF = (17, 18, 21)  # 齿孔带底色
DARKROOM = (9, 9, 10)  # 暗房放大：纯黑卡纸
MOUNT_CARD = (222, 218, 210)  # 幻灯装裱卡纸（冷灰白）
MOUNT_WEAVE = (212, 208, 200)  # 卡纸压纹
NEG_ORANGE = (188, 116, 44)  # 彩色负片的橙色 mask（真片基比纯橙更闷）
PROOF_PAPER = (252, 251, 249)  # 打样张（最白的一张）
KRAFT = (216, 200, 166)  # 牛皮档案卡
KRAFT_RULE = (176, 72, 56)  # 档案卡上那道红线

INK_GREY = (172, 167, 158)
INK_FAINT = (205, 201, 193)
INK_DARK = (86, 82, 76)
INK_REBATE = (206, 158, 74)  # 片边代号那种偏琥珀的印刷色
INK_DEEP = (96, 58, 20)  # 印在橙色片基上（同色系压深，不用黑）
INK_TYPE = (74, 62, 44)  # 打字机色带打在牛皮纸上

# 打样张的四色色标（印刷厂那四条 + 一条纸白）
CHIP_COLORS = ((0, 174, 239), (236, 0, 140), (255, 241, 0), (35, 31, 32), (250, 249, 246))


# --------------------------------------------------------------------------- #
# 通用工具
# --------------------------------------------------------------------------- #
def font(size: int) -> ImageFont.ImageFont:
    """Pillow >= 10.1 支持 load_default(size=...)，老版本回退到默认位图字体。"""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - 老 Pillow
        return ImageFont.load_default()


def save(img: Image.Image, name: str) -> None:
    """存盘。**必须先 `quantize`** —— 这是本脚本唯一一处不直观、但极其关键的地方。

    直接存 RGBA 的 PNG：一张 1350×1800 的纸纹要 **450 KB**
    （纸面上每个像素的色值都略有不同，PNG 的行滤波器完全预测不动）。
    转成 256 色调色板之后，同样的画面只要 **11 KB**（42 倍），因为大片
    "看起来一样"的色值现在真的是同一个索引值，能整行整行地压。

    安全性已经实测过：`FASTOCTREE` 会**逐像素保留 alpha** ——
    镂空窗口仍然是精确的 0（1910412 个像素一个不差），
    RGB 最大偏差 13/255、平均偏差 0.62，肉眼看不出来。
    """
    path = os.path.join(FRAMES_DIR, name + ".png")
    out = img.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
    out.save(path, "PNG", optimize=True)
    print(
        f"  -> assets/frames/{name}.png  {img.size[0]}x{img.size[1]}  "
        f"{os.path.getsize(path) / 1024:.1f} KB"
    )


def print_window(name: str, size: tuple[int, int], window: tuple[int, int, int, int]) -> None:
    x, y, w, h = window
    W, H = size
    print(
        f"  # {name}: canvas {W}x{H} aspect={W / H:.6f} | window px {window} "
        f"aspect={w / h:.5f}\n"
        f"  #   window: {{ x: {x / W:.6f}, y: {y / H:.6f}, "
        f"width: {w / W:.6f}, height: {h / H:.6f} }}"
    )


def overlay(img: Image.Image, draw) -> None:
    """在透明图层上画完再合成 —— `ImageDraw` 直接画在 RGBA 上是**覆盖**不是混合，
    画半透明的边会把它变成实心，必须走这一层。"""
    layer = Image.new("RGBA", img.size, TRANSPARENT)
    draw(ImageDraw.Draw(layer))
    img.alpha_composite(layer)


def paper(
    img: Image.Image,
    box: tuple[int, int, int, int],
    color: tuple[int, int, int],
    mottle: float = 4.5,
    scale: int = 16,
    fiber: float = 0.0,
    seed: int = 0,
) -> None:
    """把 box 区域刷成 color，并叠一层低频"不匀"（+ 可选极细纤维）。

    mottle  低频不匀的振幅（级）；scale 噪声格子边长（px），越大越"云状"；
            取值要克制：`scale` 太小（<30）或 `mottle` 太大，量化之后会
            变成一块一块的"水渍"，白纸尤其明显 —— 白纸用 mottle≈2.2 / scale≈46。
    fiber   逐像素细颗粒的振幅。体积上已经无所谓（量化扛得住），
            但只给"真的粗糙"的纸用（宝丽来涂层、牛皮卡），
            相纸和白卡纸加了会显得脏。
    """
    import numpy as np

    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    rng = np.random.default_rng(seed)

    cw, ch = max(2, w // scale), max(2, h // scale)
    low = np.asarray(
        Image.fromarray(rng.normal(0.0, 1.0, (ch, cw)).astype(np.float32), mode="F").resize(
            (w, h), Image.BICUBIC
        ),
        dtype=np.float32,
    )
    noise = low * mottle
    if fiber > 0:
        noise += np.clip(rng.normal(0.0, 1.0, (h, w)).astype(np.float32), -2.5, 2.5) * fiber

    base = np.zeros((h, w, 3), dtype=np.float32) + np.asarray(color, dtype=np.float32)
    rgb = np.clip(base + noise[..., None], 0, 255).astype(np.uint8)
    img.alpha_composite(Image.fromarray(rgb, "RGB").convert("RGBA"), (x0, y0))


def punch(img: Image.Image, window: tuple[int, int, int, int]) -> None:
    """把窗口挖成完全透明。window = (x, y, w, h)。"""
    x, y, w, h = window
    ImageDraw.Draw(img).rectangle([x, y, x + w - 1, y + h - 1], fill=TRANSPARENT)


def punch_ragged(
    img: Image.Image,
    window: tuple[int, int, int, int],
    jitter: int = 12,
    step: int = 26,
    seed: int = 0,
) -> None:
    """挖一个**四边毛糙**的窗口（暗房里手工裁切的底片夹会留下这种边）。

    关键：毛边一律**往窗口里面啃**，绝不向外扩。
    照片是严格按 window 铺在相框底下的，洞要是比 window 大，
    大出来的那几像素就会露出合成舞台的黑底（"黑边上有白牙"）。
    """
    rnd = random.Random(seed)
    x, y, w, h = window

    mask = Image.new("L", img.size, 255)
    md = ImageDraw.Draw(mask)

    pts: list[tuple[int, int]] = []
    for i in range(0, w + 1, step):
        pts.append((x + i, y + rnd.randint(0, jitter)))
    for i in range(0, h + 1, step):
        pts.append((x + w - rnd.randint(0, jitter), y + i))
    for i in range(w, -1, -step):
        pts.append((x + i, y + h - rnd.randint(0, jitter)))
    for i in range(h, -1, -step):
        pts.append((x + rnd.randint(0, jitter), y + i))
    md.polygon(pts, fill=0)

    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))


def deboss(
    img: Image.Image,
    window: tuple[int, int, int, int],
    width: int = 3,
    light: tuple[int, int, int, int] = (255, 255, 255, 78),
    dark: tuple[int, int, int, int] = (0, 0, 0, 58),
) -> None:
    """窗口四周的压痕：左上受光偏亮、右下背光偏暗（默认光从左上打来）。

    这一圈比描边重要得多 —— 描边只是"画了个框"，压痕才让窗口看起来是
    "纸被压下去了一块、照片嵌在里面"。
    """
    x, y, w, h = window

    def draw(d: ImageDraw.ImageDraw) -> None:
        d.line([(x - width, y - width), (x + w + width, y - width)], fill=light, width=width)
        d.line([(x - width, y - width), (x - width, y + h + width)], fill=light, width=width)
        d.line([(x - width, y + h + width), (x + w + width, y + h + width)], fill=dark, width=width)
        d.line([(x + w + width, y - width), (x + w + width, y + h + width)], fill=dark, width=width)

    overlay(img, draw)


def soft_edge(
    img: Image.Image,
    box: tuple[int, int, int, int],
    color: tuple[int, int, int],
    alpha: int = 40,
    width: int = 46,
    blur: float = 20.0,
) -> None:
    """沿 box 内缘铺一圈柔和的暗边（纸张受潮 / 涂层边缘偏厚的感觉）。"""
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", img.size, TRANSPARENT)
    d = ImageDraw.Draw(layer)
    for i in range(width):
        a = int(alpha * (1.0 - i / width) ** 1.6)
        if a <= 0:
            continue
        d.rectangle([x0 + i, y0 + i, x1 - i, y1 - i], outline=(color[0], color[1], color[2], a), width=1)
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def round_corners(img: Image.Image, radius: int) -> None:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255
    )
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))


def print_text(
    text: str,
    size: int,
    tracking: int,
    ink: tuple[int, int, int],
    wear: float = 0.14,
    seed: int = 7,
    jitter: int = 0,
) -> Image.Image:
    """排一行"丝网印刷"字：等宽字距 + 随机磨损（做旧）+ 可选基线抖动。

    为什么要自己排而不是 `d.text()`：
      · 默认字体没有"细体"字重，想做出"字重变轻"只能靠
        **缩小字号 + 拉开字距 + 降低墨色对比度**三招组合；
      · `tracking`（字距）必须逐字排版才能控制；
      · `wear` 随机啃掉一小部分笔画，模拟油墨没印匀的旧印刷品
        （真实做旧感来自"缺损"而不是"模糊"）；
      · `jitter` 让每个字的基线上下乱跳 —— 这是"打字机"的关键，
        均匀的等宽字看起来是印刷，抖过的才像打字机色带。

    返回 RGBA 图层，调用方 `img.alpha_composite(layer, (x, y))` 贴上去。
    """
    f = font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    widths = [probe.textlength(ch, font=f) for ch in text]

    total_w = int(sum(widths) + tracking * max(0, len(text) - 1)) + 6
    mask = Image.new("L", (total_w, size * 2 + 10), 0)
    md = ImageDraw.Draw(mask)
    rnd = random.Random(seed)

    x = 2.0
    for ch, w in zip(text, widths):
        dy = 5 + (rnd.randint(-jitter, jitter) if jitter else 0)
        md.text((x, dy), ch, font=f, fill=255)
        x += w + tracking

    if wear > 0:
        px = mask.load()
        W, H = mask.size
        for _ in range(int(W * H * wear * 0.012)):
            cx = rnd.randrange(W)
            cy = rnd.randrange(H)
            for ddy in (-1, 0, 1):
                for ddx in (-1, 0, 1):
                    nx, ny = cx + ddx, cy + ddy
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
    jitter: int = 0,
) -> None:
    """`print_text` 的糖：直接贴到相框上。"""
    img.alpha_composite(print_text(text, size, tracking, ink, wear, seed, jitter), xy)


def perf_holes(
    img: Image.Image,
    size: tuple[int, int],
    centers_x: tuple[int, ...],
    hole: tuple[int, int] = (98, 68),
    top: int = 118,
    pitch: int = 148,
    radius: int = 15,
) -> None:
    """沿两侧打一排**透明**的圆角齿孔。

    透明（而不是画成浅灰）是有意的：合成舞台的底色是纯黑，
    洞透过去就是黑，和真齿孔看过去一样；画成灰色反而像印上去的。
    """
    W, H = size
    hw, hh = hole[0] // 2, hole[1] // 2
    d = ImageDraw.Draw(img)
    y = top
    while y + hh < H - 60:
        for cx in centers_x:
            d.rounded_rectangle([cx - hw, y - hh, cx + hw, y + hh], radius=radius, fill=TRANSPARENT)
        y += pitch


# --------------------------------------------------------------------------- #
# 1. classic-white —— 纤维相纸（重做：去掉底部那行"滤镜话术"）
# --------------------------------------------------------------------------- #
def make_classic_white() -> None:
    """3:4 纤维相纸：暖白纸 + 低频不匀 + 一圈内缩细线 + 窗口压痕。**通篇无字。**

    上一版底部印着 `RETRO 400 · 36 EXP · C-41` —— 那行字是"我在模仿胶片"的
    自白；真实的相纸底下什么都没有，白就是白。留白反而显贵。
    """
    W, H = 1350, 1800
    window = (76, 84, 1197, 1596)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), PAPER_FIBER, mottle=2.4, scale=46, seed=101)
    # 纸张边缘一圈柔和变暗（受潮 / 压边），避免"一个纯白矩形"的数码感
    soft_edge(img, (0, 0, W, H), (206, 200, 188), alpha=30, width=44, blur=22)

    def draw(d: ImageDraw.ImageDraw) -> None:
        # 内缩 30px 的极细双线：像相纸厂的压边线，走近才看得见
        d.rectangle([30, 30, W - 31, H - 31], outline=(240, 237, 230, 190), width=2)
        d.rectangle([36, 36, W - 37, H - 37], outline=(244, 242, 236, 130), width=1)

    overlay(img, draw)

    deboss(img, window, width=3, light=(255, 255, 255, 92), dark=(0, 0, 0, 52))
    punch(img, window)

    save(img, "classic-white")
    print_window("classic-white", (W, H), window)


# --------------------------------------------------------------------------- #
# 2. instant-square —— 宝丽来（重做：去掉 FRETROCAM 那两行字）
# --------------------------------------------------------------------------- #
def make_instant_square() -> None:
    """1:1 窗口 + 很宽的下白边。纸更暖、涂层更不匀、窗口压痕更深。

    下白边**刻意留空**：真宝丽来的那片空白是给你用圆珠笔写字的。
    上一版在那儿印了 `FRETROCAM` / `INSTANT · ISO 800`，一下子就成了滤镜。
    """
    W, H = 1425, 1800
    window = (78, 92, 1269, 1269)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    # fiber 给到 1.4：宝丽来的涂层里有肉眼可见的杂质，这是它和铜版纸的区别
    paper(img, (0, 0, W, H), PAPER_POLAROID, mottle=2.8, scale=40, fiber=1.4, seed=202)
    # 涂层边缘偏厚 → 四周一圈很淡的暗边，中部更亮
    soft_edge(img, (0, 0, W, H), (198, 192, 180), alpha=40, width=66, blur=28)

    deboss(img, window, width=4, light=(255, 255, 255, 104), dark=(0, 0, 0, 74))
    punch(img, window)

    save(img, "instant-square")
    print_window("instant-square", (W, H), window)


# --------------------------------------------------------------------------- #
# 3. film-35mm —— 真实片边（重做：帧号 + 片基代号，不再是那句通用话术）
# --------------------------------------------------------------------------- #
def make_film_35mm() -> None:
    """35mm 胶片条：两侧齿孔 + 片边代号。

    真片边上印的是**索引**而不是标语：帧号（`12A`）、片基型号、冲洗工艺。
    所以这里顶部是 `▶ 12A` 与 `RETRO 400`，底部是 `C-41 · 135` 与 `13 ▷`
    —— 看起来像从一条真实的负片上裁下来的一格。
    """
    W, H = 1350, 1950
    # 窗口纵向居中偏上 10px：上一版下边留了 440px 黑边，成片看起来像"照片贴歪了"
    window = (210, 300, 930, 1330)
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W - 1, H - 1], fill=FILM_BASE)
    d.rectangle([0, 0, W - 1, H - 1], outline=FILM_EDGE, width=8)
    d.rectangle([0, 0, 196, H - 1], fill=FILM_PERF)
    d.rectangle([W - 197, 0, W - 1, H - 1], fill=FILM_PERF)

    x, y, w, h = window
    # 窗口内侧一圈压痕：片基被放大机压过的痕迹
    d.rectangle([x - 5, y - 5, x + w + 4, y + h + 4], outline=(52, 54, 58, 255), width=5)
    punch(img, window)
    perf_holes(img, (W, H), (98, W - 98))

    # 顶部片边：帧号（琥珀，像 Kodak 的边码）+ 片基型号（灰）
    paste_text(img, (x, 150), "▶ 12A", size=38, tracking=5, ink=INK_REBATE, wear=0.11, seed=41)
    paste_text(img, (x, 216), "RETRO 400", size=32, tracking=11, ink=INK_GREY, wear=0.16, seed=43)
    # 底部片边：冲洗工艺 + 下一格帧号（右边对齐到窗口右缘）
    # y 留在 H-250：再往下就会被**日期水印**压住（日期右对齐、烧在下留白里）
    paste_text(img, (x, H - 250), "C-41 · 135", size=32, tracking=9, ink=INK_GREY, wear=0.17, seed=47)
    paste_text(img, (x + w - 132, H - 250), "13 ▷", size=32, tracking=5, ink=INK_REBATE, wear=0.12, seed=53)

    save(img, "film-35mm")
    print_window("film-35mm", (W, H), window)


# --------------------------------------------------------------------------- #
# 4. darkroom —— 暗房放大（新）
# --------------------------------------------------------------------------- #
def make_darkroom() -> None:
    """暗房放大：纯黑卡纸 + **手工裁切**的毛边窗口 + 右下角一枚编号。

    四边宽度刻意不等（左 78 / 右 104 / 上 92 / 下 118）—— 手动裁的纸不可能等宽，
    等宽是"贴纸"的观感。毛边 + 不等宽这两件事，一眼就能和"黑色圆角边框"分开。
    """
    W, H = 1350, 1800
    window = (78, 92, 1168, 1590)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), DARKROOM, mottle=2.0, scale=56, seed=404)
    soft_edge(img, (0, 0, W, H), (0, 0, 0), alpha=80, width=72, blur=32)

    # 放大机漏进来的那圈极淡光晕：紧贴窗口外侧一圈，说明"光是穿过底片来的"
    def glow(d: ImageDraw.ImageDraw) -> None:
        x, y, w, h = window
        d.rectangle([x - 9, y - 9, x + w + 8, y + h + 8], outline=(255, 250, 238, 26), width=5)

    overlay(img, glow)

    punch_ragged(img, window, jitter=13, step=24, seed=7)

    # 编号：印在**左下角**（不是右下角！）。右下角是日期水印的地盘 ——
    # 日期是右对齐烧在下留白里的，编号放右下会和它叠在一起。
    # 小到要凑近看 —— 档案感来自"少而准"，不是"多而全"。
    paste_text(
        img,
        (window[0], window[1] + window[3] + 36),
        "No. 12",
        size=28,
        tracking=6,
        ink=(118, 114, 108),
        wear=0.20,
        seed=61,
    )

    save(img, "darkroom")
    print_window("darkroom", (W, H), window)


# --------------------------------------------------------------------------- #
# 5. slide-mount —— 幻灯装裱卡（新）
# --------------------------------------------------------------------------- #
def make_slide_mount() -> None:
    """幻灯装裱卡：方形冷灰卡纸 + 圆角 + 压纹 + 3:2 的横向开孔。

    为什么是**方形 + 横向窗口**：真实的 35mm 幻灯框就是 50×50mm 的方卡、
    中间开一个 36×24mm 的横孔 —— 所以它天然和另外 7 张竖构图不一样，
    在相册里一眼就能认出。做成竖的"高级灰边框"就又俗回去了。
    """
    W, H = 1350, 1350
    # 窗口**纵向居中**（上下各 360 / 316）：上一版顶在 31% 处，卡面上一大片空
    window = (170, 360, 1010, 674)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), MOUNT_CARD, mottle=2.4, scale=42, seed=505)

    # 卡纸压纹：等距竖线，只比底色深 6 级 —— 看得出"有纹"，看不出"有线"
    def weave(d: ImageDraw.ImageDraw) -> None:
        for gx in range(10, W, 9):
            d.line([(gx, 0), (gx, H)], fill=(MOUNT_WEAVE[0], MOUNT_WEAVE[1], MOUNT_WEAVE[2], 90), width=1)

    overlay(img, weave)
    soft_edge(img, (0, 0, W, H), (186, 182, 172), alpha=40, width=54, blur=22)

    x, y, w, h = window
    # 开孔厚度：卡纸是有厚度的，孔壁会在下方和右侧留一圈阴影
    deboss(img, window, width=4, light=(255, 255, 255, 118), dark=(0, 0, 0, 96))
    punch(img, window)

    # 底部一行极小的印刷字（真卡纸上印的就是这类规格）。
    # 位置留在 H-300 / H-246：下面的 H-179~H-123 是日期水印的地盘。
    paste_text(img, (x, H - 300), "35mm · MOUNTED SLIDE", size=30, tracking=10, ink=INK_GREY, wear=0.16, seed=71)
    def chip(d: ImageDraw.ImageDraw) -> None:
        d.rectangle([x, H - 246, x + 46, H - 222], fill=(198, 122, 40, 255))

    overlay(img, chip)
    paste_text(img, (x + 66, H - 254), "PROCESS C-41", size=26, tracking=8, ink=INK_FAINT, wear=0.20, seed=73)

    round_corners(img, 26)

    save(img, "slide-mount")
    print_window("slide-mount", (W, H), window)


# --------------------------------------------------------------------------- #
# 6. orange-base —— 彩色负片的橙色片基（新）
# --------------------------------------------------------------------------- #
def make_orange_base() -> None:
    """彩色负片的橙色 mask 直接当边框用。

    彩色负片最容易被认出来的特征就是那层**橙红色片基**（为了校正染料的不纯），
    拿它当整块边框，辨识度比"黑色胶片条"高一个量级，而且没人这么做。
    字全部用同色系压深（`INK_DEEP`），不用黑 —— 黑字压在橙底上会显脏。
    """
    W, H = 1350, 1800
    window = (150, 260, 1050, 1400)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    # mottle 给到 7：真片基的 mask 颜色本来就不匀（涂层厚度差），太均匀反而假
    paper(img, (0, 0, W, H), NEG_ORANGE, mottle=7.0, scale=44, fiber=1.0, seed=606)
    soft_edge(img, (0, 0, W, H), (120, 66, 16), alpha=48, width=58, blur=24)

    x, y, w, h = window
    ImageDraw.Draw(img).rectangle([x - 6, y - 6, x + w + 5, y + h + 5], outline=(138, 78, 18, 255), width=6)
    punch(img, window)
    perf_holes(img, (W, H), (84, W - 84), hole=(92, 64), top=140, pitch=152, radius=14)

    paste_text(img, (x, 96), "C-41", size=34, tracking=10, ink=INK_DEEP, wear=0.16, seed=81)
    paste_text(img, (x + w - 210, 96), "RETRO 400", size=34, tracking=9, ink=INK_DEEP, wear=0.15, seed=83)
    # 这行必须落在窗口**下面**的下留白里。原来写的是 H-176，而窗口底边在 1660 ——
    # 字实际渲染在 y≈1638..1659，整行压在照片上（相框 PNG 是盖在照片之上的图层，
    # 半透明的字会直接烧进成片）。下留白 = 1660..1800，取 H-104 让字居中。
    paste_text(img, (x, H - 104), "135 · 36 EXP", size=32, tracking=9, ink=INK_DEEP, wear=0.17, seed=87)

    save(img, "orange-base")
    print_window("orange-base", (W, H), window)


# --------------------------------------------------------------------------- #
# 7. crop-marks —— 印刷打样张（新）
# --------------------------------------------------------------------------- #
def make_crop_marks() -> None:
    """印刷打样张：白纸 + 四角裁切线 + 套准十字 + 底部四色色标条。

    这是唯一一张"有信息量"的框：裁切线在告诉你要切哪儿、色标在告诉你
    这台机器的 C/M/Y/K 准不准。工具属性 > 装饰属性，所以它不俗。
    """
    W, H = 1350, 1800
    window = (96, 108, 1158, 1584)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), PROOF_PAPER, mottle=2.0, scale=52, seed=707)

    MARK = (28, 28, 30, 210)
    x, y, w, h = window

    def marks(d: ImageDraw.ImageDraw) -> None:
        arm, inset, wd = 66, 30, 3
        for (cx, cy, sx, sy) in (
            (inset, inset, 1, 1),
            (W - inset, inset, -1, 1),
            (inset, H - inset, 1, -1),
            (W - inset, H - inset, -1, -1),
        ):
            d.line([(cx, cy), (cx + sx * arm, cy)], fill=MARK, width=wd)
            d.line([(cx, cy), (cx, cy + sy * arm)], fill=MARK, width=wd)
        # 四边中点的套准十字（印刷机对版用的）
        cross, gap = 26, 7
        for (cx, cy) in ((W // 2, 26), (W // 2, H - 26), (26, H // 2), (W - 26, H // 2)):
            d.line([(cx - cross, cy), (cx - gap, cy)], fill=MARK, width=2)
            d.line([(cx + gap, cy), (cx + cross, cy)], fill=MARK, width=2)
            d.line([(cx, cy - cross), (cx, cy - gap)], fill=MARK, width=2)
            d.line([(cx, cy + gap), (cx, cy + cross)], fill=MARK, width=2)

    overlay(img, marks)

    # 底部四色色标：方块之间留白，最后一格是纸白（用来对"纸本身"的色）
    chip = 54
    cy0 = H - 102
    for i, color in enumerate(CHIP_COLORS):
        cx0 = 96 + i * (chip + 20)
        ImageDraw.Draw(img).rectangle([cx0, cy0, cx0 + chip, cy0 + chip], fill=color + (255,))
        ImageDraw.Draw(img).rectangle([cx0, cy0, cx0 + chip, cy0 + chip], outline=(120, 118, 114, 160), width=1)

    paste_text(img, (96, 66), "FRETROCAM · PROCESS C-41 · 135", size=26, tracking=7, ink=(132, 129, 124), wear=0.18, seed=91)

    deboss(img, window, width=2, light=(255, 255, 255, 70), dark=(0, 0, 0, 34))
    punch(img, window)

    save(img, "crop-marks")
    print_window("crop-marks", (W, H), window)


# --------------------------------------------------------------------------- #
# 8. archive-card —— 牛皮档案卡（新）
# --------------------------------------------------------------------------- #
def make_archive_card() -> None:
    """牛皮档案卡：左侧装订打孔 + 底部一道红线 + 打字机打的编号。

    打字机的"抖"是靠 `print_text(jitter=1)` 做的：等宽字如果基线笔直，
    看起来就是印刷；基线上下乱跳 1~2 像素，立刻变成色带打上去的。
    """
    W, H = 1350, 1800
    window = (300, 150, 960, 1280)
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), KRAFT, mottle=6.0, scale=48, fiber=1.6, seed=808)
    soft_edge(img, (0, 0, W, H), (150, 132, 96), alpha=46, width=62, blur=26)

    # 左侧三个装订孔（透明 → 露出黑底，像真打穿的）
    d = ImageDraw.Draw(img)
    for cy in (380, 700, 1020):
        d.ellipse([80, cy - 30, 140, cy + 30], fill=TRANSPARENT)

    x, y, w, h = window
    deboss(img, window, width=3, light=(255, 252, 240, 96), dark=(0, 0, 0, 64))
    punch(img, window)

    # 底部那道红线：档案卡用来分隔"标题区"和"填写区"的横线。
    # 整块文字留在 H-360 以上 —— 下面的 H-205~H-152 是日期水印的地盘。
    ImageDraw.Draw(img).rectangle([x, H - 360, x + w, H - 357], fill=KRAFT_RULE + (255,))

    paste_text(img, (x, H - 322), "FRETROCAM", size=44, tracking=6, ink=INK_TYPE, wear=0.22, seed=101, jitter=1)
    paste_text(img, (x, H - 250), "135 · C-41 · 36 EXP", size=28, tracking=7, ink=(112, 98, 74), wear=0.24, seed=103, jitter=1)
    # 右上角一个手填的编号框，留空 —— 空着比填上更像真档案
    ImageDraw.Draw(img).rectangle([x + w - 210, 46, x + w, 130], outline=(150, 132, 96, 200), width=3)

    save(img, "archive-card")
    print_window("archive-card", (W, H), window)


# --------------------------------------------------------------------------- #
BUILDERS = {
    "classic-white": make_classic_white,
    "instant-square": make_instant_square,
    "film-35mm": make_film_35mm,
    "darkroom": make_darkroom,
    "slide-mount": make_slide_mount,
    "orange-base": make_orange_base,
    "crop-marks": make_crop_marks,
    "archive-card": make_archive_card,
}


def main() -> None:
    os.makedirs(FRAMES_DIR, exist_ok=True)
    wanted = sys.argv[1:]
    names = [n for n in BUILDERS if not wanted or n in wanted]
    if not names:
        print(f"没有叫这些名字的相框：{' '.join(wanted)}")
        print(f"可选：{' '.join(BUILDERS)}")
        raise SystemExit(1)

    print("frames:")
    for name in names:
        BUILDERS[name]()
    print("done.")


if __name__ == "__main__":
    main()
