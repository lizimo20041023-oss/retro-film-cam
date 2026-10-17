/**
 * 光学日期渲染层（v1.8.7 模块一）—— 一行日期 = 一行原生文本 × 按字形档分派的叠影配方。
 *
 * ── 为什么 v1.8.7 又要改 ──────────────────────────────────────────────────────
 * v1.8.3 把四档「字形」统一成「同一套 Menlo-Bold 文本 × 三层红晕」，只在字重
 * （600/700/800 在 Menlo 上全部落到 Bold）、`trackingScale`（0.84~1.25）和
 * `glowScale`（0.35~1）上有差别 —— 用户 v1.8.7 的原话是「切 STAMP FONT 看不出变化」。
 * 所以 v1.8.7 起四档必须**同时**在四个维度上拉开距离：
 *
 *   1. **字体族**（iOS 原生预装字体，见 `GLYPH_FONT_FAMILY`）
 *      quartz_led → Courier-Bold；ccd_osd → Menlo-Bold；
 *      lab_inkjet → AmericanTypewriter；archival_steel → Copperplate。
 *   2. **几何**：quartz 斜刀（skewX -10°）、ccd 直立压缩（scaleY 1.22 / scaleX 0.92）、
 *      archival 字号收到 0.90×（钢印刻得浅、字面小）。
 *   3. **层数与阴影**：quartz 三层发光；ccd 单层纯白 + 0 模糊硬黑投影；
 *      lab 单层墨色 + 极淡油墨边缘；archival 双层浮雕（左上暗影 + 右下高光）。
 *   4. **透明度**：lab 整体 0.84（油墨吃进纸里）。
 *
 * ── 什么必须保持不变 ─────────────────────────────────────────────────────────
 * 1. **宽度仍由排版层算死**：`width` / `letterSpacing` 由 `DateStamp` 从
 *    `quartz.width` / `quartz.letterSpacing` 原样传进来，本文件不量字。四档的
 *    `trackingScale`（在 `DATE_GLYPH_STYLES`）改的是**排版层**算出的字距，渲染层只是照抄。
 * 2. **整行一个 `<Text>`、不逐字符**：同一处 JSX 复用 N 层（`dateGlyphLayers(...)` 返回
 *    的配方数组长度随档位 1~3 变化，00 NO FRAME 的 `haloShadow` 再垫 2 层暗影），由
 *    CoreText 一次排版；不拆字、不量宽。
 * 3. **竖排整层旋转**：`rotationDeg` 只作用在最外层 `View` 上，逐字符旋转会歪基线。
 * 4. **空输入返回 `null`**：没字 / 字号非正 / 宽度非正时不渲染空盒子，避免父级误判。
 *
 * ── 三层配方（quartz）从哪来 ────────────────────────────────────────────────
 * 仍是 `opticalGlowLayers()`：颜色来自 `DATE_GLOW_PALETTE`，半径来自
 * `hazeLayers()` × 档位 `glowScale`，本文件不发明色值。其余三档的色值要么是
 * iOS 系统色的硬约束（ccd 纯白 `#F8F9FA`、硬投影纯黑、钢印浮雕高光），要么是
 * 调色板派生色（lab 与 archival 的墨色取 `DATE_GLOW_PALETTE[glow].core`，
 * 这样「发光色」这一轴对四档仍然生效 —— 只换材质，不换配色逻辑）。
 *
 * ── 宽度契约 ─────────────────────────────────────────────────────────────────
 * `glyphHeight()` / `glyphWidth()` 保留给排版层调用，公式与
 * `constants/dateEngine.ts` 的 `dateEngineTextWidth()` 逐项同源（0.6 em advance +
 * 字距 + 余量）。**任何人改字体都必须同时改那两处**；本文件的 `glyphFontPx()`
 * 只影响渲染字号（archival 0.90×），不参与排版宽度 —— 渲染色比容器窄是安全的，
 * 宽了才会裁字。
 */
