/**
 * 日期水印 —— 系统等宽粗体 + 固定字距，**不加载任何第三方字体**。
 *
 * ── 为什么把"七段数码管"整个换掉（v1.4.1）────────────────────────────────────
 * v1.3.0 起日期是 `SegmentDate` 用纯 `View` 手绘的七段管。那套方案在**大字号**下很好，
 * 但 v1.4.0 按"画布短边 2%"把字号收口到 8pt 之后，管高只剩
 * `max(MIN_QUARTZ_HEIGHT, round(8 × 0.58)) = 6pt`，于是几何整体塌了：
 *
 *     段厚   = 6 × 0.14                = 0.84pt
 *     竖段长 = 6/2 − 0.84×1.5 − 0.5×2  = 0.74pt
 *
 * 竖段**比段厚还短**（0.881 倍）—— 它已经不是一个"竖条"，而是一个方点。
 * 三个横段（3.3 × 0.84pt）加四个方点，整串 `'26  10  12` 看上去就是**一排横向虚线**。
 * 这就是用户报的"时间乱码"。
 *
 * 复现证据：`scripts/_quartz_repro.py` 按原公式逐段重画，管高 6/8/11/16pt 四档对照 ——
 * 6pt 完全认不出，8pt 勉强，11pt 才成形。**它和字体没有任何关系**：
 * 工程里从来没加载过字体，日期的字形也不是字体给的。
 *
 * 真实字形就没有这个毛病 —— 字形是**矢量轮廓**，8pt 有 8pt 自己的笔画安排，
 * 不会因为"某一段比另一段短"而退化。而且 8pt 在成片里一点都不小：
 * 合成舞台 358pt 宽、`captureLongEdge = 2048`，放大 5.7 倍 → 字高约 46px。
 *
 * ── 契约：宽度由 `geometry.ts` 算，渲染层**不许**量 ─────────────────────────
 * （和 `WatermarkLine.quartz` 上那一份是同一个契约，两处各写一份。）
 * 容器宽度**只能**用 `quartz.width`，并且 `flexShrink: 0`。
 * 曾经的 bug 就是日期行的宽度由 `<Text>` 排版排出来、被 `flexShrink` 压成 `26 10...`；
 * 现在的宽度是 `dateStampWidth()` 算出来的确定值，谁也压不动。
 *
 * ── 为什么容器宽度现在是"实测字形宽 + 一点余量"（v1.5.1 修）──────────────────
 * 本轮专门量过真字体：`C:\Windows\Fonts\courbd.ttf`（= iOS `CourierNewPS-BoldMT`
 * 的同族 Courier New Bold）里 `'` / 数字 / 空格 / `A` / `M` 的 advance **全部是
 * 600/1000 em = 0.6000 em**，`'26  10  12` 合计 6.6000 em —— 也就是说
 * `dateStampWidth()` 用的 0.6 **本来就是准的**，"模型低估了字宽"这个诊断不成立。
 *
 * 但"算得准"恰好意味着**余量为零**：容器宽度与文字 advance 精确相等，剩下能救命的
 * 只有"RN 会不会给最后一个字形也加字距"这一条未写进文档的假设。而 iOS 的 CoreText
 * 是**逐字形取整**的，11 个字形各差零点几个 pt 累起来就可能超过容器，
 * 于是 `numberOfLines={1}` 给出省略号 —— 用户看到的就是"日期掉字"。
 *
 * 所以排版层（`geometry.ts` 的 `DATE_GLYPH_SLACK`）给每个字形留了 0.5pt 的确定余量
 * （11 个字形 = 5.5pt，约 5.8%），渲染层在这里**再多钉一道** `maxWidth`：
 * 容器既不会小于它该有的宽度（`width` 固定），也不会大于文本真正能画的范围
 * （`maxWidth` 等于同一个数），宽度再也不是"排出来的"，而是"发下来的"。
 *
 * ── 为什么**删掉**了 `adjustsFontSizeToFit`（v1.7.0 §四）────────────────────
 * 上一版留它是想"万一塞不下就缩到 0.9 倍，总比出现一个 `…` 好"。代价是：
 * **水位被静默吃掉** —— 日期一旦被 iOS 自动缩放，成片上的字高就不再等于排版层算出的
 * 那个数，"绝对像素锁定"当场失效，而且没有任何地方能发现（屏幕上看着"还行"）。
 * 本轮要的是"画布上日期的像素高度绝对恒定"，所以这条后门必须关掉。
 *
 * 关掉之后靠什么不溢出：宽度是 `dateStampWidth(text, 同一个字号, 同一个字距)` 算出来的
 * （`quartz.width`），公式里含 `DATE_GLYPH_SLACK`（每个字形 +0.5pt）的正向余量，
 * 所以"容器 ≥ 文字"是结构性成立的。真到余量也不够的那天，`ellipsizeMode="clip"`
 * 会让它**可见地切掉一截**，而不是静默缩小 —— 我们要的是可发现，不是掩盖。
 *
 * ⚠️ 因此**不许**再把 `adjustsFontSizeToFit` / `minimumFontScale` 加回来，
 * 也不许改成 `ellipsizeMode="tail"`：省略号会把"算错了"伪装成"字体没装好"。
 */
import { memo } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WatermarkQuartz } from '../utils/geometry';

export interface DateStampProps {
  /** 排版层算好的整块参数（宽度 / 字号 / 字距 / 字重 / 阴影）。 */
  quartz: WatermarkQuartz;
  /** 墨色。已按锚点解析好：压在照片上是琥珀橙，印在相纸留白上是印字橙。 */
  color: string;
  /** 等宽字体族（`useFilmFonts()` 给，iOS 是 `CourierNewPS-BoldMT`）。 */
  fontFamily: string;
}

/** 行高 ÷ 字号。1.16 = iOS 默认行高，与 `geometry.ts` 的 `QUARTZ_LINE_BOX_RATIO` 同一个数。 */
const LINE_HEIGHT_RATIO = 1.16;

function DateStampImpl({ quartz, color, fontFamily }: DateStampProps): ReactElement {
  return (
    /*
     * `width` 与 `maxWidth` 用**同一个数**：`width` 保证它不会被父级的 flex 分配压小，
     * `maxWidth` 保证它也不会被"文字想要更宽"撑开（撑开就会盖住左边的地名）。
     * 两个一起写 = 这一块的宽度完全由排版层决定，和渲染层的排版结果无关。
     */
    <View style={[styles.root, { width: quartz.width, maxWidth: quartz.width }]}>
      {/*
       * 不缩（没有 `adjustsFontSizeToFit`）、不省略（`clip`）：宽度是排版层发下来的确定值，
       * 字号就是成片上的字号。理由见文件头"为什么删掉了 adjustsFontSizeToFit"。
       */}
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        ellipsizeMode="clip"
        style={{
          color,
          fontFamily,
          fontSize: quartz.fontSize,
          lineHeight: Math.round(quartz.fontSize * LINE_HEIGHT_RATIO),
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
