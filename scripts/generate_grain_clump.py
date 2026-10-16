# -*- coding: utf-8 -*-
"""重烤 assets/textures/grain.png（双尺度团簇颗粒）与 assets/textures/light-leak.png（角落漏光）。

为什么这些事必须在**烘焙期**做（而不是留给运行时）：

  · 颗粒的"中间调/暗部明显、高光近零"在 RN 里没有逐像素亮度遮罩可用，唯一的
    办法是 overlay 混合的数学性质：`overlay(cb,cs)` 与 0.5 的偏差按
    `2·min(cb,1−cb)` 加权 —— 高光处权重趋 0，中间调处权重最大。所以"影调加权"
    等于"贴图围绕中灰 128 的对比度"。对比度不够，颗粒就是看不见的。
  · 贴图是 1 贴图像素 = 1 逻辑点、`resizeMode="repeat"` 平铺，而截图跑在 3x 屏上
    （见 `src/constants/textures.ts` 头注释）—— 贴图必须**无缝**，且要按用户口径
    「先按 1.4× 画团簇，再 0.7px 高斯微模糊」在烘焙期完成，运行时零成本、零新依赖。
  · 漏光是 `screen` 混合 + 拉伸铺满整幅：screen 的抬升 = `cs·(1−cb)`，贴图越亮、
    暗部被抬得越狠 —— 这是"成片白雾"的第一根因（旧贴图 99% 的像素亮度 ≥0.5）。
    新贴图把光收进角落，让 ≥60% 的像素三通道全 ≤0.02（= screen 中性），
    并把 meanLum 压到 ≤0.25。

无缝是怎么保证的：所有滤波都在**周期性**域里做 —— 高斯模糊走 FFT（乘高斯传递函数，
等价于把图首尾相接再卷积），1.4× 放大走"按模取下标"的周期双线性插值
（放大倍数正好取 `512/366`，所以 `xs(i+512) = xs(i)+366 ≡ xs(i) (mod 366)`，
输出严格周期）。脚本最后用数值断言核对"跨接缝的相邻梯度分布"与"图内相邻梯度分布"
一致，不靠眼睛。

用法（PATH 上的 python 是 Windows Store 桩，必须用工作区自带的解释器）：

    $env:PYTHONIOENCODING='utf-8'
    & "C:\\Users\\lizim\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" `
        retro-film-cam\\scripts\\generate_grain_clump.py

跑完必须再跑一次工作区根的 `_plate_stats.py` 刷新 `_plate_stats.json`
（`_haze_audit.mjs` 读的是那份 JSON 统计，不是 PNG 本身）。
"""

import sys

import numpy as np
from PIL import Image

# ---------------------------------------------------------------- 常量（确定性）

SEED = 20261017
SIZE = 512
COARSE = 366  # 512 / 1.4 ≈ 365.7：团簇按 1.4× 画在粗网格上
SIGMA_FINE_C = 0.55  # 粗网格上的细颗粒（放大后 ≈0.77px，再叠 0.7px 模糊）
SIGMA_CLUMP_C = 1.60  # 粗网格上的团簇（放大后 ≈2.2px → 直径 5~7px）
W_FINE = 0.62
W_CLUMP = 0.38
SIGMA_MICRO = 0.7  # 用户口径的"0.7px 高斯微模糊"
TARGET_MEAN = 127.5  # 中灰：overlay 的亮度恒等点
TARGET_SIGMA = 0.26  # 归一化对比度（实测 σ≈66/255；喂 effAmp 断言用）

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


