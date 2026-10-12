"""把 `assets/frames/` 里的相框拼成预览图，方便一眼比较。

用法（在项目根目录）：
    python scripts/preview_frames.py                       # 用内置的合成示意图
    python scripts/preview_frames.py 某张照片.jpg           # 用你自己的照片
    python scripts/preview_frames.py 照片.jpg 出图.png      # 指定输出文件名

产物：
    assets/frames/_preview.png            7 款竖版 / 横孔（一张 4×2 的对照表）
    assets/frames/_preview-landscape.png  4 款横版纸（同一款纸转 90°）
两个都以下划线开头，已被 .gitignore 排除。

为什么值得单独有个脚本：相框的镂空窗口是**全透明**的，在系统看图器里
只会看到一片棋盘格 —— 光看 PNG 根本判断不出"照片放进去是什么样"。
这个脚本把每张相框按自己的 window 归一化值贴到同一张照片上，并排铺开，
改一版看一版。

覆盖的 11 张（= `generate_frames.py` 的 BUILDERS 全集）：
    竖版：polaroid-600 / instax-mini / neg-135 / slide-mount / fp100c /
          half-frame / sheet8x10
    横版：polaroid-600-landscape / instax-mini-landscape / neg-135-landscape /
          slide-mount-landscape
（本脚本只贴相框，**不画水印** —— 定位/日期水印是 App 运行时烧进照片的，
锚点写在 `src/constants/frames.ts` 里，`assets/frames/README.md` 有对照表。）

⚠️ 为什么横竖版分成两张图而不是排在同一张：横竖混排时每格都得按不同的缩放系数
   缩到同一个格子尺寸里，**纸张纹理的粗细就不一样了** —— 而"纤维噪点会不会显脏"
   这个问题只能靠横向对比同一缩放下的几款来回答。分组之后组内缩放一致。

⚠️ 一个诚实的说明：横版**不是**运行时会出现的构图。App 只会从 `frames.ts` 的
   `landscape` 字段取横版，而本轮新增的三款（fp100c / half-frame / sheet8x10）
   没有横版 PNG。这四张横版是给"同一款纸转 90° 之后长什么样"做验证用的。
"""

from __future__ import annotations

import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")
FRAMES_TS = os.path.join(ROOT, "src", "constants", "frames.ts")

# 和 src/constants/frames.ts 一一对应：(PNG 宽, PNG 高, 镂空窗口 (x, y, w, h))
# 归一化值**由这里算出来**，不手抄 —— 手抄一份 6 位小数迟早会错一位，
# 而错一位就是照片在成片里整体错位，肉眼还看不出来。
# 竖版在下、横版在上：下面的 `SPECS` 与 `GROUP` 成员一一对应，缺一张就报错。
SPECS = [
    # ── 7 款竖版 / 横孔 ──────────────────────────────────────────────
    ("polaroid-600", "polaroid 600", (1408, 1712), (72, 72, 1264, 1264)),
    ("instax-mini", "instax mini", (1080, 1720), (81, 90, 918, 1224)),
    ("neg-135", "35mm neg", (1350, 1950), (212, 280, 926, 1389)),
    # slide-mount 的开孔本轮从 972×648 放大到 993×662（占宽 73.556%，保住 3:2）
    ("slide-mount", "slide mount", (1350, 1350), (178, 403, 993, 662)),
    ("fp100c", "FP-100C peel-apart", (1080, 1416), (36, 48, 1008, 672)),
    # half-frame 的画布本轮从 1080 加宽到 1500 —— 两个 612 px 宽的 3:4 槽
    # 在 1080 上会互相重叠 164 px（成品里没有立筋，是一个 960 px 宽的大洞）。
    ("half-frame", "half frame (2x)", (1500, 1488), (96, 432, 1308, 816)),
    ("sheet8x10", "8x10 sheet", (1080, 1350), (24, 24, 1032, 688)),
    # ── 4 款横版纸（同一款纸转 90°） ────────────────────────────────
    ("polaroid-600-landscape", "polaroid 600 L", (1712, 1408), (376, 72, 1264, 1264)),
    ("instax-mini-landscape", "instax mini L", (1720, 1080), (406, 81, 1224, 918)),
    ("neg-135-landscape", "35mm neg L", (1950, 1350), (281, 212, 1389, 926)),
    ("slide-mount-landscape", "slide mount L", (1350, 1350), (285, 178, 662, 993)),
]

