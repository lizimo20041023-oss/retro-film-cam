/**
 * 长卷底片（§九）—— 相册页的"暗房"视图。
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 版式（从外到内）                                                          │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  · 纯黑背光暗房底：`#0A0A0C`（不是纯黑 —— 留一点底噪才像灯箱，不像 OLED 熄屏）│
 * │  · 上下**各一条贯穿整屏、完全相连**的齿孔外轨，高 36pt，`#141416`          │
 * │  · 轨道上均布圆角矩形"镂空"齿孔：用 `#0A0A0C` 的小圆角矩形**盖**出来       │
 * │  · 齿孔旁边印暗码：上轨帧号 `▷ 01` / `▷ 01A` + 胶卷代号，下轨 `PROCESS C-41`│
 * │  · 中间一横排底片，横向滚动                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ── 三个实现上的关键决定（都写在这里，因为它们看起来都像"可以更简单"）──────
 *
 * ① **齿孔轨道为什么不是"每张底片各画一段"？**
 *    用户的原话是"贯穿整屏、完全相连"。如果每张底片自己带一段轨道，底片之间
 *    的间距就会把轨道切断，滚动时还会看到一段段接头在跳。所以结构是**倒过来**的：
 *    进纸口（`FlatList`）和画面是**两个平行的东西** ——
 *      · 一个 `FlatList` 横着放，每项是透明的占位（只负责提供滚动、吸附、可见性）；
 *      · 真正的画面由 `onScroll` 的偏移量驱动，整条轨道 + 整排底片一起
 *        `translateX(-offset)`。
 *    这样轨道天然是一条连续的带子（它根本没有"每张"这个概念），
 *    而底片和它**同速**移动，观感上就是"底片在轨道上滑过"。
 *
 * ② **6% 打滑必须是确定性的（`slipAt(index)`，用帧序号哈希）**。
 *    用 `Math.random()` 的话，每次 re-render（滚动、选中、切语言都会 re-render）
 *    都会重新掷一次骰子，画面会不停地抖 —— 那不是"机械故障彩蛋"，那是坏掉了。
 *    哈希 = 一个整数位混合函数（见 `slipAt`），同一个 index 永远得到同一个结果。
 *
 * ③ **`A` 后缀的规则（只在需要时出现）**。
 *    真实胶片上 `01A` 表示"第 1 格和第 2 格之间的半格"。本组件里唯一会让帧号
 *    偏离"每张一格"的东西就是打滑 —— 打滑的那一刻，后一张不是正常过片到第 2 格，
 *    而是压在 01 的边缘上。所以规则只有一条：
 *      **`indexBefore` 打滑时，`index` 那一张的号是 `{indexBefore 的号}A`；否则是 `{index+1}`。**
 *    没打滑就永远不会出现 `A`，绝不为了好看乱加。
 *
 * ── 没能验证的 ────────────────────────────────────────────────────────────
 * 真机上的手感（滚动阻尼、`Haptics.selectionAsync` 的间隔是否太密）、以及
 * 齿孔轨道会不会被 `FlatList` 的裁剪吃掉 —— 见交付报告"没能验证"一节。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { INK, UI_MONO } from '../constants/theme';
import { useI18n } from '../i18n';
import type { GalleryShot } from '../utils/galleryStore';
import { saveToLibraryDetailed } from '../utils/saveToLibrary';

/* ==========================================================================
 * 常量
 * ========================================================================== */

/** 暗房底色。刻意不是 `#000`：纯黑在 OLED 上像熄屏，留一点底噪才是"背光灯箱"。 */
const DARKROOM = '#0A0A0C';
/** 齿孔轨道。比底色亮两档，才能看出那是"胶片的外边缘"而不是背景。 */
const RAIL = '#141416';
/** 轨道高度（pt）。任务书指定 ~36。 */
const RAIL_HEIGHT = 36;
/** 齿孔宽度 / 高度 / 圆角（任务书：圆角矩形镂空）。 */
const PERF_WIDTH = 18;
const PERF_HEIGHT = 11;
const PERF_RADIUS = 2;
/** 两个齿孔中心之间的距离。真实 35mm 是 4.75mm 孔距 / 8 孔一帧，这里按视觉取整。 */
const PERF_PITCH = 26;
/** 底片之间的标准间距。打滑时后一张会吃掉它的一部分甚至全部。 */
const FRAME_GAP = 10;
/** 帧号暗码离轨道上沿的位置。 */
const RAIL_TEXT_TOP = 2;

