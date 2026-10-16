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
 * ⚠️ **尺寸那些事（决定颗粒看起来什么样，2026-10-10 实测）**：
 * 贴图 1 px = 1 逻辑点，而截图发生在 3x 屏幕上 → **1 个贴图像素会变成 3×3 个输出像素**，
 * iOS 会在放大时做平滑插值，噪声对比度会掉到约 0.35 倍。
 * 所以：
 *   1. tile 必须**大于照片窗口**（窗口最大约 352×466 pt）才不会露出重复花纹 → 512 起步；
 *   2. 想得到可见的颗粒，脚本里的 σ 和预设里的 opacity 都要按"放大后掉 65%"来补偿；
 *   3. 别指望 1 像素级的细颗粒 —— 那在这个架构下必然被插值抹平（要更细只能换渲染技术栈）；
 *   4. 正因为 1 像素高频会被抹平，`grain.png` 才做成**双尺度团簇**（细颗粒 σ≈0.55 +
 *      结块 σ≈1.6 两条带限噪声叠加，整体再上采样 1.4× 并 0.7px 高斯微模糊）：
 *      结块的那部分在插值后留得下来，看起来才是银盐团簇而不是电子沙沙声。
 *      v1.8.0 之前那版是 2×2 / 4×4 盒平均叠加，对比度只有 σ≈0.23，
 *      叠出来的颗粒幅度约为 0.02~0.035，肉眼几乎看不见 —— 这就是这一轮重烤的原因。
 */
import type { TextureId, TextureSpec } from '../types';

export const TEXTURES: Record<TextureId, TextureSpec> = {
  grain: {
    id: 'grain',
    name: '颗粒',
    // 512×512：比照片窗口（最大约 352×466 pt）大 → 完全不重复
    source: require('../../assets/textures/grain.png'),
    defaultResizeMode: 'repeat',
    note: '单色颗粒 tile（512×512 8 位灰度）：双尺度团簇噪声（细颗粒 σ≈0.55 + 结块 σ≈1.6 两条带限噪声叠加），围绕中灰 128、σ≈66（归一化 0.26），且三通道恒等 → 只改亮度、绝不出彩噪。烘焙期已做完 1.4× 上采样 + 0.7px 高斯微模糊（RN 的 Image 没有逐像素滤镜，颗粒的"放大 + 微糊"只能在贴图里做），并且用 FFT + 周期重采样保证无缝可平铺。用 overlay 混合，平铺铺满画面；tile 越大越不会看出重复。',
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
