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
 *   `setBlurRadius:`），能被 `captureRef` 截进成片 —— 但正因为它真模糊，
 *   v1.8.3（用户 m01534 · C1）删掉微柔焦、v1.8.5（用户 m02760 · M2）又删掉泛光的
 *   模糊副本之后，**本文件不再构建任何带 `blurRadius` 的图层**：
 *   用户红线是"严禁在原图上叠加模糊副本，必须 100% 恢复相机原生清晰度"。
 *   `GradeLayer.photo` 类型里仍留着 `blurRadius?` 字段（类型定义不归这里），但没有任何
 *   构建路径会写它 —— 合成栈里 `kind:'photo'` 只剩**无模糊**的对比度自叠。
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
 *   `WARM / COOL / TINT_绿品红` 都写成 Y≈0.5 的原因（探针逐色断言 |Y−0.5| ≤ 0.002）。
 *   ⇒ 门的 `whiteLoss / veilHigh / veilMid / blackLift / normalMid` 对色层全部为 0。
 *
 * 反过来，**screen 加光**的量必须按预算掐死：screen 的抬升 = cs·(1−cb)，0.1 处抬 0.9·cs、
 * 0.9 处只抬 0.1·cs（最伤暗部、最伤对比度）。所以现在只剩 halation / 漏光两层用小 opacity。
 * v1.8.0 已删掉正曝光的纯白 screen 与低对比中灰层；v1.8.3 又删掉 `fade` 托黑层 ——
 * **现在栈里没有任何整幅白 / 浅黄 / 青灰层**，原图对比度直接呈现。
 *
 * 图层顺序（= 绘制顺序，改顺序会改结果）：
 *   ① 色温 ② 色调 ③ 分离色调 ④ 饱和度 ⑤ 对比度
 *   ⑥ 曝光 ⑦ 光晕 ⑧ 真黑白（仅 mono 卷） ⑧.5 S-Curve 自混合
 *   ⑧.6 分离染色（暗部/柔光） ⑨ 颗粒 ⑩ 暗角 ⑪ 漏光
 * 前五层负责"色"，后六层负责"质"；⑧ 必须在所有彩色层之后再叠，黑白才是数学纯灰度；
 * ⑧.5/⑧.6（v1.8.7）同理必须排在 ⑧ 之后：黑白卷也要"先去色、再自混合/染色"。
 *
 * ── v1.8.3（用户 m01534 · 模块 C1）删掉的三层 ───────────────────────────────
 *   · ⑤.5 `micro-soft-focus`：`blurRadius=1.2` 的模糊副本 + 0.5pt 偏移。
 *     用户红线："严禁在原图上叠加模糊副本，必须 100% 恢复相机原生清晰度！"
 *   · ⑥ `fade`（褪色托黑，`lighten #545A61`，opacity ≤ 0.13）：全画幅半透明**青灰**层 ——
 *     正是用户说的"盖在照片上方的半透明青灰遮罩"，它把 0.35 以下的灰阶整体抬起来，
 *     画面因此"模糊发灰、对比度不够"。要"真实对比度直接呈现"就必须删掉它。
 *   · ⑩ `dust` 纹理层（`dust.png` 平铺 + screen）：用户要求白尘只以"成片上 1~2 颗"出现，
 *     不再整幅铺贴图 —— 现在由 `FilmLookLayers.planDustSpecks()` 按颗粒档位生成。
 * （曾经在 ⑦ 和 ⑧ 之间还有一层 `chroma-noise` 彩噪贴图，已在 2026-10-12 彻底删除，
 *   理由见下面 ⑧ 处的注释 —— 那一层是满屏紫绿伪色的唯一来源。）
 *
 * ── v1.8.4（用户 m02103 · 模块 C3）取景器去雾：色彩层降 60% + 硬夹 [0.04, 0.08] ──
 * 用户真机对比原生相机，报"取景器有雾感"（成片反而没有这么明显）。根因：取景器
 * `planFilmLooks(preset, 'live')` 以前把成片同一套色彩层按**成片原 opacity** 画在
 * 两百多 pt 的小窗口上 —— PR-400 的色温 + 色调 + 分离色调叠在实时画面上，视觉效果
 * 就是一层灰白纱（越暗的环境越像"蒙了雾"）。用户要求：
 *   「把胶卷色彩遮罩（如 PR-400）与色温遮罩的整体 opacity 降低 60%（目标 0.04~0.08）」，
 *   并且**绝不允许在实时预览上叠灰白色纱**。
 * 所以 v1.8.4 起 live 路径三件事（`buildGradeLayers` 成片路径一个数字都不改）：
 *   ① 继续滤掉 `kind:'photo'`（自叠/泛光）与 grain 纹理层；
 *   ② 再滤掉一切中性灰/降对比层（`desaturate` / `saturate` / `contrast-boost`，
 *      载体是 NEUTRAL_GRAY / SATURATE_ACCENT、走 saturation / soft-light 混合）；
 *   ③ 剩下的 `kind:'color'` 层 opacity = `liveLookOpacity(原值)`：
 *      × `LIVE_LOOK_OPACITY_SCALE`(0.4) 再硬夹到 `[LIVE_LOOK_OPACITY_MIN, MAX]`
 *      = **[0.04, 0.08]**。暗角/漏光是边缘质感、不是纱，保留原 opacity。
 * 为什么不干脆把成片也降了：用户只投诉**取景器**；成片的色彩性格是 v1.8.0~v1.8.3
 * 一层层按白雾预算调出来的，动它就是换滤镜，属于不请自来的改动，所以不碰。
 *
 * ── v1.8.5（用户 m02760 · M2）胶卷库重构：零模糊、零白蒙、真黑白、光学暗角 ──
 * 用户拿 Dazz #Inst C 的成片做对照，核心诉求是"照片必须通透"：
 *   ① **零模糊**：旧的 `bloom` 泛光 = "模糊 8pt 的原图 screen 叠回"（`halation-glow`，
 *      `blurRadius: 8`）。用户红线是"严禁在原图上叠加模糊副本"，整层删除。
 *      `halation` 只剩**一层暖红纯色 screen**（`#FF4028`，opacity = 值 × 0.08 ≤ 0.08，
 *      v1.8.7 按用户模块三数值表把上限从 0.06 抬到 0.08）。
 *   ② **零白蒙**：不再有任何浅白/米色遮罩；暗角贴图中心 68% 半径全透明，
 *      混合 v1.8.7 起从 `normal` 改为 `multiply` —— 四角"乘"暗、中心一个像素都不压。
 *   ③ **真黑白**：`mono:true` 的卷在彩色层之后、颗粒之前叠 `#808080` + `saturation` + 1.0
 *      的满幅层。saturation 混合"取颜色的饱和度、保留底图明度"，输出 R=G=B ⇒ 数学纯灰度，
 *      不是半透明灰罩（灰罩只会把画面抬灰，不会去掉颜色）。
 *   ④ **色层纪律**：彩色卷每个 color 层 opacity 必须 ∈ [0.03, 0.06]（`_haze_audit` 断言），
 *      性格靠暗角 / 阴影倾向 / 颗粒区分，不靠浓遮罩。
 *   ⑤ 反转片 RI-100 通过 `GRAINLESS_PRESET_IDS` 永久跳过颗粒层（用户颗粒档位会覆盖
 *      `preset.grain`，所以只能按 id 表达"这支卷天生无颗粒"）。
 *   `buildGradeLayers` 的架构和其余公式（overlay 色层 / soft-light 自叠）一个数没动。
 */
