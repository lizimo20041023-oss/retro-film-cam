/**
 * 日期水印 —— 硬件字形版（v1.8.0 模块四）。
 *
 * ── 这个文件现在的两个身份 ────────────────────────────────────────────────────
 * 1. **旧路径（兼容面，一行都不许破）**：`{ quartz, color, fontFamily }` ——
 *    `FilmCompositor.tsx:714` 与 `FramePreviewLayer.tsx:177/201` 就是这么调它的。
 *    缺省（不传 `glyphStyle`）时走 `<Text>` 等宽粗体，与 v1.7.0 的成片逐像素同观感。
 * 2. **新路径（日期引擎）**：额外传 `glyphStyle` / `spot` / `glow` / `canvasWidth`，
 *    由 `DateGlyphs` 按机位与字形画，并挂上双层荧光晕染。
 *
 * ## 为什么保留旧路径而不是一刀切
 * 成片、实时预览、导出三条链路都在用这一个组件，且分属不同人改。
 * 把"引擎没配好"的情形做成"退回旧观感"，谁先合都不会把对方的成片弄成白板。
 *
 * ── 契约：宽度由 `geometry.ts` 算，渲染层**不许**量 ─────────────────────────
 * （和 `WatermarkLine.quartz` 上那一份是同一个契约，两处各写一份。）
 * 容器宽度**只能**用 `quartz.width`，并且 `flexShrink: 0`。
 * 曾经的 bug 就是日期行的宽度由 `<Text>` 排版排出来、被 `flexShrink` 压成 `26 10...`；
 * 现在的宽度是 `dateStampWidth()` 算出来的确定值，谁也压不动。
 *
 * ── 为什么容器宽度是"实测字形宽 + 一点余量"（v1.5.1 修）─────────────────────
 * 本轮专门量过真字体：`C:\Windows\Fonts\courbd.ttf`（= iOS `CourierNewPS-BoldMT`
 * 的同族 Courier New Bold）里 `'` / 数字 / 空格 / `A` / `M` 的 advance **全部是
 * 600/1000 em = 0.6000 em**，`'26  10  12` 合计 6.6000 em —— 也就是说
 * `dateStampWidth()` 用的 0.6 **本来就是准的**，"模型低估了字宽"这个诊断不成立。
 * 但"算得准"意味着余量为零，而 iOS 的 CoreText 逐字形取整，累起来就超过容器 ——
 * 所以排版层（`DATE_GLYPH_SLACK`）与渲染层（这里的 `maxWidth`）各钉一道。
 *
 * ── 为什么**删掉**了 `adjustsFontSizeToFit`（v1.7.0 §四）────────────────────
 * 它会静默吃掉"水位"：日期一旦被 iOS 自动缩放，成片上的字高就不再等于排版层算出的数，
 * "绝对像素锁定"当场失效，而且屏幕上看着"还行"。这条后门必须关着。
 *
 * ── v1.8.0 的新路径为什么**能**关着这道门还不出错 ─────────────────────────────
 * 像素字形（`led_7seg` / `led_dot_matrix`）根本不排字，宽高全是算出来的整数；
 * 文字字形（后三档）沿用 `quartz` 的发下来的宽度与余量。两条路都不需要自动缩放。
 *
 * ⚠️ 因此**不许**再把 `adjustsFontSizeToFit` / `minimumFontScale` 加回来，
 * 也不许把旧路径的 `ellipsizeMode` 改成 `tail`：省略号会把"算错了"伪装成"字体没装好"。
 */
import { memo } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DateGlowId, DateGlyphStyleId, DateStampSpot } from '../types';
import { DATE_SPOT_TRAITS, dateEngineFontPx } from '../constants/dateEngine';
import { DateGlyphs, glyphHeight } from './DateGlyphs';
import type { WatermarkQuartz } from '../utils/geometry';

