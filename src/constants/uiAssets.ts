/**
 * UI 质感素材注册表（皮革底纹 / 机械拨轮 / 快门盘 / 线性图标）。
 *
 * 全部由 `scripts/generate_ui_assets.py` 生成。想换风格有两条路：
 *   1. 改那个脚本里的调色板常量再重跑（推荐，尺寸/抗锯齿都是算好的）；
 *   2. 直接用你自己的 PNG 覆盖 `assets/ui/` 下的同名文件
 *      —— 建议按 4 倍逻辑尺寸出图（44pt → 176px，42pt → 168px）。
 *
 * 为什么这些也做成图片而不是纯样式：
 *   RN 在 iOS 上没有径向渐变（`experimental_background*` 本项目刻意不用），
 *   而"金属滚花""皮革毛孔""按键高光"本质上是美术资源。
 *   做成 PNG 既能精准控制，又和相框/纹理一样"换图不用改代码"。
 */
export const UI_ASSETS = {
  /** 可平铺的暗色皮革底纹（160×160 无缝 tile，配 `resizeMode="repeat"`）。 */
  leatherTile: require('../../assets/ui/leather-tile.png'),
  /** 44pt 机械防滑拨轮：未点亮 / 点亮（琥珀）。 */
  dial: require('../../assets/ui/dial.png'),
  dialOn: require('../../assets/ui/dial-on.png'),
  /** 快门内盘：奶油色 + 左上偏移的径向渐变 + 底缘内阴影。 */
  shutterDisc: require('../../assets/ui/shutter-disc.png'),
  /** 极细线性图标（42pt 画布）：闪光灯 / 闪光灯点亮 / 镜头反转。 */
  iconFlash: require('../../assets/ui/icon-flash.png'),
  iconFlashOn: require('../../assets/ui/icon-flash-on.png'),
  iconFlip: require('../../assets/ui/icon-flip.png'),
  /** 预设拨轮的图标：电影胶片条。 */
  iconFilm: require('../../assets/ui/icon-film.png'),
  /** 设置入口的图标：三档推子。 */
  iconSettings: require('../../assets/ui/icon-settings.png'),
  /** App 内相册入口的图标：装了山和太阳的照片。 */
  iconAlbum: require('../../assets/ui/icon-album.png'),
} as const;
