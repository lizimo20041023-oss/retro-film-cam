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
 *
 * ── v1.8.0：相框外围的**不透明幕布**（修"取景器顶部黑线断层"）────────────────────
 * 用户报的现象是取景器顶部有一条黑线断掉/错位。根因是这一层原本只有"相纸"一块，
 * 相纸之外（取景器剩下的那一圈）什么都没有：黑边来自下面别的层，一旦相纸的取整位置
 * 比那些层多出半个点，就露出一条与周围黑不一样的缝，看起来就是"黑线断了"。
 *
 * 修法不是去对缝，而是**把"取景器 − 相纸"整块用 100% 不透明的 `#0A0A0C` 铺满**：
 * 相框于是变成一块干净的镂空遮罩，缝不存在了（没有"缝"这一说，只有两种颜色）。
 *
 * ⚠️ 三条不许动的约束（探针 `_probe_skin_material.cjs` 第 4 节守着）：
 *   · 幕布**必须在这层 0.82 的不透明度之外** —— 否则黑是半透明的，实时画面从黑里透出来，
 *     比原来那条缝更难看。所以根节点不再带 opacity，opacity 移到里面的"相纸层"。
 *   · 四块幕布**一个像素都不许压进相纸盒**（相纸自己就是相框，压上去会切掉纸边），
 *     但相邻两块必须互相多压 `CURTAIN_SEAM`(1pt)——**防的是幕布之间的缝**，不是幕布与相纸的缝。
 *   · 容器尺寸由已给的量反推：`container = layout + 2×(left, top)`（`frameOffset` 就是居中偏移）。
 *     这是本层唯一的假设：调用方给的 `left/top` 必须是在**同一块容器**里量出来的。
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
import type { FrameLayout, FrameSpec, FrameVariant, Rect } from '../types';

/**
 * 预览层整体不透明度。取 0.82 的理由见文件头 —— 它是"看得清相框"与"看得见实时画
 * 面"之间的折中值，不是随手写的。要调就调到能同时满足这两条为止。
 */
export const FRAME_PREVIEW_OPACITY = 0.82;

/**
 * 相框外围幕布的颜色。**不透明**（`opacity: 1`，没有任何 alpha）。
 *
 * 比纯黑亮一点点：取景器上下就是机身黑，`#0A0A0C` 能同时压住"比机身更黑"的突兀感，
 * 又不至于把相纸的暖白边衬得发灰。抽屉里的迷你预览用的 `FilmDrawer.FRAME_PREVIEW_BACKDROP`
 * 是同一个色 —— 两处看起来必须是同一块黑。
 */
export const CURTAIN_COLOR = '#0A0A0C';

/**
 * 相邻幕布互相多压的宽度（pt）。
 *
 * ⚠️ 这一条**不是**"往相纸里多压 1pt"：幕布只在自己那侧的空白里，相纸一个像素都不碰。
 * 它是左/右两块向上下各伸 1pt，伸进上/下两块的地盘 —— 防的是**幕布之间**的缝
 * （四块严丝合缝时，亚像素取整有可能在两个矩形的公共边上留出半像素的亮线）。
 */
export const CURTAIN_SEAM = 1;

/** 幕布的四块。 */
export type CurtainSide = 'top' | 'bottom' | 'left' | 'right';

export interface CurtainRect {
  side: CurtainSide;
  /** 在**取景器容器**坐标系里的矩形（pt）。 */
  rect: Rect;
}

/**
 * 把"取景器容器 − 相纸盒"切成四块幕布（纯函数，探针直接跑它，不经过渲染）。
 *
 * 几何（`paper` = 相纸盒，`container` = `paper + 2×(left, top)`）：
 *
 *   ┌─────────────────────────────────┐  ← container 顶上（= 取景器容器）
 *   │            top                  │
 *   ├──────┬───────────────────┬──────┤  ← paper 顶
 *   │ left │   paper（相框）    │ right│      left/right 向上下各多压 SEAM
 *   ├──────┴───────────────────┴──────┤  ← paper 底
 *   │            bottom               │
 *   └─────────────────────────────────┘
 *
 * · 四块的**并集恰好是"容器 − 相纸"**：left/right 多压的那 1pt 落在 top/bottom 里，
 *   不改变并集，也不碰相纸（它们的 x 区间本来就在相纸两侧）。
 * · 相纸贴着某条边（留白为 0）时那一块不生成 —— 那一条边本来就没有"外围"。
 * · 容器尺寸从 `layout + 2×(left, top)` 反推（`left/top` 就是居中偏移，见文件头）。
 *   反推不出来（负数 / 尺寸非正）就返回空数组：宁可不铺，也不铺错位。
 */
export function previewCurtainRects(layout: FrameLayout, left: number, top: number): CurtainRect[] {
  const paperWidth = layout.width;
  const paperHeight = layout.height;
  if (!(paperWidth > 0) || !(paperHeight > 0) || !(left >= 0) || !(top >= 0)) {
    return [];
  }
  const containerWidth = paperWidth + left * 2;
  const containerHeight = paperHeight + top * 2;
  const paperRight = left + paperWidth;
  const paperBottom = top + paperHeight;
  const rects: CurtainRect[] = [];

  if (top > 0) {
    rects.push({ side: 'top', rect: { left: 0, top: 0, width: containerWidth, height: top } });
  }
  if (containerHeight - paperBottom > 0) {
    rects.push({
      side: 'bottom',
      rect: { left: 0, top: paperBottom, width: containerWidth, height: containerHeight - paperBottom },
    });
  }

  // 左/右两块向上下各多压一个 CURTAIN_SEAM（只压进上/下幕布，不压进相纸）。
  const sideTop = Math.max(0, top - CURTAIN_SEAM);
  const sideBottom = Math.min(containerHeight, paperBottom + CURTAIN_SEAM);
  const sideHeight = sideBottom - sideTop;
  if (left > 0 && sideHeight > 0) {
    rects.push({ side: 'left', rect: { left: 0, top: sideTop, width: left, height: sideHeight } });
  }
  if (containerWidth - paperRight > 0 && sideHeight > 0) {
    rects.push({
      side: 'right',
      rect: { left: paperRight, top: sideTop, width: containerWidth - paperRight, height: sideHeight },
    });
  }
  return rects;
}

