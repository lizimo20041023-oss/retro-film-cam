#!/usr/bin/env python3
"""调色管线模拟器：把 buildGradeLayers() 的图层栈在 Python 里重放一遍，直接看结果。

**为什么需要它**：本项目没有真机可用，而"颗粒/CCD 质感"这类东西光看参数完全无法判断。
这个脚本用 numpy 实现了与 CoreImage 同源的 W3C 混合公式（RN 的 mixBlendMode 在 iOS 上
就是 CALayer.compositingFilter），按 src/utils/gradeLayers.ts 的**同一顺序**叠层，
所以能相当接近地预览成片观感。

**它不模拟什么**：
  * iOS 的渲染细节（drawViewHierarchyInRect 的重采样、色彩管理）
  * JPEG 压缩、相框 PNG 的透明窗口抗锯齿
  * 真实照片的色域（这里用程序生成的测试场景）

**关键保真度设定 `PIXEL_SCALE = 3`**：贴图 1 px = 1 逻辑点，而捕获发生在 3x 屏幕上，
所以 1 个贴图像素最终占 3×3 个输出像素 —— 脚本会把平铺贴图放大 3 倍后再铺，
这样看到的"颗粒有多糊"才是真的。

用法：
    python scripts/preview_grade.py

输出：
    assets/textures/_grade-preview.png   九宫格整幅预览
    assets/textures/_grade-grain.png     九宫格 1:1 裁切（看颗粒）
"""

from __future__ import annotations

import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTURE_DIR = os.path.join(ROOT, "assets", "textures")
FRAME_DIR = os.path.join(ROOT, "assets", "frames")
PRESETS_TS = os.path.join(ROOT, "src", "constants", "presets.ts")

PIXEL_SCALE = 3                     # 舞台 1 逻辑点 -> 捕获后 3 像素
# 预览画布 = polaroid-600 的等比缩小（1408x1712 的 0.75 倍）。
# 下面第 480 行把相框 PNG **拉伸**到画布尺寸，所以画布宽高比必须等于相框宽高比
# （1408/1712 = 0.822430），否则纸边会被拉变形。
CANVAS = (1056, 1284)
FRAME_FILE = "polaroid-600.png"
FRAME_WINDOW = (0.051136, 0.042056, 0.897727, 0.738318)   # 与 frames.ts 一致
GRAIN_TILE_PT = 512                 # grain.png 的逻辑点边长（= 文件像素，1x 资源）


# --------------------------------------------------------------------------
# W3C / PDF 混合公式（CoreImage 的 *BlendMode 家族同源）
# --------------------------------------------------------------------------
def _lum(c: np.ndarray) -> np.ndarray:
    return 0.3 * c[..., 0:1] + 0.59 * c[..., 1:2] + 0.11 * c[..., 2:3]


def _clip_color(c: np.ndarray) -> np.ndarray:
    l = _lum(c)
    n = c.min(axis=-1, keepdims=True)
    x = c.max(axis=-1, keepdims=True)
    c = np.where(n < 0, l + (c - l) * l / np.maximum(l - n, 1e-6), c)
    c = np.where(x > 1, l + (c - l) * (1 - l) / np.maximum(x - l, 1e-6), c)
    return np.clip(c, 0.0, 1.0)


def _set_lum(c: np.ndarray, l: np.ndarray) -> np.ndarray:
    return _clip_color(c + (l - _lum(c)))


def _sat(c: np.ndarray) -> np.ndarray:
    return c.max(axis=-1, keepdims=True) - c.min(axis=-1, keepdims=True)


def _set_sat(c: np.ndarray, s: np.ndarray) -> np.ndarray:
    mn = c.min(axis=-1, keepdims=True)
    mx = c.max(axis=-1, keepdims=True)
    rng = mx - mn
    nz = rng > 1e-6
    scaled = (c - mn) / np.where(nz, rng, 1.0) * s
    out = np.where(nz, scaled, 0.0)
    out = np.where(nz & (c >= mx - 1e-6), s, out)
    out = np.where(nz & (c <= mn + 1e-6), 0.0, out)
    return np.clip(out, 0.0, 1.0)


