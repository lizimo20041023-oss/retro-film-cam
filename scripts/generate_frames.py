"""生成 FretroCam 的 4 张相框 PNG。

用法（在项目根目录）：
    python scripts/generate_frames.py            # 全部重画 + 校验镂空窗口
    python scripts/generate_frames.py neg-135    # 只重画一张（改一张不用等全部）

产物在 `assets/frames/`，脚本会打印每张的**归一化镂空窗口** —— 那组数字直接抄进
`src/constants/frames.ts` 就是新相框，核心逻辑一行都不用改；画完还会**回读 PNG
校验 alpha 包围盒**，窗口量错会当场报错，不会静默地把照片放歪。

设计原则（为什么不是"白色圆角 + 一行英文"那种常见滤镜框）：
  1. **每张都对应一种真实的物理产物**，而不是一种"滤镜风格"：
     600 系即时成像、instax mini 片、35mm 负片条、50×50 幻灯装裱卡。
     每张的**全部尺寸都从真实毫米数换算**（见各 builder 的注释），
     所以画幅比、留白比例、开孔位置都不是"看着好看"调出来的。
  2. **留白不说话。** 真实的相纸上什么都不会印；字只在真的承载信息的
     地方出现 —— 片边的帧号 / 冲洗工艺代号、卡纸上的规格线。
     上一版每张底下都印一行 `RT-400 · 36 EXP · C-41`，那是滤镜的语言。
  3. **纸要像纸，但不能"脏"。** 只加**低频不匀**（`paper()` 的 mottle/scale），
     不加逐像素噪点、不加污渍斑点：逐像素噪点在成片里会被当成"照片本身的
     颗粒"，而污渍是做旧 —— 真相纸出厂是干净的，旧是**时间和使用**留下的，
     不是印刷时喷上去的。

注意：本脚本**只画相框**。颗粒/暗角/漏光那些纹理在
`scripts/generate_placeholder_assets.py` 里，两者互不影响。
"""

from __future__ import annotations

import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")

TRANSPARENT = (0, 0, 0, 0)
# 调色板里专门留给"透明"的那一号槽（见 `save()`）
TRANSPARENT_INDEX = 255

# --------------------------------------------------------------------------- #
# 镂空窗口表 —— **唯一的真相**，四个 builder 和末尾的校验都用这一份。
# 单位是像素，值是 (x, y, w, h)，必须和 `src/constants/frames.ts` 里的
# `window` 完全一致（那边是这四个数除以画布尺寸）。
# --------------------------------------------------------------------------- #
WINDOW_POLAROID_600 = (72, 72, 1264, 1264)
WINDOW_INSTAX_MINI = (81, 90, 918, 1224)
WINDOW_NEG_135 = (212, 280, 926, 1389)
WINDOW_SLIDE_MOUNT = (189, 351, 972, 648)

# --------------------------------------------------------------------------- #
# 调色板：4 张相框所有用色都在这里，想统一换风格改这一段就够。
# 颜色数量要克制 —— `save()` 会把整张图量化到 256 色，颜色一多，
# 相近的纸色就会被合并成同一格，纸纹先糊掉。
# --------------------------------------------------------------------------- #
PAPER_INSTANT = (250, 249, 245)  # 600 系即时成像相纸（暖白，比纯白低 2 度）
PAPER_MINI = (250, 250, 250)  # instax mini 片（冷白，比 600 系更冷更细）
CARD_IVORY = (233, 228, 217)  # 幻灯装裱卡纸（象牙白，偏暖）
CARD_WEAVE = (223, 218, 205)  # 卡纸的哑光织纹（压深一点点）
CARD_SHADE = (199, 193, 180)  # 开孔内壁的暗面（露出的纸板厚度）
CARD_LIGHT = (255, 254, 250)  # 开孔倒角的受光面

FILM_BASE = (22, 23, 26)  # 35mm 片基（近黑，带一点蓝）
FILM_EDGE = (9, 10, 12)  # 片基最外圈（裁切边比片基本体更黑）
FILM_PERF = (28, 29, 33)  # 齿孔带底色（乳剂面比片基略亮，摸得出来）

