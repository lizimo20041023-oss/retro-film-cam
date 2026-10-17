/**
 * 光学日期渲染层（v1.8.3 模块四 · B1）—— 一行日期 = 一行原生等宽文本 × 三层绝对对齐叠影。
 *
 * ── 为什么整份重写 ───────────────────────────────────────────────────────────
 * v1.8.0 的"硬件字形"给日期做了两套完全不同的实现：两支像素字形逐格画 `View`
 * （7 段笔画、5×7 圆点），另外三档排 `<Text>`。像素字形在真机上有两个
 * 治不好的问题：一是笔画间隙里永远带着未点亮的 ghost 色，日期看起来"发灰"；
 * 二是逐字画出来的一行没有字距、没有墨迹，观感与"一台装打印机后背的相机"越走越远。
 *
 * v1.8.3 起用户的要求是「统一成一行等宽字体 + 三层发光」，所以这里**删掉全部逐格几何**
 * （7 段、点阵、字符表、灯箱、`resolveDateSpot` 的临时坐标实现都在 v1.8.2 之前就迁走了），
 * 只留一个 `OpticalDateText`：同一行文本画三遍，三层**逐点绝对对齐**，只有颜色与阴影不同。
 *
 * ── 三层怎么叠 ───────────────────────────────────────────────────────────────
 * 1. **外层 halation**：`outer` 色 + 大半径 `textShadow` —— 字外那一圈扩散光；
 * 2. **中层 glow**：`filament` 色（灯丝本体）+ 一层较紧的暖色阴影（`inner`）；
 * 3. **顶层 core**：`core` 色（过曝中心），无阴影。
 *
 * 三层共用同一个 `TextStyle`（字体 / 字号 / 行高 / 字距 / 字重 / 基线全部相同），
 * 所以对齐不是"调出来"的，而是结构上只有 color / shadow 不同。层配方（色值、扩散量）
 * 全部来自 `constants/dateEngine.ts` 的 `DATE_GLOW_PALETTE` 与 `hazeSpread()/hazeLayers()`，
 * 本文件**不发明任何色值**。
 *
 * ── 两个绝对不许做的事 ──────────────────────────────────────────────────────
 * 1. **不许逐字符渲染再拼接**（不许 `text.split('')` 摆一排 `<Text>`）：逐字符排版
 *    每一格都要自己量宽、自己取整，排到画布宽 1000pt 以上时累积误差会让"日期是否
 *    被右边界裁掉"变成掷骰子。整行一个 `<Text>` 由 CoreText 一次性排版，字距与基线
 *    由系统保证，宽度再由排版层（`geometry.computeWatermarkPlan`）算死 —— 两条路都不量。
 * 2. **不许逐字符旋转**：竖排机位（`in_bl_v` 等）必须把整行作为一个水平 `<View>` 渲染，
 *    再对**整层**施加 `transform: [{ rotate: '90deg' }]`。逐字符转 90° 会让每个字的
 *    基线与字距全部歪掉，排出来像贴纸。
 *
 * ── 宽度契约 ─────────────────────────────────────────────────────────────────
 * `width` 由调用方（`DateStamp`）把 `quartz.width` 原样传进来，本文件不量文字宽度。
 * `glyphHeight()` / `glyphWidth()` 保留下来给排版层调用，公式与
 * `constants/dateEngine.ts` 的 `dateEngineTextWidth()` 逐项同源（0.6 em advance + 字距 + 余量），
 * 任何人改了字体都必须同时改那两处。
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

/**
 * 光学日期的平台字体族。
 *
 * iOS 用系统预装的 **Menlo-Bold**：它是 iOS 上少数真正等宽的正文无衬线字，
 * advance ≈ 1233/2048 em ≈ 0.602 em（与 `MONO_ADVANCE = 0.6` 差 0.2%，由逐字余量吸收），
 * 字面比 Courier New 干净、在照片上更像"机器印上去的"。Android 退回 `'monospace'`。
 *
 * ⚠️ 用户给的规范是逐字的 `Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace'`，
 * 不许换成 `fontFamily: 'Courier'`、也不许按字形档换字体 —— 四档的差别只在字重/字距/发光。
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
 * 两处必须拿到同一个数；`DATE_GLYPH_STYLES[*].heightRatio` 四档统一 1.16，
 * 所以三层叠影的行盒与旧 `<Text>` 路径的 1.16 行高是同一个几何。
 */
export function glyphHeight(style: DateGlyphStyleId, fontPx: number): number {
  if (!(fontPx > 0)) {
    return 0;
  }
  return round2(fontPx * DATE_GLYPH_STYLES[style].heightRatio);
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
  // 当前四档共用同一条等宽 advance，宽度与档位无关。
  void style;
  const per = fontPx * MONO_ADVANCE + letterSpacing + GLYPH_SLACK;
  return round2(text.length * per);
}

