/**
 * 十一卷真胶片 LUT 资产的运行时入口（九张光谱图集 + 两卷派生人格）。
 *
 * ── 这里在做什么 ────────────────────────────────────────────────────────────
 * `constants/lutAtlas.ts` 里是九张 **256×141 RGBA PNG 图集**的 base64（两卷复用基底，
 * 由 `_v200_gen_atlas.py` 从 spectral_film_lut 离线生成的 33³ float 表量化为 8bit）。
 * 运行时需要的是查表用的 `Lut3D`（107,811 B/卷），所以这里负责：
 *
 *     base64 → decodeBase64 → decodePng → extractLutFromAtlas → Lut3D（缓存）
 *
 * 解码一次约几毫秒（Node 实测 640×480 PNG 解码 28ms；这里每张图集只有 256×141，
 * 40ms 上限），所以**必须缓存**：一卷拍十张不该解十次。缓存是模块级 Map，
 * 一卷最多 107,811 B，十一卷全解满约 1.2 MB —— 只在真的用过那卷时才占。
 *
 * ── 失败为什么返回 null 而不是抛 ────────────────────────────────────────────
 * `processFilmPhoto` 的 v2.0.0 管线是「能用真 LUT 就用，不能用就回退声明式调色」。
 * 资产解码失败（打包错、base64 被截断、PNG 解码器遇到未知色型）属于**可降级**故障：
 * 抛异常会把一次拍照整个搞挂，而用户还有一条 v1.9.x 的完整管线可走。
 * 所以这里吞掉异常、`console.warn`（真机上留一条证据），返回 null 让调用方回退。
 *
 * ⚠️ 不要在这里 `import` 任何 React Native / Expo 模块：这段代码要能在 Node
 * 探针里直接跑（`_probe_v200_lut.cjs` 就是这么验证九卷 maxDiff=0 的）。
 */

import { LUT_ATLAS_BASE64 } from '../constants/lutAtlas';
import { LUT_SIZE } from '../constants/filmRender';
import { decodeBase64 } from './base64';
import { decodePng } from './pngCodec';
import { extractLutFromAtlas } from './lut3d';
import type { Lut3D } from './lut3d';
import { applyFilmPersonalityToLut } from './filmProfiles';

/** 卷 id → Lut3D。只缓存成功结果；失败的卷下次调用会再试（资产可能被热更新修好）。 */
const lutCache = new Map<string, Lut3D>();

/**
 * 取一卷的 33³ LUT。
 *
 * @param stockId 卷 id（`um-400` / `gd-200` / …）。不在图集里的 id 返回 null。
 * @returns 命中缓存 / 解码成功 → `Lut3D`；图集里没有这卷或解码失败 → null。
 */
export function getLutForStock(stockId: string): Lut3D | null {
  const cached = lutCache.get(stockId);
  if (cached !== undefined) {
    return cached;
  }

  const atlas = LUT_ATLAS_BASE64[stockId];
  if (typeof atlas !== 'string' || atlas.length === 0) {
    return null;
  }

  try {
    const png = decodePng(decodeBase64(atlas));
    const lut = applyFilmPersonalityToLut(extractLutFromAtlas(png, LUT_SIZE), stockId);
    lutCache.set(stockId, lut);
    return lut;
  } catch (error) {
    console.warn(`[lutAssets] ${stockId} 的 LUT 图集解码失败，本张走声明式调色回退`, error);
    return null;
  }
}

/** 图集里有没有这卷（不解码，只查 key；探针用它校验九卷覆盖率）。 */
export function hasLutForStock(stockId: string): boolean {
  const atlas = LUT_ATLAS_BASE64[stockId];
  return typeof atlas === 'string' && atlas.length > 0;
}

/** 清空缓存（探针 / 内存压力测试用；App 正常运行不需要）。 */
export function clearLutCache(): void {
  lutCache.clear();
}

/** 当前已缓存的卷 id（探针断言缓存行为用）。 */
export function cachedLutStockIds(): string[] {
  return Array.from(lutCache.keys()).sort();
}
