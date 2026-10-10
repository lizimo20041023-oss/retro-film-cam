# assets/frames —— 相框 PNG 规范

这里的 **8 张 PNG** 是用 `scripts/generate_frames.py` 程序化生成的
（纯 Pillow 画的：真实的纸 / 片基质感 + 全透明镂空窗口 + 印刷字），可以直接用，也可以整个换掉。

| 文件 | 像素尺寸 | 宽高比 | 镂空窗口（像素） | 镂空窗口（归一化，写进 `frames.ts` 的就是这组数） | 日期锚点 |
| --- | --- | --- | --- | --- | --- |
| `classic-white.png` | 1350 × 1800 | 0.7500 | x 76, y 84, 1197 × 1596 | `{ x: 0.056296, y: 0.046667, width: 0.886667, height: 0.886667 }` | `window` |
| `instant-square.png` | 1425 × 1800 | 0.7917 | x 78, y 92, 1269 × 1269（1:1） | `{ x: 0.054737, y: 0.051111, width: 0.890526, height: 0.705 }` | `frame` |
| `film-35mm.png` | 1350 × 1950 | 0.6923 | x 210, y 300, 930 × 1330（3:4） | `{ x: 0.155556, y: 0.153846, width: 0.688889, height: 0.682051 }` | `frame` |
| `darkroom.png` | 1350 × 1800 | 0.7500 | x 78, y 92, 1168 × 1590，**窗口是毛边** | `{ x: 0.057778, y: 0.051111, width: 0.865185, height: 0.883333 }` | `frame` |
| `slide-mount.png` | 1350 × 1350 | 1.0000 | x 170, y 360, 1010 × 674 | `{ x: 0.125926, y: 0.266667, width: 0.748148, height: 0.499259 }` | `frame` |
| `orange-base.png` | 1350 × 1800 | 0.7500 | x 150, y 260, 1050 × 1400 | `{ x: 0.111111, y: 0.144444, width: 0.777778, height: 0.777778 }` | `frame` |
| `crop-marks.png` | 1350 × 1800 | 0.7500 | x 96, y 108, 1158 × 1584 | `{ x: 0.071111, y: 0.06, width: 0.857778, height: 0.88 }` | `window` |
| `archive-card.png` | 1350 × 1800 | 0.7500 | x 300, y 150, 960 × 1280 | `{ x: 0.222222, y: 0.083333, width: 0.711111, height: 0.711111 }` | `frame` |

> `darkroom.png` 的窗口边缘是**故意做成毛边**的（0~13 px 随机往窗口里啃），
> 模拟暗房手工裁切。所以它的"窗口"是个名义值，实际边缘有起伏 —— 这是设计，不是 bug。

## ⚠️ 光看 PNG 是判断不出好坏的

**镂空窗口是全透明的，在系统看图器里只会显示成一片棋盘格** —— 你根本看不出照片放进去长什么样。
所以项目里带了一个对照脚本：把 `assets/frames/` 里所有相框按各自的窗口贴到**同一张照片**上，
拼成一张大图：

```powershell
# 在项目根目录
python scripts/preview_frames.py                          # 用内置的合成示意图
python scripts/preview_frames.py 你的照片.jpg              # 用自己的照片
python scripts/preview_frames.py 你的照片.jpg 输出.png     # 顺便改输出路径
```

默认输出 `assets/frames/_preview.png`（下划线开头的文件已被 `.gitignore` 排除）。
**改完相框一定要看一眼这张图。** 脚本里 `FRAMES` 表的 label 一律用 ASCII ——
Pillow 的默认字体没有中文字形，写中文会全变成豆腐块。

## 自己画一张（或从网上下载后改）必须满足的 5 条

1. **格式：PNG，且必须带 alpha 通道。** JPG 不行（没有透明窗口，照片会被整块盖住）。
2. **照片要露出来的那块必须全透明**（alpha = 0），其余部分随便画（纯色、纹理、字都行）。
   > 判断标准很简单：在系统"预览"里透明处会显示成棋盘格。
3. **`aspect` 必须等于 PNG 的真实像素宽高比**，否则相框会被拉伸变形。
   例：`1350 × 1800` → `aspect: 1350 / 1800`。
4. **尺寸建议长边 1200 ~ 2400 px。** 太小 → 相框边缘放大后发虚；太大 → 内存吃紧、启动变慢。
   本项目成片分辨率 ≈ 屏幕逻辑尺寸 × PixelRatio（约 1170 × 1600 px 量级），所以 1800 px 长边足够。
5. **镂空窗口尽量居中、且不要贴着 PNG 边界**，四周留 5% ~ 15% 的实体边框：
   实体太窄的话，取景器和成片里都会看不到边框。

## 量出归一化窗口（3 种办法，任选）

**A. Python（最准，推荐）**

```powershell
# 在项目根目录
python -c "from PIL import Image; im=Image.open(r'assets/frames/你的相框.png').convert('RGBA'); print('bbox=', im.getchannel('A').getbbox(), 'size=', im.size)"
```