INK_REBATE = (206, 158, 74)  # 片边代号那种偏琥珀的印刷色（真边码是橙黄）
INK_DIM = (150, 152, 158)  # 片边上的次级代号（比边码灰，几乎融进片基）
INK_CARD = (150, 146, 136)  # 印在卡纸上的规格字（印刷灰，不是黑）

# --------------------------------------------------------------------------- #
# 真实规格（毫米）→ 本脚本所有像素尺寸都由它们换算
# --------------------------------------------------------------------------- #
MM_135 = 38.625  # neg-135 的比例尺：1350px / 35mm 片宽

# 开孔/齿孔的几何参数。builder 画它们、`expected_transparent()` 复算它们 ——
# 两边必须引用同一份常量，否则审计就成了"自己校验自己"。
RADIUS_INSTAX = 6  # instax mini 画面区的圆角（真片是热压成型的圆角）
PERF_HOLE = (108, 76)  # 齿孔 2.8 × 1.98 mm × 38.625 px/mm
PERF_RADIUS = 22  # 齿孔圆角（真齿孔四角是圆的）
PERF_PITCH = 183.0  # 孔距 4.75 mm × 38.625
PERF_CENTER_X = 108  # 孔心到片边的距离（见 `make_neg_135()` 的取舍说明）


# --------------------------------------------------------------------------- #
# 通用工具
# --------------------------------------------------------------------------- #
def font(size: int):
    """Pillow >= 10.1 支持 load_default(size=...)，老版本回退到默认位图字体。"""
    try:
        from PIL import ImageFont

        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - 老 Pillow
        from PIL import ImageFont

        return ImageFont.load_default()


def save(img: Image.Image, name: str) -> None:
    """存盘。**必须量化**，而且 alpha 必须**自己接管**。

    为什么要量化：直接存 RGBA 的 PNG，一张 1350×1950 的纸纹要 **450 KB**
    （纸面上每个像素的色值都略有不同，PNG 的行滤波器完全预测不动）。
    转成 256 色调色板之后，同样的画面只要 **11 KB**（42 倍），因为大片
    "看起来一样"的色值现在真的是同一个索引值，能整行整行地压。

    为什么不能直接 `img.quantize()` 交差（实测踩过的第二个坑）：
    `FASTOCTREE` 建调色板时**按簇平均 alpha**。窗口里那些"RGB 还是纸色、
    alpha 已经被挖成 0"的像素，和纸面在 RGBA 空间里只差 alpha 这一维，
    于是被并进同一个调色板槽，纸面的 alpha 被平均成 **254**（instax-mini
    实测 729705 个像素），幻灯卡的斜切边更惨，直接掉到 **150**。
    后果：照片以 1/255 的强度透出来（肉眼看不见，但"相框不漏照片"这件事
    不该有例外），斜切边上则是明显的一圈鬼影。

    做法：alpha 先二值化，不透明部分只占 255 个色，**第 256 号槽专门留给
    "透明"**，并把 `transparency` 显式写成 255。这样每个槽要么全透、
    要么全不透，量化器的平均再也影响不到 alpha —— 而且 PNG 的调色板模式
    本来就只有"一个透明索引"，二值 alpha 才是这个格式的母语。
    """
    path = os.path.join(FRAMES_DIR, name + ".png")
    alpha = img.getchannel("A").point(lambda v: 255 if v > 0 else 0)
    body = img.convert("RGB").quantize(
        colors=255, method=Image.FASTOCTREE, dither=Image.Dither.NONE
    )
    out = Image.new("P", img.size, TRANSPARENT_INDEX)
    out.putpalette(body.getpalette()[: 255 * 3] + [0, 0, 0])
    out.paste(body, (0, 0))
    # 透明的那些像素，索引一律改写成保留槽；其余像素保持量化结果（= 全不透）
    out.paste(TRANSPARENT_INDEX, (0, 0), ImageChops.invert(alpha))
    out.info["transparency"] = TRANSPARENT_INDEX
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
    fiber   逐像素细颗粒的振幅。**本版基本不用**：逐像素噪点在成片尺寸下
            会被读成"照片本身的颗粒"而不是"纸"，所以四张纸面一律只留低频。
            只在"真的粗糙"的材质上给极小值（卡纸织纹）。

    实现上只生成 `w/scale × h/scale` 的随机场再做 BICUBIC 放大 ——
    放大这一步就是低通滤波，出来的必然是"云状"而不是"颗粒"。
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
    """把窗口挖成**完全**透明（直角）。window = (x, y, w, h)。

    ⚠️ 坑（实测踩过）：`ImageDraw` 往 RGBA 上画 `fill=(0,0,0,0)` 时，只有
    **完全落在矩形内部的像素**会被写成 alpha=0，贴着边界的那些像素留下
    上一层合成时的 alpha（这里是 254）。结果"透明窗口"里其实躺着一圈
    alpha≈254 的像素 —— `getbbox()` 因此返回整块画布，合成时窗口边缘也
    不是干净的照片。正确做法是**把 alpha 通道乘掉**（0 × 任何 = 0），
    这样边界像素也一起归零。
    """
    x, y, w, h = window
    mask = Image.new("L", img.size, 255)
    ImageDraw.Draw(mask).rectangle([x, y, x + w - 1, y + h - 1], fill=0)
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))