export interface FramePreviewLayerProps {
  /** 当前相框。横版 PNG 的分支由 `frameOrientationOfLayout` 反推，和成片同一套逻辑。 */
  frame: FrameSpec;
  /** 相纸矩形（= `CameraScreen.previewLayout`），`window` 相对相纸左上角。 */
  layout: FrameLayout;
  /** 相纸左上角在**取景器容器**坐标系里的落点（= `CameraScreen.frameOffset`）。 */
  left: number;
  /** 同上，纵向。 */
  top: number;
  /**
   * 材质（A 经典原白 / B 岁月暖黄 / C 暗房雅黑）。三档都会画材质，没有"不画"的那一档：
   * 配方在 `constants/frameVariants.ts`，`FrameSkin` 只负责画出来。
   */
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

  const curtains = previewCurtainRects(layout, left, top);
  const containerWidth = layout.width + left * 2;
  const containerHeight = layout.height + top * 2;

  /*
   * v1.8.1 无相框（`00 NO FRAME`）：幕布、相纸、材质**整组不画**，只留水印。
   *
   * 为什么幕布必须一起跳过（而不是"顺手也能画"）：那四块是 **100% 不透明的
   * `CURTAIN_COLOR`**，它们存在的意义是盖住"相纸之外"那一圈实时画面。无相框模式下
   * 相纸矩形 = 整幅画布、窗口也铺满它，于是"相纸之外"只剩居中留白 —— 幕布一画，
   * 预览立刻变成满屏黑（用户报的就是这个）。
   *
   * 相纸与皮肤同理：这一档没有纸，PNG 铺上去就是"照片外面多一圈白边"。
   * `layout` 不再需要额外处理：`window` 已经等于整块画布（`resolveFrame` 保证）。
   */
  const fullBleed = frame.fullBleed === true;

  return (
    <View
      /*
       * `pointerEvents="none"` 是必须的：这一层盖在实时画面上、且比镂空窗大得多。
       * 不关掉命中测试，它会把下面那层 `focusCatcher` 的"点哪对哪"整个吞掉。
       */
      pointerEvents="none"
      style={[styles.root, { width: containerWidth, height: containerHeight }]}
    >
      {/*
        ⓪ 相框外围的不透明幕布（v1.8.0）。**在 0.82 那一层之外** —— 见文件头。
        渲染顺序上它们在最底下：相纸压在它们上面，于是相纸的四条边是"纸压黑"
        而不是"黑压纸"，边缘那半个像素的过渡也是正常的抗锯齿，不会切掉纸边。

        v1.8.1：`fullBleed` 时整组不画 —— 见上面 `fullBleed` 那段注释
        （这几块是全不透明的，画上去预览满屏黑）。
      */}
      {!fullBleed &&
        curtains.map(({ side, rect }) => (
          <View
            key={side}
            style={[
              styles.curtain,
              { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            ]}
          />
        ))}

      <View
        style={[
          styles.paper,
          { left, top, width: layout.width, height: layout.height, opacity: FRAME_PREVIEW_OPACITY },
        ]}
      >
        {/*
          ①② 相纸 + 材质：整组挂在 `fullBleed ? null` 上（v1.8.1 无相框）。
          没有纸就没有这两层 —— 这一档 `layout` 已经是整块画布，铺 PNG 就是画面外多一圈白边。
          ③ 水印**留在门外**：它的坐标是相对"相纸容器"的，而这个容器在 fullBleed 下
          正好等于整幅画布，所以坐标一个字都不用改。
        */}
        {fullBleed ? null : (
          <>
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
              ② 材质层（A/B/C 三档全在画）。`seed` 走 `frameSkinSeedOf(frame)`（现已返 `frame.id`）：
              种子只许有一个产地，免得将来三处调用点各写一遍、其中一处写成别的东西。
              ⚠️ v1.8.0 起 `FrameSkin` **不用**这个种子了（材质是纯几何，没有随机图案），
              但字段是冻结接口的一部分、且三个调用点都还在传，所以留在这里别删。
            */}
            <FrameSkin
              width={layout.width}
              height={layout.height}
              window={layout.window}
              variant={variant}
              seed={frameSkinSeedOf(frame)}
            />
          </>
        )}

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
  /** 覆盖整个取景器容器（尺寸由 `layout + 2×(left, top)` 反推，见文件头）。 */
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  /** 相框外围的不透明幕布（一块一块，四块拼成"容器 − 相纸"）。 */
  curtain: {
    position: 'absolute',
    backgroundColor: CURTAIN_COLOR,
  },
  /** 相纸层。`FRAME_PREVIEW_OPACITY` 挂在这一层，幕布在它外面所以是实心的。 */
  paper: {
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
