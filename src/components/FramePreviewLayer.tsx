/**
 * 取景器里的「相框实时预览」叠加层（v1.7.0 · 模块三）。
 *
 * ── 它凭什么和成片长得一样（这是整个模块成立的前提）──────────────────────────
 * 预览层**不重算任何几何**。它吃的是 `CameraScreen` 里那两个已经存在的量：
 *
 *   · `previewLayout = computeFrameLayout(frame, previewBox − 2×PREVIEW_PADDING)`
 *     —— 相纸在取景器容器里的矩形，`previewLayout.window` 是窗口相对**相纸**的位置；
 *   · `frameOffset = (previewBox − previewLayout) / 2` 取正 —— 相纸左上角在容器里的落点。
 *
 * 而镂空取景窗 `ViewfinderWindow` 吃的 `viewfinderWindow` 就是
 * `frameOffset + previewLayout.window`（`CameraScreen.tsx` 那一段注释里已经证明过）。
 * 两边**共用同一个 `previewLayout`**，所以"预览层画的窗口"与"玻璃遮罩挖的窗口"
 * 必然逐点重合 —— 这不是对齐得好，这是同一个数。
 *
 * ── 为什么不需要在预览里画照片 ────────────────────────────────────────────────
 * 相框 PNG 的画面区（`frame.window`）是**全透明**的：合成时透出的是底下的照片，
 * 取景时透出的就是底下的实时画面。所以这一层只画"纸 + 边框皮肤 + 水印"三样，
 * 相机画面自己会从洞里露出来 —— 多做一层截图反而会挡住实时预览。
 *
 * ── 为什么是半透明（`FRAME_PREVIEW_OPACITY`）────────────────────────────────
 * 用户要的是「半透明叠加层」：纸面盖住取景器边缘的同时，得让人还能看见窗外的实时
 * 画面在动，否则用户会以为相机卡住了。0.82 是反复看下来的折中 —— 再低相纸的
 * 年代感就糊在实时画面里看不出来，再高又会把取景器边缘的构图信息全糊掉。
 *
 * ── 与 `FilmCompositor` 的关系（**这段要说清楚，否则以后会改歪**）────────────
 * 水印的三条渲染分支与 `FilmCompositor.tsx` 的 ③ 段是**刻意照抄**的：预览要"所见即
 * 所得"，就得和成片用同一套规则（同一份 `WatermarkPiece[]`、同一个 `DateStamp`）。
 * 唯一的差别是字号来源 —— 成片按合成舞台算，预览按取景器尺寸算，但两边都是
 * `dateFontOf(画布宽度, dateFontRatioOf(config.fontSizeRatio, toneScale))`
 * 这**同一个比例**（v1.7.0 起字号的唯一口径，见 `utils/watermarkTypography.ts`），
 * 所以"预览里多大，成片里就多大"在比例意义上成立。预览层自己一个字号的算术都不做：
 * `pieces` 是 `planWatermark()` 按预览布局算好的，本层只负责把它画出来。
 *
 * ⚠️ 改 `FilmCompositor` 的水印渲染时，这里必须一起改。抽成共用组件是更干净的做法，
 * 但那个文件当时正在被另一个写者改（模块二往里加 `FrameSkin`），同时动它会撞车。
 */
import { memo } from 'react';
import type { ReactElement } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';

import { frameSkinSeedOf } from '../constants/frames';
import { frameOrientationOfLayout, frameSourceOf } from '../utils/geometry';
import { DateStamp } from './DateStamp';
import { FrameSkin } from './FrameSkin';
import type { WatermarkPiece } from './FilmCompositor';
import type { FrameLayout, FrameSpec, FrameVariant } from '../types';

/**
 * 预览层整体不透明度。取 0.82 的理由见文件头 —— 它是"看得清相框"与"看得见实时画
 * 面"之间的折中值，不是随手写的。要调就调到能同时满足这两条为止。
 */
export const FRAME_PREVIEW_OPACITY = 0.82;

export interface FramePreviewLayerProps {
  /** 当前相框。横版 PNG 的分支由 `frameOrientationOfLayout` 反推，和成片同一套逻辑。 */
  frame: FrameSpec;
  /** 相纸矩形（= `CameraScreen.previewLayout`），`window` 相对相纸左上角。 */
  layout: FrameLayout;
  /** 相纸左上角在**取景器容器**坐标系里的落点（= `CameraScreen.frameOffset`）。 */
  left: number;
  /** 同上，纵向。 */
  top: number;
  /** A/B/C 风格变体。`classic` 时 `FrameSkin` 返回 `null`，外观与 v1.6.1 逐像素相同。 */
  variant: FrameVariant;
  /** 水印片段，**必须**是 `planWatermark(...)` 的输出（和成片同一份）。 */
  pieces: WatermarkPiece[];
  /** 等宽字体族（`useFilmFonts().fontFamily`）。 */
  fontFamily: string;
  /** 预设的辉光总开关（`preset.timestamp.glow`），与成片同源。 */
  glow: boolean;
}