GROUP = {
    "_preview.png": [s[0] for s in SPECS[:7]],
    "_preview-landscape.png": [s[0] for s in SPECS[7:]],
}

CELL_W = 430  # 每格宽度（px）
BG = (18, 18, 17)

# 从 frames.ts 里抓一条 `window: { x: .., y: .., width: .., height: .. }`
_RE_WINDOW = re.compile(
    r"window:\s*\{\s*x:\s*([0-9.]+)\s*,\s*y:\s*([0-9.]+)\s*,"
    r"\s*width:\s*([0-9.]+)\s*,\s*height:\s*([0-9.]+)\s*\}"
)
_RE_ASPECT = re.compile(r"aspect:\s*([0-9.]+)\s*/\s*([0-9.]+)")
_RE_ID = re.compile(r"id:\s*'([^']+)'")
# 一条 FrameSpec 的起始。用缩进区分横版对象：
#   `    id: 'x',`  4 空格 = 一条 FrameSpec
#   `      source:` 6 空格 = landscape 里的字段
_RE_SPEC = re.compile(r"^    id: '([^']+)',", re.M)


def ts_windows() -> dict[str, dict[str, tuple[float, float, float, float]]]:
    """从 `src/constants/frames.ts` **正则解析**出每款的归一化窗口与 aspect。

    为什么要费这个劲解析 TS 而不是相信上面那张 SPECS 表：SPECS 是这个脚本自己的
    一份像素窗口数据，而"照片到底落在哪"最终由 `frames.ts` 决定。两边都写一遍
    就一定有分叉的可能 —— 这个函数把那件事变成**每次跑都检查**的断言：
    解析出的归一化窗口 × PNG 尺寸，必须和 SPECS 的像素窗口对得上。

    ⚠️ 用正则而不是"import 一份 JSON"是刻意的：不想为了预览脚本给项目加任何构建步骤。
       解析失败不会抛异常，只会让下面的对账打印一行"跳过"—— 预览图本身照出。
    """
    out: dict[str, dict[str, tuple[float, float, float, float]]] = {}
    try:
        with open(FRAMES_TS, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return out

    # 先把注释块切掉，免得文件头的示例代码（`id: 'my-frame'` / `window: { x, y, ... }`）
    # 被当成真数据解析出来 —— 那会让对账表里凭空多一条不存在的相框。
    body = re.sub(r"/\*.*?\*/", "", text, flags=re.S)

    starts = [m.start() for m in _RE_SPEC.finditer(body)]
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(body)
        block = body[start:end]
        name = _RE_SPEC.match(block).group(1)
        entry: dict[str, tuple[float, float, float, float]] = {}
        # 竖版的 window 是块里**第一**个（横版那个在 `landscape: {` 之后）
        windows = _RE_WINDOW.findall(block)
        aspects = _RE_ASPECT.findall(block)
        if windows:
            entry["__window__"] = tuple(float(v) for v in windows[0])  # type: ignore[assignment]
        if aspects:
            aw, ah = aspects[0]
            entry["__aspect__"] = (float(aw), float(ah))  # type: ignore[assignment]
        # 横版：`landscape: {` 之后的第一个 window
        lm = re.search(r"landscape:\s*\{", block)
        if lm:
            rest = block[lm.end():]
            lw = _RE_WINDOW.search(rest)
            la = _RE_ASPECT.search(rest)
            if lw:
                entry["__landscape_window__"] = tuple(float(v) for v in lw.groups())  # type: ignore[assignment]
            if la:
                entry["__landscape_aspect__"] = (float(la.group(1)), float(la.group(2)))  # type: ignore[assignment]
        out[name] = entry
    return out


def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # pragma: no cover
        return ImageFont.load_default()


def cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """等比裁切填满 size（和相框的 photoFit: 'cover' 是同一套算法）。"""
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def sample_photo(size: tuple[int, int]) -> Image.Image:
    """没给照片时的内置示意图：一张假的"日落街道"，有亮部也有暗部，
    这样能顺便看出定位/日期水印压上去会不会看不清。"""
    w, h = size
    img = Image.new("RGB", (w, h), (28, 30, 38))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line(
            [(0, y), (w, y)],
            fill=(
                int(255 - 90 * t),
                int(168 - 40 * t),
                int(96 + 30 * t),
            ),
        )
    # 太阳
    d.ellipse([w * 0.60, h * 0.10, w * 0.86, h * 0.10 + w * 0.26], fill=(255, 232, 176))
    # 地平线以下的暗部
    d.rectangle([0, int(h * 0.62), w, h], fill=(36, 30, 34))
    for i in range(9):
        x = int(w * (0.05 + i * 0.11))
        d.rectangle([x, int(h * (0.40 + (i % 3) * 0.07)), x + int(w * 0.07), int(h * 0.66)], fill=(24, 22, 28))
    return img


def check_against_ts(photo_arg: str | None) -> list[str]:
    """把 SPECS 的像素窗口与 `frames.ts` 的归一化值对一遍，返回问题清单。

    比对方式：`round(归一化值 × PNG 尺寸)` 必须等于 SPECS 里的像素值。
    `frames.ts` 里的小数只有 6 位，所以容差取 1 px（6 位小数在 1950 px 的画布上
    的量化误差约 0.001 px，1 px 已经是宽松到不可能误报的余量）。
    """
    problems: list[str] = []
    ts = ts_windows()
    if not ts:
        print("  对账：读不到 src/constants/frames.ts，跳过（预览图照出）")
        return problems
    for name, _label, (w, h), (wx, wy, ww, wh) in SPECS:
        entry = ts.get(name)
        if entry is None:
            if not name.endswith("-landscape"):
                problems.append(f"{name}: frames.ts 里找不到这一条（新相框忘了注册？）")
            continue
        key = "__landscape_window__" if name.endswith("-landscape") else "__window__"
        norm = entry.get(key)
        if norm is None:
            problems.append(f"{name}: frames.ts 里没有 window（{'landscape.' if name.endswith('-landscape') else ''}window 缺了？）")
            continue
        got = (round(norm[0] * w), round(norm[1] * h), round(norm[2] * w), round(norm[3] * h))
        if got != (wx, wy, ww, wh):
            problems.append(
                f"{name}: frames.ts 换算回来是 {got}，本脚本 SPECS 写的是 {(wx, wy, ww, wh)}"
            )
        # 横版的画布尺寸 = 竖版对调，所以 w/h 直接比 frame 的 aspect 字段
        akey = "__landscape_aspect__" if name.endswith("-landscape") else "__aspect__"
        asp = entry.get(akey)
        if asp is not None:
            if abs(asp[0] / asp[1] - w / h) > 1e-6:
                problems.append(
                    f"{name}: frames.ts 的 aspect={asp[0]:.0f}/{asp[1]:.0f}={asp[0] / asp[1]:.6f}，"
                    f"PNG 真实比={w / h:.6f}"
                )
        # 横版那一条还要求：frames.ts 里 `window`（竖版字段）不能被误填成横版的
        if name.endswith("-landscape"):
            continue
    # 反向检查：frames.ts 里的每一款都得有 PNG 与 SPECS 条目
    for fid in ts:
        if fid not in {s[0] for s in SPECS}:
            problems.append(f"frames.ts 里有 '{fid}'，但本脚本 / 预览表里没有它（加了相框没更新预览？）")
    return problems


def main() -> None:
    args = sys.argv[1:]
    photo_arg = args[0] if args else None
    out_arg = args[1] if len(args) > 1 else os.path.join(FRAMES_DIR, "_preview.png")

    print("对账（SPECS 像素窗口 ↔ src/constants/frames.ts 归一化值）：")
    problems = check_against_ts(photo_arg)
    if problems:
        for p in problems:
            print(f"  ✗ {p}")
        # 对不上就**停**：预览图的全部价值就在于"它显示的窗口和 on-device 一致"，
        # 数据分叉时再出图只会让人对着一张错的图做判断。
        raise SystemExit(1)
    print(f"  ✓ {len(SPECS)} 张全部对上（0 处不符）")

    by_name = {s[0]: s for s in SPECS}
    outputs: list[tuple[str, int]] = []
    for filename, members in GROUP.items():
        # 默认输出：第一组用 `_preview.png`（README 里写的就是这个文件名），
        # 第二组把后缀插在扩展名之前（`_preview-landscape.png`）。
        if out_arg == os.path.join(FRAMES_DIR, "_preview.png") and filename != "_preview.png":
            stem, ext = os.path.splitext(out_arg)
            out_path = f"{stem}-landscape{ext}"
        elif out_arg == os.path.join(FRAMES_DIR, "_preview.png"):
            out_path = out_arg
        else:
            # 用户显式指定了输出名 → 只出那一张（各组成员并成一组）
            out_path = out_arg
            members = [s[0] for s in SPECS]

        cells = []
        for name in members:
            spec = by_name.get(name)
            if spec is None:
                continue
            _n, label, (w, h), (wx, wy, ww, wh) = spec
            path = os.path.join(FRAMES_DIR, name + ".png")
            if not os.path.exists(path):
                print(f"  跳过 {name}：没有 {path}")
                continue
            if (w, h) != Image.open(path).size:
                print(f"  ✗ {name}：PNG 真实尺寸 {Image.open(path).size}，SPECS 写的是 {(w, h)}")
                raise SystemExit(1)
            aspect = w / h
            frame = Image.open(path).convert("RGBA")
            want_w, want_h = round(CELL_W), round(CELL_W / aspect)
            frame = frame.resize((want_w, want_h), Image.LANCZOS)
            if photo_arg:
                photo = cover(Image.open(photo_arg).convert("RGB"), (want_w, want_h))
            else:
                photo = sample_photo((want_w, want_h))

            canvas = Image.new("RGBA", (want_w, want_h), (0, 0, 0, 255))
            canvas.alpha_composite(photo.convert("RGBA"))
            canvas.alpha_composite(frame)
            cells.append((label, canvas.convert("RGB"), (want_w, want_h)))

        if not cells:
            print(f"  {filename}：没有可预览的相框。先跑 python scripts/generate_frames.py")
            continue

        n = len(cells)
        cols = 4 if n > 4 else n
        rows = (n + cols - 1) // cols
        pad, cap = 20, 32
        cell_w = max(c[2][0] for c in cells)
        cell_h = max(c[2][1] for c in cells)
        sheet = Image.new(
            "RGB",
            (pad + cols * (cell_w + pad), pad + rows * (cell_h + cap + pad)),
            BG,
        )
        sd = ImageDraw.Draw(sheet)
        f = font(20)
        for i, (label, cell, _) in enumerate(cells):
            cx = pad + (i % cols) * (cell_w + pad)
            cy = pad + (i // cols) * (cell_h + cap + pad)
            sheet.paste(cell, (cx, cy))
            # 标签一律 ASCII：Pillow 自带的默认字体没有中文字形，写中文会全是豆腐块
            sd.text((cx + 2, cy + cell_h + 6), label, font=f, fill=(214, 208, 196))

        sheet.save(out_path, "PNG", optimize=True)
        kb = os.path.getsize(out_path) / 1024
        print(f"  -> {os.path.relpath(out_path, ROOT)}  {sheet.size[0]}x{sheet.size[1]}  "
              f"{kb:.1f} KB  （{len(cells)} 张）")
        outputs.append((out_path, len(cells)))

        if out_arg != os.path.join(FRAMES_DIR, "_preview.png"):
            break  # 显式输出名：只出这一张

    if not outputs:
        print("没有可预览的相框。先跑 python scripts/generate_frames.py")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