def blend_normal(b, s):
    return s


def blend_multiply(b, s):
    return b * s


def blend_screen(b, s):
    return b + s - b * s


def blend_overlay(b, s):
    return np.where(b <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))


def blend_darken(b, s):
    return np.minimum(b, s)


def blend_lighten(b, s):
    return np.maximum(b, s)


def blend_soft_light(b, s):
    d = np.where(b <= 0.25, ((16 * b - 12) * b + 4) * b, np.sqrt(np.maximum(b, 0.0)))
    return np.where(
        s <= 0.5,
        b - (1 - 2 * s) * b * (1 - b),
        b + (2 * s - 1) * (d - b),
    )


def blend_hard_light(b, s):
    return np.where(s <= 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))


def blend_color_dodge(b, s):
    return np.where(s >= 1.0, 1.0, np.minimum(1.0, b / np.maximum(1 - s, 1e-6)))


def blend_color_burn(b, s):
    return np.where(s <= 0.0, 0.0, 1 - np.minimum(1.0, (1 - b) / np.maximum(s, 1e-6)))


def blend_difference(b, s):
    return np.abs(b - s)


def blend_exclusion(b, s):
    return b + s - 2 * b * s


def blend_saturation(b, s):
    return _set_lum(_set_sat(b, _sat(s)), _lum(b))


def blend_color(b, s):
    return _set_lum(s, _lum(b))


def blend_luminosity(b, s):
    return _set_lum(b, _lum(s))


BLEND = {
    "normal": blend_normal,
    "multiply": blend_multiply,
    "screen": blend_screen,
    "overlay": blend_overlay,
    "darken": blend_darken,
    "lighten": blend_lighten,
    "soft-light": blend_soft_light,
    "hard-light": blend_hard_light,
    "color-dodge": blend_color_dodge,
    "color-burn": blend_color_burn,
    "difference": blend_difference,
    "exclusion": blend_exclusion,
    "saturation": blend_saturation,
    "color": blend_color,
    "luminosity": blend_luminosity,
}


# --------------------------------------------------------------------------
# 从 TypeScript 源码里读预设（避免在 Python 里抄一份参数表导致两边漂移）
# --------------------------------------------------------------------------
NUMERIC_KEYS = (
    "temperature", "tint", "saturation", "contrast", "fade", "exposure",
    "grain", "dust", "vignette", "lightLeak", "bloom",
)


def parse_presets() -> list[dict]:
    with open(PRESETS_TS, "r", encoding="utf-8") as fh:
        text = fh.read()

    body = text[text.index("export const PRESETS"):]
    body = body[body.index("["):]

    entries = []
    depth = 0
    start = None
    for i, ch in enumerate(body):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                entries.append(body[start:i + 1])
                start = None

    presets = []
    for raw in entries:
        ident = re.search(r"id:\s*'([^']+)'", raw)
        name = re.search(r"name:\s*'([^']+)'", raw)
        if not ident:
            continue
        preset = {"id": ident.group(1), "name": name.group(1) if name else ident.group(1)}
        for key in NUMERIC_KEYS:
            m = re.search(rf"\b{key}:\s*(-?[0-9.]+)", raw)
            if m:
                preset[key] = float(m.group(1))
        m = re.search(r"lightLeakFlip:\s*(true|false)", raw)
        if m:
            preset["lightLeakFlip"] = m.group(1) == "true"
        presets.append(preset)
    return presets


PRESET_DEFAULTS = {
    "temperature": 0.0, "tint": 0.0, "saturation": 1.0, "contrast": 1.0,
    "fade": 0.0, "exposure": 0.0, "grain": 0.088,
    "dust": 0.0, "vignette": 0.18, "lightLeak": 0.0, "bloom": 0.0,
    "lightLeakFlip": False,
}


