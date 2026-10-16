/**
 * UI 质感素材注册表（快门盘 / 线性图标）。
 *
 * 全部由 `scripts/generate_ui_assets.py` 生成。想换风格有两条路：
 *   1. 改那个脚本里的调色板常量再重跑（推荐，尺寸/抗锯齿都是算好的）；
 *   2. 直接用你自己的 PNG 覆盖 `assets/ui/` 下的同名文件
 *      —— 建议按 4 倍逻辑尺寸出图（44pt → 176px，42pt → 168px）。
 *
 * 为什么这些也做成图片而不是纯样式：
 *   快门内盘要的是**径向**渐变 + 底缘内阴影，而 RN 只有**线性**渐变
 *   （`experimental_backgroundImage`；v1.6.1 起 `FilmDrawer` 顶部那道微光
 *   用的就是它，iOS 侧解析失败会优雅降级成纯色，Android 侧未验）。
 *   而"按键高光"本质上是美术资源。
 *   做成 PNG 既能精准控制，又和相框/纹理一样"换图不用改代码"。
 *
 * ⚠️ **v1.5.0 起这里的条目少了五个，别再往回调**：
 *   `dial` / `dialOn` / `iconSettings` / `iconFilm` / `iconAlbum` 已删
 *   （条目、`assets/ui/` 下的 PNG、生成器 `main()` 里的调用三者一起删的）。
 *   原因是取景器主屏换成了液态玻璃材质：
 *     - 玻璃要求图标跟着**算出来的颜色**走（禁用态 / 点亮态），位图做不到；
 *     - 位图在 18pt 上会被缩放糊掉，而玻璃盘直径只有 40pt；
 *     - 「金属滚花」这个拟物方向本身已被否掉。
 *   设置入口与胶卷抽屉现在是纯 `View` 画的矢量图形 —— 见 `DialButton` 的
 *   `glyph` prop，以及 `CameraScreen.tsx` 里的 `SettingsGlyph` / `FilmGlyph`。
 *
 * ⚠️ **v1.6.1 起这里的条目又少了一个**：
 *   `leatherTile` 已删（条目与 `require` 一起删的，`assets/ui/leather-tile.png`
 *   那个文件本身**留在原地**没删 —— `scripts/preview_ui_mock.py` 还要用它做设计稿）。
 *   原因是 `FilmDrawer` 的皮革底纹层被撤掉了：那张 320×320 的 tile 左右边缘对不上，
 *   `resizeMode="repeat"` 每 320pt 就是一条贯穿全高的纵向断层（逐像素接缝差 1.62×
 *   内部相邻列、320 条边界里排第 1），正是用户报的"✕ 旁边那条竖线"。
 *   撤掉纹理层之后全仓只剩注释在提它 —— 再留着 `require` 等于白背 99KB 进包。
 *
 * 下面四条**都还有活的引用**，删任何一条前先全仓 grep `UI_ASSETS.<名字>`。
 */
export const UI_ASSETS = {
  /** 快门内盘：奶油色 + 左上偏移的径向渐变 + 底缘内阴影。 */
  shutterDisc: require('../../assets/ui/shutter-disc.png'),
  /** 极细线性图标（42pt 画布）：闪光灯 / 闪光灯点亮 / 镜头反转。 */
  iconFlash: require('../../assets/ui/icon-flash.png'),
  iconFlashOn: require('../../assets/ui/icon-flash-on.png'),
  iconFlip: require('../../assets/ui/icon-flip.png'),
} as const;