import { memo } from 'react';
import type { ReactElement } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import {
  DATE_GLOW_PALETTE,
  DATE_GLYPH_STYLES,
  GLYPH_SLACK,
  MONO_ADVANCE,
  hazeLayers,
} from '../constants/dateEngine';
import type { DateGlowId, DateGlyphStyleId } from '../types';

/** 渲染字号换算的基准字号（设计像素 44 = `DATE_DESIGN_PX.quartz_led`）。 */
const REFERENCE_GLYPH_PX = 44;

/**
 * 平台字体族（四档）。
 *
 * iOS 预装字体名逐字取自系统字体册：
 * - `Courier-Bold`：真正的等宽打字机字，advance 恰好 0.6 em（与 `MONO_ADVANCE` 同位），
 *   斜刀之后最像石英机背的丝印；
 * - `Menlo-Bold`：v1.8.3 起的那支等宽无衬线字（advance ≈ 0.602 em，由余量吸收）；
 * - `AmericanTypewriter`：打字机衬线，喷墨打样的观感；
 * - `Copperplate`：铜版雕刻体，工业钢印的观感（备用字体族需求见文件头）。
 *
 * Android 无这些字体，一律退回 `'monospace'`：几何/阴影/透明度仍然生效，
 * 只是字体族这一维退化 —— 这是"零新增依赖、纯系统字体"约束下的诚实结果。
 */
export const GLYPH_FONT_FAMILY: Record<DateGlyphStyleId, string> = {
  quartz_led: Platform.OS === 'ios' ? 'Courier-Bold' : 'monospace',
  ccd_osd: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
  lab_inkjet: Platform.OS === 'ios' ? 'AmericanTypewriter' : 'monospace',
  archival_steel: Platform.OS === 'ios' ? 'Copperplate' : 'monospace',
};

/**
 * 光学日期的缺省平台字体族（`ccd_osd` 用的那支）。
 *
 * v1.8.3 的导出名保留下来：成片合成器 / 旧探针都还按这个名字读"等宽正文体"。
 * v1.8.7 起**四档不再共用同一支字体**，按档取字请用 `GLYPH_FONT_FAMILY`。
 */
export const OPTICAL_FONT_FAMILY: string =
  Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

/** 两位小数（与 `watermarkTypography.round2` 同一个精度收敛点）。 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 日期行的高度（逻辑点）：行盒高 = 字号 × `heightRatio`。
 *
 * ⚠️ 排版层（`geometry.computeWatermarkPlan` 画内机位）与渲染层（`DateStamp`）都读它，
 * 两处必须拿到同一个数；`DATE_GLYPH_STYLES[*].heightRatio` 四档统一 1.16。
 * 注意这里吃的是**排版字号**：archival_steel 的渲染字号是它的 0.90×（见
 * `glyphFontPx()`），但行盒仍按排版字号算 —— 行盒只负责"这一行占多高"，
 * 不能因为刻得浅就把行高也缩掉，否则白边水印的纵向排版会随字形档跳动。
 */
export function glyphHeight(style: DateGlyphStyleId, fontPx: number): number {
  if (!(fontPx > 0)) {
    return 0;
  }
  return round2(fontPx * DATE_GLYPH_STYLES[style].heightRatio);
}

/**
 * 成片上的**渲染字号**（逻辑点）。
 *
 * 只有 `archival_steel` 会把字面收到 0.90×（用户规范：钢印刻得小、刻得浅）；
 * 其余三档等于排版字号。这个函数**不参与宽度计算** —— `quartz.width` 仍按
 * 排版字号算，渲染层收窄是安全的（宁可留白，不许裁字）。
 */
export function glyphFontPx(style: DateGlyphStyleId, fontPx: number): number {
  if (!(fontPx > 0)) {
    return 0;
  }
  return style === 'archival_steel' ? round2(fontPx * 0.9) : fontPx;
}

