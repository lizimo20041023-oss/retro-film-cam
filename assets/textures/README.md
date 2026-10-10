# assets/textures —— 颗粒 / 色噪 / 灰尘 / 暗角 / 漏光贴图规范

这 5 张 PNG 全部由 `scripts/generate_placeholder_assets.py` 程序化生成：

| 文件 | 尺寸 | 铺法（`resizeMode`） | 混合模式 | 作用 |
| --- | --- | --- | --- | --- |
| `grain.png` | 512 × 512 | `repeat` | `overlay` | 胶片颗粒。**8 位灰度**，围绕中灰 128，σ≈62 |
| `chroma-noise.png` | 512 × 512 | `repeat` | `overlay` | CCD 色噪。品红 / 绿交替的 **2×2 块状**色斑，围绕中灰 128 |
| `dust.png` | 512 × 512 | `repeat` | `screen` | 灰尘与划痕。透明底 + 少量白点 / 细线 |
| `vignette.png` | 512 × 512 | `stretch` | `multiply` | 暗角。中心全透明 → 边缘纯黑 |
| `light-leak.png` | 768 × 768 | `stretch` | `screen` | 漏光。一角暖色光晕，`screen` 提亮 |

## 为什么 tile 必须 ≥ 512

贴图的 **1 个像素 = 屏幕上的 1 个逻辑点**，而照片窗口最大约 **352 × 466 pt**。
tile 小于窗口就会平铺出好几遍 —— 同一片噪点反复出现，眼睛立刻认出"花纹"，
看起来是脏而不是颗粒。512 比窗口大，铺一次就够。

（另外两个 `stretch` 的贴图会被拉伸铺满，不存在这个问题。）

## 为什么 σ 要取到 62（而不是 30~40）

捕获发生在 3x 屏幕上，所以 1 个贴图像素最终占 **3 × 3 个输出像素**，iOS 会做平滑插值。
`scripts/preview_grade.py` 实测：纯白噪声被放大 3 倍后标准差**只剩 0.35 倍** ——
σ=42 落到画面上只有约 15 级，配 `opacity: 0.16` 后中间调只剩 ±2.5 级，等于没有。
σ=62 补偿到约 22 级，预设里再用 0.2~0.38 的 opacity，中间调有 ±6~11 级，才看得出颗粒。

同理，**1 像素级的细颗粒在这套架构下必然被抹平**：想要更细的颗粒，
得先把成片分辨率做上去（见 `README.md` 第 16 节），否则只能把颗粒调粗。

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
- 颜色用**中灰**（≈ `#808080`）单色即可：`overlay` 混合时中灰不改变底色，
  只有亮度偏离中灰的像素才产生颗粒；
- 灰度存成单通道 PNG（`mode="L"`）就够，RGB 会白白多占 2/3 体积；
- **不要用 alpha 控强度**：`overlay` 只看颜色。要调强弱请改预设里的 `grain`。

**chroma-noise.png（CCD 色噪）**

- 围绕中灰 128，R/G/B 分别偏移 `+d / -d·0.85 / +d·0.45`（品红 ↔ 绿）；
- 块状：`block=2`（= 2 个逻辑点 = 捕获后 6 像素）才是小 DC 那种"色斑"，
  逐像素的彩色噪点看起来只是脏；
- 存成调色板 PNG（`convert("P", ...)`）：24 位真彩要 700 KB+，48 色调色板只要 65 KB。

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

## 想加"第 6 张贴图"？

1. 把 PNG 放进这个目录（并加到 `scripts/generate_placeholder_assets.py`，保持可复现）；
2. `src/types/index.ts` 的 `TextureId` 加一个字面量类型；
3. `src/constants/textures.ts` 的 `TEXTURES` 里加一条注册；
4. `src/utils/gradeLayers.ts` 的 `buildGradeLayers` 里按预设数值决定它出不出现。

渲染层（`FilmCompositor`）不需要改：它只认 `TextureId`，
而 `countStageImages` 会自动把新增的纹理层算进"要等几张图 onLoad"。
