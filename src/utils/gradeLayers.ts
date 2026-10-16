/**
 * 预设数值 → 合成图层（纯函数，零依赖，可以直接单测）。
 *
 * 这里是整个 App 唯一"把调色参数翻译成 RN 能力"的地方。
 * 换滤镜风格 = 改数值；加新维度（比如高光染色）= 在这里多 push 一层。
 *
 * RN 能力边界（已核实）：
 * - `mixBlendMode` 在 New Architecture 上 iOS/Android 都可用（Expo Go 只跑新架构）；
 * - `filter` 在 iOS 上**只有 brightness / opacity**，所以对比度/饱和度不能靠它；
 * - 因此对比度用"同一画面再叠一层 soft-light"实现（自叠 = 提对比），
 *   饱和度用"中灰/高饱和色 + saturation 混合"实现；
 * - `<Image blurRadius>` 在 iOS 上**是真模糊 UIImage**（`RCTImageView.mm:158` 的
 *   `setBlurRadius:` → `RCTBlurredImageWithRadius`），能被 `captureRef` 截进成片 ——
 *   所以"真泛光"（模糊后 screen 叠回）和"微柔焦"是可行的。
 *   ⚠️ v1.6.0 这里曾写着"RN 的 Image 没有 blurRadius"，那句是错的（见 `types/index.ts:437-451`）。
 *
 * ── v1.8.0：为什么整条色层都换成 `overlay` + 亮度恰好 0.5 的色 ──────────────
 * 用户报的"白雾"= 图层栈把整幅画面抬亮了。要根除它，得让色层在数学上**不动亮度**：
 *
 *   `overlay(cb, cs)` 对两条分支都是 cs 的**线性**函数，且 `cs = 0.5` 时恒等：
 *     cb ≤ 0.5 → 2·cb·cs        → 偏差 = 2·cb·(cs − 0.5)
 *     cb > 0.5 → 1 − 2(1−cb)(1−cs) → 偏差 = 2(1−cb)·(cs − 0.5)
 *   于是"加权亮度偏差" = Σᵢ wᵢ·k(cb)·(csᵢ − 0.5) = k(cb)·(Y(cs) − 0.5)，
 *   其中 Y = 0.2126R + 0.7152G + 0.0722B。**只要色的 Y 恰好是 0.5，任何底色上都不动亮度。**
 *   同时 `overlay(1, cs) = 1`（纯白永不被压）、`overlay(0, cs) = 0`（纯黑永不被抬）。
 *   一个色值同时满足"白不变形 + 黑不泛白 + 亮度恒等 + 色相照转"，这就是下面所有
 *   `WARM / COOL / TINT_绿品红 / FADE_LIFT` 都写成 Y≈0.5 的原因（探针逐色断言 |Y−0.5| ≤ 0.002）。
 *   ⇒ 门的 `whiteLoss / veilHigh / veilMid / blackLift / normalMid` 对色层全部为 0。
 *
 * 反过来，**screen 加光**的量必须按预算掐死：screen 的抬升 = cs·(1−cb)，0.1 处抬 0.9·cs、
 * 0.9 处只抬 0.1·cs（最伤暗部、最伤对比度）。所以 halation / 漏光 / 灰尘都用小 opacity，
 * 而"提亮"这件事整体交给 `fade`（托黑）+ 预设自身的曝光值，不再有任何整幅白/浅黄层。
 *
 * 图层顺序（= 绘制顺序，改顺序会改结果）：
 *   ① 色温 ② 色调 ③ 分离色调 ④ 饱和度 ⑤ 对比度 ⑤.5 微柔焦 ⑥ 褪色
 *   ⑦ 曝光 ⑧ 光晕 ⑨ 颗粒 ⑩ 灰尘 ⑪ 暗角 ⑫ 漏光
 * 前七层负责"色"，后五层负责"质"。
 * （曾经在 ⑧ 和 ⑨ 之间还有一层 `chroma-noise` 彩噪贴图，已在 2026-10-12 彻底删除，
 *   理由见下面 ⑨ 处的注释 —— 那一层是满屏紫绿伪色的唯一来源。）
 */
import type { GradeLayer, ResolvedFilmPreset } from '../types';

/*
 * 色层用的基准色。**全部按"亮度恰好 0.5"配的**（Y = .2126R+.7152G+.0722B），
 * 所以都偏浓：色相是拿来转的，亮度由底图自己决定。注释里的 Y 是实测值。
 */
