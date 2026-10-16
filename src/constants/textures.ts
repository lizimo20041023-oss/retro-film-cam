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
 *   4. 颗粒的"影调加权"依然靠 overlay 的数学性质：贴图围绕中灰 128、σ≈66/255，
 *      高光处 overlay 权重趋 0，中间调最大 —— 不需要逐像素遮罩。
 */
import type { TextureId, TextureSpec } from '../types';

export const TEXTURES: Record<TextureId, TextureSpec> = {
  grain: {
    id: 'grain',
    name: '颗粒',
    // 512×512：比照片窗口（最大约 352×466 pt）大 → 完全不重复
    source: require('../../assets/textures/grain.png'),
    defaultResizeMode: 'repeat',
    note: '单色颗粒 tile（512×512 8 位灰度）：双尺度带限噪声（细颗粒 σ=0.60px 占 0.78 + 团簇 σ=1.80px 占 0.22；v1.8.2 起直接在 512 网格上生成，不再做 1.4× 上采样 + 0.7px 微模糊），围绕中灰 128、σ≈66.4（归一化 0.2616），三通道恒等 → 只改亮度、绝不出彩噪。频带能量：<8px 65.7% / 8–24px 28.5% / 24–64px 5.0%（旧版 25.8 / 55.0 / 16.2 —— 真机上就是"脏云雾"）；由 `FilmLookLayers` 按 512/3pt 手工平铺（1 贴图像素 = 1 设备像素）+ overlay 铺满画面，FFT + 周期重采样保证无缝。',
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
    note: '从中心透明 → 边缘纯黑的径向渐变，拉伸铺满，用 overlay 压暗四角。v1.8.0 从 multiply 改过来：multiply 会把纯白压成灰（白雾来源之一），而 overlay(1, cs) = 1 对纯白一个像素都不动。',
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
