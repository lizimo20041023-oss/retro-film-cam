"""把 `assets/frames/` 里的相框拼成一张预览图，方便一眼比较。

用法（在项目根目录）：
    python scripts/preview_frames.py                       # 用内置的合成示意图
    python scripts/preview_frames.py 某张照片.jpg           # 用你自己的照片
    python scripts/preview_frames.py 照片.jpg 出图.png      # 指定输出文件名

产物默认写到 `assets/frames/_preview.png`（下划线开头，已被 .gitignore 排除）。

为什么值得单独有个脚本：相框的镂空窗口是**全透明**的，在系统看图器里
只会看到一片棋盘格 —— 光看 PNG 根本判断不出"照片放进去是什么样"。
这个脚本把每张相框按自己的 window 归一化值贴到同一张照片上，
8 张并排放，改一版看一版。
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FRAMES_DIR = os.path.join(ROOT, "assets", "frames")

# 和 src/constants/frames.ts 一一对应。这里只是预览用，真正的排版依据在那边，
# 但两处必须一致 —— 所以本脚本会顺便校验 PNG 尺寸和这里的 aspect 对不对得上。
FRAMES = [
    ("classic-white", "classic white", 1350 / 1800, (0.056296, 0.046667, 0.886667, 0.886667)),
    ("instant-square", "instant", 1425 / 1800, (0.054737, 0.051111, 0.890526, 0.705000)),
    ("film-35mm", "35mm rebate", 1350 / 1950, (0.155556, 0.138462, 0.688889, 0.635897)),
    ("darkroom", "darkroom", 1350 / 1800, (0.057778, 0.051111, 0.865185, 0.883333)),
    ("slide-mount", "slide mount", 1350 / 1350, (0.125926, 0.311111, 0.748148, 0.499259)),
    ("orange-base", "orange base", 1350 / 1800, (0.111111, 0.144444, 0.777778, 0.777778)),
    ("crop-marks", "crop marks", 1350 / 1800, (0.071111, 0.060000, 0.857778, 0.880000)),
    ("archive-card", "archive card", 1350 / 1800, (0.222222, 0.083333, 0.711111, 0.711111)),
]

CELL_W = 430  # 每格宽度（px），4×2 排布
BG = (18, 18, 17)


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


def main() -> None:
    args = sys.argv[1:]
    photo_arg = args[0] if args else None
    out_arg = args[1] if len(args) > 1 else os.path.join(FRAMES_DIR, "_preview.png")

    cells = []
    for name, label, aspect, window in FRAMES:
        path = os.path.join(FRAMES_DIR, name + ".png")
        if not os.path.exists(path):
            print(f"  跳过 {name}：没有 {path}")
            continue
        frame = Image.open(path).convert("RGBA")
        # 校验 PNG 的真实宽高比和这张表里写的 aspect 是否一致 ——
        # 不一致说明 frames.ts 里的数字抄错了，那会在成片里被拉伸变形
        real = frame.size[0] / frame.size[1]
        if abs(real - aspect) > 0.002:
            print(f"  注意 {name}：PNG 真实宽高比 {real:.4f}，本表写的是 {aspect:.4f}")
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
        print("没有可预览的相框。先跑 python scripts/generate_frames.py")
        raise SystemExit(1)

    cols = 4
    rows = (len(cells) + cols - 1) // cols
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

    sheet.save(out_arg, "PNG", optimize=True)
    print(f"  -> {os.path.relpath(out_arg, ROOT)}  {sheet.size[0]}x{sheet.size[1]}  "
          f"{os.path.getsize(out_arg) / 1024:.1f} KB  （{len(cells)} 张）")


if __name__ == "__main__":
    main()