/** 暖色（色温 > 0 / 分离色调高光）。Y = 0.5004 */
const WARM = '#FF641A';
/** 冷色（色温 < 0 / 分离色调暗部）。Y = 0.5003 */
const COOL = '#1393FF';
/** 绿（tint > 0）。Y = 0.5002 */
const TINT_GREEN = '#1AA81A';
/** 品红（tint < 0）。Y = 0.5009 */
const TINT_MAGENTA = '#E657E6';
/** 中灰：saturation 混合时用来去色。 */
const NEUTRAL_GRAY = '#808080';
/** 高饱和红：saturation 混合时用来加饱和。 */
const SATURATE_ACCENT = '#FF3B30';
/**
 * 托黑用的深板岩灰（略偏冷）。Y = 0.3499。
 * 配 `lighten` → 只把**比它更暗**的像素抬起来：中间调（≥0.35）和高光一个像素都不动，
 * 所以"托起暗部灰阶"和"保持原图对比度"能同时成立（旧值 `#1C1C1C` 太黑，
 * 抬不动 0.02~0.09 这一段的灰阶，见 ⑥ 处注释）。
 */
const FADE_LIFT = '#545A61';
const BLACK = '#000000';
/**
 * 光晕（halation）的暖红。Y = 0.4357。配 `screen` 加光；
 * 之所以不写更亮的橙色：screen 的代价 = Y·meanAlpha·opacity，Y 越低越省对比度。
 */
const HALATION = '#FF4B2D';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 光晕泛光层的模糊半径（逻辑点）。8pt ≈ 光在乳剂层里扩散的尺度。 */
const HALATION_BLUR = 8;
/** 微柔焦：模糊半径（逻辑点）与叠加强度（去数码锐化）。 */
const SOFT_FOCUS_BLUR = 1.2;
const SOFT_FOCUS_OPACITY = 0.16;
const SOFT_FOCUS_OFFSET = 0.5;

/**
 * 把一个已解析的预设展开成有序图层数组。
 * 顺序 = 绘制顺序：调色 → 密度 → 质感（颗粒/灰尘）→ 光学（暗角/漏光）。
 * 中性参数不会产生图层，所以"没调的项"零开销。
 */
