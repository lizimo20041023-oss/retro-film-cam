# -*- coding: utf-8 -*-
"""重烤 assets/textures/grain.png（像素级平铺真银盐颗粒）与 assets/textures/light-leak.png（角落漏光）。

─────────────────────────────────────────────────────────────────────────────
v1.9.3（用户 m09629 手术一）：**不透明 50% 中灰基底 + 双极性银盐黑/白点**
─────────────────────────────────────────────────────────────────────────────
用户实测「重 (HV)」档仍像没开颗粒。根因不是密度不够，而是 **v1.9.2 的 alpha 载体
对比度太低**：背景全透明、颗粒本体 alpha = |偏差|（均值仅 0.2078），层 opacity
又被封顶在 0.055 —— 换算到成片上只有 ±1~2 个灰阶的抖动，肉眼不可能看见。

v1.9.3 回到「真实胶片板」的物理模型：

  · 基底 = 50% 中性灰 `#808080`（128/255）。overlay 对中灰是**不动点**
    （overlay(cb, 0.5) = cb），所以基底完全透明、绝不给照片蒙灰罩；
  · 高频暗部银盐（卤化银）黑点 `#18181C`（约 24,24,28）→ overlay 压暗；
  · 高频亮部银盐白点 `#E8E6E0`（约 232,230,224）→ overlay 提亮；
  · 两色覆盖率对称（各 7.5%，合计 15%），保证整张均值仍是 128（不偏灰也不偏亮）；
  · 基底再叠一层 σ=3 灰阶的微抖动，破掉纯平色带来的"数字位图"感；
  · 频率结构由**周期高斯场 + 分位数阈值**决定（`DOT_SIGMA=0.62px`），所有滤波都在
    周期性域里做（FFT），平铺接缝与图内相邻梯度同分布。

为什么"看得出颗粒"与"不蒙灰"能同时成立：overlay 的偏差权重是 `2·min(cb,1−cb)`，
中灰附近最大、纯黑纯白两端趋 0 —— 颗粒只在中灰附近显形，白墙/雪地/夜空都不会被
整体抬亮或压暗。层 opacity 由 `src/constants/grain.ts` 冻结为 0/.10/.18/.30/.42，
贴图对比度在此定死，运行时只改 opacity。

频带纪律（v1.8.2 门，v1.9.3 沿用，量在灰度亮度上）：
  `<8px ≥ 0.60`、`24–64px ≤ 0.06` —— 颗粒必须在"看得清"的小尺度，不能堆成大团块。
另外新增三道门：均值 ∈ [124,132]、灰度 σ ∈ [30,55]、黑白点覆盖率对称且合计 ∈ [12%,18%]、
中性基底像素（|v−128|≤6）≥ 60%。

─────────────────────────────────────────────────────────────────────────────
历史沿革（为什么脚本长这样）
─────────────────────────────────────────────────────────────────────────────
* v1.8.2：颗粒贴图旧版是 366 网格 + 1.4× 上采样 + 0.7px 微模糊，能量跑进大尺度，
  真机上变成"脏云雾"；改为直接在 512 网格生成 + 频带门。
* v1.9.2：改用 RGBA 透明背景 + alpha 载体（颗粒 = 白/黑点 × |偏差|），层 opacity
  封顶 0.055 —— 结果就是用户 m09629 说的"开了重档还是干净得像没开"。
* v1.9.3：本文件。回到不透明中性灰基底 + 双极性点（当前实现）。

用法（PATH 上的 python 是 Windows Store 桩，必须用工作区自带的解释器）：

    $env:PYTHONIOENCODING='utf-8'
    & "C:\\Users\\lizim\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" `
        retro-film-cam\\scripts\\generate_grain_clump.py

跑完必须再跑一次工作区根的 `_plate_stats.py` 刷新 `_plate_stats.json`
（`_haze_audit.mjs` 读的是那份 JSON 统计，不是 PNG 本身）。
"""