/**
 * 日期文本的自然宽度（逻辑点）。**与 `dateEngine.dateEngineTextWidth()` 同一条公式。**
 *
 * 公式：`字符数 × (字号 × 0.6 + 字距 + 0.5)`；0.6 是 `MONO_ADVANCE`，0.5 是
 * `GLYPH_SLACK`（补偿 CoreText 逐字形取整，绝对点、不随画布缩放）。
 *
 * 这是"渲染层万一要自己算宽度"时的唯一算法，正常路径（`DateStamp`）**不许**用它：
 * 宽度以排版层写进 `quartz.width` 的数为准，渲染层照抄。
 */
export function glyphWidth(
  text: string,
  style: DateGlyphStyleId,
  fontPx: number,
  letterSpacing: number = 0,
): number {
  if (text.length === 0 || !(fontPx > 0)) {
    return 0;
  }
  // `style` 参与签名是为了与 `glyphHeight` 对称、也方便未来按档位分叉；
  // 当前四档共用同一条等宽 advance 公式，宽度与档位无关（字体族差异由 0.5pt 余量 +
  // 排版层的 `trackingScale` 吸收 —— v1.8.7 的排版层已经按档位调过字距）。
  void style;
  const per = fontPx * MONO_ADVANCE + letterSpacing + GLYPH_SLACK;
  return round2(text.length * per);
}

/** 日期阴影的偏移量（`textShadowOffset`）。 */
export interface GlyphShadowOffset {
  width: number;
  height: number;
}

/**
 * `TextStyle['transform']` 的**数组形态**。
 *
 * RN 的声明里 `transform` 是「数组 | 字符串」的联合（字符串形态来自旧版 `transform: '…'`），
 * 直接取 `NonNullable<TextStyle['transform']>` 会让 `[...base, ...extra]` 的元素类型
 * 也带上 `string`，于是 tsc 报「`string` 不能赋给变换对象」。这里用 `Extract` 只留数组形态，
 * 元素类型由此精确到系统支持的变换对象 —— 不需要类型断言，也不需要绕过类型系统。
 */
type GlyphTransform = Extract<NonNullable<TextStyle['transform']>, ReadonlyArray<unknown>>;

/** 单条变换（`[{ skewX: '-10deg' }]` 里的一个元素）。 */
type GlyphTransformItem = GlyphTransform[number];

/**
 * 三层叠影里的一层：颜色、阴影色、阴影模糊半径（v1.8.3 的导出接口，保留）。
 */
export interface OpticalGlowLayer {
  kind: 'outer' | 'mid' | 'core';
  /** 文字本身的颜色（`rgba()` / `#RRGGBB`，全部来自 `DATE_GLOW_PALETTE`）。 */
  color: string;
  /** `textShadowColor`；`core` 层没有阴影，给 `'transparent'`。 */
  shadowColor: string;
  /** `textShadowRadius`（逻辑点，已按档位 `glowScale` 收放）。 */
  shadowRadius: number;
}

/**
 * 三层叠影的**层配方**（纯函数，不碰 React）：从 `DATE_GLOW_PALETTE` + `hazeLayers()`
 * 派生三层颜色与半径，渲染层照抄即可。
 *
 * 映射关系（数值口径与用户规范一致）：
 * - `outer`：扩散色 `outer` 本体 + 同色大半径阴影；半径 = `hazeSpread()`（≈字号 0.18 倍）；
 * - `mid`：灯丝色 `filament` 本体 + `inner` 暖色阴影；半径 = 外层的一半（≈3.5 设计像素）；
 * - `core`：过曝色 `core`，无阴影。
 *
 * v1.8.7 起**只有 quartz_led 直接用它**（其余三档各有自己的材质配方，见
 * `dateGlyphLayers()`）；保留导出是因为它是"三层发光"的唯一产地，探针与
 * `DateStamp` 的历史契约都还按它核对。
 *
 * ⚠️ `glowScale` 只收放**半径**、不改不透明度：不透明度全部写死在调色板里（那是
 * "换色 = 换光，不换形状"那条规矩的落点），在这里再乘系数会让同一种光在不同机位下发灰。
 */