export function buildGradeLayers(preset: ResolvedFilmPreset): GradeLayer[] {
  const layers: GradeLayer[] = [];
  const color = preset.color;

  // ① 色温：暖橙 / 冷蓝。overlay + Y=0.5 的色 ⇒ 只转色相，不动亮度（见文件头）
  if (Math.abs(color.temperature) > 0.01) {
    const warm = color.temperature > 0;
    layers.push({
      kind: 'color',
      key: 'temperature',
      label: `色温 ${warm ? '暖' : '冷'} ${round2(Math.abs(color.temperature))}`,
      color: warm ? WARM : COOL,
      blendMode: 'overlay',
      opacity: clamp01(Math.abs(color.temperature) * 0.38),
    });
  }

  // ② 色调：偏绿 / 偏品红
  if (Math.abs(color.tint) > 0.01) {
    const green = color.tint > 0;
    layers.push({
      kind: 'color',
      key: 'tint',
      label: `色调 ${green ? '绿' : '品红'} ${round2(Math.abs(color.tint))}`,
      color: green ? TINT_GREEN : TINT_MAGENTA,
      blendMode: 'overlay',
      opacity: clamp01(Math.abs(color.tint) * 0.24),
    });
  }

  // ③ 分离色调：暗部偏青蓝 + 高光偏暖。两层都是 overlay + Y=0.5 的色。
  //
  //    ⚠️ 旧实现是"暗部 lighten 深青蓝 + 高光 darken 暖白"，两处都在加白光：
  //    darken 会把纯白压成 `#FFF2D9`（whiteLoss ≈ 0.06×opacity），lighten 会把黑场抬起来。
  //    overlay 版在 0.5 处恒等、在 1.0 处恒等，色相照样分得开。
  if (color.splitTone > 0.01) {
    const tone = clamp01(color.splitTone);
    layers.push({
      kind: 'color',
      key: 'split-shadow',
      label: `暗部青蓝 ${round2(tone)}`,
      color: COOL,
      blendMode: 'overlay',
      opacity: clamp01(tone * 0.35),
    });
    layers.push({
      kind: 'color',
      key: 'split-highlight',
      label: `高光暖调 ${round2(tone)}`,
      color: WARM,
      blendMode: 'overlay',
      opacity: clamp01(tone * 0.3),
    });
  }

  // ④ 饱和度：saturation 混合"取颜色的饱和度、保留底图明度" ⇒ 本来就不动亮度
  if (color.saturation < 0.99) {
    layers.push({
      kind: 'color',
      key: 'desaturate',
      label: `去饱和 ${round2(1 - color.saturation)}`,
      color: NEUTRAL_GRAY,
      blendMode: 'saturation',
      opacity: clamp01(1 - color.saturation),
    });
  } else if (color.saturation > 1.01) {
    layers.push({
      kind: 'color',
      key: 'saturate',
      label: `加饱和 ${round2(color.saturation - 1)}`,
      color: SATURATE_ACCENT,
      blendMode: 'saturation',
      opacity: clamp01((color.saturation - 1) * 0.85),
    });
  }

  // ⑤ 对比度：同一张原图再叠一层 **soft-light**（自叠 = 提对比）。
  //
  //    为什么是 soft-light 而不是 overlay：`soft-light(cb,cb)` 在 0.5 处恒等、
  //    在 0.85 处只抬 +0.05、在 0.1 处压 −0.072，而 `overlay(cb,cb)` 在 0.85 处抬 +0.105
  //    —— 后者的 veilHigh 代价是前者的两倍。纯白/纯黑两边都是恒等。
  //
  //    另一半原因：托黑（⑥）会把 0.1 抬起来、拉低"对比保留"这个指标，
  //    这里的高对比层正好把它挣回来（两支低对比卷的 contrast 因此上调，见 presets.ts）。
  if (color.contrast > 1.01) {
    layers.push({
      kind: 'photo',
      key: 'contrast-boost',
      label: `提对比度 ${round2(color.contrast)}`,
      blendMode: 'soft-light',
      // 硬夹 0.20：0.85 处的抬升是 0.0893 × opacity，veilHigh 预算只有 0.02。
      // 所以预设里 contrast > 1.2 会被这里夹平 —— 数值写 1.2 就够，再大写也没用。
      opacity: Math.min(0.2, clamp01(color.contrast - 1)),
    });
  }
  //    contrast < 1 的"中灰 normal 压对比"层已按 v1.8.0 要求**删除**：
  //    normal 混合 + 中灰 = 在每一条底色的暗部平铺一层灰（0.02 处抬 +0.48×opacity），
  //    是"白雾 / 灰雾"最典型的来源。低对比性格改由 ⑥ 的托黑 + 低饱和承担。

  // ⑤.5 去数码锐化：同一张照片模糊 1.2pt 再 normal 叠回 0.16。
  //      只对照片生效（不碰颗粒/相框/日期），所以它排在质感层**之前** —— 颗粒保持锐利。
  //      iOS 上是真 CIGaussianBlur（见文件头），只在成片用（planFilmLooks 在 'live' 里滤掉）。
  layers.push({
    kind: 'photo',
    key: 'micro-soft-focus',
    label: '去数码锐化（微柔焦）',
    blendMode: 'normal',
    opacity: SOFT_FOCUS_OPACITY,
    blurRadius: SOFT_FOCUS_BLUR,
    offsetX: SOFT_FOCUS_OFFSET,
    offsetY: SOFT_FOCUS_OFFSET,
  });

  // ⑥ 褪色 / 托黑（Lifted Blacks）：lighten 只抬**比 FADE_LIFT 更暗**的像素。
  //
  //    数值是掐着门的预算配的（`_haze_audit.mjs`，`BUDGET.blackLift = 0.07`）：
  //      blackLift  = opacity·(0.3499 − 0.02) ≤ 0.07  → opacity ≤ 0.212
  //      normalMid  = opacity·(0.5 − 0.3499) ≤ 0.06    → opacity ≤ 0.40（还有别的层分摊）
  //      satRatio   = 抬 0.1 这一点会直接缩小 (y(0.1)+0.05) 分母 → 由 ⑤ 的对比层支付
  //    所以这里取 0.30×fade 并硬夹到 0.13：expired-64（fade 0.42）拿到 0.126，
  //    黑场从 0 抬到 ≈0.044、y(0.02) 从 0.02 抬到 ≈0.061 —— 看得见的托黑，
  //    而 0.35 以上一个像素都不动。
  if (color.fade > 0.01) {
    layers.push({
      kind: 'color',
      key: 'fade',
      label: `褪色托黑 ${round2(color.fade)}`,
      color: FADE_LIFT,
      blendMode: 'lighten',
      opacity: Math.min(0.13, clamp01(color.fade * 0.3)),
    });
  }

  // ⑦ 曝光：**正的曝光不再有图层**（原来是一层纯白 screen：0.1 处抬 0.9×opacity，
  //    是所有预设 whiteLoss/veilMid 的共同来源，按 v1.8.0 直接删）。
  //    暗部要靠"提亮"就去调 ⑥ 的 fade；负曝光仍用黑 multiply 压暗，系数从 0.45 收到 0.30
  //    （multiply 会把纯白压到 1−opacity，ccd-cyber 的 −0.06 在 0.45 时正好顶破 0.02 预算）。
  if (color.exposure < -0.01) {
    layers.push({
      kind: 'color',
      key: 'exposure-down',
      label: `曝光 ${round2(color.exposure)}`,
      color: BLACK,
      blendMode: 'multiply',
      opacity: clamp01(-color.exposure * 0.3),
    });
  }

  // ⑧ 光晕 halation：两层配合 = 一层**真泛光** + 一层暖红色偏。
  //
  //    · `halation-glow`：把同一张照片模糊 8pt 用 screen 叠回 —— 物理上就是"乳剂层里
  //      高光halo"。数学上 lift = opacity·cb(1−cb)：0.1 与 0.9 处都是 0.09·opacity，
  //      纯白恒等（screen(1,1)=1），比纯色 screen 在暗部便宜 4.4 倍。
  //    · `halation-tint`：卡片指定的暖红 `#FF4B2D` + screen，opacity 0.05×bloom
  //      （cinestill-800t 的 0.52 → 0.026，接近卡片写的 0.06，但更省 satRatio）。
  //    两层都不动纯白；总 screen 质量 M = Σ Y·meanAlpha·opacity 仍在预算内。
  if (color.bloom > 0.01) {
    layers.push({
      kind: 'photo',
      key: 'halation-glow',
      label: `泛光 ${round2(color.bloom)}`,
      blendMode: 'screen',
      opacity: clamp01(color.bloom * 0.14),
      blurRadius: HALATION_BLUR,
    });
    layers.push({
      kind: 'color',
      key: 'halation-tint',
      label: `光晕暖红 ${round2(color.bloom)}`,
      color: HALATION,
      blendMode: 'screen',
      opacity: clamp01(color.bloom * 0.05),
    });
  }

  // ⑨ 颗粒：PNG 平铺 + overlay（overlay 在中间调最强、暗部高光自然变弱，和胶片一致）
  //
  // ⚠️ 这里曾经在它前面放过一层预烘焙的彩噪贴图（`chroma-noise.png`，品红↔绿交替的块状色斑），
  // 只被 CCD-CYBER / DIGI-02 两款用 `grainChroma` 打开。它就是"画面严重彩噪与紫绿噪波"的元凶：
  // 那张贴图 `|R-G| = 49.3`、`|G-B| = 34.6`，平铺 + overlay 之后满屏紫绿伪色，用户一眼就看出来了。
  // 已**彻底删除**（不是调小）：颗粒只走 `grain`，而 `grain.png` 三通道逐像素恒等
  // （实测 |R-G| = |R-B| = |G-B| = 0）—— 这就是绝无红绿紫伪色的保证。
  // 想再要"CCD 味"，请用 `splitTone` + `bloom` + 高对比，不要往合成栈里塞彩色噪声。
  //
  // 贴图本身是"双尺度团簇颗粒"（`scripts/generate_grain_clump.py` 烘焙：粗网格上细颗粒
  // σ=0.55 + 团簇 σ=1.6 → 1.4× 周期放大 → 0.7px 周期高斯模糊 → 绕中灰 127.5、σ≈66/255），
  // 所以这一层的视觉效果完全由"贴图对比度 × 预设 grain 值"决定。
  if (preset.grain > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'grain',
      label: `颗粒 ${round2(preset.grain)}`,
      textureId: 'grain',
      resizeMode: 'repeat',
      blendMode: 'overlay',
      opacity: clamp01(preset.grain),
    });
  }

  // ⑩ 灰尘与划痕：screen 只加亮点，暗部什么都不加 —— 老扫描件那种"不干净"
  if (preset.dust > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'dust',
      label: `灰尘 ${round2(preset.dust)}`,
      textureId: 'dust',
      resizeMode: 'repeat',
      blendMode: 'screen',
      opacity: clamp01(preset.dust),
    });
  }

  // ⑪ 暗角：PNG 拉伸 + **overlay**（原来是 multiply）。
  //
  //    multiply 会把纯白压到 `1 − meanAlpha·opacity`：旧贴图 meanAlpha 0.1341，
  //    预设 0.14~0.44 ⇒ whiteLoss 0.019~0.059，是 whiteLoss 预算（0.02）的主要来源之一。
  //    `overlay(1,·) = 1` ⇒ 白永不变形；代价是暗角变成"压暗暗部"而不是"等比衰减"
  //    （角上 0.5 的中间调 −36%、0.85 的高光 −6%）—— 胶片暗角本来就是压暗部更明显。
  if (preset.vignette > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'vignette',
      label: `暗角 ${round2(preset.vignette)}`,
      textureId: 'vignette',
      resizeMode: 'stretch',
      blendMode: 'overlay',
      opacity: clamp01(preset.vignette),
    });
  }

  // ⑫ 漏光：PNG 拉伸 + screen（可左右翻转换边）。
  //    贴图已重烤成"角落一条暖橙光 + 80% 像素严格 screen 中性"（旧版 99% 的像素亮度 ≥0.5，
  //    拉伸 + screen = 整幅加白光，是白雾的第一根因）。
  //    层 opacity 硬夹到 0.10：再亮就不像漏光、像白雾了。
  if (preset.lightLeak > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'light-leak',
      label: `漏光 ${round2(preset.lightLeak)}${preset.lightLeakFlip ? '（镜像）' : ''}`,
      textureId: 'lightLeak',
      resizeMode: 'stretch',
      blendMode: 'screen',
      opacity: Math.min(0.1, clamp01(preset.lightLeak * 0.29)),
      flipX: preset.lightLeakFlip,
    });
  }

  return layers;
}

