/**
 * 四颗胶囊（三颗可滑参数 + 一颗六档离散强度）的手势层 + 状态机。渲染全在 `ViewfinderBar`（那个文件是所有几何常量的
 * 所有者，本文件单向 import 它）。
 *
 * ── 真机上两个 bug 的根因与本轮的治法（task-6）──────────────────────────────
 * ① 「展开后是个空洞灰框」：上一轮把几何常量放在本文件、`ViewfinderBar` 反向 import，
 *    形成 require 环，对方在模块顶层读到的全是 `undefined`，刻度数算出 NaN →
 *    `Array.from({ length: NaN })` = 零根刻度。现在几何归 `ViewfinderBar` 所有，
 *    本文件只读不写，环没了。
 * ② 「焦段边滑边切镜头、卡死在 13~15mm」：上一轮的焦段是**连续**映射，而且
 *    `uAtFocalMm` 的段判据把"绝对对数比"当成"段长"，任何 ≤26mm 的输入都返回 0 →
 *    `offsetAtValue('zoom', 26)` 落在轴的最左端（-720px），展开瞬间指针下的值就是
 *    13.0mm；第一次越过抖动阈值就 `onFocal` → 父级换物理镜头 → 会话重配 → 手势被打断，
 *    于是读数停在 13~15mm 一带。本轮的治法是把焦段**改成有限档位**：
 *    · 轻点胶囊 → 原地展开分段胶囊条（13/26/35/52，有长焦档才多一档）；
 *    · 滑选只改**本组件内的 preview 高亮**，一次 `onFocal` 都不发；
 *    · **松手时才提交一次** `onFocal(mm, role, factor)`，物理镜头切换因此只可能发生在
 *      用户明确落脚的那一刻（这是 Lead 点名要的工程判断）。
 *    连续映射的那套函数（`uAtFocalMm` / `focalMmAt` / `focalMmToOffset` / `FOCAL_SPAN_PX`）
 *    整段删掉了 —— 坏在算术里的东西，留着只会有第二次。
 *
 * ── 性能红线（文件头写死的两条，别违反）────────────────────────────────────
 * · 色温/曝光拖动时**绝不**每帧改 `CameraScreen` 的 state：值按 25ms 节流上报；
 * · 尺子位移走 `Animated.Value`（`scroll.setValue`），与"值的同步"是两条独立路径。
 * 焦段滑选期间**一次上报都没有**（只改本地 preview 高亮），开销比色温/曝光还低。
 */
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';

import { PRESET_INTENSITY_OPTIONS } from '../constants/intensity';
import { ASSUMED_LENS_NATIVE_MM, TELEPHOTO_FOCAL_STOP, ZOOM_STOPS, factorToZoom } from '../constants/lenses';
import { useCapsuleAutoHide } from '../hooks/useCapsuleAutoHide';
import type { ZoomLensRole, ZoomStop } from '../constants/lenses';
import { useI18n } from '../i18n';
import {
  DIAL_PAD_H,
  DIAL_WIDTH_FRACTION,
  ViewfinderBar,
  buildCapsules,
  capsuleHitZones,
  capsuleRowWidth,
  focalSegmentIndexAtOffset,
  focalSegmentInnerWidth,
  formatIntensityTier,
  formatScrubExposure,
  formatScrubTemperature,
  rulerPhase,
} from './ViewfinderBar';
import type { CapsuleParameter, ScrubbableParameter } from './ViewfinderBar';
import type { PresetIntensityTier } from '../types';

export type { CapsuleParameter, ScrubbableParameter };

/**
 * 长按判定 160ms：比 iOS 的 500ms 长按短得多，因为这里的"长按"只是"我要开始调了"，
 * 不是上下文菜单；160ms 又足够过滤掉真正的轻点（实验性的手感值，本轮没有真机可校）。
 */
const HOLD_MS = 160;
/**
 * 抖动阈值 5pt：手指按下时的天然位移在这个量级以内，超过它才算"我在滑"。
 * 5 也是 iOS 上点按手势的常见容差，和系统手感一致。
 */
const TAP_SLOP = 5;
/**
 * 色温/曝光松手后 350ms 收拢：留出"我可能还要接着调"的窗口 —— 只要在这段时间里再次
 * 按下，`clearCollapse` 就把收拢取消（不会闪一下再展开）。350ms 大约是"看一眼读数再
 * 决定要不要继续"的时间。
 */
const COLLAPSE_DELAY_MS = 350;
/**
 * 焦段松手后 500ms 收拢（用户指定）：焦段是离散档位，用户松手后往往要**核对**
 * 一下画面有没有切过去（换镜头有可见的跳变），比色温/曝光多给 150ms。
 */
const FOCAL_COLLAPSE_DELAY_MS = 500;
/**
 * 上报节流 50ms：20Hz（v1.8.6 · 契约 §5）。
 *
 * v1.8.5 及以前是 25ms / 40Hz。那次节流只挡住了"每帧多次 setState"，却没挡住
 * "每 25ms 就重渲染一次**整个相机屏**"——曝光/色温这两个值住在 `CameraScreen` 顶层，
 * 每报一次就带着取景器、相框预览、控制台一起走一遍 React render。原生侧
 * （`exposure` prop / 色温矩阵）本来就跟不上 60fps 的写入，40Hz 里有一半是白渲染。
 *
 * 20Hz 仍然高于人眼对"读数跟手"的分辨阈值（拖动时数字看起来是连续的），
 * 而每秒的整屏渲染次数直接减半。松手时 `flushPending` 会把最后一档补发出去
 * —— 所以降频**不会**吞掉最终值，只是拖动途中的中间帧少了一半。
 */
