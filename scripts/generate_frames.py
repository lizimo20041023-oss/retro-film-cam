"""生成 FretroCam 的相框 PNG（4 款竖版 + 4 款横版 + 3 款新增 = 11 个文件）。

用法（在项目根目录）：
    python scripts/generate_frames.py            # 全部重画 + 校验镂空窗口
    python scripts/generate_frames.py neg-135    # 只重画一张（改一张不用等全部）

产物在 `assets/frames/`，脚本会打印每张的**归一化镂空窗口** —— 那组数字直接抄进
`src/constants/frames.ts` 就是新相框，核心逻辑一行都不用改；画完还会**回读 PNG
校验 alpha 包围盒**，窗口量错会当场报错，不会静默地把照片放歪。

文件名约定：`<id>.png` 是竖版，`<id>-landscape.png` 是横版（宽高对调、窗口跟着转，
`frames.ts` 里挂在同一条目的 `landscape.source` 下）。

设计原则（为什么不是"白色圆角 + 一行英文"那种常见滤镜框）：
  1. **每张都对应一种真实的物理产物**，而不是一种"滤镜风格"：
     600 系即时成像、instax mini 片、35mm 负片条、50×50 幻灯装裱卡、
     FP-100C 撕拉片、半格双联卡、8×10 散页。
     每张的**全部尺寸都从真实毫米数换算**（见各 builder 的注释），
     所以画幅比、留白比例、开孔位置都不是"看着好看"调出来的。
  2. **留白不说话。** 真实的相纸上什么都不会印；字只在真的承载信息的
     地方出现 —— 片边的帧号 / 冲洗工艺代号、卡纸上的规格线。
     上一版每张底下都印一行 `RT-400 · 36 EXP · C-41`，那是滤镜的语言。
  3. **纸要像纸，但不能"脏"。** 质感只用两种东西，都是材料本身的属性：
     · `paper()` 的**低频不匀**（mottle/scale）—— 纸浆匀度的起伏，云状不是颗粒；
     · `fiber` 的**棉浆纤维**—— 3% 上下的极淡经纬丝（见 `paper()` 的 fiber 说明）。
     **没有污渍、斑点、水痕、撕裂边、泛黄渐变**：那些是"旧"，是时间和使用留下的，
     不是印刷机喷上去的。唯一的例外是 `fp100c` 的显影药水痕 —— 它有明确的物理
     来源（撕拉片的药水包在显影时被挤到相纸边缘），且**只贴着一圈纸边**，不是满纸
     做旧，见 `chem_edge()`。

注意：本脚本**只画相框**。颗粒/暗角/漏光那些纹理在
`scripts/generate_placeholder_assets.py` 里，两者互不影响。
"""

from __future__ import annotations

import hashlib
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
# 镂空窗口表 —— **唯一的真相**，所有 builder 和末尾的校验都用这一份。
# 单位是像素，值是 (x, y, w, h)，必须和 `src/constants/frames.ts` 里的
# `window` 完全一致（那边是这四个数除以画布尺寸）。
#
# 横版的窗口由 `landscape()` 从下面这些竖版值**算**出来（(H-y-h, x, h, w)），
# 不单独写一份常量 —— 同一款纸的两个方向必须来自同一个数，否则改一个漏一个。
# --------------------------------------------------------------------------- #
WINDOW_POLAROID_600 = (72, 72, 1264, 1264)
WINDOW_INSTAX_MINI = (81, 90, 918, 1224)
WINDOW_NEG_135 = (212, 280, 926, 1389)
# 幻灯卡的开孔**不是居中的**：用户要求"高度居中偏下"，取上留白 = 1.35 × 下留白。
# 本轮把开孔从 972 放大到 **993**（用户要求开孔宽度落到画布宽的 72%~75% 且保住 3:2）：
#   993 / 1350 = 73.556%（区间中位 ≈73.5%，并保留 178 px 的左右对称白边）
#   993 / 662  = 1.501511（离 3:2 的 1.5 只差 +0.0015，肉眼与几何上都是 3:2）
#   备选 990 × 660 虽然精确等于 1.5，但只到 73.333%、离中位更远，反而不如这一组平衡。
# 左右留白 (1350 - 993) / 2 = 178.5 → 取 x = 178（左 178 / 右 179，差 1 px 无法再分）。
# 上下仍按 1.35 : 1 劈开：可用高度 1350 - 662 = 688，取 y = 403（上 403 / 下 285）。
WINDOW_SLIDE_MOUNT = (178, 403, 993, 662)
# FP-100C 撕拉片：画面 73 × 55.6 mm —— 上一代撕拉片的片幅标称就是"接近 3:2 的横画幅"，
# 这里取**精确 3:2**的 1008 × 672（用户明确要求新增款优先保住整数比）。
# 留白按"宽大卡纸"给：左右各 36 px（照片几乎顶到纸边，撕拉片就是这个样），
# 上 48 px，下巴 1416 - 48 - 672 = 696 px —— 那片宽下巴是药水包被撕下来的地方，
# 也是 `chem_edge()` 画显影药水痕的地方。
WINDOW_FP100C = (36, 48, 1008, 672)
# 半格双联框：两个 **3:4 竖幅**开槽左右并列，单个 612 × 816（= 3:4 精确）。
# 为什么是 612 × 816 而不是更"整"的 600 × 800：612/816 = 0.75 是精确 3:4，
# 半格相机的画幅本来就是 18 × 24 mm（= 3:4），留白必须让位给比例。
#
# ⚠️ 第一版画布是 1080 × 1488，槽 2 的 x 手抄成 568 —— 两个 612 宽的槽
# 在 1080 的画布上**互相重叠 164 px**，于是先画的压痕/内阴影被后画的槽口
# 切掉，`punch()` 又把重叠区一并挖透：成品里根本没有立筋，是**一个 960 px
# 宽的大洞**（实测 `half-frame.png` 在 y=500/600/840/1200 四行上都是
# "纸 0…119 / 透明 120…1079"），而 `frames.ts` 里那个 (120, 432, 1060, 816)
# 的并集窗口比真实洞口宽 100 px —— 端上摆照片时右边 100 px 会压在纸面上。
# 根因是**画布太窄**：两个 3:4 槽要并排，宽度上必须满足
#   2 × 槽宽 + 立筋 + 左右留白 = 画布宽，且 槽宽 / 槽高 = 0.75。
# 1080 的画布下槽宽上限只有 (1080 − 84 − 96×2)/2 = 402（z 那个洞小得可怜），
# 所以把画布**加宽到 1500**：半格双联本来就是横着的一张长片。
#
# 全部由下面这几个常量算出来，不再有手抄的字面量：
#   96 + 612 + 84 + 612 + 96 = 1500
HALF_SLOT_W = 612
HALF_SLOT_H = 816
HALF_RIB = 84
HALF_MARGIN = 96
HALF_TOP = 432
HALF_W = HALF_MARGIN * 2 + HALF_SLOT_W * 2 + HALF_RIB  # 1500
HALF_H = 1488
WINDOW_HALF_SLOT_A = (HALF_MARGIN, HALF_TOP, HALF_SLOT_W, HALF_SLOT_H)
WINDOW_HALF_SLOT_B = (
    HALF_MARGIN + HALF_SLOT_W + HALF_RIB, HALF_TOP, HALF_SLOT_W, HALF_SLOT_H,
)
# 并集窗口 = 从左槽左缘到右槽右缘，**中间那根立筋也算在里面**
# （`window` 是"单图兜底 + 取景器构图参考线"的框，横跨两槽才合理；
#  真正摆照片用的是 `slots`）。它的宽高比 1.206 必然不是 3:2 —— 两个 3:4
# 竖幅并排、中间还留一条筋，并集不可能是 1.5，这不是误差。
WINDOW_HALF_FRAME = (HALF_MARGIN, HALF_TOP, HALF_W - HALF_MARGIN * 2, HALF_SLOT_H)
# 上缘防挂切口（圆心在画布外）的 x：放在立筋的**延长线**上，
# 这样切口啃掉的是立筋上方的纸，离任何一个槽都够远（槽口在 y=432）。
HALF_NOTCH_X = HALF_MARGIN + HALF_SLOT_W + HALF_RIB // 2
# 8×10 大画幅散页：8 × 10 英寸 = 4:5 → 1080 × 1350 px。
# 画面 3:2 横放（大画幅散页常见的是裁切后的横构图），取 1032 × 688（精确 3:2）：
# 左右各 24 px、上 24 px 的**纯黑片边**，下巴 1350 - 24 - 688 = 638 px。
WINDOW_SHEET_8X10 = (24, 24, 1032, 688)

# fp100c 的撕纸毛边参数。**必须是常量**，不能只写在 builder 里：
# `expected_transparent()` 要用同一组数复算毛边掩码，才能审计"毛边有没有咬进窗口"
# （见 `deckle()`）。写成两处独立字面量就等于放弃这条检查。
DECKLE_DEPTH = 6
DECKLE_PERIOD = 26.0
DECKLE_SEED = 6505


# --------------------------------------------------------------------------- #
# 调色板：4 张相框所有用色都在这里，想统一换风格改这一段就够。
# 颜色数量要克制 —— `save()` 会把整张图量化到 256 色，颜色一多，
# 相近的纸色就会被合并成同一格，纸纹先糊掉。
# --------------------------------------------------------------------------- #
PAPER_INSTANT = (247, 246, 242)  # #F7F6F2 600 系即时成像相纸（纯净微暖卡纸）
PAPER_MINI = (250, 250, 250)  # instax mini 片（冷白，比 600 系更冷更细）
CARD_IVORY = (233, 228, 217)  # 幻灯装裱卡纸（象牙白，偏暖）
CARD_WEAVE = (223, 218, 205)  # 卡纸的哑光织纹（压深一点点）
CARD_SHADE = (199, 193, 180)  # 开孔内壁的暗面（露出的纸板厚度）
CARD_LIGHT = (255, 254, 250)  # 开孔倒角的受光面

FILM_BASE = (22, 23, 26)  # 35mm 片基（近黑，带一点蓝）
FILM_EDGE = (9, 10, 12)  # 片基最外圈（裁切边比片基本体更黑）
FILM_PERF = (28, 29, 33)  # 齿孔带底色（乳剂面比片基略亮，摸得出来）

INK_REBATE = (232, 163, 60)  # #E8A33C 片边帧号：橙黄（用户钉死的暖橙黄）
INK_PALE = (242, 239, 230)  # #F2EFE6 片边工艺字：浅白（上一版的冷灰"青色"已废弃）
INK_CARD = (160, 160, 154)  # #A0A09A 卡纸上的规格字：浅灰卡纸压印，不是深灰实心字

# FP-100C 撕拉片（宽白卡纸 + 一圈显影药水痕）
PAPER_PEEL = (246, 245, 241)  # 撕拉片相纸：中性的暖白，比 600 系略冷一点
DEV_AMBER = (196, 158, 84)  # 显影药水的干痕：微黄偏棕（不是做旧的咖啡渍）
DEV_PALE = (231, 221, 183)  # 药水痕靠里那半圈：更淡的黄绿，药水被纸吸进去的过渡

# 半格双联框（象牙白厚卡）
CARD_HALF = (238, 234, 225)  # 半格卡的卡纸：比幻灯卡亮一点（是要装两张的厚卡）

# 8×10 大画幅散页（纯黑片边）
FILM_SHEET = (10, 10, 12)  # 散页片基：比 135 片条更黑（大画幅用的是厚片基）
INK_SHEET = (150, 150, 146)  # #969692 散页片边的标识字：中性灰，不是暖白
FIBER_DARK = (30, 28, 22)  # 棉浆纤维的墨色（暗股）：暖灰，不是黑
FIBER_LIGHT = (255, 255, 253)  # 棉浆纤维的亮股（受光的那半根）