def punch_rounded(
    img: Image.Image, window: tuple[int, int, int, int], radius: int = 6
) -> None:
    """把窗口挖成完全透明，**四角带圆角**。

    为什么是"挖圆角"而不是"在照片上盖四个圆角"：
      相框 PNG 是盖在照片**之上**的一层，窗口那块是透明的。想在视觉上做出
      "照片四角是圆的"，要么把照片裁圆（做不到，照片是另一层），要么就是
      这一招 —— 让相框的洞本身在四角多啃掉一点，露出的就是合成舞台的底色。
      对 6 px 的半径来说，四角啃掉的那点面积小到看不出来，但照片的方角
      确实被吃掉了，"圆角"就成立了。

    圆角只**往窗口里面**啃，绝不向外扩：洞一旦比 window 大，多出来的像素
    就会露出黑底（"黑边上有白牙"）。四角啃完，alpha 包围盒仍然是精确的
    window —— 左上角那一点 (x, y) 还在（圆角切的是它的外侧对角），
    所以 `getbbox()` 校验照样能过。
    """
    x, y, w, h = window
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [x, y, x + w - 1, y + h - 1], radius=radius, fill=255
    )
    # mask=255 的地方**不能**要 → 取反：把圆角窗整块打掉
    keep = ImageChops.invert(mask)
    img.putalpha(ImageChops.multiply(img.getchannel("A"), keep))


def round_corners(img: Image.Image, radius: int) -> None:
    """整张画布切圆角（幻灯卡那种切角卡纸用）。"""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255
    )
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))


def deboss(
    img: Image.Image,
    window: tuple[int, int, int, int],
    width: int = 3,
    light: tuple[int, int, int, int] = (255, 255, 255, 78),
    dark: tuple[int, int, int, int] = (0, 0, 0, 58),
    gap: int = 0,
) -> None:
    """窗口四周的压痕：左上受光偏亮、右下背光偏暗（默认光从左上打来）。

    这一圈比描边重要得多 —— 描边只是"画了个框"，压痕才让窗口看起来是
    "纸被压下去了一块、照片嵌在里面"。`gap` 是压痕离窗口的像素距离，
    给"开孔周边留了一圈纸白"的材质（幻灯卡）用。
    """
    x, y, w, h = window

    def draw(d: ImageDraw.ImageDraw) -> None:
        d.line(
            [(x - gap - width, y - gap - width), (x + w + gap + width, y - gap - width)],
            fill=light,
            width=width,
        )
        d.line(
            [(x - gap - width, y - gap - width), (x - gap - width, y + h + gap + width)],
            fill=light,
            width=width,
        )
        d.line(
            [(x - gap - width, y + h + gap + width), (x + w + gap + width, y + h + gap + width)],
            fill=dark,
            width=width,
        )
        d.line(
            [(x + w + gap + width, y - gap - width), (x + w + gap + width, y + h + gap + width)],
            fill=dark,
            width=width,
        )

    overlay(img, draw)


