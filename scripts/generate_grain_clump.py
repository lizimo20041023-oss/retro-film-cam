# -*- coding: utf-8 -*-
"""重烤 assets/textures/grain.png（全画幅非周期微米银盐板）与 assets/textures/light-leak.png（角落漏光）。

─────────────────────────────────────────────────────────────────────────────
v1.9.4（用户 m10195 手术二）：**全画幅 1200×1600 RGBA 透明基底 + 双极性银盐粒子**
─────────────────────────────────────────────────────────────────────────────
v1.9.3 的 512×512 不透明中灰板 + `overlay` 黑点在真机上被看穿：颗粒是**小尺寸周期平铺**
（`planTextureTiles` 每 170.67pt 重复一块），蓝天上出现肉眼可见的「重复网格黑麻点阵列
（纱窗效应）」。用户 m10195 要求彻底废除周期性平铺，改为**整幅一次性的非周期银盐噪点**。

v1.9.4 的物理模型：

  · 画幅 = **1200×1600** 整块板（一次铺满画面，绝不平铺、绝不 repeat）；
  · 基底 **全透明**（alpha=0，RGB 也归零）—— 没有中性灰底，也就不会给照片蒙灰罩；
    混合模式从 overlay 换回 **soft-light**（v1.9.4 图层配置给出），只增加肌理、绝不动
    蓝天/白墙的色相与明度；
  · 粒子 50%:50% 双极性：
      - 亮部银盐粒子 RGB `(255,252,245)`，核心 alpha **0.42**（107/255）；
      - 暗部卤化银粒子 RGB `(28,26,24)`，核心 alpha **0.32**（82/255）；
  · 半径 `0.55 ~ 0.95` px（亚像素圆心），覆盖像素以 d=r 为阈值取整（无灰边）；
  · 位置 = **随机均匀撒点**（不是网格；网格会在格子周期的整数倍处留下可测伪周期），
    所有非零像素的三个通道都严格等于两个调色板之一（绝不出现第三种颜色/彩噪）；
  · 亮/暗极性**随机打乱**（不是隔行交替）—— 隔行交替会留下 2 格周期的明暗纹理，
    512-lag 自相关不为零，正好会被蓝天的"网格感"投诉命中；
  · 确定性：`numpy.random.default_rng(20261019)`，重跑逐字节一致。

自检门（脚本 exit 1 即失败）：
  · 透明像素占比 ∈ [0.70, 0.95]；平均 alpha ∈ [0.04, 0.12]；
  · 亮/暗粒子数量严格相等（50:50）；
  · **所有非零 alpha 像素的 RGB 只能是两个调色板之一**（无混色、无彩噪）；
  · 峰值 alpha = 107/255、128±? 不适用；亮核 ≥0.40、暗核 ≥0.30；
  · 非周期性：alpha 的 512-lag 自相关（x / y / 对角）≤ 0.02；
  · 频带（周期）：`<8px` 是主体（≥0.60）、`24–64px` 基本没有（≤0.06）。

用法（PATH 上的 python 是 Windows Store 桩，必须用工作区自带的解释器）：

    $env:PYTHONIOENCODING='utf-8'
    & "C:\\Users\\lizim\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" `
        retro-film-cam\\scripts\\generate_grain_clump.py

跑完必须再跑一次工作区根的 `_plate_stats.py` 刷新 `_plate_stats.json`
（`_haze_audit.mjs` 读的是那份 JSON 统计，不是 PNG 本身）。

─────────────────────────────────────────────────────────────────────────────
历史沿革
─────────────────────────────────────────────────────────────────────────────
* v1.8.2：旧版 366 网格 + 1.4× 上采样 + 0.7px 微模糊，能量跑进大尺度 → 真机「脏云雾」；
  改为 512 网格 + 频带门。
* v1.9.2：RGBA 透明背景 + alpha 载体，层 opacity 封顶 0.055 → 用户 m09629「像没开」。
* v1.9.3：不透明中性灰基底 + overlay 双极点 → 用户 m10195 蓝天「纱窗网格黑麻点」。
* v1.9.4：本文件。全画幅非周期透明银盐板 + soft-light（当前实现）。
"""