/** 行高 ÷ 字号。1.16 = iOS 默认行高，与 `geometry.ts` 的 `QUARTZ_LINE_BOX_RATIO` 同一个数。 */
const LINE_HEIGHT_RATIO = 1.16;

export interface DateStampProps {
  /** 排版层算好的整块参数（宽度 / 字号 / 字距 / 字重 / 阴影）。 */
  quartz: WatermarkQuartz;
  /** 墨色。已按锚点解析好：压在照片上是琥珀橙，印在相纸留白上是印字橙。 */
  color: string;
  /** 等宽字体族（`useFilmFonts()` 给，iOS 是 `CourierNewPS-BoldMT`）。 */
  fontFamily: string;
  /**
   * 字形风格（日期引擎）。**不传 = 走 v1.7.0 的等宽文字旧路径**（见文件头）。
   */
  glyphStyle?: DateGlyphStyleId;
  /**
   * 烙印机位。只用来取**旋转角**与"画内 / 白边"归属 ——
   * 坐标由 `geometry.resolveDateSpot()` 算好后以 `box` 的形式传进来，这里不重算。
   */
  spot?: DateStampSpot;
  /**
   * 发光色。**不传时用 `classic_amber`**（= v1.6.1 的钨丝琥珀橙）——
   * 这样"只升级了字形、还没配发光色"的中间状态不会渲染成无色。
   */
  glow?: DateGlowId;
  /**
   * 当前画布宽度（逻辑点）。新路径的**字号唯一来源**是
   * `dateEngine.dateEngineFontPx(style, canvasWidth)`（→ `canvasBase.absoluteFontPx`）。
   *
   * ⚠️ 不传时退回 `quartz.fontSize`：兼容面要求"只给三个旧 prop 也能画"，
   * 而 `quartz.fontSize` 同样是排版层按画布宽度算出来的数，两者同源，
   * 不会出现"渲染层自己瞎猜一个字号"。探针会断言：
   * `dateEngineFontPx(style, canvasWidth)` 与 `quartz.fontSize` 在 1440 设计基准上相等。
   */
  canvasWidth?: number;
  /**
   * 未旋转文本盒的左上角（新路径）。**给了它才走绝对定位**，否则按文档流排在父容器里
   * —— 旧路径依赖文档流（`split` 版式那一行是靠 `align.right` 摆的）。
   */
  box?: { left: number; top: number };
}

/**
 * 新路径的实际字号。
 *
 * 提取成函数是因为它**同时**被字形与晕染层读：两处各算一次就会出现
 * "字形按 12pt 画、光晕按 11.94pt 扩"这种半个像素的分叉，而它在真机上表现为
 * "光晕比字大了一圈"，很容易被当成配色问题。
 */
function engineFontPx(style: DateGlyphStyleId, quartz: WatermarkQuartz, canvasWidth?: number): number {
  if (canvasWidth !== undefined && canvasWidth > 0) {
    return dateEngineFontPx(style, canvasWidth);
  }
  return quartz.fontSize;
}

