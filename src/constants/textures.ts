/**
 * 纹理贴图注册表（颗粒 / 灰尘 / 暗角 / 漏光）。
 *
 * 这里曾经还注册过一张 `chromaNoise`（预烘焙的品红↔绿块状彩噪贴图）。
 * 它是 CCD-CYBER / DIGI-02 两款满屏紫绿伪色的唯一来源，已被彻底删除 ——
 * 颗粒只走 `grain`，而 `grain.png` 三通道逐像素恒等，画面里不存在色度噪声源。
 *
 * 为什么用 PNG 贴图而不是 `filter` 或渐变？
 * - RN 的 `filter` 在 **iOS 上只支持 brightness / opacity**（官方原文见 README 的兼容性核实），
 *   做不出颗粒、暗角、漏光；
 * - `backgroundImage: 'radial-gradient(...)'` 虽然可用，但配套的
 *   `experimental_backgroundPosition / Repeat / Size` 都被官方标为 🧪 Experimental，随时可能变；
 * - 静态 PNG + `mixBlendMode` 是 100% 跨平台稳定的做法，而且把"滤镜长什么样"变成了可以随便换的美术资源。
 *
 * 替换规范见 `assets/textures/README.md`。换图不用改代码。
 *
 * ⚠️ **尺寸那些事（颗粒看起来什么样，就由这几行决定；v1.8.2 重写）**：
 * 颗粒板的实际口径是 **1 贴图像素 = 1 设备像素**：`FilmLookLayers.tsx` 用
 * `planTextureTiles()` 按 `TEXTURE_TILE_PT = 512/3 ≈ 170.667pt` **手工铺方格**。
 * 旧的 `resizeMode="repeat"` 不能用 —— 它的方格边长 = `image.size`（点），而
 * `image.size` 取决于资源解码成几倍图：Metro 数据路径 3 倍（170.67pt），打包路径
 * 1 倍（512pt）⇒ 真机 IPA 里贴图被放大 3 倍，`grain.png` 中 8–24px 的团簇变成
 * 屏幕上 8–24pt 的"脏云雾"（用户 2026-10-17 的投诉，根因与修法见
 * `FilmLookLayers.tsx` 文件头）。于是：
 *   1. 贴图的**空间尺度就是屏幕尺度**：周期 `<8px` 是肉眼看得清的颗粒，`24–64px`
 *      就是污渍。`scripts/generate_grain_clump.py` 的频带自检卡死这两条
 *      （`<8px ≥ 0.60`、`24–64px ≤ 0.06`，旧配方是 0.258 / 0.162）。
 *   2. `grain.png` 必须**无缝**（FFT 域滤波 + 周期重采样），平铺后看不出接缝；
 *      每 170.67pt 重复一次没问题 —— 它是噪声场，重复不可见。
 *   3. `dust.png` 是稀疏离散点，仍然走 RN 的 `repeat`（一屏一块，重复会被看出来）；
 *      它在打包路径下斑点偏大 3 倍，属于已记档的已知缺口。
 *   4. 颗粒的"影调加权"依然靠 overlay 的数学性质：颗粒贴图偏离中灰越远、overlay 的
 *      提亮/压暗越明显，高光处权重趋 0，中间调最大 —— 不需要逐像素遮罩。
 *      v1.9.2 起 `grain.png` 不再是整块不透明灰度板，而是 **RGBA 透明背景 + alpha
 *      通道为载体**：RGB 只有纯白/纯黑两种点，alpha = |亮度偏差|，偏差为 0 的
 *      "背景" alpha=0 完全透明（用户铁律一）。因此层不透明度从 0.045 档降到
 *      0.025 档（默认），颗粒浓度不再由"灰罩"提供。
 */
import type { TextureId, TextureSpec } from '../types';

export const TEXTURES: Record<TextureId, TextureSpec> = {
  grain: {
    id: 'grain',
    name: '颗粒',
    // 512×512：比照片窗口（最大约 352×466 pt）大 → 完全不重复
    source: require('../../assets/textures/grain.png'),
    defaultResizeMode: 'repeat',
    note: '透明背景颗粒 tile（512×512 RGBA，v1.9.2 重烤）：双尺度带限噪声（细颗粒 σ=0.60px 占 0.78 + 团簇 σ=1.80px 占 0.22；v1.8.2 起直接在 512 网格上生成，不再做 1.4× 上采样 + 0.7px 微模糊）。alpha 通道为载体（background alpha=0 完全透明，颗粒 = 纯白/纯黑点 × |偏差|），不再有整块中灰底板；alpha 均值 0.2078、频带能量 <8px 84.4% / 8–24px 13.7% / 24–64px 1.6%（旧版 25.8 / 55.0 / 16.2 —— 真机上就是"脏云雾"）；由 `FilmLookLayers` 按 512/3pt 手工平铺（1 贴图像素 = 1 设备像素）+ overlay 铺满画面，FFT + 周期重采样保证无缝；层 opacity 由 grain.ts 封顶 ≤0.055。',
  },
  dust: {
    id: 'dust',
    name: '灰尘',
    source: require('../../assets/textures/dust.png'),
    defaultResizeMode: 'repeat',
    note: '稀疏白点 + 划痕，平铺 + screen（只加亮点）。模拟胶片扫描件的"不干净"。',
  },
  vignette: {
    id: 'vignette',
    name: '暗角',
    source: require('../../assets/textures/vignette.png'),
    defaultResizeMode: 'stretch',
    note: '从中心透明 → 边缘深青黑的径向渐变（v1.9.2 重烤：中心 80% 半径 alpha=0 完全透明，四角 alpha=255，smoothstep 无硬边；v1.9.1 曾是 70%），拉伸铺满，v1.8.7 起用 multiply 压暗四角。为什么这次 multiply 安全：中心 alpha=0 —— 没有上层像素参与混合，纯白/山体/海湾不会被压灰（v1.9.2 把透明区从 70% 扩到 80%，只有画面最外圈参与压暗）；v1.8.0 那次是整张不透明白底铺满，才有白雾。multiply 四角"乘"暗比 normal"盖"黑纱保留更多中间调。',
  },
  lightLeak: {
    id: 'lightLeak',
    name: '漏光',
    source: require('../../assets/textures/light-leak.png'),
    defaultResizeMode: 'stretch',
    note: '右上角暖色光晕，拉伸铺满，用 screen 提亮。v1.8.0 重烤：80% 像素三通道全 ≤0.02（= screen 中性）、meanLum 0.082，只有角部一条暖橙光；层 opacity 由引擎夹在 ≤0.10，以免整幅被提亮。preset 的 lightLeakFlip 可左右翻转换边。',
  },
};

/** 取纹理的图片源。 */
export function textureSource(id: TextureId): TextureSpec['source'] {
  return TEXTURES[id].source;
}
