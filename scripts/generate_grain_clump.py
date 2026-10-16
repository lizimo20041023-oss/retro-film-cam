# -*- coding: utf-8 -*-
"""重烤 assets/textures/grain.png（双尺度团簇颗粒）与 assets/textures/light-leak.png（角落漏光）。

为什么这些事必须在**烘焙期**做（而不是留给运行时）：

  · 颗粒的"中间调/暗部明显、高光近零"在 RN 里没有逐像素亮度遮罩可用，唯一的
    办法是 overlay 混合的数学性质：`overlay(cb,cs)` 与 0.5 的偏差按
    `2·min(cb,1−cb)` 加权 —— 高光处权重趋 0，中间调处权重最大。所以"影调加权"
    等于"贴图围绕中灰 128 的对比度"。对比度不够，颗粒就是看不见的。
  · 贴图由 `src/components/FilmLookLayers.tsx` **手工按 512/3 pt 的方格平铺**
    （v1.8.2 起，不再依赖 `resizeMode="repeat"`；见该文件头注释）—— 3x 屏上
    1 贴图像素 = 1 设备像素，所以**贴图的空间尺度就是屏幕上的尺度**：`<8px` 带是
    肉眼看得清的颗粒，`24–64px` 带就是用户说的"脏云雾"。贴图必须**无缝**，且频率
    成分必须在烘焙期定死（运行时没有逐像素遮罩可以把低频成分压下去）。
  · 漏光是 `screen` 混合 + 拉伸铺满整幅：screen 的抬升 = `cs·(1−cb)`，贴图越亮、
    暗部被抬得越狠 —— 这是"成片白雾"的第一根因（旧贴图 99% 的像素亮度 ≥0.5）。
    新贴图把光收进角落，让 ≥60% 的像素三通道全 ≤0.02（= screen 中性），
    并把 meanLum 压到 ≤0.25。

无缝是怎么保证的：所有滤波都在**周期性**域里做 —— 高斯模糊走 FFT（乘高斯传递函数，
等价于把图首尾相接再卷积），需要放大时走"按模取下标"的周期双线性插值（`wrap_resize`，
放大倍数为整数比时输出严格周期）。脚本最后用数值断言核对"跨接缝的相邻梯度分布"与
"图内相邻梯度分布"一致，不靠眼睛。

v1.8.2 的根因（用户 2026-10-17「颗粒像脏云雾」）在这份脚本里留下两道门：
  ① 频带能量：`<8px ≥ 0.60`、`24–64px ≤ 0.06`。旧配方实测是 0.258 / 0.162，
     加上"1 贴图像素 = 1 逻辑点"的旧口径 ⇒ 8–24px 的团簇在 3x 屏上变成
     8–24pt 的斑块。现在这两条越界就直接烘焙失败。
  ② 生成顺序：先定尺（在最终 SIZE 网格上生成，不再"366 网格 + 1.4× 上采样"，
     那一步单独就把 <8px 带的能量搬走 12.6pp）→ 再定形（细支 σ=0.60px 占 0.78、
     团簇 σ=1.80px 占 0.22）→ 最后定对比度（σ_pre 搜索，不用 clip 凑形状）。

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
# v1.8.2：直接在最终网格上生成。旧配方（366 网格 + 1.4× 上采样 + 0.7px 微模糊）把
# 能量推到了大尺度：实测 <8px 带只剩 25.8%、8–24px 带占 55.0%、24–64px 占 16.2%。
SIGMA_FINE = 0.60  # 细颗粒：σ 0.60px ⇒ 约 2~3px 的结构（主体）
SIGMA_CLUMP = 1.80  # 团簇：σ 1.80px ⇒ 约 6~10px 的结构（只占 22% 权重）
W_CLUMP = 0.22
TARGET_MEAN = 127.5  # 中灰：overlay 的亮度恒等点
TARGET_SIGMA = 0.2605  # 归一化对比度（实测 σ≈66.4/255；喂 effAmp 断言用）
# 频带能量门槛（环带口径，见 band_energy）：旧配方在这两条上分别是 0.258 与 0.162。
BAND_FINE_MIN = 0.60  # 周期 <8px 的能量占比下限
BAND_COARSE_MAX = 0.06  # 周期 24–64px 的能量占比上限
BAND_LABELS = (
    ("<8", 0.0, 8.0),
    ("8-24", 8.0, 24.0),
    ("24-64", 24.0, 64.0),
    ("64-160", 64.0, 160.0),
    (">160", 160.0, 1e9),
)

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


def band_energy(arr):
    """环带能量占比（去掉直流）：周期 = SIZE / 半径，与探针里的口径一致。"""
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


def bake_grain():
    rng = np.random.default_rng(SEED)
    # 一支白噪、两个尺度：细支是颗粒本体，粗支只提供 22% 的有机团簇。
    # （旧配方用两支独立白噪 + 1.4× 上采样 + 0.7px 微模糊，那是能量跑到大尺度的成因。）
    white = rng.standard_normal((SIZE, SIZE))
    fine = wrap_blur(white, SIGMA_FINE)
    clump = wrap_blur(white, SIGMA_CLUMP)
    fine /= fine.std()
    clump /= clump.std()
    pat = (1.0 - W_CLUMP) * fine + W_CLUMP * clump
    pat = (pat - pat.mean()) / pat.std()

    # 最后才定对比度：选一个"量化前的 σ"，使 8 位量化 + 端点裁剪之后的实际 σ 命中目标。
    # 注意这只缩放对比度，不改变形状（形状已由上面两支的权重定死）。
    sigma_pre = 0.16
    v = None
    while sigma_pre < 0.90:
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
        "bands": band_energy(arr),
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