def print_text(
    text: str,
    size: int,
    tracking: int,
    ink: tuple[int, int, int],
    wear: float = 0.0,
    seed: int = 7,
    jitter: int = 0,
) -> Image.Image:
    """排一行"印刷"字：等宽字距 + 可选磨损 + 可选基线抖动。

    为什么要自己排而不是 `d.text()`：
      · 默认字体没有"细体"字重，想做出"字重变轻"只能靠
        **缩小字号 + 拉开字距 + 降低墨色对比度**三招组合；
      · `tracking`（字距）必须逐字排版才能控制；
      · `jitter` 让每个字的基线上下乱跳 —— 这是"打字机"的关键。

    ⚠️ `wear` 在本版**基本给 0**：磨损是随机啃掉笔画，小字号下会把字直接
    啃没（上一版最小的字就是这么糊掉的）。真片边的边码是印得清楚的，
    这里只保留这个能力，不再默认开着。

    返回 RGBA 图层，调用方 `img.alpha_composite(layer, (x, y))` 贴上去。
    """
    import random

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
    wear: float = 0.0,
    seed: int = 7,
    jitter: int = 0,
) -> None:
    """`print_text` 的糖：直接贴到相框上。"""
    img.alpha_composite(print_text(text, size, tracking, ink, wear, seed, jitter), xy)


def text_width(text: str, size: int, tracking: int) -> int:
    f = font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    return int(
        sum(probe.textlength(ch, font=f) for ch in text)
        + tracking * max(0, len(text) - 1)
    )


def perf_boxes(
    size: tuple[int, int],
    centers_x: tuple[int, ...],
    hole: tuple[int, int] = (108, 76),
    top_margin: int = 0,
    bottom_margin: int = 0,
    pitch: float = 183.0,
) -> list[tuple[int, int, int, int]]:
    """只算齿孔几何，不画。`perf_holes()` 画它，`audit()` 用它复算期望的洞。"""
    W, H = size
    hw, hh = hole[0] / 2.0, hole[1] / 2.0

    if top_margin == 0 and bottom_margin == 0:
        top_margin = bottom_margin = 56

    usable = H - top_margin - bottom_margin
    count = max(1, int(math.floor((usable - hole[1]) / pitch)) + 1)
    span = (count - 1) * pitch + hole[1]
    y0 = top_margin + (usable - span) / 2.0 + hh

    boxes: list[tuple[int, int, int, int]] = []
    for i in range(count):
        cy = y0 + i * pitch
        for cx in centers_x:
            boxes.append((int(cx - hw), int(round(cy - hh)), hole[0], hole[1]))
    return boxes


def perf_holes(
    img: Image.Image,
    size: tuple[int, int],
    centers_x: tuple[int, ...],
    hole: tuple[int, int] = (108, 76),
    radius: int = 22,
    top_margin: int = 0,
    bottom_margin: int = 0,
    pitch: float = 183.0,
) -> list[tuple[int, int, int, int]]:
    """沿两侧打一排**透明**的圆角齿孔，返回每格的 (x, y, w, h) 供审计。

    透明（而不是画成浅灰）是有意的：合成舞台的底色是纯黑，
    洞透过去就是黑，和真齿孔看过去一模一样；画成灰色反而像印上去的。

    几何按 135mm 片标准换算（本脚本的比例尺 38.625 px/mm）：
      孔 2.8 × 1.98 mm → 108 × 76 px
      孔距 4.75 mm      → 183 px
      孔带宽 5.5 mm     → 212 px（= 两侧留白的宽度，孔正好居中）
    齿孔排**纵向居中**而不是从 y=0 起排：真片条的齿孔是连续冲的，
    居中能让上下两端留下的片头/片尾宽度基本相等，不会一边被切掉半格。
    """
    # 和 `punch()` 同一个坑：齿孔也必须靠**乘 alpha** 挖掉，
    # 直接画 fill=(0,0,0,0) 会在孔的内缘留下一圈 alpha=254 的像素。
    mask = Image.new("L", size, 255)
    md = ImageDraw.Draw(mask)
    boxes = perf_boxes(size, centers_x, hole, top_margin, bottom_margin, pitch)
    hw, hh = hole[0] / 2.0, hole[1] / 2.0
    for bx, by, bw, bh in boxes:
        md.rounded_rectangle(
            [bx, by, bx + bw - 1, by + bh - 1], radius=radius, fill=0
        )
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return boxes