export function opticalGlowLayers(
  glow: DateGlowId,
  style: DateGlyphStyleId,
  fontPx: number,
): OpticalGlowLayer[] {
  const recipe = DATE_GLOW_PALETTE[glow];
  const { glowScale } = DATE_GLYPH_STYLES[style];
  const haze = hazeLayers(fontPx, glow);
  const outerSpread = haze.length > 0 ? haze[0].spread : 0;
  const midSpread = haze.length > 1 ? haze[1].spread : 0;
  return [
    {
      kind: 'outer',
      color: recipe.outer,
      shadowColor: recipe.outer,
      shadowRadius: round2(outerSpread * glowScale),
    },
    {
      kind: 'mid',
      color: recipe.filament,
      shadowColor: recipe.inner,
      shadowRadius: round2(midSpread * glowScale),
    },
    {
      kind: 'core',
      color: recipe.core,
      shadowColor: 'transparent',
      shadowRadius: 0,
    },
  ];
}

/** 阴影偏移固定 (0, 0)：有偏移的话多层会变成"往右下掉一个字"。 */
const SHADOW_OFFSET: GlyphShadowOffset = { width: 0, height: 0 };

/**
 * 一档字形在渲染层的一层墨迹（`dateGlyphLayers()` 的返回项）。
 *
 * 与 v1.8.3 的 `OpticalGlowLayer` 相比多了 `opacity` / `shadowOffset` / `transform`：
 * ccd 的硬投影、lab 的油墨、archival 的浮雕都要靠这几个字段，且**只在这里出现**，
 * `OpticalDateText` 只负责把配方铺成 N 层 `<Text>`。
 */
export interface DateGlyphLayer {
  /** 稳定 key（同一档内唯一）。 */
  key: string;
  /** 文字颜色。 */
  color: string;
  /** 整层不透明度（lab 的 0.84；其余 1）。 */
  opacity: number;
  /** `textShadowColor`。 */
  shadowColor: string;
  /** `textShadowRadius`。 */
  shadowRadius: number;
  /** `textShadowOffset`。 */
  shadowOffset: GlyphShadowOffset;
  /** 这一层额外附带的变换（archival 的右下高光位移）；无则 `undefined`。 */
  transform?: GlyphTransform;
}

/**
 * 四档字形各自的**材质配方**：返回从底层到顶层的墨迹层数组。
 *
 * `S = fontPx / 44`：设计像素基准上的相对字号。用户规范里的 `1.8*S`、`9*S`
 * 这类数值全部按这个比例折算，保证"画布放大时阴影跟着放大"，不是绝对点。
 *
 * 四档口径（v1.8.7 用户规范逐条落点）：
 * - `quartz_led`：三层红晕（调色板派生，见 `opticalGlowLayers`）+ 整层斜刀 -10°；
 * - `ccd_osd`：单层纯白 `#F8F9FA` + 0 模糊纯黑硬投影（offset 1.8S/1.8S，radius 0.2），
 *   严禁柔和红晕；
 * - `lab_inkjet`：单层墨色（调色板 `core`）+ 整体 0.84 + 油墨边缘（offset 0 / 0.5S，
 *   radius 1.2S），无发光；
 * - `archival_steel`：双层浮雕 —— 底层是右下高光（暗纸上的刻痕反光），顶层是主体墨色
 *   + 左上暗影（offset -0.8S/-0.8S，radius 0.5）。字号 0.90× 在 `glyphFontPx()` 里。
 *
 * ── `haloShadow`（v1.8.7 模块四）──────────────────────────────────────────────
 * 00 NO FRAME 把日期直接压在照片上：客户端的"白色日期必须看得清"要求。开启后
 * 在**所有材质层下面**垫两层全向暗影（不是替代材质，是加在底下）：
 *   ① 大半径全向晕：`rgba(0,0,0,0.82)`，radius = max(3, S*9.7)（≈设计 0.22 em）；
 *   ② 贴边实影：`rgba(0,0,0,0.92)`，radius ≈ 设计 0.08 em、向下 0.02 em。
 * 两层都是**同字形的黑色副本**，上层彩色/发光字盖住主体，只从边缘渗出暗影 —— 这样
 * 浅色照片上也能读，且不改动任何一档的配色逻辑（`dateGlyphLayers` 的默认返回值
 * 保持逐字节不变，探针的"恰好 3 层"断言不受影响）。
 */