import hashlib
import os
import sys

import numpy as np
from PIL import Image

# ---------------------------------------------------------------- 常量（确定性）

SEED = 20261018
SIZE = 512

# v1.9.3 颗粒配方（用户 m09629 手术一）
BASE_LEVEL = 128                     # 50% 中性灰基底（overlay 不动点）
DARK_POINT = (24, 24, 28)            # #18181C 暗部银盐（卤化银）
LIGHT_POINT = (232, 230, 224)        # #E8E6E0 亮部银盐
DOT_SIGMA = 0.62                     # 点的团簇尺度（px）：<8px 频带的主体
DARK_COVER = 0.075                   # 暗点覆盖率（对称）
LIGHT_COVER = 0.075                  # 亮点覆盖率（对称）
BASE_DITHER_SIGMA = 3.0              # 基底微抖动（灰阶），破数字位图感

# 频带能量门槛（环带口径，见 band_energy）：v1.8.2 的"脏云雾"配方是 0.162。
BAND_FINE_MIN = 0.60                 # 周期 <8px 的能量占比下限
BAND_COARSE_MAX = 0.06               # 周期 24–64px 的能量占比上限
BAND_LABELS = (
    ("<8", 0.0, 8.0),
    ("8-24", 8.0, 24.0),
    ("24-64", 24.0, 64.0),
    ("64-160", 64.0, 160.0),
    (">160", 160.0, 1e9),
)

# v1.9.3 自检门槛
MEAN_LEVEL_MIN = 124.0
MEAN_LEVEL_MAX = 132.0
GRAY_STD_MIN = 30.0
GRAY_STD_MAX = 55.0
NEUTRAL_FRAC_MIN = 0.60              # |灰度−128| ≤ 6 的"中性基底"占比
COVER_TOTAL_MIN = 0.12
COVER_TOTAL_MAX = 0.18
COVER_ASYMMETRY_MAX = 0.01

GRAIN_OUT = r"assets\textures\grain.png"
LEAK_OUT = r"assets\textures\light-leak.png"

# 漏光：暖橙（255,140,56），右上角一条拉长的光斑 + 上边缘一条带
ORANGE = np.array([1.0, 0.549, 0.220])
LEAK_SIZE = 512
LEAK_PEAK_ALPHA = 0.62
LEAK_CUT = 0.16  # 低于此强度直接归零 → 保证 ≥60% 像素是 screen 中性