def resolve(preset: dict) -> dict:
    out = dict(PRESET_DEFAULTS)
    out.update(preset)
    return out


# --------------------------------------------------------------------------
# 与 buildGradeLayers() 等价的图层构造（顺序必须完全一致）
# --------------------------------------------------------------------------
WARM = (1.0, 0.588, 0.251)        # #FF9640
COOL = (0.298, 0.553, 1.0)        # #4C8DFF
TINT_GREEN = (0.220, 0.659, 0.361)  # #38A85C
TINT_MAGENTA = (0.753, 0.357, 0.847)  # #C05BD8
NEUTRAL_GRAY = (0.502, 0.502, 0.502)  # #808080
SAT_BOOST = (1.0, 0.231, 0.188)   # #FF3B30
FADE_LIFT = (0.110, 0.110, 0.110)  # #1C1C1C
MAGENTA = (0.845, 0.298, 0.741)   # #D84CBC
CYAN = (0.302, 0.788, 0.816)      # #4DC9D0
AMBER = (1.0, 0.706, 0.310)       # #FFB44F
COOL_SHADOW = (0.094, 0.180, 0.243)   # #182E3E
WARM_HIGHLIGHT = (1.0, 0.949, 0.851)  # #FFF2D9
HALATION = (0.102, 0.039, 0.0)        # #1A0A00


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def build_layers(p: dict) -> list[dict]:
    layers: list[dict] = []

    if p["temperature"] != 0:
        t = max(-1.0, min(1.0, p["temperature"]))
        layers.append({"kind": "color", "key": "temperature", "label": "色温",
                       "blendMode": "soft-light", "color": WARM if t > 0 else COOL,
                       "opacity": clamp01(abs(t) * 0.9)})

    if p["tint"] != 0:
        t = max(-1.0, min(1.0, p["tint"]))
        layers.append({"kind": "color", "key": "tint", "label": "色调",
                       "blendMode": "soft-light", "color": TINT_MAGENTA if t > 0 else TINT_GREEN,
                       "opacity": clamp01(abs(t) * 0.55)})

    # 新：CCD 式分离色调 —— 暗部压青蓝（lighten 只抬高暗部），高光加暖（darken 只压低高光）
    st = p.get("splitTone", 0.0)
    if st > 0:
        layers.append({"kind": "color", "key": "shadow-tint", "label": "暗部青蓝",
                       "blendMode": "lighten", "color": COOL_SHADOW, "opacity": clamp01(st)})
        layers.append({"kind": "color", "key": "highlight-tint", "label": "高光暖",
                       "blendMode": "darken", "color": WARM_HIGHLIGHT, "opacity": clamp01(st * 0.9)})

    if p["saturation"] != 1:
        sat = p["saturation"]
        layers.append({"kind": "color", "key": "saturation", "label": "饱和度",
                       "blendMode": "saturation",
                       "color": NEUTRAL_GRAY if sat < 1 else SAT_BOOST,
                       "opacity": clamp01(1 - sat) if sat < 1 else clamp01((sat - 1) * 0.85)})

    if p["contrast"] != 1:
        c = p["contrast"]
        if c > 1:
            layers.append({"kind": "photo", "key": "contrast", "label": "对比度",
                           "blendMode": "overlay", "opacity": clamp01(c - 1)})
        else:
            layers.append({"kind": "color", "key": "contrast", "label": "对比度",
                           "blendMode": "normal", "color": NEUTRAL_GRAY,
                           "opacity": clamp01((1 - c) * 0.9)})

    if p["fade"] > 0:
        layers.append({"kind": "color", "key": "fade", "label": "褪色",
                       "blendMode": "lighten", "color": FADE_LIFT,
                       "opacity": clamp01(p["fade"])})

    if p["exposure"] > 0:
        layers.append({"kind": "color", "key": "exposure-up", "label": "曝光",
                       "blendMode": "screen", "color": (1.0, 1.0, 1.0),
                       "opacity": clamp01(p["exposure"] * 0.35)})
    elif p["exposure"] < 0:
        layers.append({"kind": "color", "key": "exposure-down", "label": "曝光",
                       "blendMode": "multiply", "color": (0.0, 0.0, 0.0),
                       "opacity": clamp01(-p["exposure"] * 0.45)})

    # 光晕：深暖色 + color-dodge —— 偏移正比于底色，所以只在高光显形（halation）
    if p.get("bloom", 0.0) > 0:
        layers.append({"kind": "color", "key": "bloom", "label": "光晕",
                       "blendMode": "color-dodge", "color": HALATION,
                       "opacity": clamp01(p["bloom"])})

    # 颗粒：唯一的"质感"旋钮。这里曾经还有一层 CCD 色噪（chroma-noise.png，品红↔绿块状色斑），
    # 它是满屏紫绿伪色的来源，已连同贴图和 grainChroma 参数一起彻底删除 —— 不要再加回来。
    if p["grain"] > 0:
        layers.append({"kind": "texture", "key": "grain", "label": "颗粒",
                       "texture": "grain.png", "resizeMode": "repeat",
                       "blendMode": "overlay", "opacity": clamp01(p["grain"])})

    # 新：灰尘与划痕
    if p.get("dust", 0.0) > 0:
        layers.append({"kind": "texture", "key": "dust", "label": "灰尘",
                       "texture": "dust.png", "resizeMode": "repeat",
                       "blendMode": "screen", "opacity": clamp01(p["dust"])})

    if p["vignette"] > 0:
        layers.append({"kind": "texture", "key": "vignette", "label": "暗角",
                       "texture": "vignette.png", "resizeMode": "stretch",
                       "blendMode": "multiply", "opacity": clamp01(p["vignette"])})

    if p["lightLeak"] > 0:
        layers.append({"kind": "texture", "key": "light-leak", "label": "漏光",
                       "texture": "light-leak.png", "resizeMode": "stretch",
                       "blendMode": "screen", "opacity": clamp01(p["lightLeak"]),
                       "flipX": bool(p.get("lightLeakFlip"))})

    return layers