/**
 * 打滑概率。任务是"约 6%"—— 用 `i % 16 === 0` 实现：
 * 16 张里恰好 1 张，即 **6.25%**，而且完全确定、可复现、可断言。
 * （比"哈希后取 6% 阈值"更好：那个的实际比例会随张数浮动，也没法一眼看出来。）
 */
const SLIP_MARK = 16;
/** 打滑量：后一张与前一张**边缘叠合**宽度占一张底片宽度的比例（任务书 15%~20%）。 */
const SLIP_RATIO_MIN = 0.15;
const SLIP_RATIO_MAX = 0.2;

/** 切片导出支持的张数（任务书：连续 3 张或 4 张）。 */
export const STRIP_EXPORT_COUNTS = [3, 4] as const;
/** 切片海报的底片高度（pt）。按设备像素比 3 算，成片长边约 3000px —— 算"高分辨率"。 */
const POSTER_FRAME_HEIGHT = 748;
/** 切片海报的上下轨道高度（比屏上的窄一点，长条比例更好看）。 */
const POSTER_RAIL_HEIGHT = 44;
const POSTER_GAP = 12;
const POSTER_PADDING = 16;

/* ==========================================================================
 * 纯函数（确定性伪随机 + 帧号规则）
 * ========================================================================== */

/**
 * 第 `index` 张**自己**会不会打滑 → 返回叠合比例（0 = 不打滑，0.15~0.2 = 打滑）。
 *
 * 为什么是"自己会不会打滑"而不是"要不要和上一张叠"：叠合这件事需要两张都参与，
 * 而只在**一张**上做判断、让后一张去响应它，规则最简单也最好解释 ——
 * `index` 打滑 ⇒ `index + 1` 压过来。于是：
 *   · `indexBefore = index - 1`，`indexBefore < 0` 时不可能打滑（`-1 % 16 !== 0`，天然正确）
 *   · 成对出现，不会出现"被叠了但没人叠它"这种半截状态
 *
 * 三个系数（`0x45d9f3b` / `0x119de1f3` / `0x27d4eb2d`）是整数位混合（bit-mixing）
 * 里常用的质数种子，作用是让相邻 index 的输出**不相关** —— 否则会出现
 * "打滑的总是连着的几张"这种一眼能看穿的规律。
 */
export function slipAt(index: number): number {
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }
  const rounded = Math.floor(index);
  if (rounded % SLIP_MARK !== 0) {
    return 0;
  }
  let hash = (rounded * 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x119de1f3) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, 0x27d4eb2d) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const ratio = SLIP_RATIO_MIN + (hash % 1000) / 1000 * (SLIP_RATIO_MAX - SLIP_RATIO_MIN);
  // 钉到三位小数：叠合比例是"画面参数"，浮点尾巴留着只会让截图对比没法复现
  return Math.round(ratio * 1000) / 1000;
}

/** 第 `index` 张的帧号后缀（`''` 或 `'A'`）。规则见文件头 ③。 */
export function frameSuffix(index: number, hasPreviousSlip: boolean): string {
  return hasPreviousSlip ? 'A' : '';
}

/** 帧号：`▷ 01` = 三角 + 两位序号。三位以上不补零（`▷ 100`），补了反而难读。 */
export function frameLabel(index: number): string {
  return `▷ ${String(Math.max(1, Math.floor(index) + 1)).padStart(2, '0')}`;
}

/** 帧号 + `A` 后缀，拼成轨道上真正印的那串。 */
export function frameRailText(index: number): string {
  return `${frameLabel(index)}${frameSuffix(index, index > 0 && slipAt(index - 1) > 0)}`;
}

/**
 * `n` 的约数里选一个当"胶卷代号每隔几张印一次"的间隔。
 * 用约数是为了**最后一个齿孔格子上刚好也有一枚代号**，长卷看着才收得住口。
 */
function divisorFor(n: number): number {
  if (n <= 4) {
    return n;
  }
  const candidates = [6, 5, 4, 3, 2];
  for (const candidate of candidates) {
    if (n % candidate === 0) {
      return candidate;
    }
  }
  return 1;
}

/** 第 `index` 张上要不要印胶卷代号（每隔 `divisorFor(total)` 张印一次）。 */
export function frameCodeText(index: number, total: number, code: string): string | null {
  if (code.length === 0 || total <= 0) {
    return null;
  }
  return index % divisorFor(total) === 0 ? code : null;
}

/* ==========================================================================
 * 齿孔轨道
 * ========================================================================== */