# --------------------------------------------------------------------------- #
# 1. polaroid-600 —— 600 系一次成像
# --------------------------------------------------------------------------- #
def make_polaroid_600() -> None:
    """600 系即时成像：**三边等宽 + 厚下巴**，纸面绝对干净。

    尺寸全部照真实规格：外框 88 × 107 mm，画面 79 × 79 mm
    （79 = 88 - 3 × 3，即上/左/右三边各 3 mm，下巴 107 - 3 - 79 = 25 mm）。
    这里是 1408 × 1712 px，比例尺 16 px/mm：
      四周留白 3 mm = 48 px？—— 不是，画面区按 `frames.ts` 钉死的 1264 × 1264
      （79 mm × 16 px/mm = 1264 px），所以三边留白 = (1408 - 1264) / 2 = 72 px，
      下巴 = 1712 - 72 - 1264 = 376 px。两者自洽，这就是"头轻脚重"的来源。

    **通篇无字、无污渍、无做旧**：下巴那片空白是留给用户用圆珠笔写字的，
    印任何东西都会把它变成滤镜。唯一的"材质"是极低频的纸面不匀
    （mottle=2.2 / scale=48）—— 不匀要大到像"纸的匀度"，小到看不出斑点。
    """
    W, H = 1408, 1712
    window = WINDOW_POLAROID_600
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), PAPER_INSTANT, mottle=2.2, scale=48, seed=6001)

    # 窗口压痕：真片是"药膜面朝下压进片仓"的，边缘有一道很浅的台阶。
    # 只给最窄的一圈、最低的对比 —— 多了就是"画了个框"。
    deboss(img, window, width=3, light=(255, 255, 255, 64), dark=(0, 0, 0, 40))
    punch(img, window)

    save(img, "polaroid-600")
    print_window("polaroid-600", (W, H), window)


# --------------------------------------------------------------------------- #
# 2. instax-mini —— instax mini 片
# --------------------------------------------------------------------------- #
def make_instax_mini() -> None:
    """instax mini：54 × 86 mm 外框、画面 46 × 62 mm（3:4 竖）、下巴 406 px。

    比例尺 18 px/mm：画面 46 × 18 = 828？—— 不对。真实 mini 的画面是
    46 × 62 mm，但 `frames.ts` 钉死的是 918 × 1224 px（= 3:4 严格）。
    918 / 1224 = 0.75，和 46 / 62 = 0.742 差一点，取的是"规格标称 3:4"。
    留白按钉死值反推：两侧 (1080 - 918) / 2 = 81 px，上 90 px，
    下巴 1720 - 90 - 1224 = 406 px。

    和 600 系的两点区别就是它的"产品身份"：
      · 纸更冷更细 —— 600 系暖白 (250,249,245)，mini 冷白 (250,250,250)，
        且不匀幅度更小（真 mini 片的涂层比宝丽来细腻得多）；
      · 画面区 6 px 圆角 —— 见 `punch_rounded()` 的注释，是把洞挖圆，
        不是在照片上盖东西。
    """
    W, H = 1080, 1720
    window = WINDOW_INSTAX_MINI
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    paper(img, (0, 0, W, H), PAPER_MINI, mottle=1.5, scale=44, seed=6101)

    deboss(img, window, width=2, light=(255, 255, 255, 56), dark=(0, 0, 0, 34))
    punch_rounded(img, window, radius=RADIUS_INSTAX)

    save(img, "instax-mini")
    print_window("instax-mini", (W, H), window)


