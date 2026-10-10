# `assets/ui/` —— 界面质感素材

这个目录里的图**不是设计稿**，而是 App 界面上直接铺的位图。
它们由 `scripts/generate_ui_assets.py` 生成（Pillow + numpy，无需联网），随时可以重新跑：

```powershell
python scripts/generate_ui_assets.py
```

## 为什么界面要用图片，而不是纯 StyleSheet？

React Native 在 iOS 上**没有径向渐变**（`experimental_background*` 是 Android 专用、
并且 RN 0.86 的类型里根本没有），也没有内阴影、没有滚花纹理。
要做出"实体相机的质感"，只有两条路：

1. 引 `react-native-linear-gradient` / `react-native-svg` —— **会引入原生依赖**，
   Expo Go 直接跑不了，跟本项目的硬约束冲突；
2. 用 Pillow 把质感**预渲染成 PNG**，RN 只负责摆放。

本项目选 2。好处是：改质感只要改 Python 再跑一次，**JS 代码一行都不用动**；
坏处是这些图是固定像素，放大超过 2 倍会看出模糊 —— 所以尺寸都按 @3x 出。

## 文件清单

| 文件 | 尺寸 | 用在哪 | 说明 |
| --- | --- | --- | --- |
| `leather-tile.png` | 320×320 | 整个屏幕的底纹 | 无缝平铺（`resizeMode="repeat"`），配 `opacity: 0.95`。**振幅刻意压到 ±2.5/255**：远看是 #171716 的纯色，近看才有磨砂质感 |
| `dial.png` | 176×176 | 顶部/底部拨轮按钮 | 48 齿滚花 + 顶缘高光 + 盘心柔光。渲染成 44pt |
| `dial-on.png` | 176×176 | 同上（点亮态） | 顶缘改成琥珀色弧 + 盘心琥珀内发光。用于"补光已开" |
| `shutter-disc.png` | 240×240 | 快门键内盘 | 奶油色 + 左上偏移的径向渐变 + 底缘内阴影，模拟物理按键 |
| `icon-torch.png` | 168×168 | 补光拨轮的图标 | 只描边的细线闪电（`ICON_IDLE = (196,192,184)`） |
| `icon-torch-on.png` | 168×168 | 同上（点亮态） | 琥珀色描边 |
| `icon-flip.png` | 168×168 | 镜头反转拨轮 | 中心镜头圆 + 两段循环箭头 |
| `icon-film.png` | 168×168 | 预设拨轮 | 细线胶片条 + 两侧齿孔 |

`_mock-camera-screen.png` 是 `scripts/preview_ui_mock.py` 吐出来的**排版示意图**，
只在本地看比例用，已被 `.gitignore` 忽略。

## 改色板

所有颜色都是 `generate_ui_assets.py` 顶部的常量：

```python
INK_AMBER        = (210, 139, 42)   # 主强调色，与 App 内的 #D28B2A 一致
DIAL_TOP         = (46, 45, 43)     # 拨轮渐变亮端
DIAL_BOTTOM      = (22, 21, 20)     # 拨轮渐变暗端
DIAL_KNURL_LIGHT = (60, 58, 54)     # 滚花亮齿
DIAL_KNURL_DARK  = (16, 15, 14)     # 滚花暗齿
ICON_IDLE        = (196, 192, 184)  # 图标未点亮时的描边色
```

改完跑一遍脚本就行 —— `src/constants/uiAssets.ts` 里的 `require()` 路径不变，
Metro 会因为文件内容变了自动重新打包。

## 换素材的注意点

- **`leather-tile.png` 必须是无缝的**，否则平铺会看到网格线。当前实现靠"低频噪声 +
  双三次放大"，天然无缝；如果你换成真实皮革照片，记得先在 Photoshop 里做偏移接缝。
- **拨轮和图标是分开的两张图**：拨轮是底，图标叠在上面（见 `src/components/DialButton.tsx`
  里的 `iconLayer`）。想加一个新按钮，只要新出一个图标 PNG，不用重画拨轮。
- **图标要留白边**：`_stroke()` 画的是描边路径，四周留了约 15% 的空白。图标会被缩放到
  `size * 0.48`（44pt 的拨轮上就是 21pt），太满会顶到滚花上。