import hashlib
import sys

import numpy as np
from PIL import Image

# ---------------------------------------------------------------- 常量（确定性）

SEED = 20261019

# 全画幅银盐板（一次铺满整个照片窗口，不平铺）
PLATE_W = 1200
PLATE_H = 1600

# 粒子总数（随机均匀撒点）：394×394 = 155,236，亮/暗各半
GRID_COLS = 394
GRID_ROWS = 394

# 粒子（用户 m10195 冻结数值）
LIGHT_RGB = (255, 252, 245)   # rgba(255,252,245)
DARK_RGB = (28, 26, 24)       # rgba(28,26,24)
LIGHT_CORE = 0.42             # 107/255
DARK_CORE = 0.32              # 82/255
RADIUS_MIN = 0.55
RADIUS_MAX = 0.95
AA_SOFT_PX = 0.45             # 覆盖率阈值带：d=r 处恰好 0.5 ⇒ 亚像素圆心落进整像素

# 自检门槛
TRANSPARENT_MIN = 0.70
TRANSPARENT_MAX = 0.95
MEAN_ALPHA_MIN = 0.04
MEAN_ALPHA_MAX = 0.12
LIGHT_CORE_MIN = 0.40
DARK_CORE_MIN = 0.30
AUTOCORR_MAX = 0.02
BAND_FINE_MIN = 0.60          # 周期 <8px 的能量占比下限
BAND_COARSE_MAX = 0.06        # 周期 24–64px 的能量占比上限
BAND_LABELS = (
    ("<8", 0.0, 8.0),
    ("8-24", 8.0, 24.0),
    ("24-64", 24.0, 64.0),
    ("64-160", 64.0, 160.0),
    (">160", 160.0, 1e9),
)

GRAIN_OUT = r"assets\textures\grain.png"
LEAK_OUT = r"assets\textures\light-leak.png"

# 漏光：暖橙（255,140,56），右上角一条拉长的光斑 + 上边缘一条带（v1.8.0 起逐字保留）
ORANGE = np.array([1.0, 0.549, 0.220])
LEAK_SIZE = 512
LEAK_PEAK_ALPHA = 0.62
LEAK_CUT = 0.16


# ---------------------------------------------------------------- 通用工具


def smoothstep(edge0, edge1, x):
    """t in [0,1] -> 3t²-2t³（两端导数为 0）。"""
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def band_energy(arr):
    """环带能量占比（去掉直流）。周期 = 1 / 径向频率（像素）。支持非方形板。"""
    a = arr.astype(np.float64)
    a = a - a.mean()
    f = np.fft.fftshift(np.fft.fft2(a))
    p = np.abs(f) ** 2
    fy = np.fft.fftshift(np.fft.fftfreq(arr.shape[0]))[:, None]
    fx = np.fft.fftshift(np.fft.fftfreq(arr.shape[1]))[None, :]
    r = np.sqrt(fy**2 + fx**2)
    period = np.where(r > 0, 1.0 / np.maximum(r, 1e-12), 0.0)
    tot = p[r > 0].sum()
    out = {}
    for label, lo, hi in BAND_LABELS:
        sel = (period > lo) & (period <= hi) & (r > 0)
        out[label] = float(p[sel].sum() / tot)
    return out


def autocorr_lag(arr, lag):
    """给定 lag 的归一化自相关（去均值、按方差归一化）。"""
    a = arr.astype(np.float64)
    a = a - a.mean()
    var = float((a * a).mean())
    if var <= 0:
        return 1.0
    return float((a * np.roll(a, lag, axis=1)).mean() / var)


def _splat(px, py, radii, core, shape):
    """把一批亚像素圆粒子叠进 alpha 场（3×3 邻域，覆盖率阈值取整像素，取 max）。

    颗粒只落在整像素上（alpha 只有 0 与核心值两级），这样"每个非零像素都是纯
    亮/暗调色板"与"平均覆盖别太大"能同时成立；亚像素只体现在圆心位置与半径上。
    """
    h, w = shape
    plate = np.zeros((h, w), np.float32)
    ix = np.floor(px).astype(np.int64)
    iy = np.floor(py).astype(np.int64)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx = ix + dx
            cy = iy + dy
            dcx = px - (cx + 0.5)
            dcy = py - (cy + 0.5)
            d = np.sqrt(dcx * dcx + dcy * dcy)
            cov = smoothstep(radii + AA_SOFT_PX, radii - AA_SOFT_PX, d)
            val = np.where(cov >= 0.5, core, 0.0).astype(np.float32)
            inb = (cx >= 0) & (cx < w) & (cy >= 0) & (cy < h) & (val > 0)
            if not np.any(inb):
                continue
            np.maximum.at(plate, (cy[inb], cx[inb]), val[inb])
    return plate