# --------------------------------------------------------------------------- #
# 3. neg-135 —— 真实的 35mm 负片条
# --------------------------------------------------------------------------- #
def make_neg_135() -> None:
    """35mm 负片条：**一格竖拍底片** + 两侧真齿孔 + 片边代号。

    比例尺 MM_135 = 1350 / 35 ≈ 38.625 px/mm，1350 × 1950 的画布正好是
    35 × 50.5 mm —— 一条裁下来的片段的合理尺寸。所有数字都从毫米来：
      画面 24 × 36 mm 竖放      → 926 × 1389 px（927 取整到 926 对齐 window）
      上留白 280 px / 下留白 281 px（合计 50.5mm 里画面外的那部分）
      齿孔 2.8 × 1.98 mm        → 108 × 76 px
      孔距 4.75 mm              → 183 px
      齿孔带 5.5 mm             → 212 px（= 两侧留白，孔在带内居中）

    片基是**纯黑**的：彩色负片的片基本来就偏黑（橙色 mask 只在冲洗后的
    药膜面显色，扫描时才被扣掉），所以这里不用上一版那种橙片基。
    片边上只印真片会印的东西：帧号（`▷ 12A` / `13 ▷`）和冲洗工艺 `C-41 135`。
    **没有尘土、划痕、斑块** —— 那些是"用过"的痕迹，不该由印刷机喷上去。
    """
    W, H = 1350, 1950
    window = WINDOW_NEG_135
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    # 片基：低频不匀给到 3.0（片基涂层确实不匀），但 scale 拉到 40 ——
    # 放大后是"云"，不是"颗粒"。全黑背景上一点颗粒都会被看成噪点。
    paper(img, (0, 0, W, H), FILM_BASE, mottle=3.0, scale=40, seed=6301)

    d = ImageDraw.Draw(img)
    # 裁切边（真片条的两条长边是切出来的，比片基本体更黑）
    d.rectangle([0, 0, W - 1, H - 1], outline=FILM_EDGE, width=10)
    # 两侧齿孔带：乳剂面比片基略亮一点，肉眼看是"这边没曝光"
    d.rectangle([0, 0, 211, H - 1], fill=FILM_PERF)
    d.rectangle([W - 212, 0, W - 1, H - 1], fill=FILM_PERF)

    x, y, w, h = window
    # 窗口一圈压痕：片基被放大机的片夹压过的台阶。
    # 宽度只给 3：给到 6 会整个跨过 212px 的齿孔带，在孔上压出一道灰线。
    d.rectangle([x - 3, y - 3, x + w + 2, y + h + 2], outline=(46, 48, 52, 255), width=3)
    punch(img, window)

    # 齿孔横向位置：孔中心取 x=108 / W-108。
    # 真标准里孔边距片边 2.794mm、孔宽 2.8mm，孔中心距片边 4.194mm ≈ 162px；
    # 但 162px 已经越过了 211px 齿孔带的中线，靠近画面一侧，看着"孔贴到画面上"了。
    # 取 108 是"孔正好落在齿孔带中线上"和"符合标准孔边距"之间最稳的折中：
    # 带内两端各留 54 / 50 px，视觉上孔是居中的。
    perf_holes(
        img,
        (W, H),
        (PERF_CENTER_X, W - PERF_CENTER_X),
        hole=PERF_HOLE,
        radius=PERF_RADIUS,
        pitch=PERF_PITCH,
    )

    # 上片边：帧号（琥珀，真边码就是印在齿孔带之间的橙黄小字）。
    # 位置必须在 window 之外 —— 相框是盖在照片之上的图层，
    # 落在窗口里的字会**烧进成片**。y=150 在 window.y=280 上方，安全。
    paste_text(img, (x + 12, 150), "> 12A", size=52, tracking=9, ink=INK_REBATE, seed=41)
    # 相机侧的片边代号（灰，几乎融进片基里）—— 真片两侧印的是不同信息
    paste_text(img, (x + 12, 1730), "C-41 135", size=48, tracking=8, ink=INK_DIM, seed=43)
    # 右下角：下一格的帧号，右对齐到窗口右缘
    lab = "13 >"
    paste_text(
        img,
        (x + w - 12 - text_width(lab, 52, 9), 1730),
        lab,
        size=52,
        tracking=9,
        ink=INK_REBATE,
        seed=47,
    )

    save(img, "neg-135")
    print_window("neg-135", (W, H), window)