# --------------------------------------------------------------------------- #
# 真实规格（毫米）→ 本脚本所有像素尺寸都由它们换算
# --------------------------------------------------------------------------- #
MM_135 = 38.625  # neg-135 的比例尺：1350px / 35mm 片宽

# --------------------------------------------------------------------------- #
# 纸面棉浆纤维噪点（用户要求：所有相纸类相框都要有，**3~4% 透明度**，直接烘进 PNG）
#
# 为什么是"经纬丝对"而不是逐像素噪声：真实纸面的纤维有方向、有长度，
# 是**一根一根**的。做法是把噪声定义在 n×n 的粗网格上（一"根"纤维占一格），
# 再按格重复 —— 天然的纤维丝，不是电视雪花。`n = fiber_px` 就是丝宽，
# 4 px 的丝在 1350 px 的卡纸上是"看得到但数不清"的尺度。
#
# 为什么要量化成整数级（`FIBER_LEVELS`）：
# `save()` 会把整张图压到 255 色调色板。把纤维吸到**整数级**上，一根丝就是
# 一个色号，过量化时无损；连续取值的 3~4% 噪声则会被量化器按簇平均掉。
# 级数少到不会有色调分离的斑，又足够让"一根丝一个色号"成立。
#
# ⚠️ 量化器的选择与纤维是否幸存直接相关：`FASTOCTREE` 是**每通道固定 16 格**
# 的八叉树（不是自适应聚类），会把纸色 240…255 整段并成一个色号 —— 纤维
# 在成品 PNG 里直接消失。所以 `save()` 用 `MEDIANCUT`，并附实测数字。
#
# 幅度上限严格由 `FIBER_LEVELS` 钉死：`paper()` 把纤维 α 吸到
# `round(x / FIBER_LEVELS) * FIBER_LEVELS`，而 `_clip_fiber_alpha()` 又把
# 它夹在 `FIBER_LEVELS` 以内 —— 所以**最透的一根丝恰好是 FIBER_LEVELS 级**，
# 即 9/255 = **3.53%**，落在用户给的 3%~4% 区间里。改 FIBER_LEVELS
# 就是直接改幅度上限，别的参数都动不了它。
#
# `fiber` 参数（每款 0.022~0.032）只决定"纤维有多稀"：它是抽签用的满格权重，
# 乘上 `_FIBER_DARK_GAIN` 之后要够到 `FIBER_LEVELS` 才可能有格子亮起来。
# 这就是"一根一根的丝"和"整片灰"的区别 —— 均匀分布会让整张纸灰一层。
#
# 为什么分**暗股 / 亮股**（`_DARK_GAIN` / `_LIGHT_GAIN`）而不是只压深：
# 纸浆里既有没漂白的暗纤维，也有受光的亮纤维，两支都画才像纸。
# 但要诚实：白纸 (247,246,242) 的亮度离 255 只有 13 级，亮股的"提亮余量"
# 远小于暗股的"压深余量"（暗股一格能压 18 级），所以两支**不可能**把均值
# 配平 —— 只画纤维必然让纸面整体压深。实测（`scripts/_probe_fiber.py`）
# 配平前 Δμ ≈ -3.9 级，肉眼能看出"这张纸比那张暗一档"。
# 结论：**色号不做 DC 补偿，补偿走 `paper(offset=...)`** —— 把纸的底色先抬
# `_FIBER_DC_LIFT` 级，纤维再压回来，成品的均值与原色一致（实测 |Δμ| < 0.5 级）。
# 这是暗房里的老办法：纸基里掺一点增白剂，纤维的起伏由纸浆自己带。
# --------------------------------------------------------------------------- #
FIBER_LEVELS = 9  # 纤维的量化级数 = 最透一根丝的 α（9/255 = 3.53%）
FIBER_THREAD_PX = 4  # 一根纤维的宽度（px）
# 暗股增益 ≈ 1 是刻意的：`fiber × 增益 × 255` 要**跨过好几个级数**，纤维才有
# 深浅变化（一根丝一个色号）。增益给到 1.6 时满格值 ≈ 12.6 级，一条 4px 的丝
# 有 24% 的格子被夹到同一个 9 级上 —— 纤维变成"同一种墨印的条纹"，反而假。
# 1.0 让满格恰好落在 9 级、细丝落在 1~3 级，整条丝的灰度是连续的。
_FIBER_DARK_GAIN = 1.0  # 暗股相对 `fiber` 的增益
_FIBER_LIGHT_GAIN = 1.0  # 亮股相对 `fiber` 的增益
# 纸底色要预先抬多少级，才抵得掉纤维的净压深。
# ⚠️ 这个值**逐款实测**（`scripts/_probe_fiber.py` 的 Δμ 一列）：
#    它取决于该款的 fiber 密度与底色亮度，照抄别的款的数字会得到"比原色还亮"的纸。
# ⚠️ 白纸的"抬底色"有个天花板：纸色已经 247，抬 3 级到 250，再叠 ±2.2 级的
#    不匀就常常撞 255 —— 一撞就**削掉亮部**，纤维的幅度跟着被削
#    （实测 max|Δ| 从 9 级掉到 6 级）。所以补偿只取 2 级：
#    够把 Δμ 压到 ±0.5 级以内，又不吃掉纤维自己的对比。
#    深色纸基（`sheet8x10` 的黑片边）不吃这个值 —— 那里纤维是**提亮**的，
#    要单独给它一条 offset，别指望同一个常量同时管白纸和黑纸。
_FIBER_DC_LIFT = (2, 2, 2)


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

    ⚠️ 量化对**纤维噪点**的影响是本轮的重点（用户要求"烘进 PNG"）：
    量化器选错会把纤维整片抹平 —— `FASTOCTREE` 对 `instax-mini` 就是如此
    （纸面只剩 1 个色号、σ = 0.000）。细节与实测数字见上面那段注释。
    现在用 `MEDIANCUT`，`paper()` 那 9 个离散级完整保留（纸面 σ ≈ 3.8~4.0）。
    """
    path = os.path.join(FRAMES_DIR, name + ".png")
    alpha = img.getchannel("A").point(lambda v: 255 if v > 0 else 0)
    # ⚠️ 必须是 MEDIANCUT，**不能**用 FASTOCTREE（本轮实测，代价很大）。
    # `FASTOCTREE` 不是一个"自适应聚类"量化器：它是把每个通道**均分成固定的
    # 16 格**（格宽 16 级）建八叉树的。实测一张 0…255 的完整灰度斜坡喂给它，
    # `colors=255` 也只吐出 **16 档**（首末 7/247）。后果对纸面是致命的：
    #   - `instax-mini` 的纸色落在 **240…255** 这一格**之内** → 整张纸被并成
    #     **1 个色号**，烘进去的纤维**在成品里彻底不存在**（σ 从 3.77 掉到 0.000）；
    #   - `polaroid-600` / `slide-mount` 只是"恰好跨了格子边界"才侥幸留下
    #     4~5 个色号（σ ≈ 3.2~3.5），纤维的级数也被砍掉一半。
    # `MEDIANCUT` 是按颜色分布切中位数的真量化器，纸面的 35~63 个色号完整保留
    # （σ 回到 3.77~3.99，= `paper()` 烘焙时的水准）。
    #
    # 代价要如实记下来：调色板一多，PNG 行滤波器就预测不动纸面的纤维，
    # 11 张合计从 277 KB 涨到约 **900 KB**（3.2 倍）。这是"纤维真的在 PNG 里"
    # 的**必要**代价 —— 旧那 277 KB 之所以小，正是因为纤维根本没被保留下来
    # （instax-mini 的纸是一整块死平的 249）。
    # 试过并否掉的省体积办法（都是实测）：把调色板按亮度重排索引（853 KB，反而略涨）、
    # 降到 4bpp、开 FLOYDSTEINBERG 抖动（二者对 PNG 都无效，PNG 用调色板索引，
    # 抖动只改变索引分布）、把 `FIBER_LEVELS` 从 9 降到 3（767 KB，省不到 5%）。
    # 唯一的真旋钮是纤维丝的宽度：`thread_px` 4→8→12 时，一块 400×400 纸面
    # 从 108.8 → 85.7 → 77.7 KB。这里仍取 4 px：纸浆纤维本来就是"看得到但数不清"
    # 的尺度，为了体积把它放大成 12 px 的方格才是真的假。
    body = img.convert("RGB").quantize(
        colors=255, method=Image.MEDIANCUT, dither=Image.Dither.NONE
    )
    out = Image.new("P", img.size, TRANSPARENT_INDEX)
    # ⚠️ 调色板必须**补齐到整 256 槽（768 字节）**，不能假设量化器给满。
    # 踩过的坑：`MEDIANCUT` 对色号少的图只返回**用到的那几槽**
    # （`polaroid-600` 实测 741 字节 = 247 槽），于是 `[:255*3] + [0,0,0]`
    # 只有 741 字节 —— Pillow 把 741 字节按 247 槽装进去，**第 255 号槽
    # 根本不存在**，`out.info["transparency"] = 255` 被存成了一段
    # 247 字节全 0xff 的 tRNS、而 255 号槽的像素照常不透明 →
    # 照片被整块纸色盖住、审计直接 FAIL（1597696 px 没挖透）。
    # 所以这里按 768 逐字节补齐，透明槽永远存在且永远是最后一个。
    pal = list(body.getpalette() or [])
    out.putpalette((pal + [0, 0, 0] * 256)[: 256 * 3])
    out.paste(body, (0, 0))
    # 透明的那些像素，索引一律改写成保留槽；其余像素保持量化结果（= 全不透）
    out.paste(TRANSPARENT_INDEX, (0, 0), ImageChops.invert(alpha))
    out.info["transparency"] = TRANSPARENT_INDEX
    out.save(path, "PNG", optimize=True)
    # 存完立刻读回来自检 `transparency`：这个格式约定太容易静默失效
    # （上面那条坑就是"调色板少了几槽 → tRNS 变成一段字节数组"），
    # 而 `Image.open().info["transparency"]` 一旦变成 bytes，
    # 端上每张照片都会被纸色盖住。宁可在这里炸，也不要交出去。
    with Image.open(path) as chk:
        trans = chk.info.get("transparency")
        if trans != TRANSPARENT_INDEX:
            extra = f"（长 {len(trans)}）" if hasattr(trans, "__len__") else ""
            raise RuntimeError(
                f"{name}.png 的 transparency 不是 {TRANSPARENT_INDEX}，而是 "
                f"{type(trans).__name__}{extra} —— 调色板没补齐到 256 槽？见 save() 里的注释。"
            )
    digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
    print(
        f"  -> assets/frames/{name}.png  {img.size[0]}x{img.size[1]}  "
        f"{os.path.getsize(path) / 1024:.1f} KB  sha256 {digest[:16]}"
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


def _clip_fiber_alpha(a):
    """把纤维的 α 夹在 `FIBER_LEVELS` 以内 —— 这是"3%~4%"这个约束的**唯一**守卫。

    为什么需要它：`paper()` 第 3 步把 `round(x / FIBER_LEVELS) * FIBER_LEVELS` 吸到
    整数级，而抽签权重是三角分布（可以取到 3.0 满格）。`fiber × 增益` 一旦超过
    一个级数，满格那一撮格子就会落到 2×FIBER_LEVELS 上 —— 那是 7%，直接翻倍
    超出用户给的上限。夹住之后"最透的一根丝 = FIBER_LEVELS = 9 级 = 3.53%"，
    与 `fiber` 取值无关，改密度永远不会偷偷改幅度。
    """
    import numpy as np

    return np.minimum(a, float(FIBER_LEVELS))


def paper(
    img: Image.Image,
    box: tuple[int, int, int, int],
    color: tuple[int, int, int],
    mottle: float = 4.5,
    scale: int = 16,
    fiber: float = 0.0,
    seed: int = 0,
    offset: tuple[int, int, int] | None = None,
    thread_px: int = FIBER_THREAD_PX,
    fiber_dark: tuple[int, int, int] = FIBER_DARK,
    fiber_light: tuple[int, int, int] = FIBER_LIGHT,
) -> float:
    """把 box 区域刷成 color，并叠一层低频"不匀" + 一层棉浆纤维。

    **返回**写进图里的最透一根丝的 α（0.0~255.0）。不加纤维时返回 0.0。
    调用方（builder）把它塞进 `plates[key]["fiber_peak"]`，生成日志会打出来 ——
    这就是"3~4% 透明度"这条约束的实测凭证。

    mottle  低频不匀的振幅（级）；scale 噪声格子边长（px），越大越"云状"；
            取值要克制：`scale` 太小（<30）或 `mottle` 太大，量化之后会
            变成一块一块的"水渍"，白纸尤其明显 —— 白纸用 mottle≈2.2 / scale≈46。
    fiber   棉浆纤维的**满格权重**，0.022~0.032。峰值不在这里 —— 峰值由
            `FIBER_LEVELS` 钉死（9 级 / 255 = **3.53%**，见常量区的推导），
            本参数只决定"有多少格子被点亮"（三角分布 + 整数级取整）。
            0 表示不加（`neg-135` 的片基是黑的，不加 —— 见文件顶部的原则 3）。
            ⚠️ 它不是逐像素噪声，是**有方向的纤维丝**（见上面 FIBER_* 那一段注释）。
    offset  给色号加的**直流补偿**（级，可为负）。纤维只压深不抬亮（原因见常量区），
            所以每款纸都要先把底色抬一点，纤维再压回来，成品的均值才等于原色。
            只有 `fiber > 0` 时才生效 —— 不加纤维就不该凭空改变纸色。
    seed    同一个 seed 的 mottle 与纤维都是确定性的 —— 脚本必须可复现
            （连跑两遍要逐字节一致，见验收第 3 条）。

    实现上只生成 `w/scale × h/scale` 的随机场再做 BICUBIC 放大 ——
    放大这一步就是低通滤波，出来的必然是"云状"而不是"颗粒"。

    ⚠️ 纤维只写 RGB、**绝不碰 alpha**：底下已经是 255 的不透明白纸，
    `alpha_composite` 不会把它降下去。透明通道的二值契约（见 `save()`）
    因此在物理上就无法被这个函数破坏。
    """
    import numpy as np

    fiber_peak = 0.0  # 不加纤维时保持 0.0，别让调用方拿到未定义的局部变量
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
    if fiber > 0 and offset:
        color = tuple(int(c) + int(o) for c, o in zip(color, offset))
    base = np.zeros((h, w, 3), dtype=np.float32) + np.asarray(color, dtype=np.float32)
    rgb = np.clip(base + (low * mottle)[..., None], 0, 255)

    if fiber > 0:
        # 1) 抽签：在 thread_px 的网格上抽 (h', w') 个正态值当"格子"，再按格铺开。
        #    只抽 h'×w' 个数、却影响 w×h 个像素 —— 这就是"低频"的来源，
        #    也是运行时间不随画布面积爆炸的原因。
        gw, gh = (w + thread_px - 1) // thread_px, (h + thread_px - 1) // thread_px
        grid = rng.normal(0.0, 1.0, (gh, gw)).astype(np.float32)
        # 2) 三角分布（|N(0,1)| 截断到 3）：绝大多数格子刚好落在 0 级，少数几格拉满。
        #    均匀分布会让整片纸均匀地灰一层（"脏"），三角分布才是"一根一根"。
        g = np.minimum(np.abs(grid), 3.0)
        pos, neg = grid > 0.0, grid < 0.0
        # 3) 把"满格 = 3"归一化到 0~1，乘上各自的目标级数，再**吸到整数级**上。
        #    `np.where(neg, g * peak_dark, 0.0)` 的形状是 (gh, gw)，和 `low`
        #    一样是二维的：这里绝不能写成 `g`（那是 (gh, gw, 1)，会广播成
        #    (gh, gw, gw) —— 已经踩过一次，报 "operands could not be broadcast"）。
        peak_dark = fiber * _FIBER_DARK_GAIN * 255.0
        peak_light = fiber * _FIBER_LIGHT_GAIN * 255.0
        a_dark = np.round(np.where(neg, g * peak_dark, 0.0) / FIBER_LEVELS) * FIBER_LEVELS
        a_light = np.round(np.where(pos, g * peak_light, 0.0) / FIBER_LEVELS) * FIBER_LEVELS
        # 4) 吸到整数级之后可能越过 FIBER_LEVELS（见 `_clip_fiber_alpha()`）。
        #    夹完再补一个 [:, :, None]，让下面能按像素跟 RGB 相乘。
        a_dark = _clip_fiber_alpha(a_dark)[:, :, None]
        a_light = _clip_fiber_alpha(a_light)[:, :, None]
        # 4b) 把"最透的一根丝"的 α 记下来返回给 builder。
        #     为什么值得多返回一个数：用户要的"3~4% 透明度"是**烘进 PNG 的**，
        #     而成品 PNG 是 P 模式（同一色号可能既出现在纸上、又出现在开孔附近），
        #     从成品里反推不出 α。这个数是从 `_clip_fiber_alpha()` 的**返回值**上取的，
        #     也就是写进 PNG 之前那一刻的真值，生成日志里直接打出来（见 `print_plates()`）。
        fiber_peak = float(max(a_dark.max(), a_light.max()))
        # 5) 一"格"纤维铺满 thread_px × thread_px 个像素；多余的行列裁掉
        a_dark = np.repeat(np.repeat(a_dark, thread_px, axis=0), thread_px, axis=1)[:h, :w]
        a_light = np.repeat(np.repeat(a_light, thread_px, axis=0), thread_px, axis=1)[:h, :w]
        # 6) 先暗股后亮股（两支互斥，不重叠，顺序只影响浮点误差）

        rgb = rgb * (1.0 - a_dark / 255.0) + np.asarray(fiber_dark, dtype=np.float32) * (
            a_dark / 255.0
        )
        rgb = rgb * (1.0 - a_light / 255.0) + np.asarray(fiber_light, dtype=np.float32) * (
            a_light / 255.0
        )

    # 上面全程用 float32 算、这里才取整：`np.clip` 之后的 .astype 是**截断**，
    # 但整条式子已经带了低通，截断误差和噪声同量级，不会再引入新的台阶。
    img.alpha_composite(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA"), (x0, y0))
    return fiber_peak



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


def inner_shadow(
    img: Image.Image,
    window: tuple[int, int, int, int],
    spread: float = 1.5,
    ink: float = 0.12,
) -> None:
    """开孔四周一圈 **1.5 px 接触内阴影**（`rgba(0,0,0,0.12)`），做出"照片嵌进去了"的景深。

    ⚠️ 这道阴影画在**纸面一侧**（紧贴开孔外缘的那 1~2 圈像素），不画在洞里 —— 这是
    被格式逼出来的唯一解，不是偷懒：
      · 相框 PNG 是**盖在照片之上**的一层，洞里（alpha=0）任何像素都只会把照片挡住；
      · 更要命的是 `save()` 的二值 alpha 契约：调色板 PNG 只有一个透明槽，
        洞里画半透明黑 = 要么把照片压暗一整格（alpha 按 1/255 渗色），
        要么在"窗口必须全透"的审计里被判成 `blocked`。
    所以做法是：**在洞外的纸面上**从孔缘往外压一层会衰减的墨 —— 紧贴孔缘那一圈
    压满 12%，往外 1 px 只剩 4%，再往外归零。合成的底是**不透明**的纸，
    所以这层的半透明只改 RGB、不改 alpha，"1.5 px 的渐变"和"二值 alpha"两件事同时成立。

    观感上这就是照片投在纸口上的接触阴影（真实嵌装卡纸的孔缘本来也比纸面暗一档）。
    """
    x, y, w, h = window
    peak = ink * 255.0
    for d in range(int(math.ceil(spread))):
        level = peak * max(0.0, 1.0 - d / spread)
        if level < 1.0:
            continue
        fa = (0, 0, 0, int(round(level)))

        def draw(dd: ImageDraw.ImageDraw, d: int = d, fa=fa) -> None:
            dd.rectangle(
                [x - d - 1, y - d - 1, x + w + d, y + h + d], outline=fa, width=1
            )

        overlay(img, draw)


def chem_edge(
    size: tuple[int, int],
    box: tuple[int, int, int, int],
    band: int = 64,
    strength: float = 0.36,
    ink: tuple[int, int, int] = DEV_AMBER,
    ink_inner: tuple[int, int, int] = DEV_PALE,
    bottom_gain: float = 1.7,
    seed: int = 0,
    soft: float = 2.4,
) -> Image.Image:
    """生成"撕拉片显影药水痕"图层，返回 RGBA（调用方自己 `alpha_composite`）。

    **物理来源**（这决定了它长什么样，不是装饰）：FP-100C 这类撕拉片自带一个药水包，
    拍完拉出引条时，显影膏被两个滚轴压过整幅，**多余的药水被挤到相纸边缘**，
    干了以后留下一圈挂在纸边上的痕。所以它必须满足三条：
      1. **只贴边**：从纸边算起 `band` px 之内，越往里越淡，到带外**严格为 0**；
      2. **不平直**：滚轴压力和纸边的毛边都不均匀，边界必须是低频起伏的；
      3. **有方向**：下巴一侧（药水最后停下的地方）明显更重 → `bottom_gain`。

    为什么不做成"满纸咖啡渍"：那是做旧。用户明确讨厌假污渍 —— 一圈有物理来源、
    贴边、幅度小的药水痕可以，满天星不行。这里带外的像素 α 恒等于 0（见下面的
    `alpha *= inside`），所以"只在边缘"这件事是**数学上**成立的，不是靠调参调出来的。

    实现：在 `size` 上抽一张 `band/3` 的噪声场放大成"带宽度图" w_i（低频起伏），
    再算到纸边包围盒的逐像素距离 d，取 `falloff = clip(1 - d/w_i, 0, 1) ** soft`。
    """
    import numpy as np

    W, H = size
    x0, y0, x1, y1 = box
    rng = np.random.default_rng(seed)

    # 低频起伏：格子取 band 的 1/3，放大后是"云"，不是颗粒
    gw, gh = max(2, W // max(3, band // 3)), max(2, H // max(3, band // 3))
    wob = np.asarray(
        Image.fromarray(rng.random((gh, gw)).astype(np.float32), mode="F").resize(
            (W, H), Image.BICUBIC
        ),
        dtype=np.float32,
    )
    # 带宽度：0.30~1.00 × band。起伏幅度刻意做大（药水痕的边界本来就是不规则的），
    # 但下限保证带的最窄处也还有 ~0.3 band，不至于整段断掉。
    width = band * (0.30 + 0.70 * np.clip(wob, 0.0, 1.0))

    xs = np.arange(W, dtype=np.float32)
    ys = np.arange(H, dtype=np.float32)
    dx = np.minimum(np.abs(xs - x0), np.abs(xs - (x1 - 1)))
    dy = np.minimum(np.abs(ys - y0), np.abs(ys - (y1 - 1)))
    d = np.minimum(dx[None, :], dy[:, None])  # 到"纸边包围盒"的矩形距离
    falloff = np.clip(1.0 - d / width, 0.0, 1.0) ** soft

    a = falloff * (strength * 255.0)
    # 下巴一侧更重：药水最后停在下面。只对"确实落在下端那条带里"的像素加权
    # 1 → bottom_gain，避免在两侧竖带里也整体加深。
    low_edge = np.clip(1.0 - dy / (band * 1.2), 0.0, 1.0)[:, None]
    a = a * (1.0 + (bottom_gain - 1.0) * low_edge)

    # 带外严格归零：`d >= width` 处 falloff 已经是 0，这一行是**显式**的保险，
    # 让"药水痕只在纸边一圈"这条约束不依赖 soft/wob 的具体取值。
    inside = (d < band).astype(np.float32)
    a = np.clip(a, 0.0, 255.0) * inside

    # 内浅外深：靠外那圈是干掉的药水（DEV_AMBER），靠里是渗进纸里的过渡（DEV_PALE）。
    # 用亮层先铺满、暗层只盖外侧，得到的就是一圈同心渐层。
    inner = np.clip(a / 255.0, 0.0, 1.0)
    dark = np.clip(inner - 0.18, 0.0, 1.0) / 0.82

    arr = np.zeros((H, W, 4), dtype=np.uint8)
    arr[..., :3] = np.asarray(ink_inner, dtype=np.float32)
    arr[..., 3] = inner * 255.0
    layer = Image.fromarray(arr, "RGBA")
    # 外层：只在"比较重"的地方把颜色推向 DEV_AMBER。用 L 掩码 + 纯色 RGBA 合成，
    # 而不是逐像素算第二遍 —— 少一次全画布浮点运算。
    put = Image.new("RGBA", size, ink + (255,))
    mask = Image.fromarray((dark * 255.0).astype(np.uint8), "L")
    layer = Image.composite(put, layer, mask)
    # `Image.composite` 用的是掩码的**像素值**做插值，但 layer 的 alpha 会被混进 RGB 里，
    # 所以最后把 alpha 通道重新写回"最外层的强度"（取两者最大）。
    out_a = np.maximum(inner, dark) * 255.0
    layer.putalpha(Image.fromarray(np.clip(out_a, 0.0, 255.0).astype(np.uint8), "L"))
    return layer


def deckle(
    img: Image.Image,
    box: tuple[int, int, int, int],
    depth: int = 6,
    period: float = 26.0,
    seed: int = 0,
) -> Image.Image:
    """把 `box` 的四条外边啃成**毛边**（撕拉片相纸是撕下来的，不是切齐的）。

    只在纸的最外圈动手，`depth` 给到 6 px —— 相对于 36 px 的纸边宽度是个细齿，
    远看是"边不齐"，近看是一小口一小口。用**乘 alpha** 挖（和 `punch()` 同一个
    理由：直接画 `fill=(0,0,0,0)` 会在边界留一圈 alpha=254 的像素），
    所以啃完 alpha 仍然只有 0 / 255。

    ⚠️ 必须保证啃不到窗口：调用方传进来的 `box` 是整张画布，而窗口离纸边有几十 px。
    这条**不能只靠"几十 px 够宽"的口头保证** —— 毛边的齿是随 `seed` 与 `period`
    随机起伏的，换个参数就可能咬进去。所以本函数**把 keep 掩码返回出去**，
    `expected_transparent()` 直接拿它当"应该透明"的底图：啃到哪里，
    审计就认到哪里。于是"毛边有没有咬进窗口"从一句承诺变成了每次生成都会跑的
    逐点比对 —— 咬进去的话窗口那一块会被复算成透明，而照片那边是不透明，
    当场就 FAIL（实测过：改动前 11154 px 不符）。
    """
    import numpy as np

    W, H = img.size
    x0, y0, x1, y1 = box
    rng = np.random.default_rng(seed)
    keep = Image.new("L", (W, H), 255)
    px = keep.load()

    def fn(phase: float) -> float:
        """低频（period px 一个起伏）+ 一点高频（纤维毛刺），返回 0~1 的啃入比例。"""
        return 0.5 + 0.5 * math.sin(phase)

    # 四条边各走一遍，每条边独立抽相位 —— 四条边的齿不能长得一样（真撕边就是随机的）
    for horizontal, fixed, lo, hi in (
        (True, y0, x0, x1),  # 上
        (True, y1 - 1, x0, x1),  # 下
        (False, x0, y0, y1),  # 左
        (False, x1 - 1, y0, y1),  # 右
    ):
        phase0 = rng.random() * math.tau
        # 小数组转成 Python list 再取值：逐像素索引 numpy 数组比索引 list 慢一个量级，
        # 而这里一圈要走 (W + H) × 2 ≈ 5000 次、每次再套 ≤ depth 步。
        jitter = rng.normal(0.0, 0.18, hi - lo).astype(np.float32).tolist()
        for t in range(hi - lo):
            k = fn(phase0 + t / period * math.tau) * 0.75 + jitter[t] * 0.25
            n = int(round(max(0.0, min(1.0, k)) * depth))
            for j in range(n):
                if horizontal:
                    px[lo + t, fixed + (j if fixed == y0 else -j)] = 0
                else:
                    px[fixed + (j if fixed == x0 else -j), lo + t] = 0

    img.putalpha(ImageChops.multiply(img.getchannel("A"), keep))
    return keep


def _slot_place(
    land: Image.Image,
    block: Image.Image,
    want: tuple[float, float],
    new_window: tuple[int, int, int, int],
) -> tuple[int, int]:
    """把一块字放进"离 `want` 最近的合法位置"。

    做法：以 `want` 为中心一圈圈往外扫（曼哈顿距离），第一个"不出界、不压窗口"
    的位置就是要的。搜索半径给到整张画布，找不到就返回夹进画布的原位
    —— 宁可位置难看，也不能让字跑到画布外（那就等于丢字）。

    为什么不"解析地算出那条带子的中点"：一块字可能比带子长（`neg-135` 的
    `12A` 那块 219 px，而窗口左侧那条纸边只有 212 px），也可能比带子短很多；
    与其枚举各种带子/尺寸的组合，不如让"距离 + 两条硬约束"自己找位置。
    """
    bw, bh = block.size
    w, h = land.size
    x, y, ww, wh = new_window

    def ok(px: int, py: int) -> bool:
        if px < 0 or py < 0 or px + bw > w or py + bh > h:
            return False
        return not (px < x + ww and px + bw > x and py < y + wh and py + bh > y)

    px0 = int(round(want[0] - bw / 2.0))
    py0 = int(round(want[1] - bh / 2.0))
    if ok(px0, py0):
        return px0, py0
    for r in range(1, max(w, h) + 1):
        best: tuple[int, int, int] | None = None
        for dx in range(-r, r + 1):
            for dy in (-r, r):
                px, py = px0 + dx, py0 + dy
                if ok(px, py) and (best is None or abs(dx) + abs(dy) < best[0]):
                    best = (abs(dx) + abs(dy), px, py)
        for dy in range(-r + 1, r):
            for dx in (-r, r):
                px, py = px0 + dx, py0 + dy
                if ok(px, py) and (best is None or abs(dx) + abs(dy) < best[0]):
                    best = (abs(dx) + abs(dy), px, py)
        if best is not None:
            return best[1], best[2]
    return max(0, min(px0, w - bw)), max(0, min(py0, h - bh))


def place_landscape_text(
    land: Image.Image,
    text_layer: Image.Image,
    portrait_size: tuple[int, int],
    new_window: tuple[int, int, int, int],
    rects: list[tuple[int, int, int, int]] | None = None,
) -> Image.Image:
    """把竖版的印字**一块一块**搬到横版上（返回同尺寸透明图层，供 `alpha_composite`）。

    为什么不能把 `text_layer` 整层 `transpose` 一下了事：那样转的是**整个画布
    坐标**，字的**位置**也跟着转。`SLIDE MOUNT` 在竖版里是贴上边的一条 460 px
    横排，转完变成贴左边、竖跨 460 px 的一条，而横版左边那条纸边只有 30 px 宽
    —— 一半字跑到画布外，另一半被后面 `punch()` 挖掉。转的是"块"，不是"画布"。

    ⚠️ 为什么还要 `rects`：`neg-135` 的片边字是**散在三个角上**的（左上 `12A`、
    左下 `PROCESS C-41`、右下 `13`），它们的**联合**包围盒是 902 × 1636 px ——
    比整张横版画布还高。当成一块转过去必然放不下（实测 5019 px 字被 `punch()`
    挖掉）。所以散字款要**逐个报块**，每个块各自找位置。

    ⚠️ 也别试图把字层按"连通域"自动切块：`12A` 那几个字形彼此不相连，切出来
    就是一个个字母，数量不固定。块的划分是**设计信息**（谁和谁一起走），
    只能由 builder 报上来。
    """
    W, H = portrait_size
    bb_all = text_layer.getchannel("A").getbbox()
    if bb_all is None:
        return Image.new("RGBA", land.size, TRANSPARENT)
    if not rects:
        rects = [bb_all]

    out = Image.new("RGBA", land.size, TRANSPARENT)
    for r in rects:
        # 块内可能没墨（比如某个标签那一格留空），先夹进画布再取
        r = (max(0, r[0]), max(0, r[1]), min(W, r[2]), min(H, r[3]))
        if r[2] <= r[0] or r[3] <= r[1]:
            continue
        piece = text_layer.crop(r)
        bb = piece.getchannel("A").getbbox()
        if bb is None:
            continue
        piece = piece.crop(bb)

        # 横排 → 顺时针转 90°：变成一列竖排字，字头朝右（读法同横排）。
        # ⚠️ 用 `ROTATE_90` 试过：字也是竖排，但字头统统朝左躺倒（看图即知）。
        # 量"长条是横是竖"这种全局统计**分不出这两种**，必须看图或看字形朝向。
        block = piece.transpose(Image.Transpose.ROTATE_270)
        bw, bh = block.size

        # 这块字在竖版里的中心 → 横版坐标。
        # ⚠️ 必须用**和底图同一个旋转**的影射，否则字会跑到"另一条边"上：
        # 底图是 `ROTATE_270`（顺时针 90°），影射是 (x, y) → (H-1-y, x)，
        # 也就是"竖版的上边 → 横版的右边"。
        # 曾经写成 `(cy, W-1-cx)`（那是**逆时针**的影射），结果 `SLIDE MOUNT`
        # 从"竖版上边"跑到横版的**左**边 —— 那不是这张纸转 90° 之后该在的位置，
        # 而是把字单独搬到了对面那条边上（虽然也在纸面上、也是正立的，
        # 但没有"同一张纸转个方向"的物理来源）。
        cx = (r[0] + r[2]) / 2.0
        cy = (r[1] + r[3]) / 2.0
        px, py = _slot_place(land, block, (H - 1 - cy, cx), new_window)
        out.alpha_composite(block, (px, py))
    return out


def landscape(
    portrait: Image.Image,
    text_layer: Image.Image,
    window: tuple[int, int, int, int],
    radius: int | None = None,
    text_rects: list[tuple[int, int, int, int]] | None = None,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """把一款竖版相框整体转 90° 变成横版，返回 (横版图, 横版窗口)。

    **为什么是"转过去"而不是"照横版重画一遍"**：用户要求"同一款纸转个方向"。
    只有转过去，横版和竖版才是**同一张纸**（同一个 seed 的纸纹、同一套留白逻辑、
    同一份材质），重画一遍就会变成"另一个相似的产品"。而且旋转是纯几何：
    竖版审计通过 ⇒ 横版审计必然通过，不需要为横版再维护一份窗口常量。

    两条容易被写错的细节：

    1. **窗口跟着转**：竖版 (x, y, w, h) 顺时针转 90° 之后落在
       `(W - y - h, x, h, w)`（W 是竖版画布宽）。一步算出来，不留手抄的机会。
    2. **印在上面的字必须保持正立**，不能跟着纸一起躺下 —— 真实世界里
       卡纸横过来放，印字还是正的（它本来就是转着印的）。
       做法：文字单独画在一张和画布同大的**透明图层**上，底图转 90° 之后，
       把文字图层**反向**（`TRANSPOSE` = 逆时针）转回来，字就正了。
       位置自动落在横版的**右留白**里：竖版的下巴转 90° 之后正好是右边一条
       （竖版底部 → 横版右侧），而"下巴"本来就是留白最多、最适合印字/烧水印的那条边。

    还有一处必须处理：底图转过来时，竖版已经挖空的窗口也跟着转了过去。
    所以最后要 `punch()` 掉横版的新窗口 —— 这一下同时把"旧窗口的洞"补上
    （乘 alpha 只会让像素更透明，补不回来），所以顺序不能反：
    **先转 → 再合成字 → 最后挖洞**。转过来的旧洞落在新纸面上，是块全透明的斑；
    既然它必然被最后那一次 `punch()` 覆盖，就不必额外补了（两个矩形的位置
    关系见下面第 3 行注释）。

    ⚠️ 旧洞和"字"有没有可能重叠：字在竖版的下巴（y > 窗口底），转过来之后
    落在横版的右侧（x > 窗口右缘），和水印的 anchor='frame' 是同一片区域 ——
    这正是我们要的，两者都不在窗口里。

    ⚠️ `radius`（圆角窗用，现在只有 instax-mini 传）：**圆角必须重切一次**。
    竖版的圆角是"从直角矩形往里啃掉四个角"，那四块被啃掉的面积在窗口**外面**。
    旋转是刚体变换，它们跟着转到横版窗口外面去了 —— 于是横版的洞是
    "直角矩形 + 四块贴在短边外侧的小三角"，`punch()` 挖不到那四块，
    实测留下 **40 px** 的洞外透明（每角 20 px，见
    `scripts/_probe_instax_landscape.py`）。所以圆角窗在横版要再
    `punch_rounded()` 一次，把跟着转过来的旧圆角一起吃掉。
    """
    W, H = portrait.size
    x, y, w, h = window
    # 横版自己的洞：竖版 (x,y,w,h) 顺时针转 90° → (H-y-h, x, h, w)
    new_window = (H - y - h, x, h, w)

    # 1) 底图（纸 + 压痕 + 素材）顺时针转 90°：竖版的顶边变成横版的左边
    rot = Image.Transpose.ROTATE_270
    out = portrait.transpose(rot)
    # 2) 印字：**整块搬过去**，不是把整层画布转过来。
    # 三轮才弄对，把结论记在这里（前两轮都是错的方向，别再往回改）：
    #   · 只把 `text_layer` 整层转一下再 `alpha_composite`，那个图层里的**位置**
    #     也会跟着转 —— 字落到横版的**边上甚至界外**（`SLIDE MOUNT` 那一条
    #     460 px 的竖排字有一半在画布外）。这不是旋转方向的问题，是位置问题。
    #   · 所以先取出"墨的紧凑包围盒"（这就是"整块字"），**转块**，再**重新摆放**。
    #   · 转块用 `ROTATE_270`（顺时针 90°）：字变成"头在右、从下往上排"的
    #     竖排 —— 把照片顺时针转 90° 看就是正常的一行横排字，所以读法自然。
    #     ⚠️ 用 `ROTATE_90` 试过：字也是竖排，但字头统统朝左躺倒（看图即知）。
    #     量"长条是横是竖"这种全局统计**分不出这两种**，必须看图或看字形朝向。
    #   · 短文位置：摆在**窗外那条最外圈纸边**的正中间（竖版里它在窗口上方那条
    #     边，转过来自然就是窗口左侧/右侧那条边），与竖版是同一块纸。
    #   · 长向位置：沿用竖版字心的影射点（`(cy, W-1-cx)`），再夹进画布。
    out.alpha_composite(
        place_landscape_text(out, text_layer, (W, H), new_window, rects=text_rects)
    )
    # 3) 最后才挖洞。
    if radius is None:
        punch(out, new_window)
    else:
        punch_rounded(out, new_window, radius=radius)
    return out, new_window

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


def right_triangle(
    img: Image.Image,
    x: int,
    y: int,
    w: int,
    h: int,
    ink: tuple[int, int, int],
) -> None:
    """在 `img` 的 `(x, y)` 处画一个右向**空心**三角（▷），占 `w × h`。

    ⚠️ 为什么不用字形：`font()` 走的 `ImageFont.load_default()` 是本环境里
    唯一可用的字体（`os.walk(PIL/)` 找不到任何 .ttf / .otf），它只带一套
    极窄的默认字形，**基本只有 ASCII**。`▷`(U+25B7)、`▶`、`△`、`•`
    全部落到 .notdef —— 印出来是**"方框里画个叉"的豆腐块**，不是三角。
    判定方法：把待测字符和私用区码位 U+E000（必定缺字形）的渲染逐像素
    比对，两者完全一致即证明缺字形（实测 `'A'`/`'1'`/`'-'` 三者都不同，
    而 `▷`/`▶`/`△`/`•` 四个全都相同）。
    → 结论：**画进相框的符号一律用图元画，文字只限 ASCII。**

    为什么按重心缩放挖空，而不是"每个顶点各内缩一点"：三角形三个内角不
    一样大，逐顶点固定内缩会让三条边的笔画粗细不均，锐角那头会断；绕重心
    缩一个比例 k，内缩量才正比于对边长，看起来才像描出来的字。

    用独立 RGBA 图层做"只盖笔画"：孔内 alpha 留 0，`alpha_composite` 时
    底下的片基原样透出来 —— 直接往图上填底色会在带纹理的片基上留一块死色
    补丁，也能顺带保证 alpha 直方图仍然只有 0 / 255。
    """
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    outer = [(0, 0), (0, h - 1), (w - 1, (h - 1) // 2)]
    d.polygon(outer, fill=ink + (255,))
    gx, gy = (w - 1) / 3.0, (h - 1) / 2.0
    k = 0.42
    inner = [(gx + (px - gx) * k, gy + (py - gy) * k) for px, py in outer]
    # ImageDraw 在 RGBA 上是**直接写像素**、不做混合，所以这一笔是真的镂空。
    d.polygon(inner, fill=(0, 0, 0, 0))
    img.alpha_composite(layer, (x, y))


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
def make_polaroid_600() -> dict:
    """600 系即时成像：**三边等宽 + 厚下巴**，纸面绝对干净。

    尺寸全部照真实规格：外框 88 × 107 mm，画面 79 × 79 mm
    （79 = 88 - 3 × 3，即上/左/右三边各 3 mm，下巴 107 - 3 - 79 = 25 mm）。
    这里是 1408 × 1712 px，比例尺 16 px/mm：
      四周留白 3 mm = 48 px？—— 不是，画面区按 `frames.ts` 钉死的 1264 × 1264
      （79 mm × 16 px/mm = 1264 px），所以三边留白 = (1408 - 1264) / 2 = 72 px，
      下巴 = 1712 - 72 - 1264 = 376 px。两者自洽，这就是"头轻脚重"的来源。

    **通篇无字、无污渍、无做旧**：下巴那片空白是留给用户用圆珠笔写字的，
    印任何东西都会把它变成滤镜。唯一的"材质"是极低频的纸面不匀
    （mottle=2.2 / scale=48）加上 3.1% 的棉浆纤维丝（见 `paper()` 的 fiber）。
    """
    W, H = 1408, 1712
    window = WINDOW_POLAROID_600
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    # 纸面参数只在 `plates` 里写一次：builder 用它画，审计脚本 `_probe_fiber.py`
    # 也用它复算"同一片纸、只是不加纤维"的对照 —— 对照和正式产物必须同源，
    # 否则测出来的不是纤维的贡献，而是两份不同参数的纸的差。
    plate = dict(
        rect=(0, 0, W, H),
        base=PAPER_INSTANT,
        mottle=2.2,
        scale=48,
        fiber=0.031,
        offset=_FIBER_DC_LIFT,  # 直流补偿：先抬底色，纤维再压回来（见常量区）
        seed=6001,
    )

    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

    # 窗口压痕：真片是"药膜面朝下压进片仓"的，边缘有一道很浅的台阶。
    # 只给最窄的一圈、最低的对比 —— 多了就是"画了个框"。
    deboss(img, window, width=3, light=(255, 255, 255, 64), dark=(0, 0, 0, 40))
    # 照片内边缘的 1.5 px 接触内阴影 rgba(0,0,0,0.12)：见 `inner_shadow()`，
    # 它压在纸面一侧（洞里的像素是透明的，画不进去），孔缘那一圈压满 12%、
    # 往外 1 px 衰减到 4%、再往外归零 —— 照片看起来是"嵌"在纸口下面的。
    inner_shadow(img, window, spread=1.5, ink=0.12)
    punch(img, window)

    return dict(
        image=img,
        window=window,
        text=Image.new("RGBA", (W, H), TRANSPARENT),  # 这张本来就没字
        plates={"frame": dict(plate, fiber_peak=fiber_peak)},
    )



# --------------------------------------------------------------------------- #
# 2. instax-mini —— instax mini 片
# --------------------------------------------------------------------------- #
def make_instax_mini() -> dict:
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

    纤维振幅给 0.028（比 600 系的 0.031 低），理由是同一件事：mini 的涂层更细。
    """
    W, H = 1080, 1720
    window = WINDOW_INSTAX_MINI
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    plate = dict(
        rect=(0, 0, W, H),
        base=PAPER_MINI,
        mottle=1.5,
        scale=44,
        fiber=0.028,
        offset=_FIBER_DC_LIFT,  # 直流补偿：先抬底色，纤维再压回来（见常量区）
        seed=6101,
    )

    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

    deboss(img, window, width=2, light=(255, 255, 255, 56), dark=(0, 0, 0, 34))
    punch_rounded(img, window, radius=RADIUS_INSTAX)

    return dict(
        image=img,
        window=window,
        text=Image.new("RGBA", (W, H), TRANSPARENT),
        plates={"frame": dict(plate, fiber_peak=fiber_peak)},
    )



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
    片边上只印真片会印的东西，只用**两种墨**（用户钉死的橙黄 + 浅白，
    上一版那支偏冷的灰蓝 `INK_DIM` 已经去掉）：
      · 暖橙黄 `#E8A33C` —— 帧号 `▷ 12A` / `13 ▷`（两个三角都是**图元画的**，
        不是字形：默认字体没有 U+25B7，印出来会是豆腐块，见 `right_triangle()`）；
      · 浅白 `#F2EFE6`   —— 冲洗工艺 `PROCESS C-41`。
    **没有尘土、划痕、斑块** —— 那些是"用过"的痕迹，不该由印刷机喷上去。

    `plates` 里**没有 `fiber`**：这一张是黑片基，不是纸。用户明确要求
    "neg-135 的片基是黑的，不加"纤维 —— 3% 的纤维压在全黑上只会变成噪点。
    但 `plates` 条目仍然带着准确的 mottle/scale/seed，测试脚本照它复算对照图。
    """
    W, H = 1350, 1950
    window = WINDOW_NEG_135
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    plate = dict(
        rect=(0, 0, W, H),
        base=FILM_BASE,
        mottle=3.0,
        scale=40,
        fiber=0.0,
        # 片基不加纤维，所以也**不需要直流补偿**：`paper()` 只在 fiber > 0 时才用 offset。
        # 明写 (0,0,0) 是为了让"这一款没抬底色"这件事在 `print_plates()` 里看得见，
        # 而不是靠读代码去推。
        offset=(0, 0, 0),
        seed=6301,
    )
    # 片边文字画在**独立图层**上，而不是直接贴到底图：
    # 横版要把纸转 90° 而字保持正立（见 `landscape()`），字和纸必须能分开转。
    text = Image.new("RGBA", (W, H), TRANSPARENT)

    # 片基：低频不匀给到 3.0（片基涂层确实不匀），但 scale 拉到 40 ——
    # 放大后是"云"，不是"颗粒"。全黑背景上一点颗粒都会被看成噪点。
    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

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

    # 上片边：帧号（暖橙黄 #E8A33C，真边码就是印在齿孔带之间的橙黄小字）。
    # 位置必须在 window 之外 —— 相框是盖在照片之上的图层，
    # 落在窗口里的字会**烧进成片**。y=150 在 window.y=280 上方，安全。
    # `▷` 由 `right_triangle()` 画，不用字形（默认字体没有这个码位，见其说明）。
    NUM_SIZE, NUM_TRACK = 52, 9
    TRI_W, TRI_H, TRI_GAP = 30, 38, 12
    right_triangle(text, x + 12, 151, TRI_W, TRI_H, INK_REBATE)
    text.alpha_composite(
        print_text("12A", size=NUM_SIZE, tracking=NUM_TRACK, ink=INK_REBATE, seed=41),
        (x + 12 + TRI_W + TRI_GAP, 150),
    )
    # 相机侧的片边工艺字（浅白 #F2EFE6）—— 真片两侧印的是不同信息
    text.alpha_composite(
        print_text("PROCESS C-41", size=48, tracking=8, ink=INK_PALE, seed=43),
        (x + 12, 1730),
    )
    # 右下角：下一格的帧号，右对齐到窗口右缘（三角在数字**右边**，与上片边相反）
    lab = "13"
    lab_w = text_width(lab, NUM_SIZE, NUM_TRACK)
    lab_x = x + w - 12 - (lab_w + TRI_GAP + TRI_W)
    text.alpha_composite(
        print_text(lab, size=NUM_SIZE, tracking=NUM_TRACK, ink=INK_REBATE, seed=47),
        (lab_x, 1730),
    )
    right_triangle(text, lab_x + lab_w + TRI_GAP, 1731, TRI_W, TRI_H, INK_REBATE)

    img.alpha_composite(text)
    return dict(image=img, window=window, text=text, plates={"frame": dict(plate, fiber_peak=fiber_peak)})



# --------------------------------------------------------------------------- #
# 4. slide-mount —— 50×50mm 幻灯装裱卡
# --------------------------------------------------------------------------- #
def make_slide_mount() -> dict:
    """幻灯装裱卡：50 × 50 mm 方形卡纸，中间开 36 × 24 mm 横孔，**居中偏下**。

    比例尺 27 px/mm：50 mm × 27 = 1350 px 画布。
    **本轮把开孔从 972 × 648 放大到 993 × 662**（用户要求开孔宽度占卡纸宽的
    72%~75%，并往区间中位 ≈73.5% 靠，同时**必须保住 3:2**）：
      993 / 1350 = **73.556%**（落在区间内，离中位 73.5% 只差 0.056 个百分点）
      993 / 662  = **1.501511**（3:2 = 1.5，相对误差 +0.10% —— 肉眼与几何上都是 3:2）
    为什么不是精确 3:2 的整数对 990 × 660：那只到 73.333%，比 993 × 662 离中位更远，
    而且比值误差（0.00%）换来的"整数感"在 1350 px 的卡纸上根本看不出来 ——
    任务书要的是"既在区间内、又接近 3:2"，这一组把两个目标同时放在误差 0.1% 以内。
    左右留白 (1350 - 993) / 2 = 178.5 → x = 178（左 178 / 右 179，1 px 无法再平）。
    上下仍按 1.35 : 1 劈开：可用高度 1350 - 662 = 688 → 上 403 / 下 285。

    这是四张里唯一的横向开孔 —— 真实的 35mm 幻灯框就是"方卡 + 横孔"，
    所以它在相册里天然和另外三张竖构图不一样，一眼能认出来。

    材质四件事，全部是"工艺的副产品"而不是装饰：
      · 哑光织纹：3 px 一格的极淡经纬网，只压深 10 级 —— 看得出"有纹"，
        看不出"有线"；
      · 棉浆纤维：3.0% 的纤维丝（`paper()` 的 fiber），卡纸是棉浆抄的；
      · 开孔倒角：孔的上/左内缘受光发白、下/右内缘落在阴影里
        （卡纸有厚度，光从左上来），这是"孔是切出来的"唯一的证据；
      · 顶部一行 `SLIDE MOUNT` 规格印字 —— 真卡纸上印的就是这类小字，
        也是本张**唯一**的印刷内容。不打孔、无红线、无编号、无污渍。

    底部 285 px 是**日期水印的地盘**（`frames.ts` 里 anchor='frame'），
    所以那一片刻意留空；顶部那行 `SLIDE MOUNT` 缩到 34 号浅灰，压印感还在，
    但不再和照片抢眼睛。
    """
    W, H = 1350, 1350
    window = WINDOW_SLIDE_MOUNT
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    plate = dict(
        rect=(0, 0, W, H),
        base=CARD_IVORY,
        mottle=2.0,
        scale=56,
        fiber=0.030,
        offset=_FIBER_DC_LIFT,  # 直流补偿：先抬底色，纤维再压回来（见常量区）
        seed=6401,
    )

    # 卡纸：mottle 2.0 / scale 56，比两张即时成像更低频（卡纸比相纸细）
    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

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

    # **开孔边缘的 2 px 内阴影**（本轮新增要求）。
    # 为什么是"内阴影"却画在洞**外**：洞里的像素必须 alpha=0（照片要从那儿透出来），
    # 往里画等于既挡住照片又破坏二值 alpha 契约 —— 详见 `inner_shadow()` 的说明。
    # 压在洞外那一圈纸面上，观感就是照片在纸口上投下的接触阴影，是同一个东西。
    # spread=2 / ink=0.30：紧贴孔缘的那圈压满 30%，往外 1 px 衰减到 15%、2 px 归零。
    # 深度比 600 系的 12% 重，因为幻灯卡的纸更厚、开孔更深，接触阴影本来就该更明显；
    # 渐变宽度 2 px 正好对应 27 px/mm 比例尺下的 ~0.07 mm，是"发丝级"的量级。
    # ⚠️ 必须在 `deboss()` **之后**画：deboss 的受光亮线压在孔缘外，先画就会被盖掉。
    inner_shadow(img, window, spread=2.0, ink=0.30)

    punch(img, window)

    # 文字单独一层（横版要转纸不转字，见 `landscape()`）。
    # 顶部规格印字：本张唯一的印刷内容。小、浅灰（#A0A09A）、贴左对齐到开孔左缘。
    # 字号 46 → 34 是用户明确要求的"缩小字号，避免喧宾夺主"：46 号在 1350 px 的
    # 卡纸上已经比开孔本身还抢眼；字距反而拉到 24，把"卡纸压印"的疏排感留住了。
    text = Image.new("RGBA", (W, H), TRANSPARENT)
    text.alpha_composite(
        print_text("SLIDE MOUNT", size=34, tracking=24, ink=INK_CARD, seed=71), (x + 2, 96)
    )
    img.alpha_composite(text)

    return dict(image=img, window=window, text=text, plates={"frame": dict(plate, fiber_peak=fiber_peak)})



# --------------------------------------------------------------------------- #
# 5. fp100c —— FP-100C 撕拉片（新增）
# --------------------------------------------------------------------------- #
def make_fp100c() -> dict:
    """FP-100C 撕拉片：宽大卡纸 + **只有纸边一圈**的显影药水痕。

    画布 1080 × 1416 px，画面 1008 × 672（**精确 3:2**）：左右各 36 px、
    上 48 px、下巴 696 px。撕拉片的相纸就是"照片几乎顶到纸边、下巴一大片"，
    这一组留白是照这个来的，不是随便取的。

    三样材质，每样都有物理来源：
      · **毛边（`deckle`）**：撕拉片是撕下来的，不是切齐的。最外圈啃掉 ≤6 px，
        低频起伏 + 一点高频毛刺，四条边的相位各不相同（真撕边不可能四条一样）。
      · **显影药水痕（`chem_edge`）**：药水包被滚轴压过整幅，多余的显影膏被挤到
        纸边，干了就留下一圈挂在边上的痕。**带外严格为 0**，下巴一侧（药水最后
        停下的地方）1.7 倍重。这是用户点名要的"有明确物理来源的边痕"，
        和"满纸咖啡渍"是两件事 —— 判据就是"带外到底有没有像素"。
      · **棉浆纤维**：3.0%，和另外四款纸一致。

    **没有规格印字**：真撕拉片的卡纸是空白的（型号印在药水包那一面，撕掉就没了）。
    这一款的可读性靠"宽纸 + 药水痕"本身，不靠字。
    """
    W, H = 1080, 1416
    window = WINDOW_FP100C
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    plate = dict(
        rect=(0, 0, W, H),
        base=PAPER_PEEL,
        mottle=2.4,
        scale=52,
        fiber=0.030,
        offset=_FIBER_DC_LIFT,  # 直流补偿：先抬底色，纤维再压回来（见常量区）
        seed=6501,
    )

    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

    # 药水痕画在窗口压痕**之前**：药水是纸面上的脏，压痕是纸被压出来的台阶，
    # 物理上台阶在药水的下面（先有纸和药水，后被片仓压到）。
    img.alpha_composite(
        chem_edge((W, H), plate["rect"], band=64, strength=0.36, seed=6503),
    )

    x, y, w, h = window
    deboss(img, window, width=3, light=(255, 255, 255, 60), dark=(0, 0, 0, 42))
    inner_shadow(img, window, spread=1.5, ink=0.14)
    punch(img, window)

    # 毛边**最后**做：它动的是画布最外圈 6 px，任何时候做都不影响窗口
    # （窗口离纸边 36 px），但放最后最安全 —— 谁也啃不到照片。
    # 参数走模块常量，`expected_transparent()` 用同一组复算。
    deckle(img, plate["rect"], depth=DECKLE_DEPTH, period=DECKLE_PERIOD, seed=DECKLE_SEED)

    return dict(
        image=img,
        window=window,
        text=Image.new("RGBA", (W, H), TRANSPARENT),  # 真片纸面空白，不印字
        plates={"frame": dict(plate, fiber_peak=fiber_peak)},
    )


# --------------------------------------------------------------------------- #
# 6. half-frame —— 半格双联框（新增）
# --------------------------------------------------------------------------- #
def make_half_frame() -> dict:
    """半格双联框：一张成片里**左右并列两个 3:4 竖幅开槽**（奥林巴斯 Pen-F 那种）。

    半格相机的画幅是 18 × 24 mm —— 正好 3:4，一卷拍 72 张而不是 36 张。
    两个槽：`WINDOW_HALF_SLOT_A` / `WINDOW_HALF_SLOT_B`，都是精确 3:4（612 × 816）。
    并集窗口 `WINDOW_HALF_FRAME` 写进 `FrameSpec.window`
    —— 它的作用是"单图兜底 + 取景器构图参考线的依据"，
    两个槽写进 `FrameSpec.slots`。

    **两槽之间的 84 px 立筋是有意的**：真半格底片的两格之间留着片间间隙，
    印样时那一条也会留在纸上。没有这条筋就不是"双联"，是"一张宽照片中间切了个口"。
    （画布 1500 × 1488 就是为了容下 2 × 612 + 84 + 2 × 96 才这么宽的，
    见常量区那段"第一版翻车"的记录。）

    材质：象牙白厚卡 + 2.9% 棉浆纤维 + 每个槽口的 2 px 内阴影 + 上缘两个
    防挂切口（Notch）。切口是圆形的，因为它们本来就是在卡纸上冲出来的孔。
    """
    W, H = HALF_W, HALF_H
    window = WINDOW_HALF_FRAME
    slots = (WINDOW_HALF_SLOT_A, WINDOW_HALF_SLOT_B)
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    plate = dict(
        rect=(0, 0, W, H),
        base=CARD_HALF,
        mottle=1.8,
        scale=50,
        fiber=0.029,
        offset=_FIBER_DC_LIFT,  # 直流补偿：先抬底色，纤维再压回来（见常量区）
        seed=6601,
    )

    # paper() 把'最透一根丝的 α'返回上来 —— 生成日志要用它证明 3~4% 这条约束。
    fiber_peak = paper(img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
          fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"])

    # 两个槽各自压痕 + 内阴影，然后一次性挖透。
    # 挖洞必须在压痕之后：压痕画在槽外的纸面上（紧贴槽缘），先挖也没关系，
    # 但保持"先画纸面效果、后开洞"的统一顺序，免得后面加效果时搞反。
    for sx, sy, sw, sh in slots:
        deboss(img, (sx, sy, sw, sh), width=3, gap=2,
               light=(255, 254, 250, 104), dark=(0, 0, 0, 74))
        inner_shadow(img, (sx, sy, sw, sh), spread=2.0, ink=0.26)

    for sx, sy, sw, sh in slots:
        punch(img, (sx, sy, sw, sh))

    # 上缘的两个防挂切口：在卡纸边缘冲出来的圆孔，半径 26 —— 圆心刻意放在
    # y = -16（即卡纸**外面**），这样只有下半部分落进纸里，出来的是一个
    # "从边上咬进去的浅圆弧"，而不是纸上一个浮空的圆。
    # x 落在两个槽之间的立筋延长线上（`HALF_NOTCH_X`），离槽口 432 远得很。
    notch_r, notch_y = 26, -16
    mask = Image.new("L", (W, H), 255)
    nd = ImageDraw.Draw(mask)
    for nx in (HALF_NOTCH_X, W - HALF_NOTCH_X):
        nd.ellipse([nx - notch_r, notch_y - notch_r, nx + notch_r, notch_y + notch_r], fill=0)
    # 和 `punch()` 同一个坑：必须乘 alpha，不能直接画半透明/透明像素
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))

    # 文字单独一层（横版要转纸不转字）。y=356 在槽顶 432 之上，
    # 而且离上缘有 356 px，切口（y ≤ 10）够不着。x 从 96 起（左槽左缘对齐）。
    text = Image.new("RGBA", (W, H), TRANSPARENT)
    text.alpha_composite(
        print_text("HALF FRAME", size=44, tracking=18, ink=INK_CARD, seed=81), (HALF_MARGIN, 356)
    )
    img.alpha_composite(text)

    return dict(image=img, window=window, text=text, plates={"frame": dict(plate, fiber_peak=fiber_peak)}, slots=slots)


# --------------------------------------------------------------------------- #
# 7. sheet8x10 —— 8×10 大画幅散页（新增）
# --------------------------------------------------------------------------- #
def make_sheet_8x10() -> dict:
    """8×10 大画幅散页：纯黑片边 + 防挂切口（Notch）+ 片边标识字符。

    8 × 10 英寸 = 4:5 → 1080 × 1350 px。画面 1032 × 688（**精确 3:2**）横放：
    左右各 24 px、上 24 px 的片边，下巴 1350 - 24 - 688 = 638 px。
    大画幅片的片边本来就很窄（散页不是小片，没有齿孔也没有卷轴空间），
    所以这里给的是"窄边 + 宽下巴"——宽下巴是留给暗袋里捏片的地方。

    **Notch（防挂切口）**：大画幅片夹的一角有一个不对称的缺口，暗袋里闭着眼
    摸一下就知道药膜面朝哪边。做法是在左下角用半径 40 的**四分之一圆**啃掉：
    圆心放在 (78, 1310)，圆只留着落在片内、且 x ≤ 圆心的那一半 ——
    于是被啃掉的是一个恰好嵌在左下角里的圆角，和真片的切口同一个形状来源。
    ⚠️ 它离窗口左缘（x=24）有 54 - 40 = 14 px 的余量，啃不到画面。

    **片边标识字符**（全部 ASCII —— 默认字体没有非 ASCII 字形，见 `right_triangle()`）：
    下边 `SHEET FILM` 与左下角 `SAFETY 8X10`，都在宽下巴里，离窗口有 300+ px，
    绝不会烧进成片。

    ⚠️ **`SAFETY 8X10` 原来是 `KODAK 4142`**（一个真实的散页商品型号）。本仓库要转
    公开，片边上不许出现厂商商标 —— 理由与 `src/constants/frames.ts` 里相框代号
    那两条注释完全相同。"SAFETY" 指的是安全片基（醋酸片基，取代早期易燃的硝酸片基），
    是全行业通用的**基材类型名**，不是商标；后面跟画幅尺寸。厂商名和商品编号一起
    换掉，是为了不留任何品牌残留 —— 只删 `KODAK` 而留着 `4142`，等于把检索线索
    留在了图里。
    """
    W, H = 1080, 1350
    window = WINDOW_SHEET_8X10
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    # 片基是黑的，但 `fiber` 仍然给 0.030 —— 用户要求 8×10 也算"相纸类"，
    # 要有一层棉浆纤维；黑底上这层纤维是"乳剂面的细微不匀"，
    # 峰值 ≈8/255 叠在 RGB 10 上完全看不见，但审计里能量出来（见 `_probe_fiber.py`）。
    plate = dict(
        rect=(0, 0, W, H),
        base=FILM_SHEET,
        mottle=1.6,
        scale=44,
        fiber=0.030,
        # 黑片边**不抬底色**（纤维在这里不是压深、是提亮一档），
        # 也不吃 `_FIBER_DC_LIFT` —— 黑纸和白纸的补偿方向相反。
        offset=(0, 0, 0),
        seed=6701,
        fiber_light=(18, 18, 21),  # 黑底上的亮股不能是白的，给"比片基亮一点"的灰
    )

    # ⚠️ 这里**只刷一遍**纸面。上一版不小心刷了两遍同一块 (0,0,W,H)：第二遍
    # 会把第一遍的纤维、不匀、直流补偿**整块覆盖掉**（`alpha_composite` 是覆盖不是叠加），
    # 结果"织进去的纤维"凭空消失、`fiber_peak` 还报着第一遍的值。
    # 黑片基的"纤维"其实是乳剂面的细微颗粒：`paper()` 的默认亮股 (255,255,253)
    # 叠在全黑片基上会出来一片白丝，所以亮股换成只比片基亮一档的灰
    # （见 `plate["fiber_light"]`）。
    fiber_peak = paper(
        img, plate["rect"], plate["base"], mottle=plate["mottle"], scale=plate["scale"],
        fiber=plate["fiber"], seed=plate["seed"], offset=plate["offset"],
        fiber_light=plate["fiber_light"],
    )

    x, y, w, h = window
    # 窗口一圈压痕：散页被片夹压过的台阶
    deboss(img, window, width=3, light=(24, 25, 28, 255), dark=(0, 0, 0, 90))
    inner_shadow(img, window, spread=2.0, ink=0.22)
    punch(img, window)

    # 防挂切口：和 `notch` 同一招（乘 alpha 挖透），只是形状是圆的。
    # 半径 40、圆心 (78, H-40)：圆落在片内的那一半正好是一个圆角。
    nr = 40
    mask = Image.new("L", (W, H), 255)
    ImageDraw.Draw(mask).ellipse([78 - nr, (H - 40) - nr, 78 + nr, (H - 40) + nr], fill=0)
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))

    text = Image.new("RGBA", (W, H), TRANSPARENT)
    # 上边：**不能印字**。上边缘只有 24 px，而 36~40 号字的字身就占约 30 px ——
    # 一印就会骑到窗口顶上（实测「8X10」在 (24, 4) 时字占 y=17…49，窗口从
    # y=24 开始，烧进去 897 px）。所以上边保持"干净的片边"，规格字下移到下巴。
    # 这条不是审美取舍：落进窗口的墨会烧进用户的每一张成片。
    # 下边：片种 + 型号（下巴 638 px 足够宽，实测字占 y=755…785 / y=1254…1281）
    text.alpha_composite(
        print_text("SHEET FILM", size=40, tracking=14, ink=INK_SHEET, seed=91), (24, 740)
    )
    # 左下角：基材类型 + 画幅。x 从 210 起 —— 给防挂切口的圆弧（最右到 x = 78 + 40 = 118）
    # 留出 90 px，字不会压在切口的弧上。
    # ⚠️ 这里原来是 `KODAK 4142`，厂商商标，已换掉（理由见 docstring）。
    text.alpha_composite(
        print_text("SAFETY 8X10", size=36, tracking=10, ink=INK_SHEET, seed=95), (210, 1240)
    )
    img.alpha_composite(text)

    return dict(image=img, window=window, text=text, plates={"frame": dict(plate, fiber_peak=fiber_peak)})


# --------------------------------------------------------------------------- #
BUILDERS = {
    "polaroid-600": make_polaroid_600,
    "instax-mini": make_instax_mini,
    "neg-135": make_neg_135,
    "slide-mount": make_slide_mount,
    "fp100c": make_fp100c,
    "half-frame": make_half_frame,
    "sheet8x10": make_sheet_8x10,
}

# 每张相框的窗口"自审"表：名字 → (画布尺寸, 期望窗口)
# ⚠️ 横版**不在这里**：横版的窗口是 `landscape()` 从竖版算出来的，
# 它的期望掩码也由同一段代码生成（见 `expected_transparent()`），
# 手抄一份常量就等着两边对不上。
EXPECTED: dict[str, tuple[tuple[int, int], tuple[int, int, int, int]]] = {
    "polaroid-600": ((1408, 1712), WINDOW_POLAROID_600),
    "instax-mini": ((1080, 1720), WINDOW_INSTAX_MINI),
    "neg-135": ((1350, 1950), WINDOW_NEG_135),
    "slide-mount": ((1350, 1350), WINDOW_SLIDE_MOUNT),
    "fp100c": ((1080, 1416), WINDOW_FP100C),
    "half-frame": ((HALF_W, HALF_H), WINDOW_HALF_FRAME),
    "sheet8x10": ((1080, 1350), WINDOW_SHEET_8X10),
}

# 哪几款要出横版。用户只要求**四款现有相框**出横版；新增的三款暂时只有竖版，
# 横拍照片在它们身上会按 `photoFit: 'cover'` 裁切（这条写在 frames.ts 的注释里）。
LANDSCAPE_OF = {
    "polaroid-600": "polaroid-600-landscape",
    "instax-mini": "instax-mini-landscape",
    "neg-135": "neg-135-landscape",
    "slide-mount": "slide-mount-landscape",
}

# 横版要不要重切圆角：只有圆角窗需要（见 `landscape()` 的 `radius` 参数）。
# 值直接引用竖版用的同一个常量 —— 换个半径，竖版和横版一起变，不会只改一半。
LANDSCAPE_RADIUS = {"instax-mini": RADIUS_INSTAX}

# 横版印字要**逐块**指定矩形（竖版像素坐标）的款。
# 为什么需要：`neg-135` 的片边字散在三个角上（上片边 `▷12A`、下片边左边
# `PROCESS C-41`、下片边右边 `13▷`），三者**联合**包围盒是 902 × 1636 px ——
# 比整张横版画布还高，当成一块转过去必然放不下（实测有 5019 px 字被
# `punch()` 挖掉）。逐块报上来，每块各自找位置，才一个字都不会丢。
# 没列在这里的款（polaroid / instax / slide-mount）印字是**一整块**，用整层
# 包围盒就够（它们本来就只有一条边上有字）。
# 矩形的数值来自对 builder 返回的 text 图层做**行带 + 无墨列缝**统计，
# 不是手抄：三块墨数 1562 + 3865 + 1154 = 6581，正好等于整层墨数。
LANDSCAPE_TEXT_RECTS: dict[str, list[tuple[int, int, int, int]]] = {
    "neg-135": [
        (220, 147, 383, 210),      # 上片边：▷ 12A（墨 1562 px，x 224…378 / y 151…205）
        (227, 1727, 634, 1791),    # 下片边左：PROCESS C-41（墨 3865）
        (1020, 1727, 1130, 1791),  # 下片边右：13 ▷（墨 1154）
    ],
}


def expected_transparent(name: str) -> Image.Image:
    """按常量**独立复算**"应该透明"的区域（L 掩码，255 = 透明）。

    它不调用任何 builder，只用窗口常量重新画一遍洞。
    builder 和审计都从同一组常量出发，任何一方把窗口写错（哪怕 1 px）
    都会立刻对不上 —— 这正是这道检查的意义。

    **横版为什么也走这里**：横版的窗口不是手抄的，是竖版转过来的
    （见 `landscape()`）。所以横版的期望掩码就是"竖版掩码转 90°"——
    转的是**常量算出来的**那个掩码，不是 builder 画出来的图，
    两边仍然互相独立，检查的效力没有打折。
    """
    # 横版：转它的竖版来源
    if name.endswith("-landscape"):
        base = name[: -len("-landscape")]
        return expected_transparent(base).transpose(Image.Transpose.ROTATE_270)

    size, window = EXPECTED[name]
    x, y, w, h = window
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    # fp100c 的毛边：**先铺毛边掩码，再往上画窗口**。
    # 毛边是"应不应该有纸"的问题，窗口是"有没有洞"的问题，两者是叠加关系，
    # 所以用 `ImageChops.lighter`（取并集）而不是 `paste` —— `paste` 是**覆盖**，
    # 会把刚算出来的窗口整块抹掉（第一版写的就是 paste，实测"窗口内 840750 px
    # 没挖透"，窗口直接从掩码里消失了）。
    # 用的是 `deckle()` 返回的同一份掩码（同一个 seed / depth / period），
    # 于是"毛边有没有咬进窗口"也被纳入逐点审计。
    if name == "fp100c":
        torn = deckle(Image.new("RGBA", size, TRANSPARENT), (0, 0, *size),
                      depth=DECKLE_DEPTH, period=DECKLE_PERIOD, seed=DECKLE_SEED)
        mask = ImageChops.lighter(mask, ImageChops.invert(torn))
        d = ImageDraw.Draw(mask)
    if name == "half-frame":
        # 两个槽各自独立 —— 只用并集矩形会把中间那根 84 px 立筋也算成透明。
        # 画法必须和 builder 一致：**并集矩形先铺满，再把立筋填回去**。
        # 第一版只画两个槽的矩形（没填立筋），于是期望掩码认为立筋也该是透的，
        # 审计反过来报"窗口内 69206 px 没有透明"（= 84 × 825 的立筋面积）。
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
        # ⚠️ 立筋的左边界是"左槽右缘"，不是 `WINDOW_HALF_SLOT_B[0]`（那是立筋的**右**边界）。
        # 第一版写成 `WINDOW_HALF_SLOT_B[0]` 再往右铺 84 px，立筋整体右移 84 → 报
        # "窗口外透明 68544 px + 窗口内不透明 68544 px"（两边数字相同，正是"边界整体挪了"的味道）。
        rib_x = HALF_MARGIN + HALF_SLOT_W
        d.rectangle([rib_x, y, rib_x + HALF_RIB - 1, y + h - 1], fill=0)
        # 上缘防挂切口（圆形，圆心在画布外）
        for nx in (HALF_NOTCH_X, size[0] - HALF_NOTCH_X):
            d.ellipse([nx - 26, -16 - 26, nx + 26, -16 + 26], fill=255)
    elif name == "sheet8x10":
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
        d.ellipse([78 - 40, size[1] - 80, 78 + 40, size[1]], fill=255)
    elif name == "instax-mini":
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



def print_slots(model: dict) -> None:
    """打印多槽相框的每个 slot（半格双联）—— 数据侧要写进 `FrameSpec.slots`。"""
    slots = model.get("slots")
    if not slots:
        return
    W, H = model["image"].size
    print(f"  #   slots（左→右 {len(slots)} 个）：")
    for i, (sx, sy, sw, sh) in enumerate(slots):
        print(
            f"  #     [{i}] px {sx, sy, sw, sh} aspect={sw / sh:.6f}  "
            f"{{ x: {sx / W:.6f}, y: {sy / H:.6f}, "
            f"width: {sw / W:.6f}, height: {sh / H:.6f} }}"
        )
    # 并集：`FrameSpec.window` 写的是它（单图兜底 + 取景器参考线）
    x0 = min(s[0] for s in slots)
    y0 = min(s[1] for s in slots)
    x1 = max(s[0] + s[2] for s in slots)
    y1 = max(s[1] + s[3] for s in slots)
    print(f"  #   union px {(x0, y0, x1 - x0, y1 - y0)}（= FrameSpec.window）")


def print_plates(model: dict) -> None:
    """打印卡纸参数 —— `_probe_fiber.py` 就是照这组数复算"不加纤维"的对照图的。

    这么做的目的是让"纤维贡献了多少"这件事**可复算**：审计脚本读这里打印的参数，
    和 builder 用的是同一份，测出来的差就只可能来自纤维本身。
    """
    for key, p in model.get("plates", {}).items():
        print(
            f"  #   plate[{key}] base={p['base']} mottle={p['mottle']} "
            f"scale={p['scale']} fiber={p['fiber']} offset={p.get('offset')} seed={p['seed']}"
        )
        # 纤维的峰值 α（写进 PNG 之前那一刻的真值）。用户给的"3~4% 透明度"这条
        # 约束就落在这个数上：9/255 = 3.53%。它由 `FIBER_LEVELS` 钉死，
        # 与 `fiber` 密度无关 —— 所以每款的密度可以各自不同，幅度始终同一档。
        peak = p.get("fiber_peak", 0.0)
        print(
            f"  #   plate[{key}] 纤维峰值 α = {peak:.0f}/255 = {peak / 255.0 * 100:.2f}%"
            + ("  （本款不加纤维）" if p["fiber"] <= 0 else "")
        )


def build(name: str) -> dict:
    """画一款（或它的横版）并落盘，返回 model。**横版也走这里**，
    因为横版的窗口是算出来的 —— 调用方（`main`）必须拿到那份算出来的窗口，
    不能自己再抄一遍。"""
    if name.endswith("-landscape"):
        base = name[: -len("-landscape")]
        model = BUILDERS[base]()
        img, window = landscape(
            model["image"],
            model["text"],
            model["window"],
            radius=LANDSCAPE_RADIUS.get(base),
            text_rects=LANDSCAPE_TEXT_RECTS.get(base),
        )
        save(img, name)
        print_window(name, img.size, window)
        return dict(window=window, plates=model["plates"], size=img.size)

    model = BUILDERS[name]()
    save(model["image"], name)
    print_window(name, model["image"].size, model["window"])
    print_slots(model)
    print_plates(model)
    return model


def _dump_bad(mask, what: str) -> None:
    """把对不上的像素按行汇总打印（头几行 + 尾几行）。

    为什么要打这个：审计只会说"差了 897 px"，但 897 px 可能是"挖洞漏了一条边"
    （严重，照片错位），也可能是"齿孔/毛边复算公式差了一个像素"（无害）。
    打出行区间一眼就能分辨，不用回去改一行跑一次。
    """
    import numpy as np

    rows = np.asarray(mask).nonzero()[0]
    if rows.size == 0:
        return
    uniq, counts = np.unique(rows, return_counts=True)
    print(f"       {what}：分布在 {uniq.size} 行（y={int(uniq[0])}…{int(uniq[-1])}），"
          f"共 {int(counts.sum())} px")
    head = ", ".join(f"y={int(y)}×{int(c)}" for y, c in list(zip(uniq, counts))[:6])
    print(f"         前 6 行：{head}")
    if uniq.size > 6:
        tail = ", ".join(f"y={int(y)}×{int(c)}" for y, c in list(zip(uniq, counts))[-6:])
        print(f"         末 6 行：{tail}")


def audit(names: list[str]) -> bool:
    """回读 PNG 自审：**透明区域的每一个像素**都要和复算的掩码逐点相等。

    这是整个脚本**最重要的一道检查**：窗口就是照片在相框里的位置，
    差 1 px 就意味着用户拍的每一张照片都错位 1 px，而且肉眼看不出来。

    为什么不写 `getbbox() == 窗口`：本脚本的相框，纸面/片基一直铺到画布
    边缘，所以"非零 alpha"的包围盒必然是整张画布 —— 这个等式在这里
    恒不成立，写出来只是一条永远为假的校验。真正等价、而且更严的写法是
    把**透明区**（alpha==0）的掩码和复算掩码逐点比对，再把三件事钉死：
      · 窗口内一个非零 alpha 都没有（有字落进画面会被烧进成片）；
      · 窗口外一个透明像素都没有（洞比窗口大就会露出合成舞台的黑底）；
      · **alpha 只有 0 和 255**（有任何中间值都意味着照片会以那个强度透出来，
        见 `save()` 里量化器平均 alpha 的坑）。
    返回 True 表示全部通过。

    ⚠️ 横版走同一条路径，只是掩码来源换成"竖版掩码转 90°"（见
    `expected_transparent()`）—— 横版的窗口本来就是这么算出来的。
    """
    import numpy as np

    print("audit:")
    ok = True
    for name in names:
        # 横版：尺寸 = 竖版对调；窗口 = 竖版转过来
        if name.endswith("-landscape"):
            base = name[: -len("-landscape")]
            bsize, bwindow = EXPECTED[base]
            size = (bsize[1], bsize[0])
            window = (bsize[1] - bwindow[1] - bwindow[3], bwindow[0], bwindow[3], bwindow[2])
        else:
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
        # 报告用：透明区包围盒（neg-135 会含齿孔；新增款含 Notch / 毛边）和窗口包围盒
        wbox = ImageOps.invert(rgba.getchannel("A")).getbbox()
        exp_w = (window[0], window[1], window[0] + window[2], window[1] + window[3])
        exp_box = np.asarray(expected_transparent(name)).nonzero()
        exp_bbox = (
            int(exp_box[1].min()),
            int(exp_box[0].min()),
            int(exp_box[1].max()) + 1,
            int(exp_box[0].max()) + 1,
        )
        # PNG 的透明索引：P 模式才读得到，非 P 模式这里会是 None
        trans = im.info.get("transparency", None) if im.mode == "P" else None

        good = size_ok and partial == 0 and wrong == 0 and im.mode == "P" and trans == TRANSPARENT_INDEX
        ok = ok and good
        print(
            f"  {'OK  ' if good else 'FAIL'} {name}.png  size={im.size} "
            f"(期望 {size})  模式={im.mode}  transparency={trans}\n"
            f"       窗口 = {exp_w}  透明区包围盒 = {wbox}\n"
            f"       期望透明区包围盒 = {exp_bbox}  "
            f"逐点不符 = {wrong} px  半透明像素 = {partial} px"
        )
        if leak_out:
            ok = False
            print(f"       FAIL 窗口外有 {leak_out} px 是透明的 —— 洞比窗口大，会露黑底")
            _dump_bad(actual & ~want, "窗口外多出来的透明像素")
        if blocked:
            ok = False
            print(f"       FAIL 窗口内有 {blocked} px 没有透明 —— 有东西盖住了照片")
            _dump_bad(want & ~actual, "窗口内没挖透的像素")
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
    # 想只重画竖版：`generate_frames.py fp100c`；想连横版一起：`generate_frames.py polaroid-600 polaroid-600-landscape`。
    # 横版**不会**自动跟着竖版一起重画 —— 因为横版只对四款现有相框存在，
    # 一张竖版改了参数却没重画横版，会是"同款纸的两个方向不一致"，
    # 所以下面在审计阶段会检查横版的 sha 是否和"当场重画一遍"一致（见 `--check`）。
    names = list(BUILDERS)
    names += [LANDSCAPE_OF[n] for n in BUILDERS if n in LANDSCAPE_OF]
    if wanted:
        names = [n for n in names if n in wanted]
    if not names:
        print(f"没有叫这些名字的相框：{' '.join(wanted)}")
        print(f"可选：{' '.join(list(BUILDERS) + list(LANDSCAPE_OF.values()))}")
        raise SystemExit(1)

    print("frames:")
    for name in names:
        build(name)
    if not audit(names):
        raise SystemExit(1)
    print("done.")



if __name__ == "__main__":
    main()