def wrap_resize(a, size):
    """周期性双线性放大：源网格周期 → 按模取下标；放大倍数 = size/C，输出严格周期。"""
    c = a.shape[0]
    s = size / float(c)
    xs = (np.arange(size) + 0.5) / s - 0.5
    i0 = np.floor(xs).astype(np.int64)
    t = xs - i0
    i0m = np.mod(i0, c)
    i1m = np.mod(i0 + 1, c)
    w0 = 1.0 - t
    return (
        a[np.ix_(i0m, i0m)] * np.outer(w0, w0)
        + a[np.ix_(i0m, i1m)] * np.outer(w0, t)
        + a[np.ix_(i1m, i0m)] * np.outer(t, w0)
        + a[np.ix_(i1m, i1m)] * np.outer(t, t)
    )


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def bake_grain():
    rng = np.random.default_rng(SEED)
    fine = wrap_blur(rng.standard_normal((COARSE, COARSE)), SIGMA_FINE_C)
    clump = wrap_blur(rng.standard_normal((COARSE, COARSE)), SIGMA_CLUMP_C)
    fine /= fine.std()
    clump /= clump.std()
    pat = W_FINE * fine + W_CLUMP * clump
    pat /= pat.std()
    pat = wrap_resize(pat, SIZE)  # 先按 1.4× 画团簇
    pat = wrap_blur(pat, SIGMA_MICRO)  # 再 0.7px 高斯微模糊
    pat = (pat - pat.mean()) / pat.std()

    # 选一个"模糊前的 σ"，使 8 位量化 + 端点裁剪之后的实际 σ 命中目标
    sigma_pre = 0.16
    v = None
    while sigma_pre < 0.80:
        v = np.clip(0.5 + pat * sigma_pre, 0.0, 1.0)
        if v.std() >= TARGET_SIGMA:
            break
        sigma_pre += 0.002
    q = np.rint(v * 255.0)
    for shift in (0, -1, 1, -2, 2, -3, 3):
        cand = np.clip(q + shift, 0, 255)
        if abs(cand.mean() - TARGET_MEAN) <= 0.5:
            q = cand
            break
    arr = q.astype(np.uint8)

    # 无缝核对：跨接缝的相邻梯度 vs 图内相邻梯度
    gx = np.abs(np.diff(arr.astype(float), axis=1))
    gy = np.abs(np.diff(arr.astype(float), axis=0))
    seam_x = np.abs(arr[:, 0].astype(float) - arr[:, -1].astype(float))
    seam_y = np.abs(arr[0, :].astype(float) - arr[-1, :].astype(float))
    report = {
        "mean": float(arr.mean()),
        "std": float(arr.std()),
        "p05": float(np.percentile(arr, 5)),
        "p95": float(np.percentile(arr, 95)),
        "sigma_pre": round(sigma_pre, 3),
        "gx_mean": float(gx.mean()),
        "gx_p95": float(np.percentile(gx, 95)),
        "seam_x_mean": float(seam_x.mean()),
        "seam_x_p95": float(np.percentile(seam_x, 95)),
        "gy_mean": float(gy.mean()),
        "seam_y_mean": float(seam_y.mean()),
    }
    return arr, report


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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    root = sys.argv[1] if len(sys.argv) > 1 else "."

    grain, greport = bake_grain()
    Image.fromarray(grain, mode="L").save(root + "\\" + GRAIN_OUT, optimize=True)
    print("grain.png  %dx%d mode=L" % (SIZE, SIZE))
    print(
        "  mean=%.3f std=%.3f p05=%d p95=%d (sigma_pre=%.3f)"
        % (
            greport["mean"],
            greport["std"],
            round(greport["p05"]),
            round(greport["p95"]),
            greport["sigma_pre"],
        )
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
        % (max(greport["seam_x_p95"], greport["seam_x_p95"]), greport["gx_p95"])
    )

    leak, lreport = bake_leak()
    Image.fromarray(leak, mode="RGBA").save(root + "\\" + LEAK_OUT, optimize=True)
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

    problems = []
    if abs(greport["mean"] - TARGET_MEAN) > 0.5:
        problems.append("grain mean 偏了: %.3f" % greport["mean"])
    if abs(greport["std"] / 255.0 - TARGET_SIGMA) > 0.02:
        problems.append("grain σ 偏了: %.4f" % (greport["std"] / 255.0))
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