export function dateGlyphLayers(
  style: DateGlyphStyleId,
  glow: DateGlowId,
  fontPx: number,
  letterSpacing: number,
  haloShadow: boolean = false,
): DateGlyphLayer[] {
  // `letterSpacing` 参与签名是为了让"渲染层知道排版层给了多少字距"这件事在类型上
  // 显式化（阴影的 S 比例不依赖它）；真正排版时由 `OpticalDateText` 把它写进 textStyle。
  void letterSpacing;
  const scale = Math.max(fontPx, 0) / REFERENCE_GLYPH_PX;
  const recipe = DATE_GLOW_PALETTE[glow];
  let base: DateGlyphLayer[];

  if (style === 'ccd_osd') {
    // CCD 录像 OSD：单层纯白 + 零模糊硬投影（"刻在画面上"的数码味，不许有红晕）。
    base = [
      {
        key: 'ccd-hard',
        color: '#F8F9FA',
        opacity: 1,
        shadowColor: 'rgba(0, 0, 0, 0.92)',
        shadowRadius: 0.2,
        shadowOffset: { width: round2(1.8 * scale), height: round2(1.8 * scale) },
      },
    ];
  } else if (style === 'lab_inkjet') {
    // 暗房喷墨：墨色吃纸（整体 0.84），只有极淡的油墨边缘，没有发光。
    base = [
      {
        key: 'lab-ink',
        color: recipe.core,
        opacity: 0.84,
        shadowColor: 'rgba(30, 20, 10, 0.35)',
        shadowRadius: round2(1.2 * scale),
        shadowOffset: { width: 0, height: round2(0.5 * scale) },
      },
    ];
  } else if (style === 'archival_steel') {
    // 档案钢印：底层右下高光（刻痕反光），顶层主体 + 左上暗影 —— 双层叠出浮雕。
    const bevel = round2(0.8 * scale);
    base = [
      {
        key: 'steel-highlight',
        color: 'rgba(255, 248, 232, 0.34)',
        opacity: 1,
        shadowColor: 'transparent',
        shadowRadius: 0,
        shadowOffset: SHADOW_OFFSET,
        transform: [{ translateX: bevel }, { translateY: bevel }],
      },
      {
        key: 'steel-body',
        color: recipe.core,
        opacity: 1,
        shadowColor: 'rgba(0, 0, 0, 0.65)',
        shadowRadius: round2(0.5 * scale),
        shadowOffset: { width: -bevel, height: -bevel },
      },
    ];
  } else {
    // quartz_led：三层发光（唯一产地仍是 opticalGlowLayers），阴影无偏移。
    base = opticalGlowLayers(glow, style, fontPx).map((layer) => ({
      key: layer.kind,
      color: layer.color,
      opacity: 1,
      shadowColor: layer.shadowColor,
      shadowRadius: layer.shadowRadius,
      shadowOffset: SHADOW_OFFSET,
    }));
  }

  if (!haloShadow) {
    return base;
  }
  return [...haloLayers(fontPx), ...base];
}

