"""生成 FretroCam 的 App 图标（`assets/icon.png` + `assets/adaptive-icon.png`）。

用法（在项目根目录）：
    python scripts/generate_app_icon.py

产物**两个文件、同一张图**，都是 **1024 × 1024 / RGB / 无 alpha**：
  · `assets/icon.png`           —— `app.json` 的 `ios.icon` 指的就是它；
  · `assets/adaptive-icon.png`  —— Android 自适应图标那一位（当前 `app.json` 里
    `android` 段只有 `package`，没有 `adaptiveIcon` 键，所以它暂时不参与任何构建；
    用户明确要求一起产，那就一起产，规格和 iOS 那张完全一致）。

设计（2026-10 重绘，上一版"银色暗盒 + ISO 400 标带 + 六边形光圈"整个作废）：
  用户原话是**减法**：严禁电池柱、六边形螺母、小文字或任何有歧义的几何形状。
  所以这一版整张图**只有一条胶片齿孔**，光从孔里透出来 —— 全部信息量都压在
  "一个会发光的洞"这一件事上：

    1. 底板：哑光深炭黑金属 `#111113`，极轻微径向暗角 + 微弱 35mm 导轨线。
       它必须"哑"——所以只有低频不匀（和 `generate_frames.py` 的 `paper()`
       是同一套手法），没有逐像素噪点，也没有高光。
    2. 主体：正中央**一条 35mm 胶片齿孔**（340 × 480，圆角半径 76）。
       除了它，画面上没有任何其它形状。
    3. 透光：孔里是落日暖金 → 暗房焦糖红的竖直渐变
       （`#FFF3D6 → #FFA000 → #E64A19 → #240500`），孔外一圈极弱的暖色漫反射
       外发光，孔缘一道 **1.5 px** 的赛璐珞物理切边高光。
    4. **没有任何字母、数字、时间戳。** 上一版印了 `ISO 400`，这一版一个字都没有。

为什么要"画大再缩"：圆角矩形的边、1.5 px 的切边高光、渐变的硬边界，Pillow 的
`ImageDraw` 都是**不抗锯齿**的。直接按 1024 画，斜边和圆角上全是台阶。所以在
**4 倍画布（4096）上画完，再用 LANCZOS 缩回 1024** —— 缩这一步就是 4 × 4 的
盒式平均，等于把每条边都做了一次 16 重采样，台阶全部变成灰阶过渡。
`assets/ui/_icon-check.png` 是自查图：把成品缩到 40 / 60 px 再放大 12 倍并排看，
小尺寸下还认不认得出"一条齿孔透着落日色"，靠它一眼判断。
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SIZE = 1024  # 成品边长
SS = 4  # 超采样倍数
S = SIZE * SS  # 工作画布 4096

BG = (17, 17, 19)  # #111113 哑光深炭黑（比纯黑亮 2 度，否则像"没画东西"）
RAIL = (38, 38, 45)  # 35mm 导轨线：只比底板亮一点点，"微弱"是真的微弱
GLOW = (255, 150, 60)  # 外发光的颜色（暖橙，和渐变的中间段同族）

HOLE = (340, 480)  # 齿孔宽 × 高（1024 坐标系）
HOLE_RADIUS = 76  # 齿孔圆角半径（1024 坐标系）
CUT_EDGE = 1.5  # 赛璐珞切边高光的宽度 px（1024 坐标系）
RAIL_OFFSET = 220  # 导轨线离中轴的距离（1024 坐标系）

# 透光渐变的色标：(位置 0~1, RGB)。从落日暖金一路走到暗房焦糖红，
# 最后一段 #240500 几乎全黑 —— 那是"光在孔底沉下去"的地方，
# 有它，渐变才有"透"的感觉；没有它，整条孔就只是一块橙色贴纸。
GRADIENT = [
    (0.00, (255, 243, 214)),  # #FFF3D6 落日暖金
    (0.38, (255, 160, 0)),  # #FFA000
    (0.72, (230, 74, 25)),  # #E64A19 暗房焦糖红
    (1.00, (36, 5, 0)),  # #240500
]


def px(v: float) -> int:
    """1024 坐标系的长度 → 4096 工作画布的像素。"""
    return int(round(v * SS))


def load_font(size: int):
    """自查图上的标注字体（Pillow ≥ 10.1 才有 size 参数）。"""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover - 老 Pillow
        return ImageFont.load_default()


def hole_box() -> tuple[int, int, int, int]:
    """齿孔（圆角矩形）在 4096 画布上的外接矩形，**正中**（用户要求"正中央"）。"""
    w, h = px(HOLE[0]), px(HOLE[1])
    x0 = (S - w) // 2
    y0 = (S - h) // 2
    return x0, y0, x0 + w - 1, y0 + h - 1


def rounded_mask(box: tuple[int, int, int, int], radius: int) -> Image.Image:
    """圆角矩形掩码（L，255 = 打孔区）。硬边是故意的：抗锯齿交给最后那次 LANCZOS。"""
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(list(box), radius=radius, fill=255)
    return mask


def rot(box: tuple[int, int, int, int], d: int, radius: int) -> Image.Image:
    """圆角矩形掩码整体外扩（d > 0）或内缩（d < 0）d 个像素。"""
    x0, y0, x1, y1 = box
    return rounded_mask((x0 - d, y0 - d, x1 + d, y1 + d), max(1, radius + d))


def ramp(values: np.ndarray) -> Image.Image:
    """一列 0~255 的值 → 铺满整块画布的 L 图。

    ⚠️ 不能直接把 `(fade[:, None] * 255)` 那一列塞给 `ImageChops.multiply()`：
    新 Pillow 的 `ImageChops` 要求两张图**尺寸完全一致**，1 × 4096 对不上
    4096 × 4096，会直接 `ValueError: images do not match`。
    """
    column = np.clip(values, 0, 255).astype(np.uint8)[:, None]
    return Image.fromarray(np.repeat(column, S, axis=1), "L")


def metal_plate() -> Image.Image:
    """哑光深炭黑金属底板：低频不匀 + 极轻微径向暗角 + 顶部一点点受光。"""
    rng = np.random.default_rng(4001)
    cells = 14  # 低频格数：越小越"云状"。14 格放大到 4096，一格 ≈ 293 px，
    # 在 1024 上是 73 px 的大块 —— 读起来是"受光不匀的哑光面"，
    # 而不是"脏点"。格数一多就成了中频噪点：1024 下看得出斑、PNG 还压不动
    # （48 格 / 幅 2.2 时成品 211 KB，14 格 / 幅 1.2 时降到几十 KB）。
    low = np.asarray(
        Image.fromarray(
            rng.normal(0.0, 1.0, (cells, cells)).astype(np.float32), mode="F"
        ).resize((S, S), Image.BICUBIC),
        dtype=np.float32,
    )

    # 径向暗角：中心 1.0 → 四角约 0.86。用户要的是"**极**轻微"，
    # 所以只敢给 0.14：底板是要给中间那个发光的孔当背景的，
    # 暗角一深，观众的注意力就先跑到角上去了。
    # 用一维广播算，别 `np.mgrid` —— 4096² 上 mgrid 会先开出两个 int64 大数组。
    ax = (np.arange(S, dtype=np.float32) - S / 2.0) ** 2
    r = np.sqrt(ax[:, None] + ax[None, :]) / (S / 2 * np.sqrt(2))
    vignette = 1.0 - 0.14 * np.clip(r, 0.0, 1.0) ** 2.2

    base = np.empty((S, S, 3), dtype=np.float32)
    base[..., 0], base[..., 1], base[..., 2] = BG
    base += (low * 1.2)[..., None]  # 不匀只给 ±1 级：哑光面不该有"脏点"
    base += np.linspace(3.5, -1.5, S, dtype=np.float32)[:, None, None]  # 顶部受光
    base *= vignette[..., None]

    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def guide_rails() -> Image.Image:
    """两条微弱 35mm 导轨线（片仓两侧的导轨，齿孔贴着它走）。"""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)
    half = px(1.0) // 2 + 1
    for dx in (-px(RAIL_OFFSET), px(RAIL_OFFSET)):
        x = S // 2 + dx
        d.rectangle([x - half, 0, x + half, S - 1], fill=100)

    # 上下两端淡出：导轨线是"穿过画面"的，不该在图标边缘被切断成两条竖杠
    fade = np.ones(S, dtype=np.float32)
    tail = np.linspace(0.0, 1.0, px(120), dtype=np.float32)
    fade[: px(120)] = tail
    fade[-px(120) :] = tail[::-1]
    mask = ImageChops.multiply(mask, ramp(fade * 255.0))
    layer.paste(RAIL + (255,), (0, 0), mask)
    return layer


def light_column(box: tuple[int, int, int, int]) -> Image.Image:
    """孔里的透光：竖直渐变（用户给的四个色标）+ 一点点横向收边。

    渐变的 0~1 **铺在孔自己的高度上**，不是铺在整块画布上。孔只占画布中间
    47% 的高度，要是按画布归一化，孔顶只走到第一段的 70%（得到 `#FFB940`
    而不是 `#FFF3D6`）、孔底才刚过 `#E64A19`，最深的 `#240500` 永远露不出来
    —— 整条孔就成了一张橙色贴纸，没有"光"的感觉。横向收边同理，按画布宽度
    归一化的话孔两边只收到 0.97，等于没收。
    """
    x0, y0, x1, y1 = box
    fy0, fy1 = y0 / S, (y1 + 1) / S
    fx0, fx1 = x0 / S, (x1 + 1) / S

    ys = np.linspace(0.0, 1.0, S, dtype=np.float32)
    t = np.clip((ys - fy0) / (fy1 - fy0), 0.0, 1.0)
    stops = np.array([p for p, _ in GRADIENT], dtype=np.float32)
    colors = np.array([c for _, c in GRADIENT], dtype=np.float32)

    rows = np.zeros((S, 3), dtype=np.float32)
    for i in range(len(GRADIENT) - 1):
        m = (t >= stops[i]) & (t <= stops[i + 1])
        k = ((t[m] - stops[i]) / (stops[i + 1] - stops[i]))[:, None]
        rows[m] = colors[i] * (1.0 - k) + colors[i + 1] * k
    rows[t <= stops[0]] = colors[0]
    rows[t >= stops[-1]] = colors[-1]

    # 横向收边：真实透过开孔的光，两侧总比中间暗一档（孔壁挡掉一部分）。
    # 只收到 0.88，再多就成了"一根发光的圆柱"。
    xs = np.linspace(0.0, 1.0, S, dtype=np.float32)
    u = np.clip((xs - fx0) / (fx1 - fx0), 0.0, 1.0) * np.pi
    side = (0.88 + 0.12 * np.sin(u))[None, :, None]
    img = np.repeat(rows[:, None, :], S, axis=1)
    img *= side
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def glow(mask: Image.Image, radius: int, strength: float) -> Image.Image:
    """把齿孔掩码糊开当外发光用：`radius` 越大越"漫"，`strength` 越小越"弱"。"""
    blurred = mask.filter(ImageFilter.GaussianBlur(radius))
    layer = Image.new("RGBA", (S, S), GLOW + (0,))
    layer.putalpha(blurred.point(lambda v: int(v * strength)))
    return layer


def cut_edge(box: tuple[int, int, int, int], radius: int) -> Image.Image:
    """赛璐珞切边高光：一条 1.5 px 的亮环，压在孔的边界上（一半在里、一半在外）。

    亮度做成**上亮下暗**的：真实切边是塑料断面的镜面反射，光从上方来，
    上缘那一段必然比下缘亮。全环等亮会读成"描了个边"，就假了。
    """
    half = px(CUT_EDGE) // 2 + 1
    outer = rot(box, half, radius)
    inner = rot(box, -half, radius)
    ring = ImageChops.subtract(outer, inner)

    fade = np.linspace(1.0, 0.42, S, dtype=np.float32)
    ring = ImageChops.multiply(ring, ramp(fade * 255.0))
    layer = Image.new("RGBA", (S, S), (255, 246, 226, 0))
    layer.putalpha(ring)
    return layer


def build(size: int = SIZE, ss: int = SS) -> Image.Image:
    """画一张 size × size 的图标（内部按 ss 倍超采样）。"""
    global S, SS  # noqa: PLW0603 - 这个脚本是"一次性生成器"，全局画布尺寸就够用
    SS, S = ss, size * ss

    box = hole_box()
    radius = px(HOLE_RADIUS)
    hole = rounded_mask(box, radius)

    img = metal_plate()
    img = Image.alpha_composite(img, guide_rails())
    # 外发光两层：外层大而弱（漫反射），内层小而稍强（贴着孔缘的亮边）
    img = Image.alpha_composite(img, glow(hole, px(46), 0.26))
    img = Image.alpha_composite(img, glow(hole, px(13), 0.34))
    # 透光
    lit = light_column(box)
    lit.putalpha(hole)
    img = Image.alpha_composite(img, lit)
    # 切边高光
    img = Image.alpha_composite(img, cut_edge(box, radius))

    return img.convert("RGB").resize((size, size), Image.LANCZOS)


def save_icon(img: Image.Image, name: str) -> None:
    path = os.path.join(ROOT, "assets", name)
    img.save(path, "PNG", optimize=True)
    print(
        f"  -> assets/{name}  mode={img.mode} {img.size[0]}x{img.size[1]}  "
        f"bands={img.getbands()}  {os.path.getsize(path) / 1024:.1f} KB"
    )


def check_sheet(icon: Image.Image) -> None:
    """自查图：40 / 60 px 各放大 12 倍并排 —— 小尺寸下还认不认得出这张图。"""
    tiles = []
    for side in (40, 60):
        small = icon.resize((side, side), Image.LANCZOS)
        tiles.append((side, small.resize((side * 12, side * 12), Image.NEAREST)))

    pad, gap, cap = 40, 56, 52
    width = pad * 2 + sum(t.width for _, t in tiles) + gap
    height = pad * 2 + cap + max(t.height for _, t in tiles)
    sheet = Image.new("RGB", (width, height), (94, 94, 96))

    d = ImageDraw.Draw(sheet)
    f = load_font(30)
    x = pad
    for side, tile in tiles:
        d.text((x, pad + 8), f"{side}x{side}  x12 nearest", font=f, fill=(24, 24, 26))
        sheet.paste(tile, (x, pad + cap))
        d.rectangle(
            [x - 1, pad + cap - 1, x + tile.width, pad + cap + tile.height],
            outline=(24, 24, 26),
            width=1,
        )
        x += tile.width + gap

    out = os.path.join(ROOT, "assets", "ui", "_icon-check.png")
    sheet.save(out, "PNG", optimize=True)
    print(f"  -> assets/ui/_icon-check.png  {sheet.size[0]}x{sheet.size[1]}  ({out})")


def main() -> None:
    icon = build()
    print("app icon:")
    save_icon(icon, "icon.png")
    save_icon(icon, "adaptive-icon.png")
    check_sheet(icon)


if __name__ == "__main__":
    main()
