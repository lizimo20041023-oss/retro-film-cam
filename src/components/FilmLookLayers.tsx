/**
 * `FilmLookLayers` —— 成片合成与取景器实时预览**共用**的"胶片观感"渲染组件（v1.8.0）。
 *
 * 为什么要有它：同一套图层栈以前在 `FilmCompositor.tsx` 里内联了一份，
 * 取景器完全看不到滤镜效果 —— 用户按快门之前只能靠想象。抽出来之后：
 *   · `surface='composite'`：成片（`FilmCompositor` 里，截进 ViewShot）
 *   · `surface='live'`：取景器镂空窗（`CameraScreen` 里，纯预览、不截图）
 * 渲染什么完全由 `planFilmLooks(preset, surface)` 这个纯函数决定（在 `utils/gradeLayers.ts`）。
 *
 * ── 接线口径（宿主必须遵守，否则就绪计数会错）──────────────────────────────
 * 0. **谁渲染，谁负责报就绪**：本组件渲染的每一张叠图都各调一次 `onPlateLoad`；
 *    宿主渲染的图（底板照片 / 相框 / 重曝 overlay）由宿主自己数。两边不许重复渲染同一层。
 * 1. `countStageImages(preset)` 的口径是 `2 + texture 层数 + photo 层数`
 *    （2 = 底板照片 + 相框，由宿主自己渲染）。本组件：
 *      · 每个 `texture` 层 = 恰好一张 `<Image>` + 恰好一次 `onPlateLoad`
 *      · `color` 层 = 纯 `<View>`，**没有**加载回调
 *      · `photo` 层 = 传了 `photoUri` 才渲染，每个恰好一张 `<Image>` + 一次 `onPlateLoad`
 *        （`kind:'photo'` 是"同一张原图再叠一层"，没有第二个 URI 就画不出来）
 * 2. **photo 层只能由一边渲染**。宿主有两条合法接法：
 *      a) 把 `rawUri` 当 `photoUri` 传进来（推荐 —— 本组件会正确应用
 *         `blurRadius`/`offsetX/offsetY`，那是"真泛光"的**全部**实现）；
 *      b) 宿主自己渲染 photo 层 —— 那么它必须自己挂 `blurRadius`/`offsetX/offsetY`
 *         和 `onLoad`（`FilmCompositor` 现有的 `GradeLayerView` 这两样都没有）。
 *    两边都渲染 = 白白多等 `READY_TIMEOUT_MS`（1500ms）超时；少一张 = `captureRef` 可能截到半张。
 * 3. `seed`：颗粒板的**镜像相位**与微尘的位置都由它决定，且必须在取景器与成片之间传同一个值
 *    （`CameraScreen` 里是模块常量 `LOOK_SEED`）。同一个 seed 下两边的颗粒与微尘逐点相同。
 *    为什么只做镜像而不做平移：无缝贴图镜像之后仍然无缝，平移会在边缘露白边。
 * 4. 所有尺寸都是**比例**（`width/height` 可能只有两百多 pt 的镂空窗）：
 *    微尘半径按短边比例算，绝不写死 pt。
 *
 * ── RN 能力约束 ──────────────────────────────────────────────────────────
 * · `mixBlendMode` 只声明在 `ViewStyle` 上（RN 0.86 的 `ImageStyle` 没有），
 *   所以每个叠图都要外面包一层 `<View>` 承载混合模式与透明度。
 * · `<Image blurRadius>` 在 iOS 上是真模糊 UIImage（`RCTImageView.mm:158`），
 *   能被 `captureRef` 截进成片 —— 真泛光靠它（v1.8.3 起这是栈里**唯一**的模糊层）。
 *
 * ── 为什么平铺不用 `resizeMode="repeat"`（v1.8.2 的根因修正）─────────────
 * iOS 的 repeat 由 `RCTImageComponentView.mm:148-150` 的
 * `resizableImageWithMode:UIImageResizingModeTile` 实现，**方格边长 = `image.size`（点）**，
 * 而 `image.size` 取决于资源被解码成几倍图：Metro 数据路径是 3 倍（`512/3 ≈ 170.7pt`），
 * 打包路径（`RCTImageFromLocalAssetURL`，assets 里没有 @2x/@3x 变体）是 1 倍
 * （`512pt`）—— 同一张贴图在真机 IPA 里被放大 3 倍，于是 `grain.png` 里 8–24px 的团簇
 * 变成屏幕上 8–24pt 的"脏云雾"（用户 2026-10-17 的投诉）。
 * 现在改成 `planTextureTiles()` 手工铺方格：固定 `TEXTURE_TILE_PT = 512/3`，
 * **1 贴图像素 = 1 设备像素**（3x 屏），与资源解码倍率、与 RN 的 repeat 语义都无关；
 * 越界的最后一行/列由根节点的 `overflow: 'hidden'` 裁掉。
 * 就绪计数口径不变：整层只在**第一块**贴图上报一次 `onPlateLoad`（见上面第 1 条）。
 */
import { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { textureSource } from '../constants/textures';
import { dustSpecAlpha, dustSpecCountForGrain } from '../constants/grain';
import { planFilmLooks } from '../utils/gradeLayers';
import type { GradeLayer, ResolvedFilmPreset } from '../types';
import type { ViewStyle } from 'react-native';

export type FilmLookSurface = 'composite' | 'live';

export interface FilmLookLayersProps {
  /** 已解析的预设（`resolvePreset()` 的产物）。 */
  preset: ResolvedFilmPreset;
  /** 渲染区域尺寸（逻辑点）。取景器里就是镂空窗的尺寸，可能只有两百多 pt。 */
  width: number;
  height: number;
  /**
   * `'composite'` = 成片（含 photo 层、颗粒层与微尘）；
   * `'live'` = 取景器实时预览（v1.8.3 起滤掉 photo 层与颗粒层，只剩色层 + 暗角 + 漏光）。
   */
  surface: FilmLookSurface;
  /** 颗粒相位 / 微尘位置的种子。取景器与成片必须传同一个值。 */
  seed: number;
  /** 每一张叠图 `onLoad` 调一次（口径见文件头：每 texture 层 / 每 photo 层各一次）。 */
  onPlateLoad?: () => void;
  /**
   * 可选：原照片 URI。给了就由本组件渲染 `kind:'photo'` 层
   * （对比度自叠 / 真泛光），每层一张 `<Image>` + 一次 `onPlateLoad`。
   * 不给就**完全跳过** photo 层，交给宿主渲染 —— 但两边只能选一边（见文件头）。
   */
  photoUri?: string;
  /** photo 层的缩放方式，与底板照片保持一致（`frame.photoFit`）。 */
  photoFit?: 'cover' | 'contain';
}

/** 一颗微尘：位置与半径都是**比例**，渲染时再乘宽高。 */
export interface DustSpeck {
  key: string;
  /** 圆心 x（0..1 × width）。 */
  x: number;
  /** 圆心 y（0..1 × height）。 */
  y: number;
  /** 核心半径（0..1 × 短边）。 */
  radius: number;
  /** 核心不透明度（0..1）。 */
  opacity: number;
}

/** 32 位整数哈希：把种子 + 盐混成一个稳定值（无 `Math.random`、无 `Date.now`）。 */
function hashSeed(seed: number, salt: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32：小而稳的确定性 PRNG（同 seed ⇒ 同序列）。 */
function makeRandom(seed: number, salt: number): () => number {
  let state = hashSeed(seed, salt);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 光学微尘：**只在 HV / MAX 两档**出现，每张成片 1~2 颗（用户 m01534 · C1 第 3 条）。
 *
 * 硬表：OFF / LT / STD = 0 颗，HV = 1 颗，MAX = 2 颗；核心透明度 0.10 / 0.18（≤ 0.18）。
 * 颗数由 `preset.grain`（档位绝对不透明度）判定 —— 见 `constants/grain.ts` 的
 * `dustSpecCountForGrain()` / `dustSpecAlpha()`，两边是同一个产地，探针直接读。
 *
 * 纯函数、纯 View（没有贴图、不加新预设字段）：位置/大小全部由 `seed` 决定，
 * 所以同一个 seed 下取景器与成片逐点相同，重跑一次成片也逐点相同。
 * 位置避开最外圈 14%（暗角最重的地方），半径按短边比例 —— 成片可能只有几百 pt。
 */
export function planDustSpecks(preset: ResolvedFilmPreset, seed: number): DustSpeck[] {
  const count = dustSpecCountForGrain(preset.grain);
  const specks: DustSpeck[] = [];
  for (let i = 0; i < count; i += 1) {
    const rand = makeRandom(seed, 0x51 + i);
    const x = 0.14 + rand() * 0.72;
    const y = 0.14 + rand() * 0.72;
    // 短边 0.22%~0.50%：512px 成片上只有 1.1~2.6px，是"一粒灰"而不是"一块斑"。
    const radius = 0.0022 + rand() * 0.0028;
    const opacity = dustSpecAlpha(i);
    specks.push({ key: `speck-${i}`, x, y, radius, opacity });
  }
  return specks;
}

/**
 * 贴图的原始边长（= `scripts/generate_grain_clump.py` 里的 `SIZE = 512`）。
 * 改烤脚本的尺寸时，这里要跟着改，否则"1 贴图像素 = 1 设备像素"就断了。
 */
export const TEXTURE_SIZE_PX = 512;

/**
 * 平铺方格的边长（逻辑点）：`512 / 3 = 170.667pt` ⇒ **3x 屏上 1 贴图像素 = 1 设备像素**。
 * 取景器镂空窗约 321~373pt ⇒ 2×2 块（最多 3×3 = 9 张 `<Image>`）。
 */
export const TEXTURE_TILE_PT = TEXTURE_SIZE_PX / 3;

/** 一块平铺方格：尺寸都是逻辑点，绝对定位在图层容器里（越界部分由根的 overflow 裁掉）。 */
export interface TextureTile {
  key: string;
  left: number;
  top: number;
  size: number;
}

/**
 * 把一个 `w × h`（逻辑点）的区域切成边长为 `tilePt` 的方格阵列。
 *
 * 纯函数，探针直接调用它核对"1 贴图像素 = 1 设备像素"这条口径。
 * · 极端尺寸保护：块数上限 6×6，超出就把方格等比放大（宁可少铺几块，
 *   也不要在成片路径上炸出上百个 `<Image>`）。
 * · `- 1e-9` 是防浮点误差：`341.333… / 170.666…` 必须正好是 2 列，不能多出第 3 列。
 */
export function planTextureTiles(
  w: number,
  h: number,
  tilePt: number = TEXTURE_TILE_PT,
): TextureTile[] {
  if (w <= 0 || h <= 0 || tilePt <= 0) {
    return [];
  }
  const size = Math.max(tilePt, Math.max(w, h) / 6);
  const cols = Math.max(1, Math.ceil(w / size - 1e-9));
  const rows = Math.max(1, Math.ceil(h / size - 1e-9));
  const tiles: TextureTile[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      tiles.push({ key: `tile-${r}-${c}`, left: c * size, top: r * size, size });
    }
  }
  return tiles;
}

/** 一个图层要叠的 View 样式（混合模式 + 透明度 [+ 水平镜像]）。 */
function overlayStyle(layer: GradeLayer): ViewStyle {
  const style: ViewStyle = { mixBlendMode: layer.blendMode, opacity: layer.opacity };
  if (layer.kind === 'texture' && layer.flipX) {
    style.transform = [{ scaleX: -1 }];
  }
  return style;
}

function FilmLookLayersImpl({
  preset,
  width,
  height,
  surface,
  seed,
  onPlateLoad,
  photoUri,
  photoFit = 'cover',
}: FilmLookLayersProps) {
  const layers = useMemo(() => planFilmLooks(preset, surface), [preset, surface]);
  const grainFlipped = useMemo(() => hashSeed(seed, 0x9d) % 2 === 1, [seed]);
  const specks = useMemo(
    () => (surface === 'composite' ? planDustSpecks(preset, seed) : []),
    [preset, seed, surface],
  );
  if (width <= 0 || height <= 0) {
    return null;
  }
  const shortEdge = Math.min(width, height);

  return (
    // 整片区域都不吃手势（它盖在取景器/照片上，不能挡住对焦与快门）。
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {layers.map((layer) => {
        if (layer.kind === 'color') {
          return (
            <View
              key={layer.key}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: layer.color },
                overlayStyle(layer),
              ]}
            />
          );
        }

        if (layer.kind === 'photo') {
          // 没有第二份原图就画不出来：只有宿主把 rawUri 递进来才渲染（见文件头第 2 条）。
          if (photoUri === undefined) {
            return null;
          }
          const offsetX = layer.offsetX ?? 0;
          const offsetY = layer.offsetY ?? 0;
          return (
            <View key={layer.key} style={[StyleSheet.absoluteFill, overlayStyle(layer)]}>
              <Image
                source={{ uri: photoUri }}
                style={[
                  StyleSheet.absoluteFill,
                  offsetX !== 0 || offsetY !== 0
                    ? { transform: [{ translateX: offsetX }, { translateY: offsetY }] }
                    : null,
                ]}
                resizeMode={photoFit}
                blurRadius={layer.blurRadius ?? 0}
                onLoad={onPlateLoad}
                fadeDuration={0}
              />
            </View>
          );
        }

        const flip = layer.flipX === true ? !grainFlipped : grainFlipped;
        // 只有**颗粒板**走手工 1:1 方格（见文件头）。v1.8.3 起 `dust` 纹理层已从图层栈
        // 删除（白尘改成成片上 1~2 颗 specks，见 `planDustSpecks`）；剩下的纹理层
        // （`vignette` / `lightLeak`）都是 `resizeMode='stretch'`，走不到 repeat 分支。
        const tiled = layer.resizeMode === 'repeat' && layer.textureId === 'grain';
        const tiles = tiled ? planTextureTiles(width, height) : [];
        const source = textureSource(layer.textureId);
        return (
          <View
            key={layer.key}
            style={[
              StyleSheet.absoluteFill,
              overlayStyle(layer),
              // 颗粒板的相位由 seed 定：镜像一块无缝贴图仍然无缝，不会露白边。
              flip ? styles.flipX : null,
            ]}
          >
            {tiled
              ? tiles.map((tile, index) => (
                  <Image
                    key={tile.key}
                    source={source}
                    style={{
                      position: 'absolute',
                      left: tile.left,
                      top: tile.top,
                      width: tile.size,
                      height: tile.size,
                    }}
                    resizeMode="stretch"
                    // 就绪计数口径：整层只在第一块上报一次（见文件头第 1 条）——
                    // 多报几次会让宿主的"还差几张图"提前归零，截图就可能截到半张。
                    onLoad={index === 0 ? onPlateLoad : undefined}
                    fadeDuration={0}
                  />
                ))
              : (
                  <Image
                    source={source}
                    style={StyleSheet.absoluteFill}
                    resizeMode={layer.resizeMode === 'repeat' ? 'repeat' : 'stretch'}
                    onLoad={onPlateLoad}
                    fadeDuration={0}
                  />
                )}
          </View>
        );
      })}

      {/* 光学微尘：只在成片上加，HV 1 颗 / MAX 2 颗（核心 opacity ≤ 0.18），screen 混合只提亮不压暗。 */}
      {specks.map((speck) => {
        const core = speck.radius * shortEdge;
        const ring = core * 1.9;
        const halo = core * 3.1;
        const center: ViewStyle = {
          position: 'absolute',
          left: speck.x * width,
          top: speck.y * height,
          marginLeft: -halo / 2,
          marginTop: -halo / 2,
          borderRadius: halo / 2,
        };
        return (
          <View key={speck.key} style={[styles.speckCage, center, { width: halo, height: halo }]}>
            <View
              style={[
                styles.speckRing,
                { width: halo, height: halo, borderRadius: halo / 2, opacity: speck.opacity * 0.28 },
              ]}
            />
            <View
              style={[
                styles.speckRing,
                {
                  width: ring,
                  height: ring,
                  borderRadius: ring / 2,
                  marginLeft: (halo - ring) / 2,
                  marginTop: (halo - ring) / 2,
                  opacity: speck.opacity * 0.5,
                },
              ]}
            />
            <View
              style={[
                styles.speckCore,
                {
                  width: core,
                  height: core,
                  borderRadius: core / 2,
                  marginLeft: (halo - core) / 2,
                  marginTop: (halo - core) / 2,
                  opacity: speck.opacity,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

/** `memo` 包一层：透传父组件的重渲染（预设/尺寸/种子变了才重画）。 */
export const FilmLookLayers = memo(FilmLookLayersImpl);

/** 图层规划是纯函数，探针直接调用它 —— 这里转出去方便宿主一处 import。 */
export { planFilmLooks } from '../utils/gradeLayers';

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  flipX: {
    transform: [{ scaleX: -1 }],
  },
  speckCage: {
    mixBlendMode: 'screen',
  },
  speckRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#FFFFFF',
  },
  speckCore: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#FFFFFF',
  },
});
