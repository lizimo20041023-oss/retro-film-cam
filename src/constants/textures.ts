/**
 * 纹理贴图注册表（颗粒 / 灰尘 / 暗角 / 漏光）。
 *
 * 这里曾经还注册过一张 `chromaNoise`（预烘焙的品红↔绿块状彩噪贴图）。
 * 它是 CCD-CYBER / DIGI-02 两款满屏紫绿伪色的唯一来源，已被彻底删除 ——
 * 颗粒只走 `grain`，画面里不存在色度噪声源（v1.9.3 的 grain 板是中性灰基底 + 双极性
 * 白/黑点，三通道几乎同步，同样不产生彩噪）。
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
 * ⚠️ **尺寸那些事（颗粒看起来什么样，就由这几行决定；v1.9.4 重写）**：
 * v1.9.3 的"512 小图 + 每 170.67pt 手工平铺"已彻底废除 —— 用户 m10195 在蓝天上
 * 看到了肉眼可见的「重复网格黑麻点阵列（纱窗效应）」。v1.9.4 起：
 *   1. `grain.png` = **1200×1600 RGBA 全画幅非周期银盐板**，一次 `stretch` 铺满整个
 *      照片窗口（`resizeMode='stretch'`，**没有任何 repeat/平铺/周期小图**）；
 *   2. 基底**全透明**（alpha=0）：没有中性灰底，也就不会给照片蒙灰罩；粒子是
 *      50%:50% 双极性 —— 亮粒子 `(255,252,245)` 核心 alpha 0.42、暗粒子
 *      `(28,26,24)` 核心 alpha 0.32，半径 0.55~0.95px；
 *   3. 混合模式 **`soft-light`**（v1.9.4 图层配置给出）：只加肌理，不动蓝天/白墙的
 *      明度与色相；层 opacity 由 `grain.ts` 冻结为 0/.04/.075/.115/.16；
 *   4. `scripts/generate_grain_clump.py` 的自检卡死：透明像素 ≥70%、平均 alpha
 *      0.04~0.12、亮/暗粒子数相等、非零像素只有两个调色板、512-lag 自相关 ≤0.02、
 *      周期 <8px ≥60% 且 24–64px ≤6%。
 *   `dust.png` 是稀疏离散点（v1.8.3 起 `dust` 纹理层已不参与渲染，白尘改由
 *   `planDustSpecks` 的 1~2 颗 specks 承担），保留注册只为历史兼容。
 */

import type { TextureId, TextureSpec } from '../types';

export const TEXTURES: Record<TextureId, TextureSpec> = {
  grain: {
    id: 'grain',
    name: '颗粒',
    // 1200×1600 全画幅：一次 stretch 铺满窗口，绝不 repeat/平铺（v1.9.4）
    source: require('../../assets/textures/grain.png'),
    defaultResizeMode: 'stretch',
    note: '全画幅非周期银盐板（1200×1600 RGBA，v1.9.4 重烤）：全透明基底 + 50%:50% 双极性粒子 —— 亮粒子 (255,252,245) 核心 alpha 0.42、暗粒子 (28,26,24) 核心 alpha 0.32，半径 0.55~0.95px，随机均匀撒点（非网格、无周期）；透明像素 86.4%、平均 alpha 0.0508、非零像素调色板纯度 100%、512-lag 自相关 ≤0.002、频带 <8px 90.1% / 8–24 8.8% / 24–64 1.0%（v1.9.4 已废除 512 小图周期平铺，蓝天零网格伪影）；混合 soft-light；层 opacity 由 grain.ts 冻结为 0/.04/.075/.115/.16。',
  },
  dust: {
    id: 'dust',
    name: '灰尘',
    source: require('../../assets/textures/dust.png'),
    defaultResizeMode: 'stretch',
    note: '稀疏白点 + 划痕（历史纹理：v1.8.3 起 dust 层已不参与渲染，白尘改由 planDustSpecks 成片 1~2 颗承担）。',
  },
  vignette: {
    id: 'vignette',
    name: '暗角',
    source: require('../../assets/textures/vignette.png'),
    defaultResizeMode: 'stretch',
    note: '从中心透明 → 边缘深青黑的径向渐变（v1.9.4 重烤：中心 **74%** 半径 alpha=0 完全透明，四角 alpha=255，smoothstep 无硬边；v1.9.3 曾是 72%、v1.9.2 80%），拉伸铺满，v1.8.7 起用 multiply 压暗四角。为什么 multiply 安全：中心 alpha=0 —— 没有上层像素参与混合，纯白/山体/海湾不会被压灰；multiply 四角"乘"暗比 normal"盖"黑纱保留更多中间调。层 opacity 由预设 vignette 决定，v1.9.4 值域 0.16~0.28。',
  },
  lightLeak: {
    id: 'lightLeak',
    name: '漏光',
    source: require('../../assets/textures/light-leak.png'),
    defaultResizeMode: 'stretch',
    note: '右上角暖色光晕，拉伸铺满，用 screen 提亮。v1.8.0 重烤：80% 像素三通道全 ≤0.02（= screen 中性）、meanLum 0.082，只有角部一条暖橙光；v1.9.4 起它同时是 CS-800T 的 halation(0.04) 光晕层材质，层 opacity 由 gradeLayers 夹在 ≤0.04。preset 的 lightLeakFlip 可左右翻转换边。',
  },
};

/** 取纹理的图片源。 */
export function textureSource(id: TextureId): TextureSpec['source'] {
  return TEXTURES[id].source;
}