# --------------------------------------------------------------------------
# 图层求值
# --------------------------------------------------------------------------
_texture_cache: dict[str, Image.Image] = {}


def load_texture(name: str) -> Image.Image:
    if name not in _texture_cache:
        _texture_cache[name] = Image.open(os.path.join(TEXTURE_DIR, name)).convert("RGBA")
    return _texture_cache[name]


def tiled(texture: Image.Image, w: int, h: int, scale: int) -> np.ndarray:
    """按 1 贴图像素 = scale 输出像素 平铺铺满 w×h。"""
    src = texture
    if scale != 1:
        src = src.resize((src.width * scale, src.height * scale), Image.BICUBIC)
    reps_x = int(np.ceil(w / src.width))
    reps_y = int(np.ceil(h / src.height))
    canvas = Image.new("RGBA", (reps_x * src.width, reps_y * src.height))
    for j in range(reps_y):
        for i in range(reps_x):
            canvas.paste(src, (i * src.width, j * src.height))
    return np.asarray(canvas.crop((0, 0, w, h)), dtype=np.float32) / 255.0


def apply_layers(photo: np.ndarray, layers: list[dict]) -> np.ndarray:
    """photo: (H, W, 3) float32 in [0,1]。返回同样形状。"""
    h, w = photo.shape[:2]
    out = photo
    for layer in layers:
        mode = layer["blendMode"]
        if mode == "normal" and layer["kind"] != "color":
            mode = "normal"
        fn = BLEND.get(mode)
        if fn is None:
            continue

        if layer["kind"] == "color":
            color = np.array(layer["color"], dtype=np.float32).reshape(1, 1, 3)
            src = np.broadcast_to(color, (h, w, 3))
            alpha = np.full((h, w, 1), layer["opacity"], dtype=np.float32)

        elif layer["kind"] == "photo":
            src = out if layer.get("blurred") else photo
            if layer.get("blurred"):
                blurred = Image.fromarray((src * 255).astype(np.uint8)).filter(
                    ImageFilter.GaussianBlur(radius=w * 0.045))
                src = np.asarray(blurred, dtype=np.float32) / 255.0
            alpha = np.full((h, w, 1), layer["opacity"], dtype=np.float32)

        else:  # texture
            tex = load_texture(layer["texture"])
            if layer.get("flipX"):
                tex = tex.transpose(Image.FLIP_LEFT_RIGHT)
            if layer["resizeMode"] == "repeat":
                rgba = tiled(tex, w, h, PIXEL_SCALE)
            else:
                rgba = np.asarray(tex.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0
            src = rgba[..., :3]
            alpha = rgba[..., 3:4] * layer["opacity"]

        blended = fn(out, src)
        out = alpha * blended + (1.0 - alpha) * out

    return np.clip(out, 0.0, 1.0)


# --------------------------------------------------------------------------
# 测试场景
# --------------------------------------------------------------------------
def make_test_photo(w: int = 1200, h: int = 1600) -> np.ndarray:
    """夕阳天空 + 太阳 + 山影 + 底部 6 个参考色块（肤色/绿叶/天蓝/18%灰/白/黑）。"""
    strip_h = int(h * 0.17)
    scene_h = h - strip_h

    yy, xx = np.mgrid[0:scene_h, 0:w].astype(np.float32)
    t = (yy / scene_h)[..., None]
    top = np.array([26, 40, 84], dtype=np.float32)
    mid = np.array([118, 92, 132], dtype=np.float32)
    bottom = np.array([236, 152, 82], dtype=np.float32)
    sky = np.where(t < 0.5, top + (mid - top) * (t / 0.5), mid + (bottom - mid) * ((t - 0.5) / 0.5))

    sun_cx, sun_cy, sun_r = w * 0.66, scene_h * 0.34, w * 0.072
    dist = np.sqrt((xx - sun_cx) ** 2 + (yy - sun_cy) ** 2)
    glow = np.clip(1.0 - dist / (w * 0.55), 0, 1)[..., None] ** 3
    sky = sky + glow * np.array([70, 46, 16], dtype=np.float32)
    disc = (dist < sun_r)[..., None]
    sky = np.where(disc, np.array([255, 246, 220], dtype=np.float32), sky)

    # 山影
    ridge = scene_h * 0.66 + np.sin(xx / w * 5.5) * scene_h * 0.035 + np.sin(xx / w * 13.0) * scene_h * 0.012
    hills = (yy > ridge)[..., None]
    hill_col = np.array([34, 30, 36], dtype=np.float32) + (yy / scene_h)[..., None] * 14
    sky = np.where(hills, hill_col, sky)

    patches = [
        (222, 168, 140), (86, 110, 54), (120, 160, 210),
        (117, 117, 117), (242, 240, 236), (20, 20, 22),
    ]
    strip = np.zeros((strip_h, w, 3), dtype=np.float32)
    pw = w // len(patches)
    for i, color in enumerate(patches):
        x0 = i * pw
        x1 = w if i == len(patches) - 1 else (i + 1) * pw
        strip[:, x0:x1] = np.array(color, dtype=np.float32)

    photo = np.concatenate([sky, strip], axis=0)
    return np.clip(photo, 0, 255) / 255.0


# --------------------------------------------------------------------------
# 渲染
# --------------------------------------------------------------------------
def fit_cover(photo: np.ndarray, w: int, h: int) -> np.ndarray:
    ph, pw = photo.shape[:2]
    scale = max(w / pw, h / ph)
    nw, nh = int(round(pw * scale)), int(round(ph * scale))
    img = Image.fromarray((photo * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return np.asarray(img.crop((left, top, left + w, top + h)), dtype=np.float32) / 255.0


def render(photo: np.ndarray, preset: dict, canvas=CANVAS) -> np.ndarray:
    cw, ch = canvas
    wx = int(round(FRAME_WINDOW[0] * cw))
    wy = int(round(FRAME_WINDOW[1] * ch))
    ww = int(round(FRAME_WINDOW[2] * cw))
    wh = int(round(FRAME_WINDOW[3] * ch))

    window = fit_cover(photo, ww, wh)
    window = apply_layers(window, build_layers(resolve(preset)))

    frame = Image.open(os.path.join(FRAME_DIR, FRAME_FILE)).convert("RGBA").resize((cw, ch), Image.LANCZOS)
    base = np.zeros((ch, cw, 3), dtype=np.float32)
    base[wy:wy + wh, wx:wx + ww] = window
    falpha = np.asarray(frame, dtype=np.float32)[..., 3:4] / 255.0
    fcolor = np.asarray(frame, dtype=np.float32)[..., :3] / 255.0
    return np.clip(falpha * fcolor + (1 - falpha) * base, 0, 1)


def label_font(size: int):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf"):
        path = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def contact_sheet(images: list[tuple[str, np.ndarray]], cols: int, tile: tuple[int, int], out_path: str):
    tw, th = tile
    rows = int(np.ceil(len(images) / cols))
    pad, cap = 16, 34
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + cap + pad) + pad), (22, 22, 24))
    draw = ImageDraw.Draw(sheet)
    font = label_font(20)
    for i, (name, arr) in enumerate(images):
        r, c = divmod(i, cols)
        x = pad + c * (tw + pad)
        y = pad + r * (th + cap + pad)
        sheet.paste(Image.fromarray((arr * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS), (x, y))
        draw.text((x + 2, y + th + 6), name, fill=(214, 206, 192), font=font)
    sheet.save(out_path)
    return out_path


def measure_grain(window: np.ndarray) -> str:
    """量一下平滑天空区域的高频标准差（判断颗粒够不够）。"""
    patch = window[int(window.shape[0] * 0.08):int(window.shape[0] * 0.22),
                   int(window.shape[1] * 0.05):int(window.shape[1] * 0.35)]
    lum = _lum(patch)[..., 0]
    hp = lum - np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(radius=6)), dtype=np.float32) / 255.0
    return f"σ={hp.std() * 255:.2f} 级"


