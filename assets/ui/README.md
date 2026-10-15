# `assets/ui/` —— 界面质感素材

这个目录里的图**不是设计稿**，而是 App 界面上直接铺的位图。
它们由 `scripts/generate_ui_assets.py` 生成（Pillow + numpy，无需联网），随时可以重新跑：

```powershell
python scripts/generate_ui_assets.py
```

## v1.5.0 拿掉了哪五张，为什么

取景器主屏换成了**液态玻璃**（`src/components/LiquidGlassView.tsx`），这一版删了五张：

| 删掉的 | 原来是干什么的 |
| --- | --- |
| `dial.png` / `dial-on.png` | 44pt 机械防滑拨轮（48 齿滚花），顶栏与底栏的按钮底 |
| `icon-film.png` | 预设拨轮的图标（细线胶片条） |
| `icon-settings.png` | 设置拨轮的图标（三档推子） |
| `icon-album.png` | 相册入口的图标（早就没人用了） |

理由三条，每一条单独就够：

1. **玻璃要求图标跟着算出来的颜色走。** 玻璃盘上的图标要在"禁用态 / 点亮态"之间换色，
   位图做不到 —— 位图的颜色是烘死在像素里的。
2. **18pt 上缩放会糊。** 玻璃盘直径只有 40pt，图标按 `size * 0.48` 缩到 ~18pt，
   位图在这个尺寸上的描边全是半透明灰边。
3. **"金属滚花"这个拟物方向已经被否掉了。** 它是这一版要消灭的东西本身。

替代品是纯 `View` 画的矢量图形：`DialButton` 的 `glyph` prop、以及
`CameraScreen.tsx` 里的 `SettingsGlyph`（三横线 + 三旋钮，滑杆）与 `FilmGlyph`
（带齿孔的圆角矩形）。**改色改尺寸都不用重跑 Python。**

那五个 `make_*` 函数**仍然留在生成器里**当参考实现（几何算法是对的，想拿回滚花拨轮
直接照抄），只是 `main()` 不再调用它们 —— 所以重跑脚本不会把那五张图又变出来。

## 为什么界面还要用图片，而不是纯 StyleSheet？

React Native 在 iOS 上**没有径向渐变**（`experimental_background*` 是 Android 专用、
并且 RN 0.86 的类型里根本没有），也没有内阴影、没有滚花纹理。
要做出"实体相机的质感"，只有两条路：

1. 引 `react-native-linear-gradient` / `react-native-svg` —— **会引入原生依赖**，
   Expo Go 直接跑不了，跟本项目的硬约束冲突；
2. 用 Pillow 把质感**预渲染成 PNG**，RN 只负责摆放。

本项目选 2。好处是：改质感只要改 Python 再跑一次，**JS 代码一行都不用动**；
坏处是这些图是固定像素，放大超过 2 倍会看出模糊 —— 所以尺寸都按 @4x 出。

⚠️ 但**图标**这一类不适用上面这条理由了（见上一节）：线性图标在 18pt 上，
"预渲染"带来的只有模糊，没有收益。

## 文件清单

| 文件 | 尺寸 | 用在哪 | 说明 |
| --- | --- | --- | --- |
| `leather-tile.png` | 320×320 | 暗房抽屉面板 | 无缝平铺（`resizeMode="repeat"`），配 `opacity: 0.95`。**振幅刻意压到 ±2.5/255**：远看是 #171716 的纯色，近看才有磨砂质感。取景器那块底纹在 v1.5.0 已经删掉了（玻璃要能采到画面），现在只剩 `FilmDrawer` 在用 |
| `shutter-disc.png` | 240×240 | 快门键内盘 | 奶油色 + 左上偏移的径向渐变 + 底缘内阴影，模拟物理按键 |
| `icon-flash.png` | 168×168 | 工具行的闪光灯档 | 只描边的细线闪电（`ICON_IDLE = (196,192,184)`）。**原来叫 `icon-torch.png`** —— 那个图形从它叫 torch 起画的一直就是闪电，所以只是改名，重画前后字节完全一致 |
| `icon-flash-on.png` | 168×168 | 同上（点亮态） | 琥珀色描边 |
| `icon-flip.png` | 168×168 | 工具行的镜头反转档 | 中心镜头圆 + 两段循环箭头 |

## 改色板

所有颜色都是 `generate_ui_assets.py` 顶部的常量：

```python
INK_AMBER        = (210, 139, 42)   # 主强调色，与 App 内的 #D28B2A 一致
DIAL_TOP         = (46, 45, 43)     # 拨轮渐变亮端（只有参考实现还在用）
DIAL_BOTTOM      = (22, 21, 20)     # 拨轮渐变暗端（同上）
DIAL_KNURL_LIGHT = (60, 58, 54)     # 滚花亮齿（同上）
DIAL_KNURL_DARK  = (16, 15, 14)     # 滚花暗齿（同上）
ICON_IDLE        = (196, 192, 184)  # 图标未点亮时的描边色
```

改完跑一遍脚本就行 —— `src/constants/uiAssets.ts` 里的 `require()` 路径不变，
Metro 会因为文件内容变了自动重新打包。

> 本机代码页是 **gb2312**：用 PowerShell 的 `Get-Content` / `Set-Content` 读写这个仓库里
> 任何含中文的文件都会把中文变成乱码（而且 `Get-Content` 报的行数也不对）。
> 改文件请用 `read` / `edit` / `write` 工具，或直接用 Python。

## 换素材的注意点

- **`leather-tile.png` 必须是无缝的**，否则平铺会看到网格线。当前实现靠"低频噪声 +
  双三次放大"，天然无缝；如果你换成真实皮革照片，记得先在 Photoshop 里做偏移接缝。
- **图标要留白边**：`_stroke()` 画的是描边路径，四周留了约 15% 的空白。图标会被缩放到
  `size * 0.48`，太满会顶到盘边。
- **删任何一条之前先全仓 grep `UI_ASSETS.<名字>`**：`src/constants/uiAssets.ts` 里的
  每一条都对应一次 Metro 的资产打包，留着一个没人 `require` 的条目等于让 App 白背几十 KB。