/**
 * 00 NO FRAME 的全向暗影层（v1.8.7 模块四）：两层黑色同字形副本，垫在所有材质层下面。
 *
 * 为什么要两层：RN 的 `textShadow*` 一组只能给一个偏移/半径。单层大半径会糊掉字边、
 * 单层小半径在浅色照片上又不够 —— 所以一层"扩散"（offset 0,0 全向）+ 一层"贴边"
 * （微小下偏，给字一点重量），这正对应用户说的「双层全向暗影」。
 */
function haloLayers(fontPx: number): DateGlyphLayer[] {
  const scale = Math.max(fontPx, 0) / REFERENCE_GLYPH_PX;
  return [
    {
      key: 'halo-around',
      color: 'rgba(0, 0, 0, 0.55)',
      opacity: 1,
      shadowColor: 'rgba(0, 0, 0, 0.82)',
      shadowRadius: round2(Math.max(3, 9.7 * scale)),
      shadowOffset: SHADOW_OFFSET,
    },
    {
      key: 'halo-drop',
      color: 'rgba(0, 0, 0, 0.62)',
      opacity: 1,
      shadowColor: 'rgba(0, 0, 0, 0.92)',
      shadowRadius: round2(Math.max(1.5, 3.5 * scale)),
      shadowOffset: { width: 0, height: round2(Math.max(1, 0.9 * scale)) },
    },
  ];
}

/**
 * 把"整层基础变换"与"这一层的额外位移"合成一条 `transform` 数组。
 *
 * ⚠️ 必须显式合并：RN 的样式数组是**覆盖**语义，若某一层把 `transform` 写成
 * `undefined`，会把基础变换（quartz 的斜刀、ccd 的缩放）整条盖掉 —— 那样四档又只剩
 * 字体族不同，正是本轮要修的病。无变换时返回 `undefined`，不制造空数组。
 */
function combineTransforms(
  base: GlyphTransform | undefined,
  extra: GlyphTransform | undefined,
): GlyphTransform | undefined {
  if (base === undefined) {
    return extra;
  }
  if (extra === undefined) {
    return base;
  }
  return [...base, ...extra];
}

/**
 * 整层文字的基础变换（不含 archival 的逐层位移）。
 *
 * - quartz：斜刀 -10°（石英机背丝印的机械斜感）；
 * - ccd：直立但横向压瘦、纵向拉高（录像 OSD 的窄体字模）；
 * - lab / archival：无几何变换（喷墨与钢印都是正的，钢印靠阴影浮出来）。
 */
function glyphTextTransform(style: DateGlyphStyleId): GlyphTransform | undefined {
  if (style === 'quartz_led') {
    return [{ skewX: '-10deg' }];
  }
  if (style === 'ccd_osd') {
    return [{ scaleY: 1.22 }, { scaleX: 0.92 }];
  }
  return undefined;
}

export interface OpticalDateTextProps {
  /** 已经按格式渲染好的日期串（例如 `10  17  '26`）。 */
  text: string;
  /** 字形档（四档，参数见 `DATE_GLYPH_STYLES`）。 */
  style: DateGlyphStyleId;
  /** 排版字号（逻辑点，由 `dateEngineFontPx(style, canvasWidth)` 换算出来）。 */
  fontPx: number;
  /** 整块宽度（逻辑点）—— 原样用排版层写进 `quartz.width` 的数，渲染层不量。 */
  width: number;
  /** 字距（逻辑点）—— 原样用 `quartz.letterSpacing`（排版层已按档位折算过）。 */
  letterSpacing: number;
  /** 发光/墨色档（5 档）。 */
  glow: DateGlowId;
  /** 竖排机位的旋转角：整层旋转，不逐字符转。 */
  rotationDeg?: 0 | 90;
  /**
   * 是否在材质层下面再垫两层全向暗影（v1.8.7 模块四：00 NO FRAME 把日期压在
   * 照片上，白字/发光字需要黑晕才看得清）。默认 `false` —— 白边水印不加任何
   * 额外阴影，四档材质与探针冻结的层数都维持原样。
   */
  haloShadow?: boolean;
}