const EMIT_INTERVAL_MS = 50;
/**
 * 色温每像素 0.02/6、曝光每像素 0.1/8：这两个数是"一格刻度 = 多少值"定的 ——
 * 色温一格 0.02（两位小数的最小可视单位）、曝光一格 0.1 EV（1/3 档的 0.3 倍，
 * 手感上"推一格"就是一个可读的读数变化）。除以 6 / 8 是因为刻度间距是 8pt、
 * 而一个可读变化跨 6~8pt，滑起来才不觉得"太灵"。
 */
const WB_PER_PX = 0.02 / 6;
const EV_PER_PX = 0.1 / 8;
const WB_MIN = -1;
const WB_MAX = 1;
const EV_MIN = -2;
const EV_MAX = 2;
/** 归零吸附：尺子离 0 的位移在 6pt 以内就当用户想归零（≈0.02 色温 / 0.075 EV）。 */
const ZERO_MAGNET_PX = 6;
/** 触感分档：色温 0.05、曝光 0.1 EV —— 与读数的最小可视变化同量级。 */
const WB_HAPTIC_STEP = 0.05;
const EV_HAPTIC_STEP = 0.1;

/** 只有色温/曝光有连续刻度尺；焦段是离散档位，没有尺子。 */
type ExtractableDial = 'wb' | 'ev';

/**
 * 焦段四档的**丝印毫米数**不再另抄一张表（v1.8.4）：`ZOOM_STOPS[i].focalMm` 就是它。
 *
 * 上一版之所以要一张 `FOCAL_STOPS_MM`，是因为 `wide14` 的数学倍率是 1.4
 * （26 × 1.4 = 36.4mm）、而丝印是 35mm —— 两个数不得不分开记。v1.8.4 的 35 档把
 * `digitalFactor` 钉成 `35/26`，丝印与画面严格一致（26 × 35/26 = 35mm），一张表就够。
 */

/** 一个可选焦段档位。`stopIndex` 指回 `ZOOM_STOPS`（长焦段是 -1，它不在四档表里）。 */
export interface FocalOption {
  readonly mm: number;
  readonly multiplier: number;
  readonly role: ZoomLensRole;
  /**
   * 刻度尺这一档要写的**原生**倍率因子：`handleFocalScrub` 会用
   * `factorToZoom(factor)` 把它换成 `CameraView.zoom`。
   *
   * 注意它**不是** `ZoomStop.digitalFactor`：档位按钮（`applyStop`）走布局裁切、
   * 原生 zoom 恒 0；刻度尺的连续行程沿用 v1.8.3 口径（原生 zoom 落点），
   * 两条路各走各的确定性通道，但读数在同一个丝印值上对齐。
   * 长焦段恒为 1（原生 zoom 0 = 那支镜头的完整视场）。
   */
  readonly factor: number;
  readonly zoom: number;
  readonly stopIndex: number;
}

/**
 * 毫米数落在 `ZOOM_STOPS` 的哪一档。父级 `CameraScreen` 也 import 这个函数
 * （`setStopIndex` 要用它），所以它必须是纯函数、不依赖组件状态。
 *
 * 判据 = 相邻两档丝印毫米数的中点（13/26 → 19.5、26/35 → 30.5、35/52 → 43.5）。
 * `> 52mm`（长焦段的连续行程）取最后一档 —— 长焦不在四档表里，`stopIndex` 只能
 * 对齐到 52；读数与镜头由 `handleFocalScrub` 的 `scrubFocal` 负责。
 */
export function focalStopIndex(focalMm: number): number {
  const lastIndex = Math.max(0, ZOOM_STOPS.length - 1);
  for (let index = 1; index < ZOOM_STOPS.length; index += 1) {
    const lower = ZOOM_STOPS[index - 1];
    const upper = ZOOM_STOPS[index];
    if (lower === undefined || upper === undefined) {
      continue;
    }
    const boundary = (lower.focalMm + upper.focalMm) / 2;
    if (focalMm < boundary) {
      return index - 1;
    }
  }
  return lastIndex;
}

/**
 * 刻度尺这一档要写的原生倍率因子。
 *
 * 13 / 26 段不放大（1）；35 / 52 段按「相对主摄原生视场」的倍率写原生 zoom
 * （35/26 / 2）—— 这条连续行程**不经过** `digitalFactor` 布局裁切（见
 * `FocalOption.factor`），所以不能直接用档位表里的 `digitalFactor`。长焦段恒为 1。
 */
function rulerFactorFor(stop: ZoomStop): number {
  return stop.lens === 'wide' ? Math.max(1, stop.focalMm / ASSUMED_LENS_NATIVE_MM.wide) : 1;
}