import { grainLayerOpacity } from '../constants/grain';
import { GRAINLESS_PRESET_IDS } from '../constants/presets';
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
const BLACK = '#000000';
/**
 * 光晕（halation）的暖红。Y = 0.4034。配 `screen` 加光；
 * 之所以不写更亮的橙色：screen 的代价 = Y·opacity，Y 越低越省对比度。
 * v1.8.5 起只剩这一层**纯色**光晕（零模糊），`opacity = clamp01(halation) × 0.08` ≤ 0.08
 * （v1.8.7 模块三把上限从 0.06 抬到 0.08，NT-800T 要 rgba(255,55,30,0.08) 的暖红）。
 */
const HALATION = '#FF4028';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// v1.8.3 删 `SOFT_FOCUS_BLUR / _OPACITY / _OFFSET`、v1.8.5 删 `HALATION_BLUR`：
// 本文件不再有任何模糊半径常量（用户红线：不许在原图上叠模糊副本）。不要再加回来。

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
  //
  //    ⚠️ `mono:true` 的卷**跳过这一层**：⑧ 的满幅去色层（opacity 1）已经接管，
  //    再叠一层半透明去色/加饱和既没意义，也会破坏"BW 只有一层满幅纯度"的验收口径。
  if (!preset.mono) {
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

  // ⑤.5 微柔焦（`micro-soft-focus`）已按 v1.8.3 用户红线**整层删除** ——
  //      旧实现是"同一张照片模糊 1.2pt 再 normal 叠回 0.16"，等于给整幅画面蒙一层柔焦。
  //      用户实测"拍出来像没对上焦一样模糊"，要求 100% 回到相机原生锐度。
  //      v1.8.5 又把 ⑦ 的泛光模糊副本也删了：**本文件现在不构建任何带 blurRadius 的层**。
  //      ⑤ 这层对比度自叠是 photo 层里唯一活下来的，但它不模糊、不叠副本图 ——
  //      只是同一画面 soft-light 自己混合，数学上提对比，不是"模糊副本"。不要再加模糊。

  // ⑥ 褪色托黑（`fade`）已按 v1.8.3 用户红线**整层删除** ——
  //      旧实现是 `lighten #545A61`，把 0.35 以下的灰阶整体抬向 0.3499：
  //      本质是"全画幅半透明青灰遮罩"，画面因此发灰、对比度不足（用户投诉的原话是
  //      "模糊发灰"）。用户要求"让原图以 100% 原生对比度直接呈现"，所以这层不再存在。
  //      `color.fade` 数值仍留在预设数据里（历史字段，不参与渲染），不要再接回图层。

  // ⑥ 曝光：**正的曝光不再有图层**（原来是一层纯白 screen：0.1 处抬 0.9×opacity，
  //    是所有预设 whiteLoss/veilMid 的共同来源，按 v1.8.0 直接删）。
  //    暗部不再有"提亮"层（v1.8.3 已删 `fade`）；负曝光仍用黑 multiply 压暗，系数从 0.45 收到 0.30
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

  // ⑦ 光晕 halation（v1.8.5 重写）：**只有一层暖红纯色 screen，零模糊**。
  //
  //    v1.8.0~v1.8.4 的实现是两层：`halation-glow`（把原图模糊 8pt 再 screen 叠回）
  //    + `halation-tint`（暖红色偏）。模糊副本正是用户 m02760 的红线（"严禁在原图上
  //    叠加 blurRadius 模糊副本"），所以 v1.8.5 删掉模糊那层，只保留纯色光晕：
  //    物理上它是"高光在乳剂层里扩散出的暖红 halo"，视觉上仍是胶片味，但没有一个像素被模糊。
  //
  //    screen 的代价 = Y·opacity（最伤暗部），所以 opacity = clamp01(halation) × 0.08
  //    硬封顶 0.08（v1.8.7 模块三：用户要求 NT-800T 的暖红 screen 到 rgba(…,0.08)）。
  //    色值 #FF4028 的 Y≈0.403，比旧 #FF4B2D 更省。纯白恒等（screen(1,·)=1）。
  if (color.halation > 0.01) {
    layers.push({
      kind: 'color',
      key: 'halation',
      label: `光晕 ${round2(color.halation)}`,
      color: HALATION,
      blendMode: 'screen',
      opacity: clamp01(color.halation * 0.08),
    });
  }

  // ⑧ 真黑白（v1.8.5 · mono 卷）：满幅中灰 + `saturation` 混合 + opacity 1。
  //
  //    `saturation` 混合的定义是"取上层颜色的**饱和度**、保留底图明度"——上层是
  //    无饱和度的 #808080，所以底图每个像素输出 R=G=B，是**数学纯灰度**。
  //    这不是半透明灰罩：灰罩（normal + 半透明灰）只会把画面整体抬灰、颜色还在；
  //    这一层是把色度整个抽掉，所以黑白卷的颜色差异（色温/分离色调）必须留在它**之前**。
  //    位置：所有彩色层之后、颗粒/纹理之前（契约 §3.4 冻结口径）。
  if (preset.mono) {
    layers.push({
      kind: 'color',
      key: 'mono',
      label: '真黑白',
      color: NEUTRAL_GRAY,
      blendMode: 'saturation',
      opacity: 1,
    });
  }

  // ⑧.5 自混合 S-Curve（v1.8.7 模块二）：**同一张原图的无模糊副本**按预设指定的
  //      `curveBlendMode`（soft-light / overlay）再叠一层，opacity = `sCurveIntensity`
  //      （用户表 0.22~0.42，这里硬夹 ≤ 0.42）。
  //
  //      为什么它必须排在 ⑧ 之后：对彩色卷，这是"调完色再自混合"；对黑白卷，这是
  //      "满幅去色之后再自混合"—— 顺序反了 S 曲线就会把彩色信息拉回来，黑白不纯。
  //      `soft-light(cb, cb)` 在 0/0.5/1 三处恒等，只把中间调往 S 形推；overlay 版本
  //      更硬（高光抬升约为 soft-light 的两倍）。两者都**不模糊、不叠白**。
  //
  //      ⚠️ 这是 `kind:'photo'` 层：live 取景器仍按 v1.8.4 规则把它滤掉
  //      （`planFilmLooks` 的 photo 过滤），取景器保持干净；成片走完整栈。
  const sCurve = clamp01(color.sCurveIntensity);
  if (sCurve > 0.01) {
    layers.push({
      kind: 'photo',
      key: 's-curve',
      label: `S-Curve 自混合 ${color.curveBlendMode} ${round2(sCurve)}`,
      blendMode: color.curveBlendMode,
      // 硬夹 0.42（用户表上限）+ 0.01 下限：0.01 以下不产生图层，避免空跑。
      opacity: Math.min(0.42, sCurve),
    });
  }

  // ⑧.6 分离染色（v1.8.7 模块二/三）：暗部与柔光各一层，**全部用 `mixBlendMode`**
  //      而不是半透明平涂 —— 用户原话是"分离色调用 mixBlendMode，而非平涂"。
  //      暗部用乘性混合（multiply / exclusion / color-burn）压暗并转色相；
  //      柔光用 soft-light / screen 把高光往某个色相提。数值逐卷见 `presets.ts`。
  //      空串 = 该卷没有这一层（不是黑层，别用空色值骗渲染器）。
  if (color.shadowTint.length > 0 && color.shadowTintOpacity > 0.01) {
    layers.push({
      kind: 'color',
      key: 'shadow-tint',
      label: `暗部染色 ${color.shadowTintBlendMode} ${round2(color.shadowTintOpacity)}`,
      color: color.shadowTint,
      blendMode: color.shadowTintBlendMode,
      opacity: clamp01(color.shadowTintOpacity),
    });
  }
  if (color.highlightTint.length > 0 && color.highlightTintOpacity > 0.01) {
    layers.push({
      kind: 'color',
      key: 'highlight-tint',
      label: `柔光染色 ${color.highlightTintBlendMode} ${round2(color.highlightTintOpacity)}`,
      color: color.highlightTint,
      blendMode: color.highlightTintBlendMode,
      opacity: clamp01(color.highlightTintOpacity),
    });
  }

  // ⑨ 颗粒：PNG 平铺 + overlay（overlay 在中间调最强、暗部高光自然变弱，和胶片一致）
  //
  // ⚠️ 这里曾经在它前面放过一层预烘焙的彩噪贴图（`chroma-noise.png`，品红↔绿交替的块状色斑），
  // 只被 CCD-CYBER / DIGI-02 两款用 `grainChroma` 打开。它就是"画面严重彩噪与紫绿噪波"的元凶：
  // 那张贴图 `|R-G| = 49.3`、`|G-B| = 34.6`，平铺 + overlay 之后满屏紫绿伪色，用户一眼就看出来了。
  // 已**彻底删除**（不是调小）：颗粒只走 `grain`，而 `grain.png` 三通道逐像素恒等
  // （实测 |R-G| = |R-B| = |G-B| = 0）—— 这就是绝无红绿紫伪色的保证。
  // 想再要"CCD 味"，请用 `splitTone` + `halation` + 高对比，不要往合成栈里塞彩色噪声。
  //
  // 贴图本身是"细密双尺度银盐"（v1.8.2 重烤，`scripts/generate_grain_clump.py`：
  // `0.78·wrap_blur(白噪, 0.60) + 0.22·wrap_blur(白噪, 1.80)`，σ=0.2616、
  // 频带 <8px 65.7% / 8–24px 28.5% / 24–64px 5.0%），平铺走的是**手工 1:1 方格**
  // （1 贴图像素 = 1 设备像素，见 `FilmLookLayers.planTextureTiles`）——
  // 所以这一层的视觉效果完全由"贴图对比度 × 图层不透明度"决定。
  //
  // ⚠️ **v1.8.3 用户强制数值表**（m01534 · C1 第 3 条）：
  //     關 0 / 輕 0.022 / 標準 0.045 / 重 0.075 / 極重 0.110（硬封顶 0.11）
  //   档位直接给**绝对不透明度**（`grainLevel.opacity`），不再乘预设底味 ——
  //   旧实现 0.42~0.62 × scale(2.2) = 1.364 → clamp01 = 1.0，整张不透明中灰贴图
  //   100% 盖住画面（用户图 23/24 的"灰色大网"）；v1.8.1 夹到 [0.12, 0.22] 仍被判
  //   "像脏云雾"（2026-10-17 投诉），所以 v1.8.3 按用户表锁死。
  //   `grainLayerOpacity()` 是唯一的封顶入口（`min(s, 0.11)`），不要再抬。
  //   这一层现在**只出现在成片**：`planFilmLooks(..., 'live')` 会把 grain 纹理层滤掉，
  //   取景器保持 100% 干净通透（用户 m01534 · C1 第 2 条）。
  //    v1.8.5：`GRAINLESS_PRESET_IDS` 里的卷（RI-100 反转片）**永不产生颗粒层** ——
  //    `preset.grain` 会被用户档位覆盖（applyGrainLevel），所以不能只靠数据里的 0 表达。
  if (preset.grain > 0.01 && !GRAINLESS_PRESET_IDS.has(preset.id)) {
    layers.push({
      kind: 'texture',
      key: 'grain',
      label: `颗粒 ${round2(preset.grain)}`,
      textureId: 'grain',
      resizeMode: 'repeat',
      blendMode: 'overlay',
      opacity: grainLayerOpacity(preset.grain),
    });
  }

  // ⑩ 灰尘纹理层已按 v1.8.3 用户规范**删除**：
  //    `dust.png`（稀疏白点/划痕）整幅平铺 + screen 会把画面弄脏，用户要求
  //    "白尘只在 HV / MAX 两档、每张成片 1~2 颗、透明度 ≤ 0.18"。
  //    实现改在 `FilmLookLayers.planDustSpecks()`：颗数由 `preset.grain`（档位绝对
  //    不透明度）决定，见 `constants/grain.ts` 的 `dustSpecCountForGrain()`。
  //    `preset.dust` 字段仍留在数据里（历史字段，不参与渲染）。

  // ⑩ 暗角：v1.8.7 模块三起是 **multiply 混合的光学暗角**（v1.8.5 曾用 normal）。
  //
  //    贴图 `assets/textures/vignette.png`：1024×1024 RGBA，RGB (6,14,20)，alpha 按
  //    归一化半径 rho 走 smoothstep：rho ≤ 0.68 → alpha 0（中心 68% 半径**一个像素
  //    都不压**）；rho 0.68~1 → alpha 0→255 平滑（无硬边）；四角按 1 处理。
  //
  //    为什么现在敢用 multiply：贴图中心是**完全透明**的，multiply 在中心没有任何
  //    上层像素可取（不做混合），所以不存在 v1.8.0 那种"multiply 把纯白压成灰"的
  //    问题 —— 那次是整张铺满的不透明白底；这张只有四角有 alpha。
  //    multiply 的好处是四角被"乘"向深青黑而不是"盖"上一层黑纱：中间调保留更多
  //    层次，纯白/纯黑两端恒等（multiply(1,·)=上层色、multiply(0,·)=0）。
  //    层 opacity = 预设 vignette 值 = 边缘最大不透明度（EK 0.38 / TX 0.42 /
  //    UM 0.34，其余 0.18~0.28）。
  if (preset.vignette > 0.01) {
    layers.push({
      kind: 'texture',
      key: 'vignette',
      label: `暗角 ${round2(preset.vignette)}`,
      textureId: 'vignette',
      resizeMode: 'stretch',
      blendMode: 'multiply',
      opacity: clamp01(preset.vignette),
    });
  }

  // ⑪ 漏光：PNG 拉伸 + screen（可左右翻转换边）。
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

/* ── v1.8.4 · C3：取景器色彩层统一衰减到 [0.04, 0.08] ─────────────────────── */

/**
 * 取景器色彩层统一缩放系数：**0.4 = 降 60%**（用户 m02103 的硬要求）。
 * 只作用于 live 剩下的 `kind:'color'` 层；成片 composite 路径不经过它。
 */
export const LIVE_LOOK_OPACITY_SCALE = 0.4;

/** 取景器色彩层 opacity 下限：降 60% 后太淡的层托底到 0.04（成片里多数色彩层都比它浓）。 */
export const LIVE_LOOK_OPACITY_MIN = 0.04;

/** 取景器色彩层 opacity 上限：原层再浓，实时预览也绝不超过 0.08，杜绝灰白纱。 */
export const LIVE_LOOK_OPACITY_MAX = 0.08;

/**
 * 把成片色彩层的 opacity 换算成取景器（live）的 opacity：
 * `clamp(原值 × LIVE_LOOK_OPACITY_SCALE, LIVE_LOOK_OPACITY_MIN, LIVE_LOOK_OPACITY_MAX)`。
 * 纯函数、无副作用；探针直接调它断言（不要在其他地方复制这个公式）。
 */
export function liveLookOpacity(opacity: number): number {
  const scaled = opacity * LIVE_LOOK_OPACITY_SCALE;
  return Math.min(Math.max(scaled, LIVE_LOOK_OPACITY_MIN), LIVE_LOOK_OPACITY_MAX);
}

/**
 * 取景器必须滤掉的「中性层」key（v1.8.4 · C3）。判别用 `kind + key`，再用载体色/
 * 混合模式兜底 —— 这些层不带来色相，只靠 saturation / soft-light 把画面拉灰：
 *   · `desaturate`：`NEUTRAL_GRAY` + saturation（抽掉颜色）；
 *   · `saturate`：`SATURATE_ACCENT` + saturation（加饱和，同样走 saturation 混合）；
 *   · `contrast-boost`：soft-light 自叠（kind:'photo'，① 的 photo 过滤已拦，这里再兜一次）；
 *   · `fade`：v1.8.3 已从图层栈删除，仅作历史 key 兜底；
 *   · **`mono`（v1.8.5）不在此列**：真黑白满幅去色层是成片观感本身，live 必须保留
 *     （否则黑白卷取景器会看到彩色，违背所见即所得；见 `isLiveNeutralLayer` 例外）。
 * 将来新增任何压对比/去饱和的中性层，都要把 key 加进这里 —— 取景器绝不允许出现灰白色纱。
 */
const LIVE_NEUTRAL_LAYER_KEYS: ReadonlySet<string> = new Set([
  'desaturate',
  'saturate',
  'contrast-boost',
  'fade',
]);

/** 中性层的载体色：saturation 混合用的中灰 / 高饱和红，出现即代表"降通透"层。 */
const LIVE_NEUTRAL_CARRIERS: ReadonlySet<string> = new Set([NEUTRAL_GRAY, SATURATE_ACCENT]);

/**
 * 取景器必须滤掉的「分离染色层」key（v1.8.8 · 用户 m05280 降发热）。
 *
 * `shadow-tint` / `highlight-tint` 是 v1.8.7 新增的分离色调：每条都是**一层全屏
 * `mixBlendMode` 纯色 View**，要盖在相机预览上把整块画面重新混合一遍。取景器里它们被
 * `liveLookOpacity()` 压到 0.04~0.08 —— 肉眼几乎看不出色差，却让实时预览每帧多两次
 * 全屏混合（GPU 一直在算 = 真机发热的固定开销之一）。取景器保留色温 / 暗角 / 漏光
 * 这三类"能看出差别"的色层就够了，分离染色只在**成片合成**时上（`buildGradeLayers` 不动）。
 */
const LIVE_DROPPED_COLOR_LAYER_KEYS: ReadonlySet<string> = new Set([
  'shadow-tint',
  'highlight-tint',
]);

/** 某一层是不是「中性灰/降对比」层（live 必须滤掉）。 */
function isLiveNeutralLayer(layer: GradeLayer): boolean {
  if (LIVE_NEUTRAL_LAYER_KEYS.has(layer.key)) {
    return true;
  }
  // v1.8.5 · M2：`mono` 真黑白去色层**不是**灰白纱 —— saturation 满幅中灰是数学去色，
  // 不降低通透度；它在 live 保留（黑白卷取景器 = 黑白，所见即所得）。
  if (layer.key === 'mono') {
    return false;
  }
  if (layer.kind !== 'color') {
    return false;
  }
  return layer.blendMode === 'saturation' || LIVE_NEUTRAL_CARRIERS.has(layer.color);
}

/**
 * 某个 surface 真正要画的图层。
 *
 * `'composite'`（成片合成）= `buildGradeLayers` 全量，**v1.8.4 未改动任何数字**。
 *
 * `'live'`（取景器镂空窗，可能只有两百多 pt）滤掉三类层：
 *   · 所有 `kind:'photo'` 层 —— 它们需要原照片（对比度自叠 / 泛光），
 *     在这么小的尺寸上毫无意义，却要让实时预览多跑一次全分辨率 CIGaussianBlur；
 *   · **颗粒纹理层**（v1.8.3 · 用户 m01534 C1 第 2 条）—— 用户实测取景器"铺满刺眼的
 *     雪花噪点"，要求"严禁渲染任何颗粒组件，保持取景器 100% 干净通透、满帧 60fps"。
 *     颗粒只在按下快门后的成片合成阶段渲染。
 *   · **中性灰/降对比层**（v1.8.4 · 用户 m02103 C3）—— `desaturate` / `saturate` /
 *     `contrast-boost` 这类以 NEUTRAL_GRAY / SATURATE_ACCENT 为载体、靠 saturation /
 *     soft-light 拉低通透度的层。用户真机反馈"取景器有雾感"，它们就是那层灰白纱。
 *   · **分离染色层**（v1.8.8 · 用户 m05280 降发热）—— `shadow-tint` / `highlight-tint`
 *     这两条全屏 `mixBlendMode` 纯色叠加在取景器里被压到 0.04~0.08（看不出色差），
 *     却是每帧两次额外的全屏混合；取景器不再画它们，只在成片上色。
 *   · **例外：`mono` 真黑白去色层不滤**（v1.8.5 · M2，用户要所见即所得）—— 满幅
 *     `#808080` + saturation 是成片观感本身，不带来色偏、不压对比；滤掉它黑白卷取景器
 *     就会看到彩色。它同样**不参与** `liveLookOpacity()` 缩放，保持 opacity 1（预览是
 *     低反差黑白：底层 photo 对比度层仍按 live 规则淡出）。
 * 除 `mono` 外的 `kind:'color'` 层（色温/色调/分离色调/光晕色偏/曝光压暗）一律经
 * `liveLookOpacity()` 压到 **[0.04, 0.08]**（原 opacity × 0.4，再硬夹）；
 * 暗角/漏光是边缘质感、不是纱，保留原 opacity。
 * 取景器剩下的只有纯色 View（overlay / saturation / multiply）+ 暗角 + 漏光，
 * 代价是纯 View，60fps 无压力。
 */
export function planFilmLooks(preset: ResolvedFilmPreset, surface: FilmLookSurface): GradeLayer[] {
  const layers = buildGradeLayers(preset);
  if (surface === 'composite') {
    return layers;
  }
  return layers
    .filter((layer) => {
      // ① 自叠/泛光：需要原照片，实时窗口画不了，也最容易发灰。
      if (layer.kind === 'photo') {
        return false;
      }
      // ② 颗粒：v1.8.3 起取景器保持 100% 干净通透，一格颗粒都不画。
      if (layer.kind === 'texture' && layer.textureId === 'grain') {
        return false;
      }
      // ③ 中性灰/降对比层：v1.8.4 去雾的核心 —— 取景器绝不允许出现灰白色纱。
      if (isLiveNeutralLayer(layer)) {
        return false;
      }
      // ④ 分离染色层（v1.8.8）：取景器里被压到 0.04~0.08 几乎看不见，
      //    却每帧多两次全屏混合；只在成片上色（见 LIVE_DROPPED_COLOR_LAYER_KEYS）。
      if (LIVE_DROPPED_COLOR_LAYER_KEYS.has(layer.key)) {
        return false;
      }
      return true;
    })
    .map((layer): GradeLayer => {
      // v1.8.5：真黑白去色层在 live 保持满幅 opacity 1 —— 它不属于"色彩层"，不压淡；
      // 黑白卷取景器因此与成片同为黑白（低反差，因 photo 对比度层已按 live 规则滤掉）。
      if (layer.key === 'mono') {
        return layer;
      }
      if (layer.kind !== 'color') {
        // 暗角 / 漏光：边缘质感，不是纱，保留成片原 opacity。
        return layer;
      }
      return { ...layer, opacity: liveLookOpacity(layer.opacity) };
    });
}

/**
 * 合成视图需要单独等几张图片 `onLoad`（决定什么时候可以截图）。
 *
 * 口径（v1.8.0）：**2 + 每个 `texture` 层 1 张 + 每个 `photo` 层 1 张**。
 *   · 2 = 底板照片 + 相框（`FilmCompositor` 自己渲染）；
 *   · `texture` 层由 `FilmLookLayers` 渲染，每层恰好一张 `<Image>` + 一次 `onPlateLoad`；
 *   · `photo` 层（对比度自叠 / 泛光）需要原照片 URI：宿主渲染时每层一张 `<Image>`,
 *     或者把 URI 通过 `FilmLookLayers` 的可选 `photoUri` 交给它渲染 —— **两条路都恰好一张**，
 *     ⚠️ v1.8.3 删掉微柔焦后 photo 层从 3 层降到 2 层（对比度自叠 + 泛光）。
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