def bake_grain():
    """烘出 1200×1600 RGBA 全画幅非周期银盐板。"""
    rng = np.random.default_rng(SEED)

    cols, rows = GRID_COLS, GRID_ROWS
    count = cols * rows
    # 随机均匀撒点（不是网格）：任何方向的 lag 自相关都只剩有限样本噪声 ——
    # 抖动网格会在"格子周期 ≈ lag 的整数倍"处留下可测的伪周期，正好是用户投诉的网格感。
    jx = rng.uniform(0.0, PLATE_W, count)
    jy = rng.uniform(0.0, PLATE_H, count)
    radii = rng.uniform(RADIUS_MIN, RADIUS_MAX, count)

    # 极性随机打乱（隔行交替会留下 2 格周期纹理 → 512-lag 自相关不为零）
    perm = rng.permutation(count)
    half = count // 2
    light_mask = np.zeros(count, dtype=bool)
    light_mask[perm[:half]] = True
    light_sel = light_mask
    dark_sel = ~light_sel
    light_count = int(light_sel.sum())
    dark_count = int(dark_sel.sum())

    alpha_l = _splat(jx[light_sel], jy[light_sel], radii[light_sel], LIGHT_CORE, (PLATE_H, PLATE_W))
    alpha_d = _splat(jx[dark_sel], jy[dark_sel], radii[dark_sel], DARK_CORE, (PLATE_H, PLATE_W))

    # 理论零重叠；真出现就按"谁更强"归属，保住调色板纯度（不混色）。
    overlap = (alpha_l > 0) & (alpha_d > 0)
    if np.any(overlap):
        keep_light = overlap & (alpha_l >= alpha_d)
        keep_dark = overlap & (alpha_l < alpha_d)
        alpha_d[keep_light] = 0.0
        alpha_l[keep_dark] = 0.0

    alpha = np.maximum(alpha_l, alpha_d)
    # 量化到 8bit（核心 0.42 -> 107，0.32 -> 82）
    q = np.rint(alpha * 255.0).astype(np.uint8)
    q[alpha <= 0] = 0

    rgba = np.zeros((PLATE_H, PLATE_W, 4), dtype=np.uint8)
    light_px = q > 0
    light_px &= alpha_l > 0
    dark_px = (q > 0) & (alpha_d > 0)
    rgba[..., :3][light_px] = np.array(LIGHT_RGB, dtype=np.uint8)
    rgba[..., :3][dark_px] = np.array(DARK_RGB, dtype=np.uint8)
    rgba[..., 3] = q

    alpha01 = rgba[..., 3].astype(np.float64) / 255.0
    # 调色板纯度：非零像素必须是两调色板之一（无混色、无第三种颜色）
    nz = rgba[..., 3] > 0
    pal_ok = np.zeros(nz.shape, dtype=bool)
    pal_ok[nz] = (
        np.all(rgba[..., :3][nz] == np.array(LIGHT_RGB, dtype=np.uint8), axis=1)
        | np.all(rgba[..., :3][nz] == np.array(DARK_RGB, dtype=np.uint8), axis=1)
    )

    report = {
        "transparent_frac": float((rgba[..., 3] == 0).mean()),
        "mean_alpha": float(alpha01.mean()),
        "light_count": light_count,
        "dark_count": dark_count,
        "max_alpha": float(alpha01.max()),
        "nonzero_frac": float(nz.mean()),
        "palette_ok": bool(np.all(pal_ok[nz])),
        "palette_frac": float(pal_ok[nz].mean()) if np.any(nz) else 1.0,
        "bands": band_energy(alpha01),
        "autocorr_x512": autocorr_lag(alpha01, 512),
        "autocorr_y512": float(
            (lambda a: (a * np.roll(a, 512, axis=0)).mean() / (a * a).mean())(
                alpha01 - alpha01.mean()
            )
        ),
        "overlap_px": int(overlap.sum()),
    }
    return rgba, report


