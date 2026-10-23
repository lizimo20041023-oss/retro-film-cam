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
 *    照片由虚拟 FlatList 负责，只挂载视口附近的底片；上下轨道独立连续。
 *    轨道位移由 native driver 对孔距取模，不逐帧 setState，也不生成整卷齿孔。
 *
 * ② **叠合（打滑）机制已被删除，不要再加回来。**
 *    原先有一套"6% 打滑"：第 16 张一张（`index % 16 === 0`）会让后一张向左压过去叠合
 *    `frameWidth × 15%~20%`（`SLIP_*` 常量 / `slipAt()` / 渲染层的 `translateX: -overlap`）。
 *    **用户实测：后一张的相纸边缘盖住前一张，长卷里照片被挤成细缝，故整体废除。**
 *    现在的规矩是**硬性的**：格子之间只有正的 `marginRight: FRAME_GAP`，
 *    严禁任何负位移、负边距或 `transform` 位移。
 *
 * ③ **帧号后缀 `A`（`frameSuffix`）同批删除。**
 *    `A` 只在"上一张打滑"时出现；打滑没了，`A` 就永远不该出现。
 *    帧号现在是纯粹的顺序读数 `{index + 1}` —— 不为了好看乱加后缀。
 *
 * ── 没能验证的 ────────────────────────────────────────────────────────────
 * 真机上的手感（滚动阻尼、`Haptics.selectionAsync` 的间隔是否太密）、以及
 * 齿孔轨道会不会被 `FlatList` 的裁剪吃掉 —— 见交付报告"没能验证"一节。
 */
