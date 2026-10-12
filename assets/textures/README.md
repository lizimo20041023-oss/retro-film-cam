# assets/textures —— 颗粒 / 灰尘 / 暗角 / 漏光贴图规范

这 4 张 PNG 全部由 `scripts/generate_placeholder_assets.py` 程序化生成：

| 文件 | 尺寸 | 铺法（`resizeMode`） | 混合模式 | 作用 |
| --- | --- | --- | --- | --- |
| `grain.png` | 512 × 512 | `repeat` | `overlay` | 胶片颗粒。**8 位灰度**，围绕中灰 128，σ≈59，多尺度团簇、**三通道恒等** |
| `dust.png` | 512 × 512 | `repeat` | `screen` | 灰尘与划痕。透明底 + 少量白点 / 细线 |
| `vignette.png` | 512 × 512 | `stretch` | `multiply` | 暗角。中心全透明 → 边缘纯黑 |
| `light-leak.png` | 768 × 768 | `stretch` | `screen` | 漏光。一角暖色光晕，`screen` 提亮 |

> `chroma-noise.png`（CCD 色噪）已于 2026-10-12 **连同生成函数彻底删除**：它是品红 ↔ 绿
> 逐块跳变的彩色噪声，贴到 CCD-CYBER / DIGI-02 两款上就是满屏紫绿伪色。颗粒只走
> `grain.png`，而它三通道逐像素恒等 —— 这就是"绝不出红绿紫伪色"的结构性保证，
> 不要再加回来。

## 为什么 tile 必须 ≥ 512

贴图的 **1 个像素 = 屏幕上的 1 个逻辑点**，而照片窗口最大约 **352 × 466 pt**。
tile 小于窗口就会平铺出好几遍 —— 同一片噪点反复出现，眼睛立刻认出"花纹"，
看起来是脏而不是颗粒。512 比窗口大，铺一次就够。

（另外两个 `stretch` 的贴图会被拉伸铺满，不存在这个问题。）

## 为什么 σ 取 59，以及为什么必须做成团簇

捕获发生在 3x 屏幕上，所以 1 个贴图像素最终占 **3 × 3 个输出像素**，iOS 会做平滑插值。
`scripts/preview_grade.py` 实测：纯白噪声被放大 3 倍后标准差**只剩 0.35 倍** ——
σ 按 1/0.35 反推，要落到画面上还有意义，贴图本身就得先有 ~59 的 σ。

但**只堆 σ 是没用的**：逐像素白噪声被 3× 插值抹平后剩下的只是一层均匀的灰雾，
看起来像"电子沙沙声"而不是颗粒。所以 `grain.png` 改成**多尺度团簇**：
细颗粒 + 2×2 平均 + 4×4 平均加权叠加，粗结构在放大插值下活下来，
才像银盐颗粒的团簇感（详见 `scripts/generate_placeholder_assets.py` 的 `make_grain`）。

## 为什么用贴图而不是 `filter` / 渐变

1. RN 的 `filter` 在 **iOS 上只支持 `brightness` / `opacity`**（官方原文："Due to issues with
   performance and spec compliance, these are the only two filter functions available on iOS"），
   做不出颗粒和暗角；
2. `backgroundImage: 'radial-gradient(...)'` 可用，但配套的定位/平铺/尺寸 API 都还是
   `experimental_backgroundPosition / Repeat / Size`（官方标 🧪），随时可能改名；
3. 静态 PNG + `mixBlendMode` 在 Expo Go（新架构）上 100% 可用，而且**把"滤镜长什么样"变成了美术资源** ——
   换图不用改一行代码。

## 替换规范

**grain.png（颗粒）**

- 正方形，**必须能无缝平铺**（左右/上下边缘接得上），边长别小于 512；
  程序化生成时用**环面（`np.pad(mode="wrap")`）做邻域平均**，别用普通卷积 —— 普通卷积在边缘
  会"看到"零填充，平铺出来就是一圈可见的格线；
- 颜色用**中灰**（≈ `#808080`）单色即可：`overlay` 混合时中灰不改变底色，
  只有亮度偏离中灰的像素才产生颗粒；
- **必须逐像素单色**：先生成一个灰度数组、再 `np.stack([g, g, g], axis=-1)`，
  绝不能对 R/G/B 各取一次随机数 —— 那正是被删掉的色噪的做法；
- 灰度存成单通道 PNG（`mode="L"`）就够，RGB 会白白多占 2/3 体积；
- **不要用 alpha 控强度**：`overlay` 只看颜色。要调强弱请改预设里的 `grain`。

**dust.png（灰尘划痕）**

- 大部分完全透明，只有少量白点和细线，所以文件极小（5 KB）；
- 配 `screen` 混合 → 只在暗部显形，亮部看不出来，这正是扫描底片的观感。

**vignette.png（暗角）**

- 正方形即可，会被拉伸成画面比例，所以尽量做**径向对称**；
- 中心区域 alpha = 0（不压暗），边缘用黑色 + 高 alpha；
- 想要"四角轻微压暗"就只把最角落做黑，想要"重口味暗角"就把黑圈往里收。

**light-leak.png（漏光）**

- 任意宽高比，会被拉伸铺满；
- 用暖色（橙/红/黄）+ `screen` 混合提亮；一角留透明；
- 预设里 `lightLeakFlip: true` 会把同一张图水平镜像（不用准备两张图）。

## 重新生成

```powershell
python scripts/generate_placeholder_assets.py
```

## 调参时先看效果，别盲改

```powershell
python scripts/preview_grade.py
```

它把 `src/constants/presets.ts` 里的数值**解析出来**（不抄一份参数表，避免两边漂移），
用与 CoreImage 同源的混合公式重放整个图层栈，输出：

- `_grade-preview.png` —— 10 个预设的整幅九宫格；
- `_grade-grain.png` —— 同一批的 1:1 裁切（看颗粒就该看这张），
  并打印每个预设的"天空高频 σ"，用来判断颗粒是不是真的看得见。

两张都是临时产物，已在 `.gitignore` 里。

## 想加"第 5 张贴图"？

1. 把 PNG 放进这个目录（并加到 `scripts/generate_placeholder_assets.py`，保持可复现）；
2. `src/types/index.ts` 的 `TextureId` 加一个字面量类型；
3. `src/constants/textures.ts` 的 `TEXTURES` 里加一条注册；
4. `src/utils/gradeLayers.ts` 的 `buildGradeLayers` 里按预设数值决定它出不出现。

渲染层（`FilmCompositor`）不需要改：它只认 `TextureId`，
而 `countStageImages` 会自动把新增的纹理层算进"要等几张图 onLoad"。