拿到 `bbox=(left, top, right, bottom)` 和 `size=(w, h)` 之后：

```
window.x = left / w
window.y = top / h
window.width  = (right - left) / w
window.height = (bottom - top) / h
```

> 注意：`getbbox()` 返回的是"非全透明像素"的范围，也就是**整张相框的包围盒**（通常就是整块画布）。
> 真正要做的是量**透明洞**的位置。更省事的办法是让 `scripts/generate_frames.py` 画完直接
> 打印归一化窗口 —— 它每次生成都会打印，照着抄进 `frames.ts` 就行。

**B. Photoshop / 预览 / 任意图片编辑器**：用矩形选区框住透明区域，读选区坐标，再除以画布尺寸。

**C. 直接用对照脚本反查**：改完 `window` 后跑 `python scripts/preview_frames.py`，
看照片有没有正好落在窗口里，反复微调。比 B 快，比 A 慢。

## 注册到代码（只改 `src/constants/frames.ts`，不动任何逻辑）

```ts
{
  id: 'my-frame',                       // 唯一即可，英文小写短横线
  name: '我的相框',                      // 会显示在取景器左上角
  nameKey: 'frame.myFrame',             // 可选：走 i18n 时填这个，界面显示 t(nameKey)
  source: require('../../assets/frames/my-frame.png'),
  aspect: 1350 / 1800,                  // = PNG 真实像素宽高比
  window: { x: 0.055556, y: 0.05, width: 0.888889, height: 0.888333 },
  photoFit: 'cover',                    // 默认 cover（裁切填满）；'contain' 会留黑边但完整
  defaultTimestampAnchor: 'window',     // 日期烧在画面里；'frame' = 烧在相框留白里
  designSize: { width: 1350, height: 1800 },   // 只用于备注，方便你自己对账
  description: '一句话说明',
},
```

改完存盘 → 热重载 → 取景器和成片**同时**变成新相框（两者都由这一份数据算出来）。

### `defaultTimestampAnchor` 怎么选

日期右下角那行橙色液晶字是**后烧上去的一层**，它会盖在相框上。所以：

- **下留白够宽（≥ 约 110 px）且留白里没有别的字** → 用 `'frame'`，日期烧在下留白里，像真相机。
- **下留白很窄，或者那里已经排了东西**（色标条、编号、规格字）→ 用 `'window'`，
  日期改烧在**画面内部**右下角，绝不压到相框上的字。
  现有的 `crop-marks.png` 就是这种情况（底下排了四色色标条）。

## 常见坑

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 照片被整块挡住 / 只看到相框 | 窗口不是透明的（PNG 没 alpha 或用了 JPG） | 重新导出带透明通道的 PNG |
| 相框明显被拉扁/拉长 | `aspect` 与真实像素比不一致 | 按真实像素改 `aspect` |
| 成片里照片位置偏移 | `window` 量错（尤其忘了除以画布尺寸） | 用上面 A 方案重新量 |
| 取景器和成片构图差一点 | 取景器显示的是相机传感器中心裁切，成片是整张照片中心裁切 | 见 README「已知限制」第 2 条 |
| 日期看不见 | 日期烧在了相框留白之外或颜色与边框太接近 | 调 `defaultTimestampAnchor`，或改预设的 `timestamp.color` |
| **相框上有半透明的字被照片压住了** | 字画到了窗口**里面**（相框 PNG 是盖在照片之上的图层，但窗口那块是透明的，字就落到照片上了） | 字必须画在**窗口之外**。生成脚本里有一道窗口审计（内缩 20 px 检查非零 alpha），加完相框记得跑一次 |

## 重新生成

```powershell
python scripts/generate_frames.py            # 全部 8 张
python scripts/generate_frames.py darkroom   # 只重画其中一张（名字 = 文件名去掉 .png）
```

需要 Pillow（`pip install Pillow`）。脚本是幂等的，会覆盖同名文件，并打印每张图的归一化窗口，
方便和 `src/constants/frames.ts` 里的数字对账。

> **相框不要用 `scripts/generate_placeholder_assets.py` 生成。** 那个脚本早期版本里也画相框，
> 现在只负责 `assets/textures/` 下那 5 张贴图 —— 相框那部分已经从它里面删掉了，
> 就是为了避免"跑一次贴图脚本，8 张新相框被悄悄覆盖回旧设计"。

### 为什么相框存成 256 色而不是 24 位真彩

`generate_frames.py` 的 `save()` 在写盘前会做一次
`img.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.Dither.NONE)`。

原因很实在：纸纹这类低频噪声存 24 位 PNG 会膨胀得离谱 ——
实测一张 1350×1800 的纸面，**448.5 KB → 10.7 KB（42 倍）**。
而且量化**逐像素保留 alpha**：镂空窗口的 191 万个像素依然全部是精确的 0，
RGB 最大偏差 13/255、平均 0.62，肉眼看不出区别。
量化到 32 / 64 / 128 / 256 色体积几乎一样（6~11 KB），所以统一用 256。