/** 取景器实时预览 / 成片合成 —— 决定哪些图层要渲染。 */
export type FilmLookSurface = 'composite' | 'live';

/**
 * 某个 surface 真正要画的图层。
 *
 * `'live'`（取景器镂空窗，可能只有两百多 pt）滤掉所有 `kind:'photo'` 层：
 * 它们要么需要原照片（对比度自叠 / 泛光 / 微柔焦），要么在这么小的尺寸上毫无意义，
 * 却要让实时预览多跑一次全分辨率 CIGaussianBlur。取景器只要"色 + 质感"就够仿真了。
 */
export function planFilmLooks(preset: ResolvedFilmPreset, surface: FilmLookSurface): GradeLayer[] {
  const layers = buildGradeLayers(preset);
  if (surface === 'composite') {
    return layers;
  }
  return layers.filter((layer) => layer.kind !== 'photo');
}

/**
 * 合成视图需要单独等几张图片 `onLoad`（决定什么时候可以截图）。
 *
 * 口径（v1.8.0）：**2 + 每个 `texture` 层 1 张 + 每个 `photo` 层 1 张**。
 *   · 2 = 底板照片 + 相框（`FilmCompositor` 自己渲染）；
 *   · `texture` 层由 `FilmLookLayers` 渲染，每层恰好一张 `<Image>` + 一次 `onPlateLoad`；
 *   · `photo` 层（对比度自叠 / 泛光 / 微柔焦）需要原照片 URI：宿主渲染时每层一张 `<Image>`，
 *     或者把 URI 通过 `FilmLookLayers` 的可选 `photoUri` 交给它渲染 —— **两条路都恰好一张**，
 *     所以这个计数在两种接线下都精确。
 *     ⚠️ 绝不能两边都渲染：多一张图就要白等 `READY_TIMEOUT_MS`（1500ms）超时，
 *        少一张图 `captureRef` 可能截到半张（`useFilmStage.ts` 的等待门就是按这个数开合的）。
 */
export function countStageImages(preset: ResolvedFilmPreset): number {
  const stages = buildGradeLayers(preset).filter(
    (layer) => layer.kind === 'texture' || layer.kind === 'photo',
  ).length;
  return 2 + stages;
}