interface RailProps {
  side: 'top' | 'bottom';
  /** 滚动偏移（pt）。轨道跟着画面一起走，才像同一条底片在过片。 */
  offset: number;
  holes: number;
}

/**
 * 一整条轨道（含它的暗码）。
 *
 * 关键在 `transform: [{ translateX: -offset }]`：轨道不是"每张一份"，
 * 它是**一条长带子**，靠这一个位移和底片保持同速。带子本身够长
 * （`PERF_PITCH × holes`，容量由 `stripLayout` 按张数算并留了富余），
 * 所以滚到最右端也不会露出带子之外的空白。
 */
function FilmRail({ side, offset, holes }: RailProps): React.ReactElement {
  const perforations = useMemo(
    () => Array.from({ length: holes }, (_unused, index) => index * PERF_PITCH),
    [holes],
  );

  return (
    <View style={[styles.rail, side === 'top' ? styles.railTop : styles.railBottom]}>
      <View style={[styles.railBelt, { transform: [{ translateX: -offset }] }]}>
        {perforations.map((left) => (
          <View key={left} style={[styles.perforation, { left: left + (PERF_PITCH - PERF_WIDTH) / 2 }]} />
        ))}
      </View>
    </View>
  );
}

/* ==========================================================================
 * 单片底片
 * ========================================================================== */

interface FrameProps {
  shot: GalleryShot;
  index: number;
  total: number;
  /** 一张底片的显示宽度（pt）。 */
  frameWidth: number;
  /** 底片图像区高度（pt）。 */
  frameHeight: number;
  /** 本张左沿相对"上一张右沿"的位移：正 = 标准间距，负 = 打滑叠合。 */
  spacing: number;
  /** 本张**自己**的打滑比例（只影响帧号后缀）。 */
  ownSlip: number;
  /** 上一张的打滑比例（决定本张要不要压过去叠合）。 */
  previousSlip: number;
  /** 胶卷代号那一行要印的串（`PR-400`）。 */
  code: string;
  /** 选中态（只有切片导出模式才非 null）。 */
  selected: boolean | null;
  onPress: (shot: GalleryShot) => void;
}

/**
 * 一张底片：**图像按覆盖铺满一条**（所以打滑时右侧露出的还是这张图本身），
 * 帧号印在图像左上角之外，不盖住画面。
 */