/**
 * 这一步能给出哪些焦段档位。
 *
 * `focalMinMm` 由父级按"超广角到底能不能用"给（判据在 `lenses.ts` 的 `resolveStop`）；
 * `focalMaxMm` 只有在父级确认长焦可用时才给 —— 长焦段会切物理镜头，
 * **判不出来就宁可不给**，不能凭猜把一个可能不存在的镜头挂上去。
 *
 * 返回值 = 四档表里落在 `[focalMinMm, focalMaxMm]` 的档 + **可选的长焦光学段**
 * （`TELEPHOTO_FOCAL_STOP`，它不在 `ZOOM_STOPS` 里，所以 `stopIndex: -1`）。
 */
export function buildFocalOptions(input: {
  readonly focalMinMm: number;
  readonly focalMaxMm: number | undefined;
}): readonly FocalOption[] {
  const options: FocalOption[] = [];
  for (let index = 0; index < ZOOM_STOPS.length; index += 1) {
    const stop = ZOOM_STOPS[index];
    if (stop === undefined) {
      continue;
    }
    if (stop.focalMm < input.focalMinMm) {
      continue;
    }
    if (input.focalMaxMm !== undefined && stop.focalMm > input.focalMaxMm) {
      continue;
    }
    const factor = rulerFactorFor(stop);
    options.push({
      mm: stop.focalMm,
      multiplier: stop.multiplier,
      role: stop.lens,
      factor,
      // 刻度尺的路由 `factorToZoom` 现算：v1.8.4 四档的 `zoom` 恒 0（档位按钮走
      // `digitalFactor` 布局裁切），而刻度尺要的是 0.10721 / 0.25 这类连续落点。
      zoom: factorToZoom(factor),
      stopIndex: index,
    });
  }
  // 长焦光学段（不在四档表里）：只有父级确认长焦可用（`focalMaxMm` 给到 77）时才加。
  if (input.focalMaxMm !== undefined && input.focalMaxMm >= TELEPHOTO_FOCAL_STOP.focalMm) {
    options.push({
      mm: TELEPHOTO_FOCAL_STOP.focalMm,
      multiplier: TELEPHOTO_FOCAL_STOP.multiplier,
      role: TELEPHOTO_FOCAL_STOP.lens,
      factor: 1,
      zoom: 0,
      stopIndex: -1,
    });
  }
  return options;
}

/**
 * 分段条里"毫米数最接近 `focalMm`"的那一段。只在**精确匹配不到**时用：
 * 父级没给 `focalMaxMm` 而用户已经站在长焦档上（例如用无障碍动作切过去）时，
 * 分段条里根本没有 77mm 这一段，此时高亮必须落在最接近的一段（52mm），
 * 而不是 `findIndex` 失败的 -1。
 */
function nearestFocalOptionIndex(options: readonly FocalOption[], focalMm: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === undefined) {
      continue;
    }
    const distance = Math.abs(option.mm - focalMm);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** 色温/曝光的尺子位移函数：`value → offset`（线性，最大值在 0、最小值在最左）。 */
export function offsetAtValue(dial: ExtractableDial, value: number): number {
  const clamped = clampToDial(dial, value);
  const perPx = dial === 'wb' ? WB_PER_PX : EV_PER_PX;
  const max = dial === 'wb' ? WB_MAX : EV_MAX;
  return (clamped - max) / perPx;
}

/** `offset → value`，与 `offsetAtValue` 严格互逆（都是线性映射，没有分段）。 */
export function valueAtOffset(dial: ExtractableDial, offset: number): number {
  const perPx = dial === 'wb' ? WB_PER_PX : EV_PER_PX;
  const max = dial === 'wb' ? WB_MAX : EV_MAX;
  return clampToDial(dial, max + offset * perPx);
}

function clampToDial(dial: ExtractableDial, value: number): number {
  const min = dial === 'wb' ? WB_MIN : EV_MIN;
  const max = dial === 'wb' ? WB_MAX : EV_MAX;
  return Math.min(Math.max(value, min), max);
}

/** 尺子的位移范围：最大值对齐 0，最小值在最左。 */
function rulerRange(dial: ExtractableDial): { readonly min: number; readonly max: number } {
  return { min: offsetAtValue(dial, dial === 'wb' ? WB_MIN : EV_MIN), max: 0 };
}

/**
 * 离 0 够近就吸附（"一键归零"的手滑版本）。
 *
 * 导出只为让本轮的探针能直接调它（任务板点名要断言零吸附的边界）；它是纯函数、
 * 没有副作用，导出不改变运行行为。
 */
export function magnetToZero(dial: ExtractableDial, offset: number, value: number): number {
  const zeroOffset = offsetAtValue(dial, 0);
  return Math.abs(offset - zeroOffset) <= ZERO_MAGNET_PX ? 0 : value;
}

interface GestureState {
  dial: CapsuleParameter | null;
  /** `tap` = 还没越过抖动阈值；`scrub` = 已经在滑。 */
  mode: 'tap' | 'scrub';
  /** 长按定时器已经开过刻度尺（这次手势就不是轻点了）。 */
  held: boolean;
  startedAt: number;
  /** 色温/曝光：按下瞬间的尺子位移，之后所有位移都相对它算（所以不会跳）。 */
  startOffset: number;
  offset: number;
  value: number;
  /** 被节流压住、还没上报的值；松手时补发。 */
  pending: number | null;
  lastEmitAt: number;
  lastTick: number;
  /** 焦段：当前预览到第几档 + 这次手势是否真的换过档。 */
  focalIndex: number;
  focalChanged: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  collapseTimer: ReturnType<typeof setTimeout> | null;
}