/**
 * 光学日期层：一行文本按档位画 1~3 遍，各层绝对对齐。
 *
 * 返回 `null` 的条件：没字 / 字号非正 / 宽度非正 —— 这些是"排版层还没准备好"的情形，
 * 渲染一个空 `View` 会让父级的"这一行有没有日期"判断误判。
 */
function OpticalDateTextImpl({
  text,
  style,
  fontPx,
  width,
  letterSpacing,
  glow,
  rotationDeg = 0,
  haloShadow = false,
}: OpticalDateTextProps): ReactElement | null {
  const height = glyphHeight(style, fontPx);
  if (text.length === 0 || !(fontPx > 0) || !(width > 0)) {
    return null;
  }

  const { fontWeight } = DATE_GLYPH_STYLES[style];
  const textTransform = glyphTextTransform(style);
  /**
   * 各层共用的**同一份**文本样式：字体、字号、行高、字距、字重、数字宽度变体全部相同。
   * 层与层之间只允许 color / opacity / textShadow* / 额外 transform 不同 ——
   * "绝对对齐"就是靠这份共享样式保证的。
   */
  const textStyle: TextStyle = {
    fontFamily: GLYPH_FONT_FAMILY[style],
    fontSize: glyphFontPx(style, fontPx),
    lineHeight: height,
    fontWeight,
    letterSpacing,
    // 等宽数字变体：日期里全是数字，避免某些字体把 1/4 等数字渲染成比例宽。
    fontVariant: ['tabular-nums'],
    // 居中：容器宽 = 墨迹宽 + 逐字余量，居中最不容易在"右对齐日期块"里贴边。
    textAlign: 'center',
    includeFontPadding: false,
    // 整层几何（斜刀 / 窄高体）；archival 的逐层位移在 layer.transform 里再叠。
    transform: textTransform,
  };

  const rowStyle: ViewStyle = { width, height };
  if (rotationDeg !== 0) {
    // 竖排：整行一个水平 View 画完，再整层旋转（旋转中心 = 日期块中心）。
    rowStyle.transform = [{ rotate: `${rotationDeg}deg` }];
  }

  return (
    <View style={rowStyle} pointerEvents="none">
      {dateGlyphLayers(style, glow, fontPx, letterSpacing, haloShadow).map((layer) => (
        <Text
          // key 在同一档内唯一（outer/mid/core、ccd-hard、lab-ink、steel-*）。
          key={layer.key}
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.layer,
            textStyle,
            {
              color: layer.color,
              opacity: layer.opacity,
              textShadowColor: layer.shadowColor,
              textShadowRadius: layer.shadowRadius,
              textShadowOffset: layer.shadowOffset,
              // 基础变换（quartz 斜刀 / ccd 窄高体）+ 这一层的额外位移（钢印高光）。
              transform: combineTransforms(textTransform, layer.transform),
            },
          ]}
        >
          {text}
        </Text>
      ))}
    </View>
  );
}

/**
 * `memo`（v1.8.6）：这一行日期会在三处被父级重排带着重建 —— 成片合成的 `DateStamp`、
 * 取景器预览 `FramePreviewLayer`、抽屉/相册里的迷你成片。八个 props 全是标量
 * （`text` / `style` / `fontPx` / `width` / `letterSpacing` / `glow` / `rotationDeg` /
 * `haloShadow`），父级重渲染而日期没变时应当整棵 bailout，不必把叠影层重新提交。
 *
 * 导出名与 props 接口名都不变（`DateStamp.tsx` 零改动）；实现体改名
 * `OpticalDateTextImpl` 只是让"带 memo 的导出"与"裸实现"一眼可分。
 */
export const OpticalDateText = memo(OpticalDateTextImpl);

const styles = StyleSheet.create({
  /**
   * 各层都铺满整块日期行（`width × height`）：`position: 'absolute'` + 四边 0，
   * 行高已由 `lineHeight` 钉死，所以各层的基线必然重合。
   */
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
});