function FramePreviewLayerImpl({
  frame,
  layout,
  left,
  top,
  variant,
  pieces,
  fontFamily,
  glow,
}: FramePreviewLayerProps): ReactElement | null {
  /*
   * `previewBox` 还没量出来时（首帧）尺寸是 0，摆上去就是"贴在左上角的一个点"。
   * 直接不画 —— 反正下一帧 `onLayout` 一到就回来了。
   */
  if (layout.width <= 1 || layout.height <= 1) {
    return null;
  }

  return (
    <View
      /*
       * `pointerEvents="none"` 是必须的：这一层盖在实时画面上、且比镂空窗大得多。
       * 不关掉命中测试，它会把下面那层 `focusCatcher` 的"点哪对哪"整个吞掉。
       */
      pointerEvents="none"
      style={[
        styles.root,
        { left, top, width: layout.width, height: layout.height, opacity: FRAME_PREVIEW_OPACITY },
      ]}
    >
      {/*
        ① 相纸：与 `FilmCompositor` 同一句 `frameSourceOf(frame, frameOrientationOfLayout(...))`。
        朝向**从 layout 反推**、不在这里重判一次 —— 判两次就会出现"布局按竖版算、PNG 铺了
        横版"的错位，合成器那段注释里记着这个坑。
      */}
      <Image
        source={frameSourceOf(frame, frameOrientationOfLayout(frame, layout))}
        style={[styles.frame, { width: layout.width, height: layout.height }]}
        resizeMode="stretch"
        fadeDuration={0}
      />

      {/*
        ② A/B/C 风格皮肤。`classic` 返回 `null`，于是这一层对老用户是**零像素变化**。
        `seed` 走 `frameSkinSeedOf(frame)`（现已返 `frame.id`）：种子只许有一个产地，
        免得将来三处调用点各写一遍、其中一处写成别的东西，预览与成片就长得不一样了。
        涂鸦波点必须确定性（同一款相框每次进来长得一样），禁 `Math.random()`
        —— 否则预览每帧都在抖。
      */}
      <FrameSkin
        width={layout.width}
        height={layout.height}
        window={layout.window}
        variant={variant}
        seed={frameSkinSeedOf(frame)}
      />

      {/* ③ 水印：三条分支与 `FilmCompositor` 的 ③ 段一一对应 */}
      {pieces.map((piece) => {
        const text = previewStampTextStyle(piece, fontFamily, glow);

        // 纯文字行（地名 / 摄影代号 / 日期关掉时的纯文字）
        if (piece.quartz === undefined) {
          return (
            <Text
              key={piece.key}
              allowFontScaling={false}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.stamp,
                {
                  left: piece.left,
                  right: piece.right,
                  bottom: piece.bottom,
                  maxWidth: piece.maxWidth,
                  textAlign: piece.textAlign,
                },
                text,
              ]}
            >
              {piece.text}
            </Text>
          );
        }

        // 独立日期块（`text` 为空）：宽度来自排版层，这里只负责摆位置
        if (piece.text.length === 0) {
          return (
            <View
              key={piece.key}
              style={[
                styles.stamp,
                {
                  left: piece.left,
                  right: piece.right,
                  bottom: piece.bottom,
                  width: piece.quartz.width,
                  flexShrink: 0,
                },
              ]}
            >
              <DateStamp quartz={piece.quartz} color={piece.color} fontFamily={fontFamily} />
            </View>
          );
        }

        // 居中版式：「地名 + 数码管」一行，文字可省，管子整块让位
        return (
          <View
            key={piece.key}
            style={[
              styles.stamp,
              styles.centeredRow,
              {
                left: piece.left,
                right: piece.right,
                bottom: piece.bottom,
                maxWidth: piece.maxWidth,
                width: piece.textAlign === 'center' ? piece.maxWidth : undefined,
              },
            ]}
          >
            <Text allowFontScaling={false} numberOfLines={1} ellipsizeMode="tail" style={[styles.centeredText, text]}>
              {piece.text}
            </Text>
            <DateStamp quartz={piece.quartz} color={piece.color} fontFamily={fontFamily} />
          </View>
        );
      })}
    </View>
  );
}

/**
 * 一行文字的样式 —— **逐字照抄** `FilmCompositor.stampTextStyle`（那一处是 v1.4.1 抽出来
 * 的，原本两处各写一遍，改一处忘一处就出现"居中那行不发光"）。这里再抄一遍同样是权宜：
 * 真正的解是把它提成共用模块，等 `FilmCompositor` 那一轮改动落地后再做。
 *
 * 两个要点别改掉：
 *   · 字重**听排版层的**（`piece.fontWeight`）：`anchor === 'window'` + graphite 要 400；
 *   · 半径 0 = 一个阴影都不带（印在相纸留白上的字就是这样），不是"半径 0 的阴影"。
 */
function previewStampTextStyle(piece: WatermarkPiece, fontFamily: string, glowEnabled: boolean): TextStyle {
  return {
    color: piece.color,
    fontSize: piece.fontSize,
    letterSpacing: piece.letterSpacing,
    fontFamily,
    fontWeight: piece.fontWeight,
    textShadowColor:
      piece.shadowRadius > 0 ? (piece.shadowColor ?? (glowEnabled ? piece.color : 'rgba(0, 0, 0, 0.55)')) : 'transparent',
    textShadowRadius:
      piece.shadowRadius > 0 && glowEnabled ? Math.max(3, Math.round(piece.fontSize * 0.45)) : piece.shadowRadius,
    textShadowOffset: { width: 0, height: piece.shadowRadius > 0 ? 1 : 0 },
  };
}

/**
 * `memo`：取景器每帧都在重渲染（对焦、缩放、倒计时都会动父组件）。
 * 相框、变体、水印片段都没变时不该重画这棵子树。
 */
export const FramePreviewLayer = memo(FramePreviewLayerImpl);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
  },
  frame: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  stamp: {
    position: 'absolute',
  },
  /** 居中版式那一行：文字在左、日期在右，两个片段一起居中。 */
  centeredRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  /** 居中版式里可被省略号收掉的那一半（日期那一半不参与压缩）。 */
  centeredText: {
    flexShrink: 1,
  },
});