export interface ParameterScrubBarProps {
  temperature: number;
  focalMm: number;
  exposure: number;
  /** 「预设强度」当前档（六档；AUTO 由场景引擎按拍摄画面决定）。 */
  intensityTier: PresetIntensityTier;
  /** 当前实际挂着的镜头（父级给，用于显示与可用性判断）。 */
  focalRole: ZoomLensRole;
  /** 能到的最小焦距：没有超广角时父级给主摄的 26mm。 */
  focalMinMm: number;
  /** 能到的最大焦距：父级确认长焦可用时才给（见 `buildFocalOptions`）。 */
  focalMaxMm?: number;
  onTemperature: (value: number) => void;
  onFocal: (focalMm: number, role: ZoomLensRole, factor: number) => void;
  onExposure: (value: number) => void;
  /** 强度换档：轻点某一段即提交（强度是离散档位，没有滑选预览的中间态）。 */
  onIntensityTier: (tier: PresetIntensityTier) => void;
  /** VoiceOver 的"上一档/下一档"（也是键盘/无障碍的换档路径）。 */
  onCycleFocal: () => void;
  /**
   * 父级的「用户刚轻触取景器对焦」信号：**单调递增整数**，每变一次唤醒一次胶囊
   * 并重新计时。
   *
   * 为什么用计数器而不是传一个 `wake()` 函数进来：胶囊行是**本组件**渲染的，
   * 父级手上没有这个 hook 的实例；传函数会让父级每帧重建回调（依赖数组写不干净），
   * 而"值一变就唤醒"用 `useEffect(..., [wakeSignal])` 就能表达，探针也好驱动。
   * 缺省（父级没接）时行为退化为"只按参数变化唤醒"，不会报错。
   */
  wakeSignal?: number;
}