function FilmFrame(props: FrameProps): React.ReactElement {
  const { shot, index, total, frameWidth, frameHeight, spacing, ownSlip, previousSlip, code, selected, onPress } = props;

  const aspect = shot.height > 0 ? shot.width / shot.height : 1;
  const codeText = frameCodeText(index, total, code);
  // 打滑时本张向左平移，压到上一张的右边缘上 → 双重曝光交错感
  const overlap = previousSlip > 0 ? frameWidth * previousSlip : 0;
  const suffix = frameSuffix(index, previousSlip > 0);

  return (
    <Pressable
      onPress={() => onPress(shot)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${index + 1} / ${total}`}
      style={({ pressed }) => [
        styles.frameSlot,
        { width: frameWidth, marginLeft: spacing, transform: [{ translateX: -overlap }] },
        selected === false ? styles.frameSlotMuted : null,
        pressed ? styles.frameSlotPressed : null,
      ]}
    >
      <View style={[styles.frameWindow, { height: frameHeight }]}>
        <Image
          source={{ uri: shot.thumbUri }}
          // 宽高比用 shot 自己的：竖拍横拍混在一卷里时，画面比例必须是各自的原样。
          // `frameWindow` 是 `overflow: hidden` 的定尺窗口，所以这里按比例算宽度居中。
          style={{ width: Math.max(1, frameHeight * aspect), height: frameHeight }}
          resizeMode="cover"
          accessible={false}
        />
        {/* 打滑时上一张露出来的那条边缘：半透明压一层，模拟未完全过片的双重曝光 */}
        {previousSlip > 0 ? (
          <View style={[styles.overlapVeil, { width: overlap }]} pointerEvents="none" />
        ) : null}
        {ownSlip > 0 ? <View style={styles.slipMark} pointerEvents="none" /> : null}
        {selected === true ? (
          <View style={styles.frameSelected} pointerEvents="none">
            <Text style={styles.frameSelectedMark}>✓</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.frameFooter}>
        <Text style={styles.frameRailNo} numberOfLines={1}>
          {`${String(index + 1).padStart(2, '0')}${suffix}`}
        </Text>
        {codeText === null ? null : (
          <Text style={styles.frameCode} numberOfLines={1}>
            {codeText}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/* ==========================================================================
 * 切片海报（导出用）
 * ========================================================================== */

export interface StripPosterProps {
  shots: GalleryShot[];
  /** 胶卷代号（印在每张底片下面 + 海报底部）。 */
  code: string;
  /** 海报宽度（pt）。 */
  width: number;
  /** 海报长度（pt）。 */
  height: number;
  /** 截图 ref（调用方 `captureRef` 用）。 */
  shotRef: React.RefObject<ViewShotRef | null>;
  /** 底片图像就绪回调（至少一张就绪才允许截图）。 */
  onFrameLoad: () => void;
}

/**
 * 带齿孔长条切片海报。
 *
 * ⚠️ 这个组件**必须真的被渲染在屏幕上**才能截图 —— iOS 的 `drawViewHierarchyInRect`
 * 对离屏 / `opacity: 0` 的视图会得到空白图（`src/types/index.ts` 里
 * `FilmStageHost` 的注释也记了同一条约束）。所以调用方是把它铺在相册页**最上层**、
 * 盖一层半透明幕布 + 转圈，等截完再卸掉，而不是藏起来偷偷截。
 *
 * 分辨率说明：`ViewShot` 的 options 故意**不传 width/height**（官方注释：不传就是原始
 * 像素尺寸），所以成片像素 = 这里的 pt 尺寸 × 设备像素比。底片高按 748pt 算，
 * 在 3x 设备上是 2244px，整条海报宽约 1690px —— 已经超过手机屏幕分辨率。
 * 相册里那份还会被 `galleryStore` 压到 2048 长边，所以再大也只是白占内存。
 */
export function StripPoster({ shots, code, width, height, shotRef, onFrameLoad }: StripPosterProps): React.ReactElement {
  const frameHeight = POSTER_FRAME_HEIGHT;
  const frameWidths = shots.map((shot) => (shot.height > 0 ? frameHeight * (shot.width / shot.height) : frameHeight));

  return (
    <ViewShot ref={shotRef} style={[styles.poster, { width, height }]}>
      {/* 上轨：帧号暗码 */}
      <View style={[styles.posterRail, { height: POSTER_RAIL_HEIGHT }]}>
        <View style={styles.posterRailBelt}>
          {shots.map((shot, index) => (
            <Text key={shot.id} style={[styles.posterRailText, { width: frameWidths[index] + POSTER_GAP }]}>
              {frameRailText(index)}
            </Text>
          ))}
        </View>
      </View>

      {/* 底片排 */}
      <View style={styles.posterFrames}>
        {shots.map((shot, index) => {
          const previousSlip = index > 0 ? slipAt(index - 1) : 0;
          const overlap = previousSlip > 0 ? frameWidths[index] * previousSlip : 0;
          return (
            <View
              key={shot.id}
              style={{
                width: frameWidths[index],
                marginLeft: index === 0 ? 0 : POSTER_GAP,
                transform: [{ translateX: -overlap }],
              }}
            >
              <Image
                source={{ uri: shot.uri }}
                style={{ width: frameWidths[index], height: frameHeight }}
                resizeMode="cover"
                onLoad={onFrameLoad}
                fadeDuration={0}
              />
            </View>
          );
        })}
      </View>

      {/* 下轨：冲印工艺 + 胶卷代号 */}
      <View style={[styles.posterRail, { height: POSTER_RAIL_HEIGHT }]}>
        <View style={styles.posterProcessRow}>
          <Text style={styles.posterProcess}>{'PROCESS C-41'}</Text>
          <Text style={styles.posterProcess}>{`${code} · ${shots.length} FRAMES`}</Text>
        </View>
      </View>
    </ViewShot>
  );
}

/* ==========================================================================
 * 主组件
 * ========================================================================== */

/** 底片之间是否已经"咬合"过，用不上；这里只关心"带子要画多长"。 */
export interface StripLayout {
  frameWidth: number;
  frameHeight: number;
  /** 每张底片的左沿（pt，未减滚动偏移）。 */
  offsets: number[];
  /** 内容总宽（pt）。 */
  contentWidth: number;
  /** 需要画多少个齿孔（含富余）。 */
  holes: number;
}

/** 底片图像区的可用高度 = 总高 - 上下轨道 - 导出条（含它上面 4pt 呼吸）。 */
export const EXPORT_BAR_HEIGHT = 54;

/**
 * 纯函数：按可用宽度和底片数，算出整条底片的几何。
 *
 * 抽出来是为了能**单独验算**（这是本文件里唯一有算术的部分）：
 * 底片宽度取"一张不超过屏宽的 62%"与"不超过 300pt"里的小者 —— 竖拍照片在高屏上
 * 如果按 `height = 可用高` 去反算宽度，会宽到一张就占满屏，失去"长卷"的意义。
 */
export function computeStripLayout(
  availableWidth: number,
  availableHeight: number,
  shots: readonly { width: number; height: number }[],
): StripLayout {
  const usableHeight = availableHeight - RAIL_HEIGHT * 2 - EXPORT_BAR_HEIGHT;
  const frameHeight = Math.max(120, Math.min(usableHeight, 520));
  const widest = shots.reduce((max, shot) => {
    const aspect = shot.height > 0 ? shot.width / shot.height : 1;
    return Math.max(max, frameHeight * aspect);
  }, 0);
  // 一张不超过屏宽的 62%，也不超过 300pt：既能一屏看到两张，也不至于小到看不清
  const frameWidth = Math.max(140, Math.min(widest, Math.min(availableWidth * 0.62, 300)));

  const offsets: number[] = [];
  let cursor = 0;
  for (let index = 0; index < shots.length; index += 1) {
    const previousSlip = index > 0 ? slipAt(index - 1) : 0;
    // 打滑时后一张往左压 `frameWidth × slip`：间距是**被吃掉**的，不是额外加的
    cursor -= frameWidth * previousSlip;
    offsets.push(cursor);
    cursor += frameWidth + FRAME_GAP;
  }
  const contentWidth = Math.max(frameWidth, cursor);

  return {
    frameWidth,
    frameHeight,
    offsets,
    contentWidth,
    // 富余 8 个齿孔：滚到最右端时带子也不会见底
    holes: Math.ceil((contentWidth + availableWidth) / PERF_PITCH) + 8,
  };
}

export interface StripViewProps {
  shots: GalleryShot[];
  /** 当前胶卷代号（`preset.code` 之类），印在齿孔轨道和切片海报上。 */
  filmCode: string;
  /** 屏上可用的宽 / 高（pt）。调用方按安全区算好。 */
  width: number;
  height: number;
  /** 点一张底片（打开大图）。 */
  onOpen: (shot: GalleryShot) => void;
  /** 长按一张底片（删除确认）。 */
  onLongPress?: (shot: GalleryShot) => void;
  /** 切片存进系统相册后的回音文案（成功 / 失败各一句，已本地化）。 */
  onSaved: (message: string) => void;
  onFailed: (message: string) => void;
}

export function StripView(props: StripViewProps): React.ReactElement {
  const { shots, filmCode, width, height, onOpen, onLongPress, onSaved, onFailed } = props;
  const { t } = useI18n();

  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [posterReady, setPosterReady] = useState(false);

  const posterRef = useRef<ViewShotRef | null>(null);
  /** 上一次触发过片震动的"当前位置"。用它去重：同一个位置绝不震第二次。 */
  const lastSweptRef = useRef<number | null>(null);

  const layout = useMemo(
    () => computeStripLayout(width, height, shots),
    [width, height, shots],
  );

  /**
   * 帧号是一条**按吸附位置**算的直线：底片宽度 + 标准间距 = 一格的步长。
   * 故意**不**把打滑算进去 —— 打滑是"机械故障"，它不该改变"现在过到第几格"这个
   * 读数（真实机器上打滑恰恰是"过片轮咬不住"，读数会跳，但那是另一个彩蛋了）。
   */
  const sweepStep = layout.frameWidth + FRAME_GAP;

  /**
   * 过片触觉反馈。
   *
   * 任务书写的是"监听横向滚动事件，每滑过一张底片触发一次"。**没有**在 `onScroll`
   * 里做，因为 `Haptics.selectionAsync()` 是异步的：60fps 的 `onScroll` 里连发几次
   * 会让马达来不及停，手感变成一片糊；而且 `onScroll` 在惯性阶段一秒能来上百次。
   * 所以把"滑过一张"定义成**一次滑动行为落定后，停留位置与上次不同**
   * （`onMomentumScrollEnd` 只在减速结束时来一次），一次滑动 = 一声"咔哒"。
   */
  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      const next = event.nativeEvent.contentOffset.x;
      const swept = Math.round(next / sweepStep);
      if (lastSweptRef.current !== swept) {
        lastSweptRef.current = swept;
        void Haptics.selectionAsync();
      }
    },
    [sweepStep],
  );

  // ---- 切片导出：只允许连续 3 或 4 张 ------------------------------------
  const sortedSelection = useMemo(() => {
    const indexes = selectedIds
      .map((id) => shots.findIndex((shot) => shot.id === id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    return indexes;
  }, [selectedIds, shots]);

  const selectionIsContiguous =
    sortedSelection.length > 0 &&
    sortedSelection[sortedSelection.length - 1] - sortedSelection[0] === sortedSelection.length - 1;
  const selectionCount = sortedSelection.length;
  const readyToExport =
    selectionIsContiguous &&
    (STRIP_EXPORT_COUNTS as readonly number[]).includes(selectionCount);

  /**
   * 某一张现在能不能被选。
   *
   * 规则只有一条：**已有的选择必须始终是一段连续区间**。
   * 所以点一个不在区间里的格子时，只有"正好贴着区间左端或右端"的那一个能选 ——
   * 中间隔着一格的（比如已选 3、4，去点 1）会破坏连续性，直接不理它。
   * 这样用户**不可能**凑出"3 张不连续"的状态，导出路径就永远不需要处理它。
   */
  const canSelect = useCallback(
    (index: number): boolean => {
      if (sortedSelection.length === 0) {
        return true;
      }
      const first = sortedSelection[0];
      const last = sortedSelection[sortedSelection.length - 1];
      return index >= first && index <= last ? true : index === first - 1 || index === last + 1;
    },
    [sortedSelection],
  );

  const handleFramePress = useCallback(
    (shot: GalleryShot, index: number): void => {
      if (!exporting) {
        void Haptics.selectionAsync();
        onOpen(shot);
        return;
      }
      if (!canSelect(index)) {
        return;
      }
      void Haptics.selectionAsync();
      setSelectedIds((current) =>
        current.includes(shot.id) ? current.filter((id) => id !== shot.id) : [...current, shot.id],
      );
    },
    [canSelect, exporting, onOpen],
  );

  const beginExport = useCallback((): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds([]);
    setPosterReady(false);
    setExporting(true);
  }, []);

  const cancelExport = useCallback((): void => {
    setExporting(false);
    setSelectedIds([]);
    setPosterReady(false);
  }, []);

  const selectedShots = useMemo(
    () => sortedSelection.map((index) => shots[index]),
    [shots, sortedSelection],
  );

  const handleExport = useCallback(async (): Promise<void> => {
    const target = posterRef.current;
    if (!readyToExport || target === null || !posterReady) {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const uri = await target.capture();
      const saved = await saveToLibraryDetailed(uri);
      if (saved.ok) {
        onSaved(t('gallery.export.saved'));
        cancelExport();
        return;
      }
      onFailed(t('gallery.export.failed', { message: saved.message }));
    } catch (error) {
      onFailed(
        t('gallery.export.failed', {
          message: error instanceof Error && error.message.length > 0 ? error.message : String(error),
        }),
      );
    }
  }, [cancelExport, onFailed, onSaved, posterReady, readyToExport, t]);

  /**
   * 海报底片加载的兜底。
   *
   * 不用 `Promise.all` 等所有 `Image.onLoad`：iOS 上 `Image` 的 `onLoad` 在缓存命中时
   * 也可能不触发（是已知行为），真那样就永远等不到导出按钮。这里给 1800ms 上限，
   * 到点就当作"可以截了" —— 真没加载完也会截出空白底片，但**至少不是卡死**。
   */
  useEffect(() => {
    if (!exporting || posterReady) {
      return;
    }
    const timer = setTimeout(() => setPosterReady(true), 1800);
    return () => clearTimeout(timer);
  }, [exporting, posterReady]);

  // ---- 切片海报的尺寸（纯几何） ------------------------------------------
  const posterFrameHeight = POSTER_FRAME_HEIGHT;
  const posterFrameWidths = selectedShots.map((shot) =>
    shot.height > 0 ? posterFrameHeight * (shot.width / shot.height) : posterFrameHeight,
  );
  const posterWidth =
    posterFrameWidths.reduce((sum, frameWidth, index) => {
      const previousSlip = index > 0 ? slipAt(index - 1) : 0;
      return sum + frameWidth + (index === 0 ? 0 : POSTER_GAP) - frameWidth * previousSlip;
    }, 0) +
    POSTER_PADDING * 2;
  const posterHeight = posterFrameHeight + POSTER_RAIL_HEIGHT * 2 + POSTER_PADDING * 2;

  if (shots.length === 0) {
    return <View style={[styles.root, { width, height }]} />;
  }

  const railOffset = offset;

  return (
    <View style={[styles.root, { width, height }]}>
      {/* ① 上下两条贯穿轨道（在画面之前画，底片滚过去时压在它们下面 —— 和真胶片一致） */}
      <View style={[styles.railLayer, { top: 0 }]} pointerEvents="none">
        <FilmRail side="top" offset={railOffset} holes={layout.holes} />
      </View>

      {/* ② 画面：由滚动偏移驱动，整排一起平移 */}
      <View style={[styles.stripLayer, { top: RAIL_HEIGHT, height: layout.frameHeight + 26 }]} pointerEvents="box-none">
        <Animated.View
          style={[styles.strip, { transform: [{ translateX: -offset }], paddingLeft: 8 }]}
          pointerEvents="box-none"
        >
          {shots.map((shot, index) => {
            const previousSlip = index > 0 ? slipAt(index - 1) : 0;
            return (
              <FilmFrame
                key={shot.id}
                shot={shot}
                index={index}
                total={shots.length}
                frameWidth={layout.frameWidth}
                frameHeight={layout.frameHeight}
                // 间距恒为标准值：打滑靠 `translateX` 把后一张**拉回来**叠上去，
                // 而不是把间距改小 —— 后者会让整条底片的总长也变，吸附步长就跟着乱
                spacing={index === 0 ? 0 : FRAME_GAP}
                ownSlip={slipAt(index)}
                previousSlip={previousSlip}
                code={filmCode}
                selected={exporting ? selectedIds.includes(shot.id) : null}
                onPress={(pressed) => handleFramePress(pressed, index)}
              />
            );
          })}
        </Animated.View>
      </View>

      {/*
        ③ 进纸口：一个**透明**的横向 FlatList。
        它只负责三件事：滚动手势、吸附、以及让 `contentContainer` 撑出正确的滚动范围。
        画面不由它渲染 —— 见文件头 ① 的解释。
        ⚠️ 触摸必须能被它拿到（它是唯一的滚动手势来源），所以底色透明但**不能** pointerEvents none。
      */}
      <View style={[styles.scrollLayer, { top: RAIL_HEIGHT, height: layout.frameHeight + 26 }]}>
        <FlatList
          data={shots}
          horizontal
          keyExtractor={(shot) => shot.id}
          showsHorizontalScrollIndicator={false}
          bounces
          decelerationRate="fast"
          snapToInterval={sweepStep}
          snapToAlignment="start"
          onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          contentContainerStyle={styles.scrollContent}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => handleFramePress(item, index)}
              onLongPress={onLongPress === undefined ? undefined : () => onLongPress(item)}
              delayLongPress={420}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${index + 1} / ${shots.length}`}
              style={{ width: layout.frameWidth + FRAME_GAP, height: layout.frameHeight + 26 }}
            />
          )}
        />
      </View>

      {/* ④ 下轨 */}
      <View style={[styles.railLayer, { top: RAIL_HEIGHT + layout.frameHeight + 26 }]} pointerEvents="none">
        <FilmRail side="bottom" offset={railOffset} holes={layout.holes} />
      </View>

      {/* ⑤ 切片导出的控制条（贴在底片区之下，不压住下轨） */}
      <View style={[styles.exportBar, { top: RAIL_HEIGHT + layout.frameHeight + 26 + 4 }]}>
        {!exporting ? (
          <Pressable onPress={beginExport} style={styles.exportEntry} accessibilityRole="button" accessibilityLabel={t('gallery.export.entry')}>
            <Text style={styles.exportEntryText}>{t('gallery.export.entry')}</Text>
          </Pressable>
        ) : (
          <>
            {/*
              提示文案的三条分支：
              · 选够了连续 3/4 张 → 直接读回"这 N 张"（屏幕上就不重复第二遍了）
              · 还没选够但**仍然连续** → "再选 N 张"（N = 离 3 张还差几张）
              · 退化成不连续（理论上进不来，`canSelect` 会拦住）→ 说清是"连续"这个条件没满足。
                这一条必须有：`gallery.export.hint` 的文案是"再选 {count} 张"，如果这里硬算
                `3 - 2 = 1`，用户会看到"再选 1 张"却怎么点都点不上（他多选了一张不连续的），
                那是纯误导。宁可多说一句"要连着选"。
            */}
            <Text style={styles.exportHint} numberOfLines={2}>
              {readyToExport
                ? t('gallery.export.a11y', { count: selectionCount })
                : selectionIsContiguous
                  ? t('gallery.export.hint', { count: Math.max(1, 3 - selectionCount) })
                  : t('gallery.export.hint', { count: selectionCount })}
            </Text>
            {/*
              导出键**一直存在**（只置灰），不做"满足条件才出现"：
              按钮凭空出现/消失会让人以为点错了；置灰明确表示"还有个条件没满足"。
              `disabled` 同时把 VoiceOver 的可聚焦状态标成不可用，不必再额外加 a11y 说明。
            */}
            <Pressable
              onPress={() => void handleExport()}
              disabled={!readyToExport || !posterReady}
              style={readyToExport && posterReady ? styles.exportGo : styles.exportGoDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !readyToExport || !posterReady }}
              accessibilityLabel={t('gallery.export.a11y', { count: selectionCount })}
            >
              <Text style={styles.exportGoText}>{t('gallery.export.entry')}</Text>
            </Pressable>
            <Pressable onPress={cancelExport} style={styles.exportCancel} accessibilityRole="button" accessibilityLabel={t('gallery.cancel')}>
              <Text style={styles.exportCancelText}>{t('gallery.cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>

      {/*
        ⑥ 切片海报本体：**铺在最上层、真的渲染出来**才能截图（离屏截不到）。
        导出进行中时用一层幕布盖住它，用户看到的是"拼合中"，看不到这张半成品。
        幕布在 ViewShot **之外**，所以不会被截进海报。
      */}
      {exporting && selectedShots.length > 0 ? (
        <View style={styles.posterStage} pointerEvents="none">
          <StripPoster
            shots={selectedShots}
            code={filmCode}
            width={posterWidth}
            height={posterHeight}
            shotRef={posterRef}
            onFrameLoad={() => setPosterReady(true)}
          />
        </View>
      ) : null}
      {exporting && !posterReady ? (
        <View style={styles.busyVeil} pointerEvents="auto">
          <ActivityIndicator color={INK.amberSoft} />
          <Text style={styles.busyText}>{t('gallery.export.busy')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ==========================================================================
 * 样式
 * ========================================================================== */

const styles = StyleSheet.create({
  root: {
    backgroundColor: DARKROOM,
    overflow: 'hidden',
  },
  railLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: RAIL_HEIGHT,
    overflow: 'hidden',
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: RAIL_HEIGHT,
    backgroundColor: RAIL,
    overflow: 'hidden',
  },
  railTop: {
    top: 0,
  },
  railBottom: {
    bottom: 0,
  },
  railBelt: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  perforation: {
    position: 'absolute',
    top: (RAIL_HEIGHT - PERF_HEIGHT) / 2,
    width: PERF_WIDTH,
    height: PERF_HEIGHT,
    borderRadius: PERF_RADIUS,
    // 用底色"盖"出镂空：真抠洞要上 mask，代价大得多，而观感完全一样
    backgroundColor: DARKROOM,
  },
  stripLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  scrollLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  frameSlot: {
    alignItems: 'flex-start',
  },
  frameSlotMuted: {
    opacity: 0.45,
  },
  frameSlotPressed: {
    opacity: 0.75,
  },
  frameWindow: {
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlapVeil: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(232, 228, 220, 0.10)',
  },
  slipMark: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 2,
    bottom: 0,
    backgroundColor: 'rgba(210, 139, 42, 0.75)',
  },
  frameSelected: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(18, 18, 18, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameSelectedMark: {
    color: '#E5A93C',
    fontSize: 13,
    lineHeight: 16,
  },
  frameFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 3,
    height: 18,
  },
  frameRailNo: {
    color: INK.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  frameCode: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  exportBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: EXPORT_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  exportEntry: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportEntryText: {
    color: INK.paper,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1,
  },
  exportHint: {
    flexShrink: 1,
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  exportGo: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 169, 60, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5A93C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 置灰态。**只降不透明度、不缩尺寸** —— 尺寸一变，按钮会在选够的那一刻
   * 跳到新位置，正要点的手指就落空了。
   */
  exportGoDisabled: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 169, 60, 0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: INK.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  exportGoText: {
    color: '#E5A93C',
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1,
  },
  exportCancel: {
    minHeight: 40,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCancelText: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 1,
  },
  posterStage: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poster: {
    backgroundColor: DARKROOM,
    padding: POSTER_PADDING,
  },
  posterRail: {
    backgroundColor: RAIL,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterRailBelt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  posterRailText: {
    color: INK.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 26,
    letterSpacing: 2,
  },
  posterFrames: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  posterProcessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  posterProcess: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 24,
    letterSpacing: 3,
  },
  busyVeil: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(10, 10, 12, 0.94)',
  },
  busyText: {
    color: INK.paperDim,
    fontFamily: UI_MONO,
    fontSize: 12,
    letterSpacing: 2,
  },
});