function DateStampImpl({
  quartz,
  color,
  fontFamily,
  glyphStyle,
  spot,
  glow,
  canvasWidth,
  box,
}: DateStampProps): ReactElement | null {
  /*
   * `format === 'OFF'` 的判据落在**文本**上，不落在 render 层的 switch 上：
   * 引擎那边 `OFF` 的模板是空串（`DATE_FORMAT_TEMPLATES.OFF = ''`），所以"空串 = 不烧"
   * 这一个判据同时覆盖"关掉了"和"这一张没有日期"两种情况。
   *
   * ⚠️ 必须 `return null` 而不是渲染空 View：`FramePreviewLayer` 里那些
   * "白边有没有日期块"的判断会因为一个空 View 而误判成"有"。
   */
  if (quartz.text.trim().length === 0) {
    return null;
  }

  const rotationDeg = spot ? DATE_SPOT_TRAITS[spot].rotationDeg : 0;
  const engine = glyphStyle !== undefined;
  /** 渲染宽度：旧路径逐字照抄 `quartz.width`（那是排版层算死的数，压不动）；新路径同源。 */
  const width = quartz.width;
  const height =
    engine && glyphStyle !== undefined ? glyphHeight(glyphStyle, quartz.fontSize) : Math.round(quartz.fontSize * LINE_HEIGHT_RATIO);

  /*
   * ── 旧路径（v1.7.0 观感，逐像素不变）─────────────────────────────────────
   * `width` 与 `maxWidth` 用**同一个数**：`width` 保证它不会被父级的 flex 分配压小，
   * `maxWidth` 保证它也不会被"文字想要更宽"撑开（撑开就会盖住左边的地名）。
   */
  if (!engine || glyphStyle === undefined) {
    return (
      <View style={[styles.root, { width, maxWidth: width }]}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          ellipsizeMode="clip"
          style={{
            color,
            fontFamily,
            fontSize: quartz.fontSize,
            lineHeight: height,
            letterSpacing: quartz.letterSpacing,
            fontWeight: quartz.fontWeight,
            // 与 `FilmCompositor.stampTextStyle` 同一套规则：颜色由排版层给（`quartzShadow`），
            // 半径 0 = 一个阴影都不带（印在相纸留白上的日期就是这一支）。
            textShadowColor: quartz.shadowRadius > 0 ? quartz.shadowColor : 'transparent',
            textShadowRadius: quartz.shadowRadius,
            // 偏移 0 = 四周均匀的那圈光；有偏移会变成"往右下掉一个字"
            textShadowOffset: { width: 0, height: 0 },
          }}
        >
          {quartz.text}
        </Text>
      </View>
    );
  }

  /*
   * ── 新路径（日期引擎）───────────────────────────────────────────────────
   * v1.8.1 起**没有独立的晕染层**了：光晕由每个字形自己画（亮灯的放大副本 + 文字字形的
   * `textShadow`），所以这一行只剩字形。用户强制规范：日期水印的背景必须 100% 透明，
   * 任何实色或半透明矩形都不许有 —— 旧 `DateHaze` 的两层实心圆角矩形正是实测图 21 里
   * 那块橙色方块的来源，已整体删除（见 `DateGlyphs.tsx` 第八节的说明）。
   * 旋转仍然由 `DateGlyphs` 自己处理，光的中心与字形中心同源。
   */
  const fontPx = engineFontPx(glyphStyle, quartz, canvasWidth);
  const glowId: DateGlowId = glow ?? 'classic_amber';
  /** 排版层给的字距优先；它是日期行真正会用的那个数（`DATE_LETTER_SPACING = 2`）。 */
  const tracking = quartz.letterSpacing;

  return (
    <View
      style={[
        styles.root,
        {
          width,
          maxWidth: width,
          height,
          // 新路径必须自己钉住高度：像素字形的高度是算出来的（不等于行盒），
          // 不写死的话父级的 `alignItems: 'center'` 会把它压到行盒里、上下各切一截
          ...(box ? { position: 'absolute', left: box.left, top: box.top } : {}),
        },
      ]}
    >
      <View style={{ width, height, justifyContent: 'center' }}>
        <DateGlyphs
          text={quartz.text}
          style={glyphStyle}
          fontPx={fontPx}
          glow={glowId}
          tintColor={color}
          fontFamily={fontFamily}
          letterSpacing={tracking}
          rotationDeg={rotationDeg}
        />
      </View>
    </View>
  );
}

/**
 * `memo`：`FilmCompositor` 每次重排都会重建这棵子树，日期串没变就不该重画。
 */
export const DateStamp = memo(DateStampImpl);

const styles = StyleSheet.create({
  /**
   * 宽度由 `quartz.width` 定死，`flexShrink: 0` 显式写出来 ——
   * 这条契约值得被后来的人看见（它就是当年被压成 `26 10...` 的那一行）。
   */
  root: { flexShrink: 0 },
});