function ParameterScrubBarInner({
  temperature,
  focalMm,
  exposure,
  intensityTier,
  focalRole,
  focalMinMm,
  focalMaxMm,
  onTemperature,
  onFocal,
  onExposure,
  onIntensityTier,
  onCycleFocal,
  wakeSignal,
}: ParameterScrubBarProps) {
  const { t } = useI18n();
  const { width: windowWidth } = useWindowDimensions();
  const [active, setActive] = useState<CapsuleParameter | null>(null);
  const [focalPreview, setFocalPreview] = useState<number | null>(null);
  const scroll = useRef(new Animated.Value(0)).current;

  /**
   * 胶囊的自动隐藏（v1.8.0 · 模块三）。
   *
   * `locked: active !== null` 是**声明式**的那把锁：只要有色温/曝光尺子或焦段分段条
   * 处于展开态，胶囊就常亮 —— 用户明说了"操作中途不许隐藏"，而展开态本来就意味着
   * 用户正在调它（滑选、核对档位）。拖动那把锁是**命令式**的 `lock()/unlock()`，
   * 两者独立，谁在场都算锁住。
   */
  const {
    opacity: capsulesOpacity,
    translateY: capsulesTranslateY,
    hidden: capsulesHidden,
    pointerEvents: capsulesPointerEvents,
    wake: wakeCapsules,
    lock: lockCapsules,
    unlock: unlockCapsules,
  } = useCapsuleAutoHide({ locked: active !== null });
  const gesture = useRef<GestureState>({
    dial: null,
    mode: 'tap',
    held: false,
    startedAt: 0,
    startOffset: 0,
    offset: 0,
    value: 0,
    pending: null,
    lastEmitAt: 0,
    lastTick: 0,
    focalIndex: -1,
    focalChanged: false,
    holdTimer: null,
    collapseTimer: null,
  });

  const focalOptions = useMemo(
    () => buildFocalOptions({ focalMinMm, focalMaxMm }),
    [focalMinMm, focalMaxMm],
  );
  /**
   * 最后一次展开的是哪个盘：收拢的 180ms 里 `active` 已经是 `null`，但面板还在淡出，
   * 读数不能在这一瞬间变成另一个盘的。`ViewfinderBar` 里也有一份同样的记忆
   * （它负责渲染），两份必须一致：所以两边都用"最后一个非 null 值"这条同样的规则。
   */
  const lastActive = useRef<CapsuleParameter>('ev');
  if (active !== null) {
    lastActive.current = active;
  }
  const shownDial = active ?? lastActive.current;

  /**
   * 响应器只建一次，所以要读的 props 全部镜像到 `latest`。
   * `words` 也在里面：命中区与渲染层必须用**同一批**胶囊宽度，而宽度依赖文案
   * （语言不同、中文词长度不同），谁都不知道对方拿到的是哪一版文案 —— 用同一个
   * `buildCapsules` + 同一份 props 就够了。
   */
  const latest = useRef({
    temperature,
    focalMm,
    exposure,
    intensityTier,
    focalOptions,
    focalMinMm,
    onTemperature,
    onFocal,
    onExposure,
    onIntensityTier,
    windowWidth,
    words: {
      wb: t('camera.bar.temp'),
      zoom: t('camera.bar.focal'),
      ev: t('camera.bar.ev'),
      intensity: t('camera.bar.intensity'),
    } as Record<CapsuleParameter, string>,
  });
  useEffect(() => {
    latest.current = {
      temperature,
      focalMm,
      exposure,
      intensityTier,
      focalOptions,
      focalMinMm,
      onTemperature,
      onFocal,
      onExposure,
      onIntensityTier,
      windowWidth,
      words: {
        wb: t('camera.bar.temp'),
        zoom: t('camera.bar.focal'),
        ev: t('camera.bar.ev'),
        intensity: t('camera.bar.intensity'),
      },
    };
  });

  /**
   * 唤醒的两条外部通路。
   *
   * ① `wakeSignal`：父级在"轻触取景器对焦"时自增，用户抬手前胶囊就该亮回来 ——
   *    对焦那一下说明用户在看画面，而参数行是画面的一部分。
   * ② 参数值本身变化：`temperature / focalMm / exposure` 是**权威真值**，它变了就说明
   *    有人在动参数（本组件拖的，或父级自己改的 —— 例如对焦滑条同步 EV、换卷归零、
   *    翻转相机重置）。与其在每个调用点各写一次 `wake()`，不如盯着真值：
   *    漏掉任何一条新通路都不会让胶囊在使用中溜走。
   *
   * 两者都走 `wake()`：它清旧表、起新表，所以连续触发也只会有一张表在跑。
   */
  const wakeSignalValue = wakeSignal ?? 0;
  useEffect(() => {
    wakeCapsules();
  }, [wakeSignalValue, wakeCapsules]);
  useEffect(() => {
    wakeCapsules();
  }, [temperature, focalMm, exposure, wakeCapsules]);

  const clearHold = useCallback(() => {
    const state = gesture.current;
    if (state.holdTimer !== null) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
  }, []);

  const clearCollapse = useCallback(() => {
    const state = gesture.current;
    if (state.collapseTimer !== null) {
      clearTimeout(state.collapseTimer);
      state.collapseTimer = null;
    }
  }, []);

  const scheduleCollapse = useCallback(
    (delay: number) => {
      clearCollapse();
      gesture.current.collapseTimer = setTimeout(() => {
        gesture.current.collapseTimer = null;
        setActive(null);
        setFocalPreview(null);
      }, delay);
    },
    [clearCollapse],
  );

  // 卸载时把两个定时器收掉：定时器里会 setState，组件没了就是泄漏与警告。
  useEffect(
    () => () => {
      clearHold();
      clearCollapse();
    },
    [clearCollapse, clearHold],
  );

  const currentValue = useCallback((dial: ExtractableDial) => {
    const { temperature: wb, exposure: ev } = latest.current;
    return dial === 'wb' ? wb : ev;
  }, []);

  /** 立即上报（节流的出口，也是松手时的补发口）。**焦段永远不会走到这里。** */
  const emit = useCallback((dial: ExtractableDial, value: number) => {
    if (dial === 'wb') {
      latest.current.onTemperature(value);
      return;
    }
    latest.current.onExposure(value);
  }, []);

  const openDial = useCallback(
    (dial: CapsuleParameter) => {
      clearCollapse();
      setActive(dial);
      if (dial === 'zoom' || dial === 'intensity') {
        setFocalPreview(null);
        return;
      }
      const value = currentValue(dial);
      const state = gesture.current;
      state.value = value;
      state.offset = offsetAtValue(dial, value);
      state.lastTick = value;
      // 尺子对齐到当前值的相位。焦段没有尺子，所以这里也不碰 `scroll`。
      scroll.setValue(rulerPhase(state.offset));
    },
    [clearCollapse, currentValue, scroll],
  );

  const pushValue = useCallback(
    (dial: ExtractableDial, value: number) => {
      const state = gesture.current;
      const now = Date.now();
      if (now - state.lastEmitAt >= EMIT_INTERVAL_MS) {
        state.lastEmitAt = now;
        state.pending = null;
        emit(dial, value);
        return;
      }
      state.pending = value;
    },
    [emit],
  );

  /** 把位移换算成值：尺子走 `Animated`（不进 React），值走 50ms 节流（进父级 state）。 */
  const applyScrub = useCallback(
    (dial: ExtractableDial, offset: number) => {
      const state = gesture.current;
      const range = rulerRange(dial);
      const clamped = Math.min(Math.max(offset, range.min), range.max);
      state.offset = clamped;
      scroll.setValue(rulerPhase(clamped));
      const value = magnetToZero(dial, clamped, valueAtOffset(dial, clamped));
      state.value = value;
      pushValue(dial, value);
      const step = dial === 'wb' ? WB_HAPTIC_STEP : EV_HAPTIC_STEP;
      if (Math.abs(value - state.lastTick) >= step) {
        state.lastTick = value;
        void Haptics.selectionAsync();
      }
    },
    [pushValue, scroll],
  );

  /** 把 `pageX` 换算成"焦段分段条的第几段"。几何函数与渲染层共用（见 ViewfinderBar）。 */
  const focalIndexAtPageX = useCallback((pageX: number) => {
    const { windowWidth: width, focalOptions: options } = latest.current;
    if (options.length === 0) {
      return -1;
    }
    const left = width / 2 - (width * DIAL_WIDTH_FRACTION) / 2 + DIAL_PAD_H;
    return focalSegmentIndexAtOffset(
      pageX - left,
      focalSegmentInnerWidth(width),
      options.length,
    );
  }, []);

  /** 把 `pageX` 换算成「预设强度」六档里的第几档（几何与渲染层共用 focalSegment*）。 */
  const intensityIndexAtPageX = useCallback((pageX: number) => {
    const { windowWidth: width } = latest.current;
    const left = width / 2 - (width * DIAL_WIDTH_FRACTION) / 2 + DIAL_PAD_H;
    return focalSegmentIndexAtOffset(
      pageX - left,
      focalSegmentInnerWidth(width),
      PRESET_INTENSITY_OPTIONS.length,
    );
  }, []);

  /** 把胶囊行的 `pageX` 换算成"按到了哪一颗"。 */
  const dialAtPageX = useCallback((pageX: number) => {
    const { windowWidth: width, ...rest } = latest.current;
    const specs = buildCapsules({ ...rest, windowWidth: width });
    const rowLeft = (width - capsuleRowWidth(specs)) / 2;
    const x = pageX - rowLeft;
    const zone = capsuleHitZones(specs).find((candidate) => x >= candidate.from && x <= candidate.to);
    return zone?.dial ?? null;
  }, []);

  /** 焦段滑选：只改本地预览，**一次 props 回调都不发**（松手才提交）。 */
  const previewFocal = useCallback((index: number) => {
    const state = gesture.current;
    if (index < 0 || index === state.focalIndex) {
      return;
    }
    state.focalIndex = index;
    state.focalChanged = true;
    setFocalPreview(index);
    void Haptics.selectionAsync();
  }, []);

  /** 焦段提交：整个手势里**只调用一次**，就是用户松手（或轻点某一段）的那一刻。 */
  const commitFocal = useCallback((index: number) => {
    const option = latest.current.focalOptions[index];
    if (option === undefined) {
      return;
    }
    latest.current.onFocal(option.mm, option.role, option.factor);
  }, []);

  const handleRelease = useCallback(
    (event: GestureResponderEvent) => {
      const state = gesture.current;
      const dial = state.dial;
      if (dial === null) {
        return;
      }
      const wasTap = state.mode === 'tap' && !state.held;
      clearHold();

      if (dial === 'intensity') {
        if (active === null) {
          // 收拢态轻点 = 原地展开六档条；长按不松手没有额外语义，也收拢。
          if (wasTap) {
            openDial('intensity');
            return;
          }
          setActive(null);
          return;
        }
        // 展开态轻点某一段 = 直接提交这一档（强度是离散档位，没有滑选预览）。
        if (wasTap) {
          const index = intensityIndexAtPageX(event.nativeEvent.pageX);
          const option = PRESET_INTENSITY_OPTIONS[index];
          if (option !== undefined) {
            void Haptics.selectionAsync();
            latest.current.onIntensityTier(option.id);
          }
        }
        scheduleCollapse(COLLAPSE_DELAY_MS);
        return;
      }

      if (dial === 'zoom') {
        if (state.mode === 'scrub') {
          // 滑选结束：提交一次，然后按用户指定的 500ms 收拢。
          if (state.focalChanged && state.focalIndex >= 0) {
            commitFocal(state.focalIndex);
          }
          scheduleCollapse(FOCAL_COLLAPSE_DELAY_MS);
          return;
        }
        if (wasTap && active !== null) {
          // 已经展开：轻点某一段 = 选它（换档才提交），点在同一档上就是"我看完了"。
          const index = focalIndexAtPageX(event.nativeEvent.pageX);
          const option = latest.current.focalOptions[index];
          if (index >= 0 && option !== undefined && option.mm !== Math.round(latest.current.focalMm)) {
            commitFocal(index);
          }
          scheduleCollapse(FOCAL_COLLAPSE_DELAY_MS);
          return;
        }
        // 轻点收拢态 = 原地展开分段条；长按不松手在焦段上没有别的语义，也收拢。
        if (active === null && wasTap) {
          openDial('zoom');
          return;
        }
        setActive(null);
        return;
      }

      if (wasTap) {
        // 色温/曝光：轻触（或双击）一键归零。值为 0 时静默，不做无意义的震动。
        const value = currentValue(dial);
        if (Math.abs(value) > 1e-6) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        emit(dial, 0);
        if (active !== null) {
          scheduleCollapse(COLLAPSE_DELAY_MS);
        }
        return;
      }
      // 滑完松手：补发被节流压住的最后一帧，然后 350ms 后收拢。
      if (state.pending !== null) {
        emit(dial, state.pending);
        state.pending = null;
      }
      scheduleCollapse(COLLAPSE_DELAY_MS);
    },
    [
      active,
      clearHold,
      commitFocal,
      currentValue,
      emit,
      focalIndexAtPageX,
      intensityIndexAtPageX,
      openDial,
      scheduleCollapse,
    ],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        /**
         * **捕获阶段**就接管：四颗胶囊的点击/长按/滑动全在这里判，子视图不参与。
         * 为什么必须在捕获阶段：这个 View 里还有 `LiquidGlassView` 与 `Text`，
         * 让它们先拿到触摸会多一层不确定；而"按在哪一颗"本来就是纯坐标问题。
         */
        onStartShouldSetPanResponderCapture: (event) => {
          const state = gesture.current;
          const pageX = event.nativeEvent.pageX;
          // 已经有盘展开时，整个外壳都归它 —— 用户是在"接着滑"，不是在点别的胶囊。
          const dial = active !== null ? active : dialAtPageX(pageX);
          if (dial === null) {
            return false;
          }
          /**
           * 从按下的这一刻起**锁住**胶囊：手指还在屏幕上，参数行就不能自己淡走。
           *
           * 为什么锁在这里而不是长按展开那一刻：轻点也会改参数（归零/循环焦段），
           * 而且用户按下时就已经在"用"这一行了。锁是引用计数，配套的 `unlock()` 只写在
           * `onPanResponderRelease` / `onPanResponderTerminate` 两处 —— 一旦被授予响应者
           * 身份，这两个回调里必有一个会跑，所以计数不会漏。
           */
          lockCapsules();
          clearCollapse();
          state.dial = dial;
          state.mode = 'tap';
          state.held = false;
          state.startedAt = Date.now();
          state.pending = null;
          state.focalChanged = false;
          state.focalIndex = -1;
          if (dial === 'zoom') {
            // 焦段：按下不展开（轻点才展开），但要记下当前档，滑选时好比较。
            const index = focalIndexAtPageX(pageX);
            state.focalIndex = index;
            setFocalPreview(null);
            return true;
          }
          if (dial === 'intensity') {
            // 强度：同样按下不展开；六档条是轻点即选，没有滑动/长按语义。
            setFocalPreview(null);
            return true;
          }
          const value = currentValue(dial);
          state.value = value;
          state.offset = offsetAtValue(dial, value);
          state.startOffset = state.offset;
          state.lastTick = value;
          // 色温/曝光：按住 160ms 展开刻度尺（不松手就能直接滑，这是上一轮定下的手感）。
          clearHold();
          state.holdTimer = setTimeout(() => {
            state.holdTimer = null;
            if (state.dial !== dial || state.mode !== 'tap') {
              return;
            }
            state.held = true;
            openDial(dial);
          }, HOLD_MS);
          return true;
        },
        /** 不放手：正在调的盘不能被原生视图（比如相机预览）抢走。 */
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: (event, gestureState: PanResponderGestureState) => {
          const state = gesture.current;
          const dial = state.dial;
          if (dial === null) {
            return;
          }
          if (state.mode === 'tap') {
            if (Math.abs(gestureState.dx) <= TAP_SLOP) {
              return;
            }
            // 越过抖动阈值 = 用户在滑，长按展开作废，直接展开并进入滑动。
            clearHold();
            state.mode = 'scrub';
            state.held = true;
            if (dial === 'zoom') {
              openDial('zoom');
              previewFocal(focalIndexAtPageX(event.nativeEvent.pageX));
              return;
            }
            openDial(dial);
          }
          if (dial === 'zoom') {
            previewFocal(focalIndexAtPageX(event.nativeEvent.pageX));
            return;
          }
          if (dial === 'intensity') {
            // 强度是离散档位：拖动没有语义，等松手时按落点选档。
            return;
          }
          applyScrub(dial, state.startOffset + gestureState.dx);
        },
        onPanResponderRelease: (event) => {
          handleRelease(event);
          gesture.current.dial = null;
          /**
           * 松手 = 解锁 + 从这一刻**重新计时**。
           *
           * 为什么先解后唤：`unlock()` 在还有别的锁时会保持可见，只有全部解开才起表；
           * 紧接着的 `wake()` 保证"刚调完参数"的这 3 秒一定从头算，而不是接着按下的
           * 那一刻算 —— 否则快速调完再松手，胶囊可能瞬间就淡走了。
           */
          unlockCapsules();
          wakeCapsules();
        },
        /**
         * 手势被系统抢走（来电、多任务手势、别的手势识别器赢了）。**焦段绝不在这里
         * 提交**：用户没有明确落脚，就不该换物理镜头 —— 宁可这次滑动白做。
         */
        onPanResponderTerminate: () => {
          const state = gesture.current;
          clearHold();
          if (
            state.dial !== null &&
            state.dial !== 'zoom' &&
            state.dial !== 'intensity' &&
            state.mode === 'scrub'
          ) {
            if (state.pending !== null) {
              emit(state.dial, state.pending);
              state.pending = null;
            }
            scheduleCollapse(COLLAPSE_DELAY_MS);
          } else {
            setActive(null);
            setFocalPreview(null);
          }
          state.dial = null;
          // 手势被抢走也要解锁并重新计时：用户没有放手，但这一轮交互已经结束了。
          unlockCapsules();
          wakeCapsules();
        },
      }),
    [
      active,
      applyScrub,
      clearCollapse,
      clearHold,
      currentValue,
      dialAtPageX,
      emit,
      focalIndexAtPageX,
      handleRelease,
      lockCapsules,
      openDial,
      previewFocal,
      scheduleCollapse,
      unlockCapsules,
      wakeCapsules,
    ],
  );

  // ── 无障碍与键盘路径（手势层不在 VoiceOver 的路径上，所以这三条必须单列）────
  const handleActivate = useCallback(
    (dial: CapsuleParameter) => {
      if (dial === 'zoom') {
        openDial('zoom');
        return;
      }
      if (dial === 'intensity') {
        openDial('intensity');
        return;
      }
      // 色温/曝光：展开 + 归零。展开是为了让读数可见（否则用户只听到结果）。
      openDial(dial);
      emit(dial, 0);
    },
    [emit, openDial],
  );

  const handleAdjust = useCallback(
    (dial: CapsuleParameter, direction: 1 | -1) => {
      if (dial === 'zoom') {
        onCycleFocal();
        return;
      }
      if (dial === 'intensity') {
        const currentIndex = Math.max(
          0,
          PRESET_INTENSITY_OPTIONS.findIndex((option) => option.id === latest.current.intensityTier),
        );
        const nextIndex = Math.min(
          Math.max(currentIndex + direction, 0),
          PRESET_INTENSITY_OPTIONS.length - 1,
        );
        const option = PRESET_INTENSITY_OPTIONS[nextIndex];
        if (option !== undefined) {
          latest.current.onIntensityTier(option.id);
        }
        openDial('intensity');
        return;
      }
      const step = dial === 'wb' ? WB_HAPTIC_STEP : EV_HAPTIC_STEP;
      const next = clampToDial(dial, currentValue(dial) + step * direction);
      openDial(dial);
      emit(dial, next);
    },
    [currentValue, emit, onCycleFocal, openDial],
  );

  const desiredStop = focalStopIndex(focalMm);
  const exactOptionIndex = focalOptions.findIndex((option) => option.stopIndex === desiredStop);
  /**
   * 高亮哪一段：
   * 优先按"父级给的真实焦段落在哪一档"；父级**没给** `focalMaxMm` 时，分段条里可能
   * 没有当前档（比如用户用无障碍动作切到了 77mm 长焦，而这里只列了 13/26/35/52）——
   * 那就退到"毫米数最接近的那一段"，绝不能让高亮跳回第一段，否则读数（77mm）和
   * 高亮（13mm）会互相打脸。
   */
  const activeOptionIndex = exactOptionIndex >= 0 ? exactOptionIndex : nearestFocalOptionIndex(focalOptions, focalMm);
  const focalActiveIndex = activeOptionIndex >= 0 ? activeOptionIndex : 0;
  const reading =
    shownDial === 'wb'
      ? formatScrubTemperature(temperature)
      : shownDial === 'ev'
        ? formatScrubExposure(exposure)
        : shownDial === 'intensity'
          ? formatIntensityTier(intensityTier)
          : `${Math.round(focalMm)}mm`;

  return (
    /**
     * 最外层只做三件事：挂手势、在隐藏时把触摸**整体**放行、把无障碍元素一起摘掉。
     *
     * `pointerEvents` 换成 `'none'`（而不是只把 `opacity` 调到 0）的理由：透明但仍在
     * 命中的视图会把取景器上的"轻触对焦"吃掉 —— 那时用户看到的是空画面，点哪儿都不该
     * 有反应，但实际会落在四颗看不见的胶囊上，去开底片抽屉或把参数归零。
     *
     * `accessibilityElementsHidden` / `importantForAccessibility` 同理：VoiceOver 的
     * 焦点不该落在一行已经淡走的控件上（可见性靠 `opacity`，无障碍树不会自己跟着变）。
     */
    <View
      style={styles.root}
      pointerEvents={capsulesPointerEvents}
      accessibilityElementsHidden={capsulesHidden}
      importantForAccessibility={capsulesHidden ? 'no-hide-descendants' : 'auto'}
      {...responder.panHandlers}
    >
      <Animated.View
        style={[
          styles.hideLayer,
          { opacity: capsulesOpacity, transform: [{ translateY: capsulesTranslateY }] },
        ]}
      >
        <ViewfinderBar
          active={active}
          reading={reading}
          temperature={temperature}
          focalMm={focalMm}
          exposure={exposure}
          intensityTier={intensityTier}
          scroll={scroll}
          focalOptions={focalOptions}
          focalActiveIndex={focalActiveIndex}
          previewIndex={focalPreview}
          onActivate={handleActivate}
          onAdjust={handleAdjust}
        />
      </Animated.View>
    </View>
  );
}

