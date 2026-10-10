# assets/textures —— 颗粒 / 暗角 / 漏光贴图规范

这 3 张 PNG 是 `scripts/generate_placeholder_assets.py` 程序化生成的，语义如下：

| 文件 | 尺寸 | 铺法（代码里的 `resizeMode`） | 混合模式 | 作用 |
| --- | --- | --- | --- | --- |
| `grain.png` | 192 × 192 | `repeat`（平铺） | `overlay` | 胶片颗粒。**单色（中灰）+ alpha 噪点**，靠 alpha 控制颗粒随机性 |
| `vignette.png` | 512 × 512 | `stretch`（拉伸铺满） | `multiply` | 暗角。中心全透明 → 边缘纯黑 |
| `light-leak.png` | 768 × 768 | `stretch`（拉伸铺满） | `screen` | 漏光。右上角暖色光晕，`screen` 提亮 |

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

- 建议 128 × 512 之间的正方形，**必须能无缝平铺**（左右/上下边缘接得上）；
- 颜色用**中灰**（≈ `#808080`）单色即可：`overlay` 混合时中灰不改变底色，只有亮度偏离中灰的像素才产生颗粒；
- 噪点强度用 alpha 控制：alpha 越低颗粒越淡；
- tile 越小颗粒越细（192 px 是"中等颗粒"），越大越粗。

**vignette.png（暗角）**

- 正方形即可，会被拉伸成画面比例，所以尽量做**径向对称**；
- 中心区域 alpha = 0（不压暗），边缘用黑色 + 高 alpha；
- 想要"四角轻微压暗"就只把最角落做黑，想要"重口味暗角"就把黑圈往里收。

**light-leak.png（漏光）**

- 任意宽高比，会被拉伸铺满；
- 用暖色（橙/红/黄）+ `screen` 混合提亮；左下角/右下角留透明；
- 预设里 `lightLeakFlip: true` 会把同一张图水平镜像（不用准备两张图）。

## 重新生成

```powershell
python scripts/generate_placeholder_assets.py
```

## 想加"第 4 张贴图"？

1. 把 PNG 放进这个目录；
2. 在 `src/constants/textures.ts` 的 `TEXTURES` 里加一条（同时给 `TextureId` 加一个字面量类型，
   见 `src/types/index.ts`）；
3. 在 `src/utils/gradeLayers.ts` 的 `buildGradeLayers` 里按预设数值决定它出不出现。

渲染层（`FilmCompositor`）不需要改：它只认 `TextureId`。