def window_box(canvas=CANVAS) -> tuple[int, int, int, int]:
    cw, ch = canvas
    return (int(round(FRAME_WINDOW[0] * cw)), int(round(FRAME_WINDOW[1] * ch)),
            int(round(FRAME_WINDOW[2] * cw)), int(round(FRAME_WINDOW[3] * ch)))


def main() -> int:
    presets = parse_presets()
    if not presets:
        print("没解析出任何预设，检查 presets.ts 结构", file=sys.stderr)
        return 1

    photo = make_test_photo()
    wx, wy, ww, wh = window_box()
    fulls, crops = [], []
    print(f"预设 {len(presets)} 个，画布 {CANVAS[0]}x{CANVAS[1]}，照片窗口 {ww}x{wh}（PIXEL_SCALE={PIXEL_SCALE}）")
    for preset in presets:
        p = resolve(preset)
        frame = render(photo, preset)
        window = frame[wy:wy + wh, wx:wx + ww]
        crop_y = int(wh * 0.06)
        crop_x = int(ww * 0.06)
        crop = window[crop_y:crop_y + 340, crop_x:crop_x + 340]
        fulls.append((preset["name"], frame))
        crops.append((preset["name"], crop))
        print(f"  {preset['id']:<14} grain={p['grain']:.2f} "
              f"dust={p.get('dust', 0):.2f}  →  天空高频 {measure_grain(window)}")

    out1 = contact_sheet(fulls, 3, (330, 440), os.path.join(TEXTURE_DIR, "_grade-preview.png"))
    out2 = contact_sheet(crops, 3, (330, 330), os.path.join(TEXTURE_DIR, "_grade-grain.png"))
    print(f"\n-> {os.path.relpath(out1, ROOT)}")
    print(f"-> {os.path.relpath(out2, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