export const ParameterScrubBar = memo(ParameterScrubBarInner);

// ── 样式 ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  /**
   * 手势带挂在这条**满宽**的带上，而不是那 86% 的外壳上。
   *
   * 为什么：命中判定本来就用绝对 `pageX` 算（`dialAtPageX` / `focalIndexAtPageX`），
   * 挂在满宽上只是让"按在胶囊外面"也能被明确判成"不是我的触摸"，不必依赖 View 边界
   * 与 86% 百分比宽度之间的换算；少一层换算就少一处会漂的地方。
   * `alignSelf: 'stretch'` 同时给内层的 86% 宽度一个确定的父宽。
   */
  root: { alignSelf: 'stretch', alignItems: 'center' },
  /**
   * 淡出/位移挂在**内层**，不挂 `root`。
   *
   * 为什么：`root` 是手势带，它自己的边界就是"触摸会不会被交给我"的判据（按在视图
   * 边界外的手势根本不会派发到它的捕获回调）。把 `translateY` 加在 `root` 上，退场那
   * 200ms 里边界会跟着往下走 —— 手指正好在这一刻落下就会落在一个正在挪的框外。让手势带
   * 永远待在原位、只让里面的内容动，命中区域就是稳定的。
   * 两层都是 `alignSelf: 'stretch'`，宽度链没变，内层 86% 的参照仍然是满屏的 `barLayer`。
   */
  hideLayer: { alignSelf: 'stretch', alignItems: 'center' },
});