def wrap_blur(a, sigma):
    """周期性高斯模糊（FFT 乘高斯传递函数 = 首尾相接的卷积）。"""
    if sigma <= 0:
        return a
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2.0 * np.pi**2 * sigma**2 * (fx**2 + fy**2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def band_energy(arr):
    """环带能量占比（去掉直流）：周期 = SIZE / 半径，与探针里的口径一致。

    v1.9.3：入参是灰度亮度（0..255）—— 颗粒的可见强度全在亮度偏差上。
    """
    a = arr.astype(np.float64) / 255.0
    n = a.shape[0]
    f = np.fft.fftshift(np.fft.fft2(a - a.mean()))
    p = np.abs(f) ** 2
    c = n // 2
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.sqrt((yy - c) ** 2 + (xx - c) ** 2)
    period = np.where(r > 0, n / np.maximum(r, 1.0), 0.0)
    tot = p[r > 0].sum()
    out = {}
    for label, lo, hi in BAND_LABELS:
        sel = (period > lo) & (period <= hi) & (r > 0)
        out[label] = float(p[sel].sum() / tot)
    return out


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _periodic_field(rng, sigma):
    """零均值、单位方差的周期高斯随机场（用于做点的掩膜）。"""
    white = rng.standard_normal((SIZE, SIZE))
    field = wrap_blur(white, sigma)
    return (field - field.mean()) / field.std()


def _mask_at_coverage(field, coverage):
    """按分位数阈值取覆盖率恰为 coverage 的掩膜，并返回每个像素的"超出阈值"幅度。"""
    threshold = float(np.quantile(field, 1.0 - coverage))
    mask = field >= threshold
    return mask, field - threshold


def bake_grain():
    """烘出 512×512 RGB 颗粒贴图：中性灰基底 + 对称双极性银盐黑/白点。"""
    rng = np.random.default_rng(SEED)

    dark_field = _periodic_field(rng, DOT_SIGMA)
    light_field = _periodic_field(rng, DOT_SIGMA)
    dark_mask, dark_excess = _mask_at_coverage(dark_field, DARK_COVER)
    light_mask, light_excess = _mask_at_coverage(light_field, LIGHT_COVER)

    # 重叠像素只归给"超出阈值更多"的那一极，保持两色覆盖率对称、互不抵消。
    overlap = dark_mask & light_mask
    dark_only = (dark_mask & ~light_mask) | (overlap & (dark_excess >= light_excess))
    light_only = (light_mask & ~dark_mask) | (overlap & (dark_excess < light_excess))

    dither = rng.standard_normal((SIZE, SIZE)) * BASE_DITHER_SIGMA
    arr = np.full((SIZE, SIZE, 3), float(BASE_LEVEL))
    arr += dither[..., None]
    arr[dark_only] = np.array(DARK_POINT, dtype=float)
    arr[light_only] = np.array(LIGHT_POINT, dtype=float)
    img = np.clip(np.rint(arr), 0.0, 255.0).astype(np.uint8)

    gray = (
        0.2126 * img[..., 0].astype(np.float64)
        + 0.7152 * img[..., 1].astype(np.float64)
        + 0.0722 * img[..., 2].astype(np.float64)
    )
    # 无缝核对：跨接缝的相邻梯度 vs 图内相邻梯度（量在灰度上）。
    gx = np.abs(np.diff(gray, axis=1))
    gy = np.abs(np.diff(gray, axis=0))
    seam_x = np.abs(gray[:, 0] - gray[:, -1])
    seam_y = np.abs(gray[0, :] - gray[-1, :])

    dark_frac = float(dark_only.mean())
    light_frac = float(light_only.mean())
    report = {
        "mean": float(gray.mean()),
        "std": float(gray.std()),
        "dark_frac": dark_frac,
        "light_frac": light_frac,
        "neutral_frac": float((np.abs(gray - BASE_LEVEL) <= 6.0).mean()),
        "bands": band_energy(gray),
        "gx_mean": float(gx.mean()),
        "gx_p95": float(np.percentile(gx, 95)),
        "seam_x_mean": float(seam_x.mean()),
        "seam_x_p95": float(np.percentile(seam_x, 95)),
        "gy_mean": float(gy.mean()),
        "gy_p95": float(np.percentile(gy, 95)),
        "seam_y_mean": float(seam_y.mean()),
        "seam_y_p95": float(np.percentile(seam_y, 95)),
    }
    return img, report


def bake_leak():
    yy, xx = np.mgrid[0:LEAK_SIZE, 0:LEAK_SIZE].astype(float)
    u = xx / (LEAK_SIZE - 1.0)  # 0 = 左, 1 = 右
    v = yy / (LEAK_SIZE - 1.0)  # 0 = 上, 1 = 下
    # 从右上角斜着进来的一条光：椭圆高斯（横向拉长）+ 上边缘一条带
    core = np.exp(-1.6 * (((1.0 - u) / 0.62) ** 2 + ((v - 0.02) / 0.30) ** 2))
    band = np.exp(-(((v - 0.06) / 0.16) ** 2)) * np.exp(-(((1.0 - u) / 0.75) ** 2))
    t = np.clip(0.78 * core + 0.42 * band, 0.0, 1.0)
    t = smoothstep(LEAK_CUT, 0.62, t)  # 硬门槛：光只留在角落，其余像素纯黑
    alpha = np.clip(LEAK_PEAK_ALPHA * t**1.25, 0.0, 1.0)
    rgb = ORANGE[None, None, :] * (t**0.85)[..., None]

    arr = np.zeros((LEAK_SIZE, LEAK_SIZE, 4), dtype=np.uint8)
    arr[..., 0] = np.rint(rgb[..., 0] * 255.0)
    arr[..., 1] = np.rint(rgb[..., 1] * 255.0)
    arr[..., 2] = np.rint(rgb[..., 2] * 255.0)
    arr[..., 3] = np.rint(alpha * 255.0)
    arr[arr[..., 3] == 0] = 0  # 全透明处三通道也归零 = 严格的 screen 中性

    r = arr[..., 0] / 255.0
    g = arr[..., 1] / 255.0
    b = arr[..., 2] / 255.0
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    neutral = (r <= 0.02) & (g <= 0.02) & (b <= 0.02)
    report = {
        "mean_rgb": [round(float(r.mean()), 4), round(float(g.mean()), 4), round(float(b.mean()), 4)],
        "meanLum": round(float(lum.mean()), 4),
        "meanAlpha": round(float((arr[..., 3] / 255.0).mean()), 4),
        "maxAlpha": round(float((arr[..., 3] / 255.0).max()), 4),
        "fracScreenNeutral": round(float(neutral.mean()), 4),
        "fracLumGE50": round(float((lum >= 0.5).mean()), 4),
        "p95Lum": round(float(np.percentile(lum, 95)), 4),
    }
    return arr, report


def file_facts(path):
    """返回 (bytes, sha256)：给 Lead 报告与探针核对用的可复现指纹。"""
    with open(path, "rb") as f:
        data = f.read()
    return len(data), hashlib.sha256(data).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    root = sys.argv[1] if len(sys.argv) > 1 else "."

    grain, greport = bake_grain()
    grain_path = root + "\\" + GRAIN_OUT
    Image.fromarray(grain, mode="RGB").save(grain_path, optimize=True)
    gbytes, gsha = file_facts(grain_path)
    print("grain.png  %dx%d mode=RGB" % (SIZE, SIZE))
    print(
        "  灰度: mean=%.2f std=%.2f 暗点=%.2f%% 亮点=%.2f%% 中性基底=%.2f%%"
        % (
            greport["mean"],
            greport["std"],
            greport["dark_frac"] * 100.0,
            greport["light_frac"] * 100.0,
            greport["neutral_frac"] * 100.0,
        )
    )
    print(
        "  频带能量（周期）："
        + "  ".join("%s=%.1f%%" % (k, v * 100.0) for k, v in greport["bands"].items())
    )
    print(
        "  无缝：水平内部梯度 mean=%.3f 跨接缝 mean=%.3f | 垂直内部 mean=%.3f 跨接缝 mean=%.3f"
        % (
            greport["gx_mean"],
            greport["seam_x_mean"],
            greport["gy_mean"],
            greport["seam_y_mean"],
        )
    )
    print(
        "  跨接缝 p95=%.1f vs 内部 p95=%.1f"
        % (max(greport["seam_x_p95"], greport["seam_y_p95"]), greport["gx_p95"])
    )
    print("  bytes=%d  sha256=%s" % (gbytes, gsha))

    leak, lreport = bake_leak()
    leak_path = root + "\\" + LEAK_OUT
    Image.fromarray(leak, mode="RGBA").save(leak_path, optimize=True)
    lbytes, lsha = file_facts(leak_path)
    print("light-leak.png  %dx%d mode=RGBA" % (LEAK_SIZE, LEAK_SIZE))
    print(
        "  mean=%s meanLum=%.4f meanAlpha=%.4f maxAlpha=%.4f screenNeutral=%.1f%% lum>=50:%.1f%%"
        % (
            lreport["mean_rgb"],
            lreport["meanLum"],
            lreport["meanAlpha"],
            lreport["maxAlpha"],
            lreport["fracScreenNeutral"] * 100,
            lreport["fracLumGE50"] * 100,
        )
    )
    print("  bytes=%d  sha256=%s" % (lbytes, lsha))

    problems = []
    # v1.9.3：中性灰基底 + 对称双极性银盐点的存在性（不再是透明 alpha 载体）
    if not (MEAN_LEVEL_MIN <= greport["mean"] <= MEAN_LEVEL_MAX):
        problems.append(
            "grain 灰度均值偏离中灰: %.2f（要求 %.0f~%.0f）"
            % (greport["mean"], MEAN_LEVEL_MIN, MEAN_LEVEL_MAX)
        )
    if not (GRAY_STD_MIN <= greport["std"] <= GRAY_STD_MAX):
        problems.append(
            "grain 灰度对比度不在 [%.0f,%.0f]: %.2f —— 太高像雪花屏，太低又看不见"
            % (GRAY_STD_MIN, GRAY_STD_MAX, greport["std"])
        )
    cover_total = greport["dark_frac"] + greport["light_frac"]
    if not (COVER_TOTAL_MIN <= cover_total <= COVER_TOTAL_MAX):
        problems.append(
            "grain 黑/白点总覆盖率不在 [%.0f%%,%.0f%%]: %.2f%%"
            % (COVER_TOTAL_MIN * 100, COVER_TOTAL_MAX * 100, cover_total * 100)
        )
    if abs(greport["dark_frac"] - greport["light_frac"]) > COVER_ASYMMETRY_MAX:
        problems.append(
            "grain 黑/白点覆盖率不对称（会整体偏灰或偏亮）: 暗=%.4f 亮=%.4f"
            % (greport["dark_frac"], greport["light_frac"])
        )
    if greport["neutral_frac"] < NEUTRAL_FRAC_MIN:
        problems.append(
            "grain 中性基底占比不足（|v-128|≤6 仅 %.2f%%）—— 中灰基底是 overlay 透明的前提"
            % (greport["neutral_frac"] * 100.0)
        )
    # v1.8.2 根因门：颗粒的能量必须在"看得清"的小尺度上，不能堆成大团块
    if greport["bands"]["<8"] < BAND_FINE_MIN:
        problems.append(
            "grain <8px 频带能量不足（%.3f < %.2f）——会在大屏上显成脏云雾"
            % (greport["bands"]["<8"], BAND_FINE_MIN)
        )
    if greport["bands"]["24-64"] > BAND_COARSE_MAX:
        problems.append(
            "grain 24–64px 频带能量过高（%.3f > %.2f）——团块会被看成污渍"
            % (greport["bands"]["24-64"], BAND_COARSE_MAX)
        )
    for name, internal, seam in (
        ("x", greport["gx_mean"], greport["seam_x_mean"]),
        ("y", greport["gy_mean"], greport["seam_y_mean"]),
    ):
        if internal <= 0:
            problems.append("grain 内部梯度为 0（%s）" % name)
        elif abs(seam - internal) / internal > 0.25:
            problems.append(
                "grain 跨接缝梯度与图内不一致（%s）: seam=%.3f internal=%.3f" % (name, seam, internal)
            )
    if lreport["fracScreenNeutral"] < 0.60:
        problems.append("light-leak screen 中性区不足: %.3f" % lreport["fracScreenNeutral"])
    if lreport["meanLum"] > 0.25:
        problems.append("light-leak meanLum 偏高: %.4f" % lreport["meanLum"])
    if not (0.01 <= lreport["meanAlpha"] <= 0.15):
        problems.append("light-leak meanAlpha 不在 [0.01,0.15]: %.4f" % lreport["meanAlpha"])
    if lreport["maxAlpha"] > 0.80:
        problems.append("light-leak maxAlpha 太高: %.4f" % lreport["maxAlpha"])

    if problems:
        print("\n烘焙自检失败：")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("\n烘焙自检通过。")


if __name__ == "__main__":
    main()
