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
 * ── 为什么还要 `adjustsFontSizeToFit` ──────────────────────────────────────
 * 宽度算得再准，也是"按 0.6 em 等宽"算出来的**预期**值；万一系统对某个字符的 advance
 * 有出入，`numberOfLines={1}` 会给出省略号 —— 成片上出现一个 `…` 就是废片。
 * 让它缩一点（下限 0.9）比给省略号安全得多，而正常情况下这条分支永远不触发。
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
    <View style={[styles.root, { width: quartz.width }]}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
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
