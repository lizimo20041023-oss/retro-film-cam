# assets/frames —— 相框 PNG 规范

这里的 3 张 PNG 是**占位相框**，用 `scripts/generate_placeholder_assets.py` 程序化生成的
（纯 Pillow 画的：实体边框 + 全透明镂空窗口 + 印刷字），可以直接用，也可以整个换掉。

| 文件 | 像素尺寸 | 宽高比 | 镂空窗口（像素） | 镂空窗口（归一化，写进 `frames.ts` 的就是这组数） |
| --- | --- | --- | --- | --- |
| `classic-white.png` | 1350 × 1800 | 0.7500 | x 75, y 90, 1200 × 1599 | `{ x: 0.055556, y: 0.05, width: 0.888889, height: 0.888333 }` |
| `instant-square.png` | 1425 × 1800 | 0.7917 | x 75, y 90, 1275 × 1275（1:1） | `{ x: 0.052632, y: 0.05, width: 0.894737, height: 0.708333 }` |
| `film-35mm.png` | 1350 × 1950 | 0.6923 | x 210, y 270, 930 × 1240（3:4） | `{ x: 0.155556, y: 0.138462, width: 0.688889, height: 0.635897 }` |

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

> 注意：`getbbox()` 返回的是"非全透明像素"的范围，也就是**边框的包围盒**。
> 如果相框四周还有一圈空白，需要自己再换算；本项目 3 张占位相框的空白都算在边框内，直接可用。

**B. Photoshop / 预览 / 任意图片编辑器**：用矩形选区框住透明区域，读选区坐标，再除以画布尺寸。

**C. 直接在代码里临时打印**：把 `window` 随便填个值，跑起来看 `assets/frames/README.md`
第 2 条的自检（观察成片里照片有没有正好落在窗口里），反复微调也行 —— 只是慢。

## 注册到代码（只改 `src/constants/frames.ts`，不动任何逻辑）

```ts
{
  id: 'my-frame',                       // 唯一即可，英文小写短横线
  name: '我的相框',                      // 会显示在取景器左上角
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

## 常见坑

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 照片被整块挡住 / 只看到相框 | 窗口不是透明的（PNG 没 alpha 或用了 JPG） | 重新导出带透明通道的 PNG |
| 相框明显被拉扁/拉长 | `aspect` 与真实像素比不一致 | 按真实像素改 `aspect` |
| 成片里照片位置偏移 | `window` 量错（尤其忘了除以画布尺寸） | 用上面 A 方案重新量 |
| 取景器和成片构图差一点 | 取景器显示的是相机传感器中心裁切，成片是整张照片中心裁切 | 见 README「已知限制」第 2 条 |
| 日期看不见 | 日期烧在了相框留白之外或颜色与边框太接近 | 调 `defaultTimestampAnchor`，或改预设的 `timestamp.color` |

## 重新生成占位图

```powershell
python scripts/generate_placeholder_assets.py
```

需要 Pillow（`pip install Pillow`）。脚本是幂等的，会覆盖同名文件，并打印每张图的归一化窗口，
方便和 `src/constants/frames.ts` 里的数字对账。