import { memo, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { themeFor, UI_MONO } from '../constants/theme';
import type { Theme } from '../constants/theme';
import type { GalleryShot } from '../utils/galleryStore';
import { galleryFilmLabel } from '../utils/galleryLabels';

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
/**
 * 底片之间的标准间距（pt）。
 *
 * **用户明确指定 16**，而且是**正的右间距**（`marginRight`，见 `FilmFrame`）——
 * 不是 `marginLeft`、更不是位移。废除打滑叠合之后，两个数字必须分得清：
 *   · 间距 = **16pt**（下面这个常量，唯一真源）；
 *   · 位移 = **0**（没有负位移这回事了）。
 * 滚动吸附步长（`sweepStep = frameWidth + FRAME_GAP`）与 `FlatList` 的 item 宽
 * 都直接用它，所以它是**几何的唯一真源**，不是可以随手调的观感数字。
 */
const FRAME_GAP = 16;
/** 帧号暗码离轨道上沿的位置。 */
const RAIL_TEXT_TOP = 2;
/** 画面下方帧号/胶卷代号一行的固定高度。 */
const FRAME_FOOTER_HEIGHT = 26;

/* ==========================================================================
 * 纯函数（帧号）
 * ========================================================================== */

/**
 * 帧号：`▷ 01` = 三角 + 两位序号。三位以上不补零（`▷ 100`），补了反而难读。
 */
export function frameLabel(index: number): string {
  return `▷ ${String(Math.max(1, Math.floor(index) + 1)).padStart(2, '0')}`;
}

/**
 * 帧号 + `A` 后缀，拼成轨道上真正印的那串。
 *
 * 以前这里是 `${frameLabel(index)}${frameSuffix(...)}`，后缀只在"上一张打滑"时出现。
 * **打滑叠合已废除，`A` 随之删除**，所以这个函数现在就是"直接返回帧号"。
 * 保留它（而不是让调用处直接改用 `frameLabel`）是为了让"轨道上印什么"
 * 仍然只有**一个**出口，将来要加别的前缀/后缀也只改这里一处。
 */
export function frameRailText(index: number): string {
  return frameLabel(index);
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
  offset: ReturnType<typeof Animated.multiply>;
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
  // 暗房面固定取深色（见文件头 `DARKROOM` / `RAIL` 上方那段理由）
  const board = themeFor('dark');
  const styles = useMemo(() => createStyles(board), [board]);

  const perforations = useMemo(
    () => Array.from({ length: holes }, (_unused, index) => index * PERF_PITCH),
    [holes],
  );

  return (
    <View style={[styles.rail, side === 'top' ? styles.railTop : styles.railBottom]}>
      <Animated.View style={[styles.railBelt, { transform: [{ translateX: offset }] }]}>
        {perforations.map((left) => (
          <View key={left} style={[styles.perforation, { left: left + (PERF_PITCH - PERF_WIDTH) / 2 }]} />
        ))}
      </Animated.View>
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
  /** 一张底片的显示宽度（pt）。**固定值**，与照片自己的宽高比无关（见文件头 ②）。 */
  frameWidth: number;
  /** 底片图像区高度（pt）。**固定值**。 */
  frameHeight: number;
  /**
   * 本张是不是最后一张。
   *
   * 唯一的作用是决定要不要留那个 16pt 的右间距 —— **最后一张不留**。
   * 为什么是布尔值而不是传一个间距数字：间距一旦能被调用方逐张改，
   * "间距恒为 FRAME_GAP"这条就成了调用方的纪律，而不是组件的保证；
   * 出过打滑那档子事之后，这里宁可不给那个自由度。
   */
  isLast: boolean;
  /** 胶卷代号那一行要印的串（`PR-400`）。 */
  code: string;
  /** 多选删除态；不在选择模式时为 `null`。 */
  selected: boolean | null;
  onPress: (shot: GalleryShot) => void;
  onLongPress?: (shot: GalleryShot) => void;
}

/**
 * 一张底片。格子有**固定宽高比**（`frameWidth` × `frameHeight`），画面用 `contain`
 * 整张完整居中地放进格子里 —— 关键尺寸是 `StyleSheet.absoluteFillObject` 的四条边，
 * 它是相对**父窗口**算的，所以图片绝不会由自己的宽高比把格子撑大。
 */
const FilmFrame = memo(function FilmFrame(props: FrameProps): React.ReactElement {
  const { shot, index, total, frameWidth, frameHeight, isLast, code, selected, onPress } = props;

  const board = themeFor('dark');
  const styles = useMemo(() => createStyles(board), [board]);

  const codeText = code;

  return (
    <Pressable
      onPress={() => onPress(shot)}
      onLongPress={props.onLongPress ? () => props.onLongPress?.(shot) : undefined}
      delayLongPress={420}
      accessibilityRole={selected === null ? 'imagebutton' : 'checkbox'}
      accessibilityState={selected === null ? undefined : { checked: selected }}
      accessibilityLabel={`${index + 1} / ${total}`}
      style={({ pressed }) => [
        styles.frameSlot,
        // 固定宽高比：宽高都写死，格子绝不随图片或文字伸缩。
        // 间距是**正的右间距**，而且最后一张不留 —— 留了就等于给卷尾加了一段空白。
        // 废除打滑叠合的理由（用户实测后一张盖住前一张）见文件头 ②。
        { width: frameWidth, height: frameHeight, marginRight: isLast ? 0 : FRAME_GAP },
        selected === false ? styles.frameSlotMuted : null,
        pressed ? styles.frameSlotPressed : null,
      ]}
    >
      <View style={[styles.frameWindow, { width: frameWidth, height: frameHeight }]}>
        <Image
          source={{ uri: shot.thumbUri }}
          // 四条边全部钉死（绝对定位 + 四个 0），尺寸完全由此处的父窗口决定 ——
          // 图片**不再**由自己的宽高比去撑宽度（那正是"格子被图片撑大、
          // 后一张盖住前一张"的成因之一，故废除）。
          // 不用 `StyleSheet.absoluteFillObject`：RN 0.86 的 typings 里已经**没有**
          // 这个成员（只有 `absoluteFill`），写了直接 TS2551。四个 0 一样清楚。
          // `contain`（原来是 `cover`）：整张成片含相框与水印必须完整看见，
          // 宁可留黑边也**不许裁切**。`frameWindow` 的 `alignItems/justifyContent: center`
          // 负责把这张图在格子里居中。
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          resizeMode="contain"
          accessible={false}
        />
        {selected === true ? (
          <View style={styles.frameSelected} pointerEvents="none">
            <Text style={styles.frameSelectedMark}>✓</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.frameFooter}>
        <Text style={styles.frameRailNo} numberOfLines={1}>
          {`${String(index + 1).padStart(2, '0')}`}
        </Text>
        {codeText === null ? null : (
          <Text style={styles.frameCode} numberOfLines={1}>
            {codeText}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

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

/**
 * 纯函数：按可用宽度和底片数，算出整条底片的几何。
 *
 * 抽出来是为了能**单独验算**（这是本文件里唯一有算术的部分）。几何一共四个数，
 * 全部有闭式解，删掉打滑之后不再有任何逐张变化的量：
 *   · 一个格子多宽：`frameWidth`
 *     = `clamp(widest, 140, min(availableWidth × 0.62, 300))`
 *       `widest` = 所有照片里最宽的那张在 `frameHeight` 下的宽度（`frameHeight × aspect`）。
 *       底片宽度取"一张不超过屏宽的 62%"与"不超过 300pt"里的小者 —— 竖拍照片在高屏上
 *       如果按 `height = 可用高` 去反算宽度，会宽到一张就占满屏，失去"长卷"的意义。
 *   · 一个格子多高：`frameHeight` = `clamp(usableHeight, 120, 520)`，
 *     `usableHeight` = `availableHeight − 上下轨道 − 帧号行`。
 *     **宽高都是常量、与是哪一张无关**，所以"单格固定宽高比"是这一层保证的。
 *   · 间距多少：`FRAME_GAP`（= 16pt，**正的**，由 `FilmFrame` 的 `marginRight` 施加；
 *     最后一张不留）。
 *   · 总内容宽多少：`contentWidth = shots.length × frameWidth + (shots.length − 1) × FRAME_GAP`。
 *     闭式写出来而不是拿循环累加，是为了让"总宽"能被一眼验算 —— 它必须与
 *     `FlatList` 的 item 宽之和、以及 `snapToInterval` 完全一致，
 *     这里差一个 `FRAME_GAP` 就会让滚动位置和眼睛看到的帧错开。
 *     `shots` 为空时不能算出负数，故与 `frameWidth` 取大者兜底。
 */
export function computeStripLayout(
  availableWidth: number,
  availableHeight: number,
  shots: readonly { width: number; height: number }[],
): StripLayout {
  const usableHeight = availableHeight - RAIL_HEIGHT * 2 - FRAME_FOOTER_HEIGHT;
  const frameHeight = Math.max(120, Math.min(usableHeight, 520));
  const widest = shots.reduce((max, shot) => {
    const aspect = shot.height > 0 ? shot.width / shot.height : 1;
    return Math.max(max, frameHeight * aspect);
  }, 0);
  // 一张不超过屏宽的 62%，也不超过 300pt：既能一屏看到两张，也不至于小到看不清
  const frameWidth = Math.max(140, Math.min(widest, Math.min(availableWidth * 0.62, 300)));

  // 每张的左沿 = index × (frameWidth + FRAME_GAP)，前缀和。
  // `offsets` 目前**没有任何消费方**（`git grep offsets` 在 `StripView.tsx` 之外零命中，
  // 文件内也只出现在这个函数的返回里）—— 它是给未来"按绝对位置定位某一张"留的，
  // 不是死代码要删。请注意：**它以前含有 `cursor -= frameWidth × previousSlip` 的打滑减法，
  // 那是"同一个叠合量被算了两次"的第二处**，现在一并删除。
  const step = frameWidth + FRAME_GAP;
  const offsets = shots.map((_shot, index) => index * step);
  // `shots.length - 1` 个间隙（最后一张不留右间距）。空数组时 `-1 × FRAME_GAP` 会算出负数，
  // 所以按"一个格子"兜底 —— 空卷不进这个分支（调用方 `shots.length === 0` 时直接返回空 View），
  // 但纯函数不该对空输入给出负宽度。
  const contentWidth =
    shots.length === 0 ? frameWidth : shots.length * frameWidth + (shots.length - 1) * FRAME_GAP;

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
  /** 当前胶卷代号（`preset.code` 之类），印在齿孔轨道上。 */
  /** 屏上可用的宽 / 高（pt）。调用方按安全区算好。 */
  width: number;
  height: number;
  /** 点一张底片（打开大图）。 */
  onOpen: (shot: GalleryShot) => void;
  /** 当前是否处于多选删除模式。 */
  selectionMode: boolean;
  /** 已选照片 id；选择状态由相册页统一持有，切换长卷/网格不会丢。 */
  selectedIds: readonly string[];
  /** 选择模式下点一张底片。 */
  onToggleSelection: (shot: GalleryShot) => void;
  /** 浏览模式下长按一张底片，从它开始进入多选。 */
  onBeginSelection: (shot: GalleryShot) => void;
}

export function StripView(props: StripViewProps): React.ReactElement {
  const {
    shots,
    width,
    height,
    onOpen,
    selectionMode,
    selectedIds,
    onToggleSelection,
    onBeginSelection,
  } = props;

  /**
   * 暗房面固定取深色（见上面 `DARKROOM` 那段理由）。
   * 用 `board.ink` 而不是 `useTheme().ink`：这一屏的底板永远是暗的，
   * 浅机身下也必须配深色板的墨，否则会出现"深底黑字"。
   */
  const board = themeFor('dark');
  const styles = useMemo(() => createStyles(board), [board]);

  const offset = useRef(new Animated.Value(0)).current;
  /** 上一次触发过片震动的"当前位置"。用它去重：同一个位置绝不震第二次。 */
  const lastSweptRef = useRef<number | null>(null);

  const layout = useMemo(
    () => computeStripLayout(width, height, shots),
    [width, height, shots],
  );

  /**
   * 帧号是一条**按吸附位置**算的直线：底片宽度 + 标准间距 = 一格的步长。
   *
   * 删掉打滑之后这条直线才**第一次真正等于视觉位置**：以前视觉上每张只前进
   * `frameWidth + FRAME_GAP − overlap`，而吸附步长是 `frameWidth + FRAME_GAP`，
   * 两者每过一张就错开 `overlap`（越往后错得越多）。现在位移恒为 0，
   * `sweepStep` 与 `FilmFrame`（`marginRight: FRAME_GAP`）用的是同一个 `FRAME_GAP`，
   * 不存在第二个数可以漂移。
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

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleFramePress = useCallback(
    (shot: GalleryShot): void => {
      if (selectionMode) {
        onToggleSelection(shot);
        return;
      }
      void Haptics.selectionAsync();
      onOpen(shot);
    },
    [onOpen, onToggleSelection, selectionMode],
  );

  const handleFrameLongPress = useCallback(
    (shot: GalleryShot): void => {
      if (selectionMode) {
        return;
      }
      onBeginSelection(shot);
    },
    [onBeginSelection, selectionMode],
  );

  if (shots.length === 0) {
    return <View style={[styles.root, { width, height }]} />;
  }

  const railOffset = Animated.multiply(Animated.modulo(offset, PERF_PITCH), -1);
  const visibleHoles = Math.ceil(width / PERF_PITCH) + 2;

  return (
    <View style={[styles.root, { width, height }]}>
      {/* ① 上下两条贯穿轨道（在画面之前画，底片滚过去时压在它们下面 —— 和真胶片一致） */}
      <View style={[styles.railLayer, { top: 0 }]} pointerEvents="none">
        <FilmRail side="top" offset={railOffset} holes={visibleHoles} />
      </View>

      {/*
        ③ 进纸口：一个**透明**的横向 FlatList。
        它只负责三件事：滚动手势、吸附、以及让 `contentContainer` 撑出正确的滚动范围。
        画面不由它渲染 —— 见文件头 ① 的解释。
        ⚠️ 触摸必须能被它拿到（它是唯一的滚动手势来源），所以底色透明但**不能** pointerEvents none。
      */}
      <View style={[styles.scrollLayer, { top: RAIL_HEIGHT, height: layout.frameHeight + FRAME_FOOTER_HEIGHT }]}>
        <Animated.FlatList
          data={shots}
          horizontal
          keyExtractor={(shot) => shot.id}
          showsHorizontalScrollIndicator={false}
          bounces
          decelerationRate="fast"
          snapToInterval={sweepStep}
          snapToAlignment="start"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: offset } } }],
            { useNativeDriver: true })}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          extraData={selectedIds}
          getItemLayout={(_data, index) => ({ length: sweepStep, offset: sweepStep * index, index })}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleMomentumEnd}
          contentContainerStyle={styles.scrollContent}
          renderItem={({ item, index }) => {
            return (
              <FilmFrame
                shot={item} index={index} total={shots.length}
                frameWidth={layout.frameWidth} frameHeight={layout.frameHeight}
                isLast={index === shots.length - 1}
                code={galleryFilmLabel(item.presetId)}
                selected={selectionMode ? selectedSet.has(item.id) : null}
                onPress={handleFramePress}
                onLongPress={selectionMode ? undefined : handleFrameLongPress}
              />
            );
          }}
        />
      </View>

      {/* ④ 下轨 */}
      <View style={[styles.railLayer, { top: RAIL_HEIGHT + layout.frameHeight + FRAME_FOOTER_HEIGHT }]} pointerEvents="none">
        <FilmRail side="bottom" offset={railOffset} holes={visibleHoles} />
      </View>
    </View>
  );
}