# --------------------------------------------------------------------------- #
# 4. slide-mount —— 50×50mm 幻灯装裱卡
# --------------------------------------------------------------------------- #
def make_slide_mount() -> None:
    """幻灯装裱卡：50 × 50 mm 方形卡纸，中间开 36 × 24 mm 横孔，**居中**。

    比例尺 27 px/mm：50 mm × 27 = 1350 px 画布，开孔 36 × 24 mm → 972 × 648 px，
    居中后四边留白 (1350 - 972) / 2 = 189 px、(1350 - 648) / 2 = 351 px。

    这是四张里唯一的横向开孔 —— 真实的 35mm 幻灯框就是"方卡 + 横孔"，
    所以它在相册里天然和另外三张竖构图不一样，一眼能认出来。

    材质三件事，全部是"工艺的副产品"而不是装饰：
      · 哑光织纹：3 px 一格的极淡经纬网，只压深 10 级 —— 看得出"有纹"，
        看不出"有线"；
      · 开孔倒角：孔的上/左内缘受光发白、下/右内缘落在阴影里
        （卡纸有厚度，光从左上来），这是"孔是切出来的"唯一的证据；
      · 顶部一行 `SLIDE MOUNT` 规格印字 —— 真卡纸上印的就是这类小字，
        也是本张**唯一**的印刷内容。不打孔、无红线、无编号、无污渍。

    底部 351 px 是**日期水印的地盘**（`frames.ts` 里 anchor='frame'），
    所以那一片刻意留空。
    """
    W, H = 1350, 1350
    window = WINDOW_SLIDE_MOUNT
    img = Image.new("RGBA", (W, H), TRANSPARENT)

    # 卡纸：mottle 2.0 / scale 56，比两张即时成像更低频（卡纸比相纸细）
    paper(img, (0, 0, W, H), CARD_IVORY, mottle=2.0, scale=56, seed=6401)

    # 哑光织纹：3 px 一格的经纬网。α 只给 26 —— 叠出来比底色深约 4 级，
    # 量化之后仍然留在同一格调色板里，但近距离能看出"这不是塑料"。
    def weave(d: ImageDraw.ImageDraw) -> None:
        fa = (CARD_WEAVE[0], CARD_WEAVE[1], CARD_WEAVE[2], 26)
        for gx in range(0, W, 3):
            d.line([(gx, 0), (gx, H)], fill=fa, width=1)
        for gy in range(0, H, 3):
            d.line([(0, gy), (W, gy)], fill=fa, width=1)

    overlay(img, weave)

    x, y, w, h = window
    # 开孔倒角：先在外缘补受光面，再在窗口下/右压阴影 —— 顺序不能反
    deboss(img, window, width=3, gap=2, light=(255, 254, 250, 116), dark=(0, 0, 0, 92))

    # 倒角外侧再压一道更宽的软阴影（开孔比纸面厚，光打下去有一圈过渡）。
    # ⚠️ 必须走 `overlay()`：直接 `ImageDraw` 画 RGBA 是**覆盖**不是混合，
    # 会把这一带的 alpha 一起写成 150 —— 照片从这圈线里透出来。
    def aperture_shade(d: ImageDraw.ImageDraw) -> None:
        fa = CARD_SHADE + (150,)
        d.line([(x - 5, y + h + 5), (x + w + 5, y + h + 5)], fill=fa, width=3)
        d.line([(x + w + 5, y - 5), (x + w + 5, y + h + 5)], fill=fa, width=3)

    overlay(img, aperture_shade)
    punch(img, window)

    # 顶部规格印字：本张唯一的印刷内容，小、灰、贴左对齐到开孔左缘。
    paste_text(img, (x + 2, 96), "SLIDE MOUNT", size=46, tracking=22, ink=INK_CARD, seed=71)

    save(img, "slide-mount")
    print_window("slide-mount", (W, H), window)


# --------------------------------------------------------------------------- #
BUILDERS = {
    "polaroid-600": make_polaroid_600,
    "instax-mini": make_instax_mini,
    "neg-135": make_neg_135,
    "slide-mount": make_slide_mount,
}

# 每张相框的窗口"自审"表：名字 → (画布尺寸, 期望窗口, 窗口内是否允许有字)
EXPECTED: dict[str, tuple[tuple[int, int], tuple[int, int, int, int]]] = {
    "polaroid-600": ((1408, 1712), WINDOW_POLAROID_600),
    "instax-mini": ((1080, 1720), WINDOW_INSTAX_MINI),
    "neg-135": ((1350, 1950), WINDOW_NEG_135),
    "slide-mount": ((1350, 1350), WINDOW_SLIDE_MOUNT),
}