def bake_leak():
    """v1.8.0 起逐字保留的漏光烘焙（512×512 RGBA）。"""
    yy, xx = np.mgrid[0:LEAK_SIZE, 0:LEAK_SIZE].astype(float)
    u = xx / (LEAK_SIZE - 1.0)  # 0 = 左, 1 = 右
    v = yy / (LEAK_SIZE - 1.0)  # 0 = 上, 1 = 下
    core = np.exp(-1.6 * (((1.0 - u) / 0.62) ** 2 + ((v - 0.02) / 0.30) ** 2))
    band = np.exp(-(((v - 0.06) / 0.16) ** 2)) * np.exp(-(((1.0 - u) / 0.75) ** 2))
    t = np.clip(0.78 * core + 0.42 * band, 0.0, 1.0)
    t = smoothstep(LEAK_CUT, 0.62, t)
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
    Image.fromarray(grain, mode="RGBA").save(grain_path, optimize=True)
    gbytes, gsha = file_facts(grain_path)
    print("grain.png  %dx%d mode=RGBA" % (PLATE_W, PLATE_H))
    print(
        "  透明像素=%.2f%%  非零=%.2f%%  平均alpha=%.4f  峰值alpha=%.4f"
        % (
            greport["transparent_frac"] * 100.0,
            greport["nonzero_frac"] * 100.0,
            greport["mean_alpha"],
            greport["max_alpha"],
        )
    )
    print(
        "  粒子: 亮=%d 暗=%d 相等=%s  调色板纯度=%.6f  重叠像素=%d"
        % (
            greport["light_count"],
            greport["dark_count"],
            greport["light_count"] == greport["dark_count"],
            greport["palette_frac"],
            greport["overlap_px"],
        )
    )
    print(
        "  频带能量（周期）："
        + "  ".join("%s=%.1f%%" % (k, v * 100.0) for k, v in greport["bands"].items())
    )
    print(
        "  512-lag 自相关: x=%.4f y=%.4f"
        % (greport["autocorr_x512"], greport["autocorr_y512"])
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
    if not (TRANSPARENT_MIN <= greport["transparent_frac"] <= TRANSPARENT_MAX):
        problems.append(
            "grain 透明像素占比不在 [%.2f,%.2f]: %.4f"
            % (TRANSPARENT_MIN, TRANSPARENT_MAX, greport["transparent_frac"])
        )
    if not (MEAN_ALPHA_MIN <= greport["mean_alpha"] <= MEAN_ALPHA_MAX):
        problems.append(
            "grain 平均 alpha 不在 [%.2f,%.2f]: %.4f"
            % (MEAN_ALPHA_MIN, MEAN_ALPHA_MAX, greport["mean_alpha"])
        )
    if greport["light_count"] != greport["dark_count"]:
        problems.append(
            "grain 亮/暗粒子数量不等: %d vs %d"
            % (greport["light_count"], greport["dark_count"])
        )
    if not greport["palette_ok"]:
        problems.append("grain 非零像素出现第三种颜色（混色/彩噪）: %.6f" % greport["palette_frac"])
    if greport["max_alpha"] < LIGHT_CORE_MIN - 0.01:
        problems.append("grain 亮粒子核心 alpha 不足: %.4f" % greport["max_alpha"])
    if greport["max_alpha"] > LIGHT_CORE_MIN + 0.04:
        problems.append("grain 亮粒子核心 alpha 过高: %.4f" % greport["max_alpha"])
    if greport["autocorr_x512"] > AUTOCORR_MAX or greport["autocorr_y512"] > AUTOCORR_MAX:
        problems.append(
            "grain 存在周期性重复（512-lag 自相关 x=%.4f y=%.4f > %.2f）"
            % (greport["autocorr_x512"], greport["autocorr_y512"], AUTOCORR_MAX)
        )
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