/** 三层叠影里的一层：颜色、阴影色、阴影模糊半径。 */
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
 * - `outer`：扩散色 `outer` 本体 + 同色大半径阴影；半径 = `hazeSpread()`（≈字号 0.18 倍，
 *   在 44 设计像素基准上约为 8 设计像素）；
 * - `mid`：灯丝色 `filament` 本体 + `inner` 暖色阴影；半径 = 外层的一半（≈3.5 设计像素）；
 * - `core`：过曝色 `core`，无阴影。
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

/** 阴影偏移固定 (0, 0)：有偏移的话三层会变成"往右下掉一个字"。 */
const SHADOW_OFFSET: { width: number; height: number } = { width: 0, height: 0 };

export interface OpticalDateTextProps {
  /** 已经按格式渲染好的日期串（例如 `10  17  '26`）。 */
  text: string;
  /** 字形档（四档，参数见 `DATE_GLYPH_STYLES`）。 */
  style: DateGlyphStyleId;
  /** 字号（逻辑点，由 `dateEngineFontPx(style, canvasWidth)` 换算出来）。 */
  fontPx: number;
  /** 整块宽度（逻辑点）—— 原样用排版层写进 `quartz.width` 的数，渲染层不量。 */
  width: number;
  /** 字距（逻辑点）—— 原样用 `quartz.letterSpacing`（排版层已按档位折算过）。 */
  letterSpacing: number;
  /** 发光色档（5 档）。 */
  glow: DateGlowId;
  /** 竖排机位的旋转角：整层旋转，不逐字符转。 */
  rotationDeg?: 0 | 90;
}

/**
 * 光学日期层：一行文本画三遍，三层绝对对齐。
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
}: OpticalDateTextProps): ReactElement | null {
  const height = glyphHeight(style, fontPx);
  if (text.length === 0 || !(fontPx > 0) || !(width > 0)) {
    return null;
  }

  const { fontWeight } = DATE_GLYPH_STYLES[style];
  /**
   * 三层共用的**同一份**文本样式：字体、字号、行高、字距、字重、数字宽度变体全部相同。
   * 三层之间只允许 color / textShadow* 不同 —— "绝对对齐"就是靠这份共享样式保证的，
   * 任何人给某一层单独加 padding/margin 都会破坏对齐。
   */
  const textStyle: TextStyle = {
    fontFamily: OPTICAL_FONT_FAMILY,
    fontSize: fontPx,
    lineHeight: height,
    fontWeight,
    letterSpacing,
    // 等宽数字变体：日期里全是数字，避免某些字体把 1/4 等数字渲染成比例宽。
    fontVariant: ['tabular-nums'],
    // 居中：容器宽 = 墨迹宽 + 逐字余量，居中最不容易在"右对齐日期块"里贴边。
    textAlign: 'center',
    includeFontPadding: false,
  };

  const rowStyle: ViewStyle = { width, height };
  if (rotationDeg !== 0) {
    // 竖排：整行一个水平 View 画完，再整层旋转（旋转中心 = 日期块中心）。
    rowStyle.transform = [{ rotate: `${rotationDeg}deg` }];
  }

  return (
    <View style={rowStyle} pointerEvents="none">
      {opticalGlowLayers(glow, style, fontPx).map((layer) => (
        <Text
          // 层 kind 是稳定的三元组，直接当 key。
          key={layer.kind}
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.layer,
            textStyle,
            {
              color: layer.color,
              textShadowColor: layer.shadowColor,
              textShadowRadius: layer.shadowRadius,
              textShadowOffset: SHADOW_OFFSET,
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
 * 取景器预览 `FramePreviewLayer`、抽屉/相册里的迷你成片。七个 props 全是标量
 * （`text` / `style` / `fontPx` / `width` / `letterSpacing` / `glow` / `rotationDeg`），
 * 父级重渲染而日期没变时应当整棵 bailout，不必把三层 `<Text>` + 三次阴影重新提交。
 *
 * 导出名与 props 接口名都不变（`DateStamp.tsx:47/203` 零改动）；实现体改名
 * `OpticalDateTextImpl` 只是让"带 memo 的导出"与"裸实现"一眼可分。
 */
export const OpticalDateText = memo(OpticalDateTextImpl);

const styles = StyleSheet.create({
  /**
   * 三层都铺满整块日期行（`width × height`）：`position: 'absolute'` + 四边 0，
   * 行高已由 `lineHeight` 钉死，所以三层的基线必然重合。
   */
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
});