def expected_transparent(name: str) -> Image.Image:
    """按常量**独立复算**"应该透明"的区域（L 掩码，255 = 透明）。

    它不调用任何 builder，只用 `frames.ts` 钉死的窗口常量重新画一遍洞。
    builder 和审计都从同一组常量出发，任何一方把窗口写错（哪怕 1 px）
    都会立刻对不上 —— 这正是这道检查的意义。
    """
    size, window = EXPECTED[name]
    x, y, w, h = window
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    if name == "instax-mini":
        d.rounded_rectangle(
            [x, y, x + w - 1, y + h - 1], radius=RADIUS_INSTAX, fill=255
        )
    else:
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
    if name == "neg-135":
        W = size[0]
        for bx, by, bw, bh in perf_boxes(
            size, (PERF_CENTER_X, W - PERF_CENTER_X), PERF_HOLE, pitch=PERF_PITCH
        ):
            d.rounded_rectangle(
                [bx, by, bx + bw - 1, by + bh - 1], radius=PERF_RADIUS, fill=255
            )
    return mask


def audit(names: list[str]) -> bool:
    """回读 PNG 自审：**透明区域的每一个像素**都要和复算的掩码逐点相等。

    这是整个脚本**最重要的一道检查**：窗口就是照片在相框里的位置，
    差 1 px 就意味着用户拍的每一张照片都错位 1 px，而且肉眼看不出来。

    为什么不写 `getbbox() == 窗口`：本脚本的四张相框，纸面/片基一直铺到画布
    边缘，所以"非零 alpha"的包围盒必然是整张画布 —— 这个等式在这里
    恒不成立，写出来只是一条永远为假的校验。真正等价、而且更严的写法是
    把**透明区**（alpha<255）的掩码和复算掩码逐点比对，再把三件事钉死：
      · 窗口内一个非零 alpha 都没有（有字落进画面会被烧进成片）；
      · 窗口外一个透明像素都没有（洞比窗口大就会露出合成舞台的黑底）；
      · **alpha 只有 0 和 255**（有任何中间值都意味着照片会以那个强度透出来，
        见 `save()` 里量化器平均 alpha 的坑）。
    返回 True 表示全部通过。
    """
    import numpy as np

    print("audit:")
    ok = True
    for name in names:
        size, window = EXPECTED[name]
        path = os.path.join(FRAMES_DIR, name + ".png")
        im = Image.open(path)
        rgba = im.convert("RGBA")
        alpha = np.asarray(rgba.getchannel("A"))

        # 1) 画布尺寸
        size_ok = im.size == size
        # 2) alpha 是否二值
        partial = int(((alpha > 0) & (alpha < 255)).sum())
        # 3) 透明区逐点比对
        actual = alpha == 0
        want = np.asarray(expected_transparent(name)) > 0
        wrong = int((actual != want).sum())
        # 洞是不是比窗口大 / 窗口里是不是混进了东西
        leak_out = int((actual & ~want).sum())
        blocked = int((want & ~actual).sum())
        # 报告用：透明区包围盒（含齿孔）和窗口包围盒
        wbox = ImageOps.invert(rgba.getchannel("A")).getbbox()
        exp_w = (window[0], window[1], window[0] + window[2], window[1] + window[3])
        exp_box = np.asarray(expected_transparent(name)).nonzero()
        exp_bbox = (
            int(exp_box[1].min()),
            int(exp_box[0].min()),
            int(exp_box[1].max()) + 1,
            int(exp_box[0].max()) + 1,
        )

        good = size_ok and partial == 0 and wrong == 0
        ok = ok and good
        print(
            f"  {'OK  ' if good else 'FAIL'} {name}.png  size={im.size} "
            f"(期望 {size})  模式={im.mode}\n"
            f"       窗口 = {exp_w}  透明区包围盒 = {wbox}"
            f"{'（含齿孔）' if name == 'neg-135' else ''}\n"
            f"       期望透明区包围盒 = {exp_bbox}  "
            f"逐点不符 = {wrong} px  半透明像素 = {partial} px"
        )
        if leak_out:
            ok = False
            print(f"       FAIL 窗口外有 {leak_out} px 是透明的 —— 洞比窗口大，会露黑底")
        if blocked:
            ok = False
            print(f"       FAIL 窗口内有 {blocked} px 没有透明 —— 有东西盖住了照片")
        if not size_ok:
            ok = False
            print(f"       FAIL 画布尺寸不对，照片会整体错位")
        if partial:
            ok = False
            print(f"       FAIL 有非二值 alpha —— 照片会以这个强度透出来")
    return ok


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
    if not audit(names):
        raise SystemExit(1)
    print("done.")


if __name__ == "__main__":
    main()