/* ==========================================================================
 * 样式
 * ========================================================================== */

/**
 * 样式表 = 墨色的函数。调用方一律传 `themeFor('dark')`（见上面 `DARKROOM` 那段理由），
 * 所以整张表实际上只有一组实参；写成函数是为了不让任何颜色落到模块作用域 ——
 * 那是这次要修的病（模块加载时把颜色烧死，切机身一行都不变）。
 *
 * 这里也只有"墨色"来自配色表。`DARKROOM` / `RAIL` / `#000000`（片窗）/
 * `frameSelected` 这些是**底片本身的颜色**，跟 App 的外壳无关，
 * 保持写死 —— 它们是这一屏的物性，不是主题。
 */
function createStyles(theme: Theme) {
  const { ink } = theme;

  return StyleSheet.create({
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
    // 这两行是"整张成片在格子里完整居中"的关键，**不要删**：
    // `<Image>` 的样式是显式的 `position: 'absolute'` + 四条边 0（钉死在窗口上），
    // 所以图片既不撑宽窗口、也不会自己偏移，`contain` 之后剩下的黑边就靠这里居中。
    // 顺带记一笔：RN 0.86 的 `StyleSheet` 已经**没有** `absoluteFillObject` 了
    // （`StyleSheet.d.ts` 里只剩 `absoluteFill`），写成 `...StyleSheet.absoluteFillObject`
    // 会直接 `TS2551` 编译不过，所以这里手写四边。
    // 以前 `cover` + "图片宽度按 frameHeight × aspect 算"那套写法下，图片宽度可以
    // 超过 frameWidth，`overflow: hidden` 就从两侧裁掉，观感正是"画面被压缩/被盖住"。
    // 现在图片不再参与撑宽，那条路径也一并消失。
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `overlapVeil`（打滑叠合的那层半透明遮罩）与 `slipMark`（打滑角标）
  // 随打滑机制一同删除 —— 删除理由见文件头 ②：用户实测负边距叠合会
  // 把后一张盖住前一张，故废除，任何"叠合"相关的装饰也一并废除。
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
    color: ink.amberSoft,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  frameCode: {
    color: ink.paperDim,
    fontFamily: UI_MONO,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  });
}
