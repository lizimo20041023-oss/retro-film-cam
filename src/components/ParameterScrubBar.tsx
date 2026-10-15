/**
 * 参数刻度尺（色温 / 焦段 / 曝光）：三颗胶囊的"单击快切 + 长按展开刻度尺 + 不松手接着滑"。
 *
 * 为什么要有这个东西：现在的三颗胶囊只能"点一下跳一格"（焦段循环、色温/曝光归零），
 * 想从 +0.4 拧到 −0.2 得反复按，而且每按一次都断一次视线。真机上最自然的动作其实是
 * "按住不放，直接左右搓"——像拧老相机的环。所以这里把三种手势收进同一个响应器：
 *   ① 短按（< 160ms 且水平位移 < 5px）→ 保留原来的快切语义，老手感不丢；
 *   ② 长按（>= 160ms）或一按住就拖 → 就地展开刻度尺，而且**不用抬手**；
 *   ③ 松手 → 延迟 350ms 收拢，恢复三颗并排胶囊。
 *
 * 为什么"刻度尺自己动"和"参数值上报"必须是两条路径（本文件最要紧的一条）：
 * `Animated.Value` 的位移跑在原生侧，不经过 React 渲染；而把值写回 `CameraScreen`
 * 会触发 `resolvePreset` 这类 `useMemo` 重算、并让整棵取景器树重新 diff —— 上一版
 * 真机反馈的"掉帧"正是每帧 setState 造成的（README §28.2）。所以两条路径彻底分开：
 *   · 手指每移动一像素 → 只改 `Animated.Value`（零 React 开销，60fps）；
 *   · 参数值 → 每 25ms 最多上报一次（40Hz），且只在真的跨了一格时才报。
 * 于是 UI 树一秒最多重建 40 次，而且重建的是"值"而不是"位置"。
 *
 * 为什么不用 react-native-reanimated：项目里没装（README §1 的依赖清单），新增依赖会
 * 给打包机的 pod 安装多加一个可能失败的点。这里需要的只是"一个数字被反复改、一个
 * transform 跟着变"，RN 内置的 `Animated` + `PanResponder` 完全够用。
 *
 * 分工与依赖方向：本文件是**被 `ViewfinderBar` 依赖的下层**——几何常量、读数换算
 * （纯函数）、命中区、以及手势状态机都在这儿；`ViewfinderBar` 只画两个状态的样子
 * （收拢态三颗胶囊 / 展开态那把尺子）。单向依赖，不会出现 `require` 循环。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { ZoomLensRole } from '../constants/lenses';
import { ViewfinderBar } from './ViewfinderBar';

/** 三颗胶囊对应的参数键，同时也是"当前哪把尺子展开着"的状态（null = 收拢）。 */
export type ScrubbableParameter = 'wb' | 'zoom' | 'ev';

/* ==========================================================================
 * 一、手势判定（160ms / 5px / 350ms / 25ms 四个数字的来历都在这一节）
 * ======================================================================== */

/**
 * 短按与长按的分界线（毫秒）。
 *
 * 160ms 的来历：iOS 系统级长按识别器的默认阈值是 0.5s（`UILongPressGestureRecognizer`
 * 的 `minimumPressDuration`），那个时长对"按住搓参数"太久——用户会以为按坏了。
 * 但也不能短到和轻点混淆：一次干脆的轻点，按下到抬起实测集中在 80~140ms。
 * 160ms 卡在"比最慢的轻点还慢一点、又比系统长按快两倍"的缝隙里，是这两头之间
 * 唯一说得通的取值。它**只决定展开时机**，不影响已经展开之后的跟手程度。
 */
const HOLD_MS = 160;

/**
 * 短按允许的最大水平位移（点）。
 *
 * 5px 的来历：手指按在玻璃胶囊上天然会横向漂 2~3pt，而"有意搓一下"的最小位移实测
 * 在 8~10pt 以上。5px 正好卡在噪声上沿、有意位移下沿，于是两件事同时成立：
 *   · 抖动不会把一次轻点判成搓动（色温从 0.28 飘成 0.30 是最恼人的那种 bug）；
 *   · 一按住就明显往一边搓的用户，也不会被误判成短按而归零。
 * 这个判断**只在抬起那一刻做一次**（`onPanResponderRelease`），不在移动过程中做，
 * 所以它对拖动本身的跟手程度零影响。
 */
const TAP_SLOP = 5;

/**
 * 松手后多久收拢刻度尺（毫秒）。
 *
 * 350ms 的来历：收拢 = 三颗胶囊重新布局 + 玻璃圆角从 24 变回 15，是"看得见的重排"。
 * 手感上要同时满足两件事：① 收得比 200ms 还快，会让"松手"和"缩回去"粘在一起，
 * 像被弹开；② iOS 上"用户还能反悔"的窗口大致是 300~400ms 这个量级。
 * 350ms 落在中间：足够看清自己松手后停在哪个读数，也不至于让想接着再搓一下的人干等。
 */
const COLLAPSE_DELAY_MS = 350;

/**
 * 参数值上报给父级的节流间隔（毫秒）。
 *
 * 25ms ≈ 40Hz。为什么不干脆每帧都报（16.7ms）：父级每次 `setState` 都要重算
 * `resolvePreset`、重建 `useMemo` 链，并把新的 `exposureBias` 下发原生；60Hz 下这条链
 * 会吃满一帧的预算——那正是 README §28.2 记的掉帧。40Hz 已经看不出台阶
 * （旋钮类控件的刷新率下限通常取 30Hz），同时给主线程留出约 40% 的空档。
 * 为什么不用 `requestAnimationFrame` 节流：rAF 跟着 JS 帧走，主线程一忙它自己也被
 * 推迟，"限速"就退化成"不限速"；`setTimeout` 走的是墙上时钟，才是真正的上限。
 */
const EMIT_INTERVAL_MS = 25;

/* ==========================================================================
 * 二、刻度尺几何
 * （8px 间距 / 12px 主刻度 / 6px 次刻度 / 0.85 与 0.35 / 18×2 指针 / 86% × 48 玻璃）
 * ======================================================================== */

/**
 * 刻度线间距（点）。8px 的来历：390pt 宽的机身上尺窗内沿约 300pt，8px 一格给出约 38 格
 * ——足够让"我在中间偏右一点点"这种位置感成立，又不会密到糊成一条灰带
 * （6px 以下，1pt 细线之间开始出现摩尔纹）。
 */
export const MARK_GAP = 8;
/** 主刻度线高（点）：明显长于次刻度，用来做"整档"的视觉锚。 */
export const MARK_MAJOR = 12;
/** 次刻度线高（点）：主刻度的一半，只负责密度感。 */
export const MARK_MINOR = 6;
/** 主刻度透明度。0.85 是"看得清、又不像一个 UI 元件"的上限。 */
export const MARK_MAJOR_ALPHA = 0.85;
/** 次刻度透明度。0.35 刚好在实时取景的噪点上仍然连成一条线。 */
export const MARK_MINOR_ALPHA = 0.35;

/**
 * 静止基准指针：高 18px、宽 2px。
 *
 * 为什么比最高的刻度线（12px）还长 6px：指针要"跨"在刻度阵列之上，读起来才是
 * "一把尺在下面走、一根针钉在中间"，而不是"其中一根刻度特别亮"。
 * 宽 2px 是 1pt 细线在 Retina 上的最小可辨宽度（1px 会被抗锯齿磨成半透明灰）。
 */
export const POINTER_HEIGHT = 18;
export const POINTER_WIDTH = 2;
/** 尺窗高度：指针上下各留 3px，否则展开时它会顶进玻璃的圆角里。 */
export const RULER_VIEWPORT_HEIGHT = POINTER_HEIGHT + 6;

/** 展开态整体尺寸：宽 86% 屏宽、高 48px（规格给定）。 */
export const DIAL_WIDTH_RATIO = '86%';
export const DIAL_HEIGHT = 48;

/**
 * 收拢态每颗胶囊的宽与间距（点）。
 *
 * 为什么要**定宽**而不是让内容撑开：按住胶囊时"按在了哪一颗上"必须在按下那一刻就
 * 知道（`onStartShouldSetPanResponderCapture` 里就要判定），而内容撑开的宽度只有
 * 渲染之后量得到。定宽之后命中区可以从几何直接算出来（见 `COLLAPSED_HIT_ZONES`），
 * 不用等一次 `onLayout` 回报，也不会出现"首帧按了没反应"。
 *
 * 86pt 的来历：三颗定为 86 + 8 + 86 + 8 + 86 = 274pt，比原来按内容撑开的
 * （约 76/70/84）宽一点，正好和展开态 86% 屏宽的玻璃在视觉上同量级
 * （390pt × 86% = 335pt），于是"三颗拼起来 ≈ 一把尺"这个过渡读得通。
 * 内容真的超出时由胶囊自己的 `overflow: 'hidden'` 兜底，不会顶坏布局。
 */
export const CAPSULE_HEIGHT = 30;
export const CAPSULE_WIDTH = 86;
export const CAPSULE_GAP = 8;

/* ==========================================================================
 * 三、手感参数
 * ======================================================================== */

/**
 * 手指位移 → 尺子位移的减速系数。
 *
 * 为什么不是 1:1：86% 屏宽在 390pt 机身上约 335pt 尺窗，1:1 的话一次"从左搓到右"
 * 只够走完约 42 格，而色温整程有 75 格——用户会觉得"手指都搓出屏幕了还没调完"。
 * 0.6 让同一次滑动覆盖 1.7 倍行程；代价是"手指比读数跑得快"，但旋钮类控件用户的
 * 注意力在中间的读数上、不在手指上，这个代价是值得的。
 */
const SCROLL_DAMP = 0.6;

/**
 * 色温灵敏度：每 6px 变 0.02（规格给定）。
 *
 * 它的意义是整程 2.00 需要 600px 的有效尺面位移（`2 / 0.02 × 6`），乘上阻尼后是
 * 1000px 的手指行程 ≈"从屏幕左沿搓到右沿再回来一次"。这是"一次能调完、又不会碰一下
 * 就飞"的常见取值（约 0.0033 / pt）。
 */
const WB_PER_PX = 0.02 / 6;
/** 色温整程 [-1, 1]，与 `ColorGradeConfig.temperature` 的定义域一致。 */
const WB_MIN = -1;
const WB_MAX = 1;

/**
 * 焦段的四个标准位（等效毫米）。
 *
 * 13 / 26 / 35 / 52mm 是规格给的四个读数，对应机身丝印的 0.5× / 1.0× / 1.4× / 2.0×。
 * 前两个**必须**与两支镜头的原生焦距一致（`ASSUMED_LENS_NATIVE_MM` 的 ultraWide=13、
 * wide=26），否则会出现一段"读数在动、画面没动"的死区。第三个 35mm 是丝印取整后的
 * 营销数字（主摄 26 × 1.4 其实是 36.4），所以**读数按丝印给 35，倍率按真实 1.4 给**
 * ——见 `FOCAL_FACTORS` 的注释：这样读数与画面对得上，也不会有"标 35 实际 36.4"的假精确。
 * 第四个 52mm = 26 × 2，纯数字变焦档。
 */
export const FOCAL_STOPS: readonly number[] = [13, 26, 35, 52];
/** 每一档对应的真实放大倍率（相对主摄 26mm）。它才是 `zoom` 的来源，不是阅读值。 */
const FOCAL_FACTORS: readonly number[] = [0.5, 1, 1.4, 2];

/**
 * 镜头切换点：13mm 与 26mm 是两个**物理镜头**，中间没有连续过渡。
 *
 * 为什么取 26mm（主摄原生焦距）而**不是**两支的中点 `(13 + 26) / 2 = 19.5mm`：
 * 相机 `zoom` 的取值范围是 `[0, 1]`，而它映射的数字变焦倍数是 `[1, 16]` —— **倍数下不去 1**。
 * 于是主摄最小只能呈现 26mm 的视场。若在 19.5mm 处切换：超广角一侧是 `13 × 1.5 = 19.5mm`，
 * 切到主摄那一刻视场会**一下子缩回去 1.33 倍**（26 / 19.5），取景器里就是"画面猛跳一下"。
 * 取 26mm 则超广角先把 1×→2× 的数字变焦走完（13→26mm），主摄从 `zoom = 0` 接着走，
 * 视场连续。手机相机自己也是这么切的 —— 这条是从硬件能力反推出来的，不是审美选择。
 *
 * 期望内且接受的代价：交接处超广角已经 2× 数字裁切，画质是这条轴最软的一点；但它只是
 * 两颗定焦之间的补间，不是主力档位。用 `FOCAL_STOPS[1]` 取而不是写 26，是为了将来
 * 改了假定的原生焦距时这里自动跟上，不留一个对不上的常数。
 */
const LENS_SWITCH_MM = FOCAL_STOPS[1] ?? 26;
/**
 * 镜头切换的死区（毫米）。没有死区的话，手指正好停在三岔口上抖动，镜头会在超广角与
 * 主摄之间每帧来回切——每一次切换都是一次原生会话重配（画面黑一下）。1mm 在尺子上约
 * 3px 的位移，用户感觉不到，但足以把抖动滤掉。
 */
const LENS_SWITCH_HYSTERESIS_MM = 1;

/**
 * 焦段轴在"尺子坐标"上的位置（毫米 → 轴坐标 u，u 与像素成正比）。
 *
 * 为什么段内取**对数**而不是线性：`zoom` 本身就是 `log16(factor)`（`lenses.ts` 的
 * `factorToZoom`），所以倍率取对数之后，"尺子上等距"和"变焦参数等步"是同一件事。
 * 若改成线性，13→26mm 这段每格带来的画面变化会明显大于 35→52mm 那段，手感变成
 * "一头灵一头木"。段与段之间是分段线性的——因为四个磁吸档必须精确落在给定位置上。
 */
const FOCAL_U: readonly number[] = (() => {
  const u: number[] = [0];
  for (let index = 1; index < FOCAL_STOPS.length; index += 1) {
    const previous = FOCAL_STOPS[index - 1] ?? 1;
    const current = FOCAL_STOPS[index] ?? previous;
    u.push((u[index - 1] ?? 0) + Math.log(current / previous));
  }
  return u;
})();
/** 整条轴的 u 跨度（13mm 的 u=0，52mm 的 u=该值）。 */
const FOCAL_U_SPAN = FOCAL_U[FOCAL_U.length - 1] ?? 1;

/**
 * 13mm → 52mm 在尺子上占多少像素。
 *
 * 720px 不是随手挑的：它让"13mm 到 26mm"这段（u 占整程的 `ln2 / FOCAL_U_SPAN` = 33.3%）
 * 正好落在 240px = 30 格上，于是 35mm 在 470.7px、52mm 在 720.7px——整程 90 格，
 * 小刻度间距 8px 处处相等。这个长度也解释了为什么需要 `SCROLL_DAMP`：
 * 720 × 0.6 = 432pt 的手指行程，正好略大于一颗拇指在持机姿势下的一次舒适滑动。
 */
export const FOCAL_SPAN_PX = 720;

/**
 * 曝光整程 [-2, 2]（EV），与 `FocusExposure.tsx` 那根垂直滑块完全同一区间——
 * 两条路写的是同一个 `exposure` state，区间不一致的话，从胶囊搓到 2 EV 之后再拖
 * 对焦滑块会被 `quantizeExposure` 一把拽回来。
 */
const EV_MIN = -2;
const EV_MAX = 2;
/** 曝光灵敏度：每 8px 走 0.1 EV（规格给的"每跨 0.1 触发一次 selectionAsync"）。 */
const EV_PER_PX = 0.1 / MARK_GAP;

/**
 * 一次触感反馈覆盖的值跨度：色温 0.05、曝光 0.1（规格给定）。
 *
 * 触感按"值"分档而不是按"像素"分档，是因为它要和读数对齐：用户看到 `+0.05` 跳成
 * `+0.10` 的同时手上"哒"一下，两者才是同一件事。
 */
const WB_HAPTIC_STEP = 0.05;
const EV_HAPTIC_STEP = 0.1;

/**
 * 磁吸窗口：值落进窗口就吸到那个"有意义的点"上，滑出窗口自动脱开。
 *
 * 为什么要磁吸而不是"路过时震一下"：规格要的是**停顿**感。手感上，吸住才算"停"，
 * 只震不停的话手指还是匀速滑过去，用户根本落不到那个点上。
 *
 * - 色温的 0.00：那是"不加色温"这把尺子的原点，也是唯一能跟"胶卷本色"对齐的位置，
 *   值得一个明确的坎。窗口取 ±0.02，换算成手指行程是 ±6px（`WB_PER_PX = 0.02/6`）——
 *   不到一颗胶囊的十分之一宽，不会挡路。
 * - 焦段的 13 / 26 / 35 / 52：四个丝印位。连续插值下这四个数永远只是"路过"
 *   （52 是上界还能到底，26 和 35 在中间就真的够不着），吸住之后"搓到 35mm"才是个
 *   能复现的动作；顺带把 13↔26 的换镜头点（`LENS_SWITCH_MM`）钉成确定的一帧，
 *   而不是在 ±1mm 的死区里靠运气。窗口取 ±0.8mm：按 `FOCAL_SPAN_PX` 的斜率
 *   （13→26 段约 18px/mm）约 ±14px，比一根手指的抖动大、比一颗胶囊窄。
 */
const WB_ZERO_MAGNET = 0.02;
const FOCAL_MAGNET_MM = 0.8;

/* ==========================================================================
 * 四、换算（尺子位移 ⇄ 参数值）：全是纯函数，方便单独核对
 * ======================================================================== */

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 保留两位小数。用 `toFixed` 而不是乘除，避免 `0.30000000000000004` 这类残渣进 state。 */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

/** 毫米 → 轴坐标 u（单调递增，13mm→0，52mm→`FOCAL_U_SPAN`）。 */
function uAtFocalMm(focalMm: number): number {
  const nativeWideMm = FOCAL_STOPS[1] ?? 26;
  const target = Math.log(clampValue(focalMm / nativeWideMm, 1e-6, 1e6));
  const last = FOCAL_U.length - 1;
  for (let index = 0; index < last; index += 1) {
    const u0 = FOCAL_U[index] ?? 0;
    const u1 = FOCAL_U[index + 1] ?? u0;
    const factor0 = FOCAL_FACTORS[index] ?? 1;
    const factor1 = FOCAL_FACTORS[index + 1] ?? factor0;
    const segment = Math.log(factor1 / factor0);
    if (target <= segment || index === last - 1) {
      if (segment === 0) {
        return u0;
      }
      return u0 + clampValue(target / segment, 0, 1) * (u1 - u0);
    }
  }
  return FOCAL_U_SPAN;
}

/** 轴坐标 u → 毫米（`uAtFocalMm` 的反函数）。段内按倍率对数插值回主摄焦距。 */
function focalMmAt(u: number): number {
  const last = FOCAL_U.length - 1;
  let index = 0;
  for (let i = 0; i < last; i += 1) {
    if (u >= (FOCAL_U[i] ?? 0)) {
      index = i;
    }
  }
  if (u >= FOCAL_U_SPAN) {
    index = last - 1;
  }
  const u0 = FOCAL_U[index] ?? 0;
  const u1 = FOCAL_U[index + 1] ?? u0;
  const factor0 = FOCAL_FACTORS[index] ?? 1;
  const factor1 = FOCAL_FACTORS[index + 1] ?? factor0;
  const ratio = u1 > u0 ? clampValue((u - u0) / (u1 - u0), 0, 1) : 0;
  const factor = factor0 * Math.pow(factor1 / factor0, ratio);
  const nativeWideMm = FOCAL_STOPS[1] ?? 26;
  return round2(factor * nativeWideMm);
}

/** 毫米在尺子上离基准指针（原点）有多少像素。四个磁吸档就落在这里算出的位置上。 */
function focalMmToOffset(focalMm: number): number {
  return (uAtFocalMm(focalMm) / FOCAL_U_SPAN) * FOCAL_SPAN_PX;
}

/** 焦段轴的上界：52mm —— 长焦那档（77mm）不在这把尺子上，见文件头的手势说明。 */
const FOCAL_MAX_MM = FOCAL_STOPS[FOCAL_STOPS.length - 1] ?? 52;
/**
 * 焦段轴的**默认**下界：13mm。真机上这个值由 `focalMinMm` prop 决定，因为超广角不一定
 * 存在（SE / 模拟器 / 前摄都没有），那时低端要硬停在 26mm 而不是给一段拖不出画面的死区。
 */
const FOCAL_MIN_MM = FOCAL_STOPS[0] ?? 13;

/**
 * 某个轴的值 → 它在尺子上的像素偏移（0 = 当前值恰好停在基准指针下）。
 *
 * 三个轴都是"值越大、偏移越大"：往右搓（offset 增大）读数变大，与"旋钮顺时针"
 * 的直觉一致。而"当前值"对应的偏移是各轴的值域上界——于是当前值刚好落在指针下时
 * 刻度阵列整体左移，这就是尺子该有的样子。
 *
 * `focalMinMm` 只对焦段轴有意义（另外两轴的值域是硬件无关的常数），它同时收窄值域与
 * 可滑范围 —— 见 `offsetRange`。所以"值 → 偏移"和"偏移 → 值"必须传**同一个**下界，
 * 否则尺子停住的位置和读数会对不上。
 */
export function offsetAtValue(
  dial: ScrubbableParameter,
  value: number,
  focalMinMm: number = FOCAL_MIN_MM,
): number {
  if (dial === 'wb') {
    return (clampValue(value, WB_MIN, WB_MAX) - WB_MAX) / WB_PER_PX;
  }
  if (dial === 'ev') {
    return (clampValue(value, EV_MIN, EV_MAX) - EV_MAX) / EV_PER_PX;
  }
  return focalMmToOffset(clampValue(value, focalMinMm, FOCAL_MAX_MM)) - FOCAL_SPAN_PX;
}

/** 尺子位移 → 参数值（`offsetAtValue` 的反函数）。 */
export function valueAtOffset(
  dial: ScrubbableParameter,
  offset: number,
  focalMinMm: number = FOCAL_MIN_MM,
): number {
  if (dial === 'wb') {
    return round2(clampValue(WB_MAX + offset * WB_PER_PX, WB_MIN, WB_MAX));
  }
  if (dial === 'ev') {
    return round2(clampValue(EV_MAX + offset * EV_PER_PX, EV_MIN, EV_MAX));
  }
  const u = ((offset + FOCAL_SPAN_PX) / FOCAL_SPAN_PX) * FOCAL_U_SPAN;
  // 下界不是 0 而是 `uAtFocalMm(focalMinMm)`：超广角缺席时，轴的低端整段都不该存在
  return focalMmAt(clampValue(u, uAtFocalMm(focalMinMm), FOCAL_U_SPAN));
}

/**
 * 磁吸：把落在窗口里的值吸到那个"有意义的点"上（见 `WB_ZERO_MAGNET` / `FOCAL_MAGNET_MM`）。
 *
 * **只对读数与上报值生效，不影响尺子位移** —— `applyDrag` 里先把手指的累积位移原样交给
 * `scroll`，再拿磁吸后的值去改读数。所以吸住的时候尺子还在跟手走，窗口一出去读数立刻回到
 * 连续值，不会有"尺子被粘住"的错觉。曝光不设磁吸：规格没给曝光安排任何"标准点"。
 */
function magnetValue(dial: ScrubbableParameter, value: number): number {
  if (dial === 'wb') {
    return Math.abs(value) <= WB_ZERO_MAGNET ? 0 : value;
  }
  if (dial === 'ev') {
    return value;
  }
  for (const stop of FOCAL_STOPS) {
    if (Math.abs(value - stop) <= FOCAL_MAGNET_MM) {
      return stop;
    }
  }
  return value;
}

/**
 * 某轴平均每像素变化多少值。
 *
 * 色温与曝光是线性映射，这个数是精确值；焦段是按对数插值的，所以给的是一段整程除以
 * 整程像素的**平均值**（真实斜率在 13mm 那端更大）。刻度阵列本身是等距的
 * （规格要求 8px 一格），这个值只用来解释"三种尺子各自的疏密"。
 */
export function valuePerPx(dial: ScrubbableParameter): number {
  if (dial === 'wb') {
    return WB_PER_PX;
  }
  if (dial === 'ev') {
    return EV_PER_PX;
  }
  const mm = (FOCAL_STOPS[FOCAL_STOPS.length - 1] ?? 52) - (FOCAL_STOPS[0] ?? 13);
  return mm / FOCAL_SPAN_PX;
}

/** 各轴的整程像素跨度（正数），用来决定刻度阵列要铺多长。 */
const SPAN_PX: Readonly<Record<ScrubbableParameter, number>> = {
  wb: (WB_MAX - WB_MIN) / WB_PER_PX,
  ev: (EV_MAX - EV_MIN) / EV_PER_PX,
  zoom: FOCAL_SPAN_PX,
};

/**
 * 刻度阵列要铺多长。
 *
 * 为什么取三轴里最长的整程（800px，来自曝光的 ±2 EV）：尺子是被 `translateX` 推着走的，
 * 而"推到底"时窗里还必须有刻度——最坏情况是"整程 + 一个尺窗宽"（约 800 + 370 = 1170px）
 * 的刻度都得存在。取最长整程的两倍（1600px）= 200 根 8px 一格的刻度，两端都留足余量，
 * 而且**一张刻度表给三把尺子共用**（换参数时阵列不重建）。
 * 用最大值而不是逐轴算，就是为了这张表只有一份。
 */
export const RULER_PAD_PX = Math.max(SPAN_PX.wb, SPAN_PX.ev, SPAN_PX.zoom);
export const RULER_RANGE_PX = RULER_PAD_PX * 2;

/**
 * 各轴在"当前值居中"下的可滑动范围（min 是往右搓到底，0 是当前值）。
 *
 * 做成函数而不是常量表，只因为焦段的下界会变：超广角缺席时值域从 `[13, 52]` 收成
 * `[26, 52]`，可滑范围也必须跟着收（-720 → -480），否则尺子会继续往下滚、读数却纹丝
 * 不动 —— 那正是"拖了没反应"的手感，比硬停更糟。
 */
function offsetRange(dial: ScrubbableParameter, focalMinMm: number): { readonly min: number; readonly max: number } {
  if (dial === 'wb') {
    return { min: -SPAN_PX.wb, max: 0 };
  }
  if (dial === 'ev') {
    return { min: -SPAN_PX.ev, max: 0 };
  }
  return { min: focalMmToOffset(focalMinMm) - FOCAL_SPAN_PX, max: 0 };
}

/**
 * 焦段 → 该用哪支物理镜头 + 相机 `zoom`。
 *
 * `role` 只判 13↔26 那一段（超广角 / 主摄），因为 35mm 与 52mm 都在主摄上走数字变焦。
 * `zoom` 一律按**真实倍率**取 `log16`（与 `lenses.ts` 的 `factorToZoom` 同一条公式），
 * 所以它和 `focalMm` 永远自洽：读数 26mm 时 `zoom` 是 0、52mm 时是 0.25，与
 * `ZOOM_STOPS` 里那两档一字不差——于是"搓到的位置"和"点焦段胶囊跳到的位置"停在同处，
 * 不会有两套互相矛盾的读数。
 */
export function resolveScrubFocal(
  focalMm: number,
  previousRole: ZoomLensRole,
): { readonly role: ZoomLensRole; readonly zoom: number; readonly factor: number } {
  const wideMm = FOCAL_STOPS[1] ?? 26;
  const ultraMm = FOCAL_STOPS[0] ?? 13;
  const naturalRole: ZoomLensRole = focalMm >= LENS_SWITCH_MM ? 'wide' : 'ultraWide';
  const crossedOut =
    focalMm >= LENS_SWITCH_MM + LENS_SWITCH_HYSTERESIS_MM || focalMm <= LENS_SWITCH_MM - LENS_SWITCH_HYSTERESIS_MM;
  let role: ZoomLensRole = naturalRole !== previousRole && crossedOut ? naturalRole : previousRole;
  if (previousRole === 'telephoto') {
    // 刻度尺只覆盖 13~52mm，长焦不是它的合法起点：第一次动就先落回判定结果
    role = naturalRole;
  }
  // 兜底：读数与镜头必须自洽，否则会出现"标着 30mm、却挂在超广角上"这种组合
  if (role === 'ultraWide' && focalMm >= wideMm) {
    role = 'wide';
  }
  if (role === 'wide' && focalMm < ultraMm) {
    role = 'ultraWide';
  }
  const nativeMm = role === 'wide' ? wideMm : ultraMm;
  const factor = focalMm / nativeMm;
  const zoom = factor > 1 ? Number((Math.log(factor) / Math.log(16)).toFixed(5)) : 0;
  return { role, zoom, factor: Number(factor.toFixed(5)) };
}

/** 相邻两档之间的分界（中点）：滑过它就算"过了一档"，给一次磁吸。 */
const FOCAL_BOUNDARIES: readonly number[] = [0, 1, 2].map((index) => {
  const left = FOCAL_STOPS[index] ?? 0;
  const right = FOCAL_STOPS[index + 1] ?? left;
  return (left + right) / 2;
});

/** 当前读数落在第几档（"滑过档位分界"与磁吸判定都用它）。 */
export function focalStopIndex(focalMm: number): number {
  let index = 0;
  for (let i = 0; i < FOCAL_BOUNDARIES.length; i += 1) {
    if (focalMm >= (FOCAL_BOUNDARIES[i] ?? 0)) {
      index = i + 1;
    }
  }
  return index;
}

/**
 * 焦段轴上**第一个可达**的标准位下标。
 *
 * 超广角缺席时 `focalMinMm` 是 26，于是 0.5× 那一档不算数 —— 读屏用户按"下一档"
 * 不能落在一个拖不出画面的档上（那会让读数说 13mm、画面还是主摄视场）。
 */
function focalStopFloorIndex(focalMinMm: number): number {
  const index = FOCAL_STOPS.findIndex((stop) => stop >= focalMinMm);
  return index < 0 ? FOCAL_STOPS.length - 1 : index;
}

/* ==========================================================================
 * 五、命中区
 *
 * 三颗胶囊在收拢态是固定宽度（见 `CAPSULE_WIDTH`），所以"按在哪颗上"可以从几何直接
 * 算出来，不需要等一次 `onLayout` 回报——按下那一刻就能判定，没有"首帧按了没反应"。
 * 展开态只有一个区域：整把尺子。
 * ======================================================================== */

export type HitZone = { readonly dial: ScrubbableParameter; readonly from: number; readonly to: number };

/** 收拢态三颗胶囊的横向区间（左起第一颗的左边 = 0）。顺序即渲染顺序：色温/焦段/曝光。 */
export const COLLAPSED_HIT_ZONES: readonly HitZone[] = (['wb', 'zoom', 'ev'] as const).map((dial, index) => ({
  dial,
  from: index * (CAPSULE_WIDTH + CAPSULE_GAP),
  to: index * (CAPSULE_WIDTH + CAPSULE_GAP) + CAPSULE_WIDTH,
}));

function hitZoneAt(x: number): ScrubbableParameter | null {
  for (const zone of COLLAPSED_HIT_ZONES) {
    if (x >= zone.from && x < zone.to) {
      return zone.dial;
    }
  }
  return null;
}

/**
 * 收拢态那一行胶囊的总宽（命中区换算要用）。
 *
 * 274 = 3 × 86 + 2 × 8。它也是"为什么按下判定用 `pageX` 而不是 `locationX`"的答案：
 * `locationX` 是**相对触摸命中的那个子视图**的（手指落在胶囊上时它从 0 开始），拿它去
 * 查"落在哪颗胶囊上"会永远得到第一颗。而这一行在外壳里居中、外壳又在整屏里居中，
 * 所以"这一行的左边缘"可以从窗口宽度直接算出来 —— 见 `onStartShouldSetPanResponderCapture`。
 */
const ROW_WIDTH = CAPSULE_WIDTH * 3 + CAPSULE_GAP * 2;

/* ==========================================================================
 * 六、组件
 * ======================================================================== */

export interface ParameterScrubBarProps {
  /** 色温当前值（-1 ~ +1，正数偏暖；定义见 `ColorGradeConfig.temperature`）。 */
  temperature: number;
  /** 当前等效焦距读数（毫米）。 */
  focalMm: number;
  /** 当前曝光补偿（EV）。 */
  exposure: number;
  /** 当前实际生效的物理镜头：决定展开时焦段尺从哪一支开始算（带死区记忆）。 */
  focalRole: ZoomLensRole;
  /**
   * 焦段尺的低端（毫米）。
   *
   * 由父级给而不是这里算：只有父级知道"这台机器到底有没有超广角"（`getAvailableLensesAsync`
   * 的结果在它手里，`resolveStop` 也在它那边）。没有超广角时它传 26 —— 于是尺子在 26mm
   * 处硬停，读数与画面永远自洽，不会出现"标着 13mm、看到的却是主摄视场"。
   */
  focalMinMm: number;
  /** 色温刻度尺改值。 */
  onTemperature: (temperature: number) => void;
  /**
   * 焦段变化。
   *
   * 一次给全"读数 + 该用哪支镜头 + 相对该镜头原生焦距的真实倍率"三件：镜头切换（13↔26）
   * 与数字变焦是同一根手指上的连续动作，拆成两个回调会让父级在两次 `setState` 之间出现
   * "镜头已换、倍率还是旧的"这种中间态（画面会闪一下）。倍率交给父级用现成的
   * `factorToZoom()` 换算，不在这里重复 `lenses.ts` 的算法。
   */
  onFocal: (focalMm: number, role: ZoomLensRole, factor: number) => void;
  /** 曝光刻度尺改值。 */
  onExposure: (exposure: number) => void;
  /** 收拢态的短按：焦段跳到下一个标准位。 */
  onCycleFocal: () => void;
}

function ParameterScrubBarInner({
  temperature,
  focalMm,
  exposure,
  focalRole,
  focalMinMm,
  onTemperature,
  onFocal,
  onExposure,
  onCycleFocal,
}: ParameterScrubBarProps) {
  /** 当前展开着哪把尺子（null = 三颗胶囊）。 */
  const [active, setActive] = useState<ScrubbableParameter | null>(null);
  /**
   * 展开态顶部那行读数。
   *
   * 只有它跟着手指高频变化。**它走的是 React state，所以必须靠 25ms 节流限速**；
   * 尺子的位移则是 `Animated.Value`，完全不经 React。这两条路一分开，
   * "跟手"和"省渲染"就不再互相牵制。
   */
  const [reading, setReading] = useState(0);

  /**
   * 窗口宽度只用来算"这一行胶囊的左边缘"（`ROW_WIDTH` 的注释），不参与布局
   * ——布局交给 `styles.shell` 的百分比。旋屏时它会变，所以要跟着重算。
   */
  const { width: windowWidth } = useWindowDimensions();

  /**
   * 尺子位移。手指每动一次只改它 —— 这条路径不经过 React。
   * 用 `useRef` 而不是 `useState`：`Animated.Value` 本身可变，放进 state 只会多一次渲染。
   */
  const scroll = useRef(new Animated.Value(0)).current;

  /**
   * 响应器只创建一次，读不到最新 props —— 按项目里 `usePinchZoom` / 旧 `ViewfinderBar`
   * 的同一套写法，把"当前值 + 最新回调"镜像进 ref，每次渲染后更新。
   */
  const latest = useRef({
    temperature,
    focalMm,
    exposure,
    focalRole,
    focalMinMm,
    windowWidth,
    onTemperature,
    onFocal,
    onExposure,
    onCycleFocal,
  });
  useEffect(() => {
    latest.current = {
      temperature,
      focalMm,
      exposure,
      focalRole,
      focalMinMm,
      windowWidth,
      onTemperature,
      onFocal,
      onExposure,
      onCycleFocal,
    };
  });

  /** 一次触摸期间的全部可变状态。放 ref：`PanResponder` 的回调闭包只建一次。 */
  const gesture = useRef({
    /** 这次触摸落在哪颗胶囊上（null = 落在胶囊之外，整次忽略）。 */
    target: null as ScrubbableParameter | null,
    /** 当前展开着的那把尺子（与 `active` 同步，但回调里读得到最新值）。 */
    dial: null as ScrubbableParameter | null,
    startedAt: 0,
    startOffset: 0,
    /** 已经算出、但还没到节流窗口的值。 */
    pending: 0,
    hasPending: false,
    lastEmitAt: 0,
    /** 触感台阶（色温 0.05 / 曝光 0.1 / 焦段档位）。 */
    lastTick: 0,
    lastMagnet: -1,
    /** 色温是否正停在 0.00 的磁吸点上（用来只在"进入"那一下给 Light）。 */
    lastZero: false,
    /** 当前实际生效的镜头（带死区记忆，跨帧保留）。 */
    role: 'wide' as ZoomLensRole,
    holdTimer: null as ReturnType<typeof setTimeout> | null,
    settleTimer: null as ReturnType<typeof setTimeout> | null,
  });

  const clearHold = useCallback(() => {
    const state = gesture.current;
    if (state.holdTimer !== null) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }
  }, []);

  const clearSettle = useCallback(() => {
    const state = gesture.current;
    if (state.settleTimer !== null) {
      clearTimeout(state.settleTimer);
      state.settleTimer = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearHold();
      clearSettle();
    },
    [clearHold, clearSettle],
  );

  /** 取某个轴的"当前值"。 */
  const currentValue = useCallback((dial: ScrubbableParameter): number => {
    if (dial === 'wb') {
      return latest.current.temperature;
    }
    if (dial === 'ev') {
      return latest.current.exposure;
    }
    return latest.current.focalMm;
  }, []);

  /** 把值交给父级（各轴各自的回调）。 */
  const emit = useCallback((dial: ScrubbableParameter, value: number) => {
    if (dial === 'wb') {
      latest.current.onTemperature(value);
    } else if (dial === 'ev') {
      latest.current.onExposure(value);
    } else {
      const { role, factor } = resolveScrubFocal(value, gesture.current.role);
      gesture.current.role = role;
      latest.current.onFocal(value, role, factor);
    }
  }, []);

  /**
   * 展开刻度尺。
   *
   * `scroll.setValue()` 一次跳到正确位置：不能从 0 滑过去，那会读出一串根本没发生过的
   * 中间值；之后位置就完全由手指的累积位移驱动，**不再反向读 props** —— 否则父级
   * 25ms 一次的回流会把尺子往过期的值上拽，产生"尺子在抖"的观感。
   */
  const openDial = useCallback(
    (dial: ScrubbableParameter) => {
      const state = gesture.current;
      const value = currentValue(dial);
      state.dial = dial;
      state.role = latest.current.focalRole;
      state.startOffset = offsetAtValue(dial, value, latest.current.focalMinMm);
      state.pending = value;
      state.hasPending = false;
      state.lastEmitAt = 0;
      state.lastTick = dial === 'wb' ? Math.round(value / WB_HAPTIC_STEP) : Math.round(value / EV_HAPTIC_STEP);
      // 展开那一刻手指可能正好停在某个磁吸点上（比如色温本来就是 0.00）：先记下，
      // 免得"刚展开"就补一次震动 —— 那一下展开的 Medium 已经给过确认了
      state.lastMagnet = dial === 'zoom' ? FOCAL_STOPS.indexOf(magnetValue('zoom', value)) : -1;
      state.lastZero = value === 0;
      scroll.setValue(state.startOffset);
      setReading(value);
      setActive(dial);
      /*
       * 震动口径沿用项目既有约定：`selectionAsync` 表示"选中/切换了某一档"，
       * `impactAsync` 表示"发生了一次机械动作"。展开刻度尺是后者，所以取 Medium
       * ——比打开底片抽屉的 Light 重一档，因为它同时意味着"接下来手指的移动会改参数"，
       * 用户需要这个确认。
       */
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [currentValue, scroll],
  );

  /**
   * 节流上报 + 触感。
   *
   * 触感**不受节流限制**：它必须跟手（跨台阶那一刻就震），等 40Hz 的下一个窗口会明显滞后。
   * 值上报则按 `EMIT_INTERVAL_MS` 限速；窗口内的最后一次在 `settle()` 里补发，
   * 否则用户松手时最终位置可能丢——那是最不能丢的一次。
   */
  const pushValue = useCallback(
    (dial: ScrubbableParameter, value: number) => {
      const state = gesture.current;
      const now = Date.now();
      state.pending = value;
      state.hasPending = true;

      if (dial === 'wb') {
        const atZero = value === 0;
        if (atZero && !state.lastZero) {
          // 滑进 0.00 磁吸点的这一下用 Light：它是"吸住了"的机械确认，
          // 与"数值过了一个 0.05 台阶"不是同一件事，所以不跟台阶震动共用口径
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        state.lastZero = atZero;
        const tick = Math.round(value / WB_HAPTIC_STEP);
        // 停在 0 点上的整段时间里不再补台阶震动，否则同一个点会连着"咚 + 哒"两下；
        // 台阶记录照常更新，离开 0 点后第一次跨 0.05 才会再震
        if (!atZero && tick !== state.lastTick) {
          void Haptics.selectionAsync();
        }
        state.lastTick = tick;
      } else if (dial === 'ev') {
        const tick = Math.round(value / EV_HAPTIC_STEP);
        if (tick !== state.lastTick) {
          state.lastTick = tick;
          void Haptics.selectionAsync();
        }
      } else {
        // 磁吸后的值要么**就是**某个标准位（`indexOf` 找得到），要么是连续值（-1）：
        // 用下标而不是"过了分界"来触发，震动才落在 13/26/35/52 这四个点上
        const magnet = FOCAL_STOPS.indexOf(value);
        if (magnet >= 0 && magnet !== state.lastMagnet) {
          state.lastMagnet = magnet;
          // 焦段磁吸用 Medium：它换的是"视场"，比"数值动了一点"重要得多
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }

      if (state.lastEmitAt !== 0 && now - state.lastEmitAt < EMIT_INTERVAL_MS) {
        return;
      }
      state.lastEmitAt = now;
      state.hasPending = false;
      emit(dial, value);
    },
    [emit],
  );

  /**
   * 手指位移 → 尺子位移 + 读数。
   *
   * 用**累积量** `gesture.dx`（相对按下点）而不是逐帧增量：增量式一旦丢一帧就永久偏移，
   * 而累积量任何时刻重算都能回到正确位置。
   */
  const applyDrag = useCallback(
    (dial: ScrubbableParameter, dx: number) => {
      const state = gesture.current;
      const range = offsetRange(dial, latest.current.focalMinMm);
      const offset = clampValue(state.startOffset + dx * SCROLL_DAMP, range.min, range.max);
      // 尺子位移先落地（永远跟手），再拿磁吸后的值去改读数：
      // 吸住的只是"值"，不是"尺子"，所以窗口一出去读数立刻回到连续值
      scroll.setValue(offset);
      const value = magnetValue(dial, valueAtOffset(dial, offset, latest.current.focalMinMm));
      setReading(value);
      pushValue(dial, value);
    },
    [pushValue, scroll],
  );

  /**
   * 松手：先把最后那个值补发出去，再延迟收拢。
   *
   * 为什么要延迟而不是立刻 `setActive(null)`：立刻收拢等于"手指一离开就变回三颗胶囊"，
   * 用户来不及确认自己刚拧到的读数；350ms 是一次"看清楚"的时间（见 `COLLAPSE_DELAY_MS`）。
   */
  const settle = useCallback(() => {
    const state = gesture.current;
    const dial = state.dial;
    if (dial === null) {
      return;
    }
    if (state.hasPending) {
      state.hasPending = false;
      emit(dial, state.pending);
    }
    state.dial = null;
    clearSettle();
    state.settleTimer = setTimeout(() => {
      state.settleTimer = null;
      setActive(null);
    }, COLLAPSE_DELAY_MS);
  }, [clearSettle, emit]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        /**
         * 按下即接管，而且要在**捕获**阶段。
         *
         * 捕获先于冒泡，能保证在任何子层的 `Pressable` 之前拿到这次触摸。旧版用的是
         * `onMoveShouldSetPanResponderCapture`（只抢竖直拖动、把横滑留给别的层），这里
         * 必须改成按下即接管——横滑现在就是本组件自己的手势，而且"短按还是长按"的判定
         * 需要"按下"那一刻的时间戳，等移动再抢就来不及了。
         * 三颗胶囊的 `Pressable` 因此不再负责手势（`pointerEvents="none"`），它们的点击
         * 语义由 `onPanResponderRelease` 统一按短按规则分派——一个判断源，不会两套阈值打架。
         */
        onStartShouldSetPanResponderCapture: (event: GestureResponderEvent) => {
          const state = gesture.current;
          /*
           * 用 `pageX`（窗口绝对坐标）换算"落在这行的哪个位置"，而不是 `locationX`。
           * `locationX` 是相对**触摸命中那个子视图**的：手指落在色温胶囊上时它从 0 开始，
           * 落在焦段胶囊上时也从 0 开始 —— 拿它查命中区会永远判成第一颗。
           * 这一行在外壳里居中、外壳又在整屏居中，所以它的左边缘 = 屏宽的一半减去行宽的一半，
           * 一次减法就够，不需要 `onLayout`/`measure` 那种异步回报（异步会在首帧留下空档）。
           */
          const rowLeft = latest.current.windowWidth / 2 - ROW_WIDTH / 2;
          const x = event.nativeEvent.pageX - rowLeft;
          state.target = active === null ? hitZoneAt(x) : active;
          state.startedAt = Date.now();
          state.dial = null;
          state.hasPending = false;
          state.lastEmitAt = 0;
          return state.target !== null;
        },
        // 已经接管之后不要再交出去：中途被抢走会让刻度尺停在半路
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: () => {
          const state = gesture.current;
          clearSettle();
          if (state.target === null) {
            return;
          }
          /*
           * 长按展开用定时器，不在 `onPanResponderMove` 里比时间：用户长按之后
           * **手指可能一动不动**（就是"按住等我展开"），而那时 `onPanResponderMove`
           * 根本不会被调用——那样就永远展不开了。
           */
          clearHold();
          state.holdTimer = setTimeout(() => {
            state.holdTimer = null;
            if (state.dial === null && state.target !== null) {
              openDial(state.target);
            }
          }, HOLD_MS);
        },

        onPanResponderMove: (_event: GestureResponderEvent, info: PanResponderGestureState) => {
          const state = gesture.current;
          const target = state.target;
          if (target === null) {
            return;
          }
          if (state.dial === null) {
            /*
             * 还没展开。两种情况：
             *   ① 按住就拖（|dx| 超过 TAP_SLOP）→ 立刻展开，这就是规格要的"按住直接滑"；
             *   ② 位移还没到阈值 → 什么都不做，等长按定时器、或者抬起时的短按判定。
             */
            if (Math.abs(info.dx) <= TAP_SLOP) {
              return;
            }
            clearHold();
            openDial(target);
          }
          applyDrag(target, info.dx);
        },

        onPanResponderRelease: (_event: GestureResponderEvent, info: PanResponderGestureState) => {
          const state = gesture.current;
          clearHold();
          const target = state.target;
          state.target = null;
          if (target === null) {
            return;
          }
          if (state.dial !== null) {
            // 已经展开过：松手 → 延迟收拢
            settle();
            return;
          }
          /*
           * 一次轻点：按下到抬起 < 160ms 且几乎没横向移动。
           * 注意这里**不依赖 `Pressable` 的 `onPress`**——手势已经被本组件接管，
           * `Pressable` 收不到这次触摸，所以短按必须在这里补上，否则三颗胶囊会变成
           * "按下去有高亮、抬起来什么都没发生"。
           */
          const isTap = Date.now() - state.startedAt < HOLD_MS && Math.abs(info.dx) < TAP_SLOP;
          if (!isTap) {
            return;
          }
          if (target === 'zoom') {
            void Haptics.selectionAsync();
            latest.current.onCycleFocal();
            return;
          }
          /*
           * 色温与曝光的轻点都是**一键归零**（规格 §1）——两者共用下面同一段。
           *
           * 色温这颗胶囊在本轮之前是"点开底片抽屉"，本次让位给归零，两个理由：
           *   ① 底片抽屉的主入口一直是控制台右侧那颗底片按钮（`CameraScreen.tsx` 里
           *      的 `DialButton`，`onPress={handleOpenFilmDrawer}`），胶囊只是重复了一遍，
           *      所以改掉它并没有让抽屉变得进不去；
           *   ② 色温在旧版**没有**任何回到中性 0.00 的路 —— 拧歪之后只能靠手感去对，
           *      而 0.00 恰恰是唯一能跟"胶卷本色"对齐的位置（父级里 `null` 与 `0`
           *      是两回事）。短按一下就到，价值比重复一遍抽屉入口大得多。
           */
          const current = currentValue(target);
          if (current === 0) {
            // 已经是 0：不震动、也不写 state（写一次相同的值会让父级白重建一次）
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          emit(target, 0);
        },

        onPanResponderTerminate: () => {
          clearHold();
          const state = gesture.current;
          state.target = null;
          if (state.dial !== null) {
            settle();
          }
        },
      }),
    [active, applyDrag, clearHold, clearSettle, currentValue, emit, openDial, settle],
  );

  /**
   * 下面三个回调只服务 VoiceOver：真实触摸到不了胶囊里的 `Pressable`（被本组件的
   * 捕获阶段响应器先接走），所以"双击激活"这条通道得单独接上。它们与手指路径共用
   * 同一个 `emit`，两条路写出去的值不可能不一致。
   */
  const handleCycleFocal = useCallback(() => {
    void Haptics.selectionAsync();
    latest.current.onCycleFocal();
  }, []);

  const handleReset = useCallback(
    (dial: 'wb' | 'ev') => {
      if (currentValue(dial) === 0) {
        return;
      }
      // 与手指短按归零同一套口径：机械动作走 Light（见项目触感约定）
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      emit(dial, 0);
    },
    [currentValue, emit],
  );

  /**
   * 无障碍 increment / decrement：每次一格。
   *
   * 色温一格 0.05、曝光一格 0.1（与触感台阶同一个量），焦段一格直接跳到相邻标准位——
   * 读屏用户没有"刻度尺"这个视觉参照可用，只能按档数着走，一格跳 0.01 对他没有意义。
   */
  const handleAdjust = useCallback(
    (dial: ScrubbableParameter, direction: 1 | -1) => {
      const current = currentValue(dial);
      let next = current;
      if (dial === 'wb') {
        next = round2(clampValue(current + direction * WB_HAPTIC_STEP, WB_MIN, WB_MAX));
      } else if (dial === 'ev') {
        next = round2(clampValue(current + direction * EV_HAPTIC_STEP, EV_MIN, EV_MAX));
      } else {
        // 低端不是 0 而是 `focalStopFloorIndex(...)`：超广角缺席时 0.5× 那档不存在
        const floor = focalStopFloorIndex(latest.current.focalMinMm);
        const index = Math.round(
          clampValue(focalStopIndex(current) + direction, floor, FOCAL_STOPS.length - 1),
        );
        next = FOCAL_STOPS[index] ?? current;
      }
      void Haptics.selectionAsync();
      emit(dial, next);
    },
    [currentValue, emit],
  );

  /** 展开态顶部那行读数（收拢态这行不看，交给三颗胶囊自己显示）。 */
  const shownReading =
    active === 'wb'
      ? formatScrubTemperature(reading)
      : active === 'ev'
        ? formatScrubExposure(reading)
        : `${Math.round(reading)}mm`;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/*
        外壳恒定 86% 屏宽 × 48 高：收拢态三颗胶囊在里面居中、展开态整块被玻璃占满，
        两个状态共用同一块区域，所以切换时不会有任何东西被挤动（只做 opacity/scale）。
        尺寸的来历见 `DIAL_WIDTH_RATIO` 与 `CAPSULE_WIDTH` 的注释。
      */}
      <View style={styles.shell} {...responder.panHandlers}>
        <ViewfinderBar
          active={active}
          reading={shownReading}
          temperature={temperature}
          focalMm={focalMm}
          exposure={exposure}
          scroll={scroll}
          onCycleFocal={handleCycleFocal}
          onReset={handleReset}
          onAdjust={handleAdjust}
        />
      </View>
    </View>
  );
}

/* ==========================================================================
 * 七、读数格式化
 * ======================================================================== */

/** 色温读数：带符号两位小数，0 写 `0.00`（不带符号更像仪表）。 */
export function formatScrubTemperature(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  const clamped = clampValue(value, WB_MIN, WB_MAX);
  if (Math.abs(clamped) < 0.005) {
    return '0.00';
  }
  return `${clamped > 0 ? '+' : '-'}${Math.abs(clamped).toFixed(2)}`;
}

/** 曝光读数：带符号一位小数，0 写 `0.0`；与 `FocusExposure.formatExposure` 同一口径。 */
export function formatScrubExposure(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.0';
  }
  const rounded = round2(clampValue(value, EV_MIN, EV_MAX));
  if (rounded === 0) {
    return '0.0';
  }
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}`;
}

/* ==========================================================================
 * 八、样式
 *
 * 只有几何：颜色全部来自 `useTheme()`（在 `ViewfinderBar` 里）。模块级
 * `StyleSheet.create` 里把颜色烧死，会把深浅色切换冻在首次渲染那一刻。
 * ======================================================================== */

const styles = StyleSheet.create({
  /**
   * `alignSelf: 'stretch'` 是**必须的**，不是为了好看：父级 `styles.barLayer` 是
   * `position:absolute + left:0 + right:0 + alignItems:'center'`，于是它给子级的可用宽度
   * 是整屏宽、但 `alignItems:center` 会把子级缩成"内容宽"。`shell` 用的是百分比宽度
   * （`DIAL_WIDTH_RATIO`），而百分比要对着**确定**的父宽才有意义 —— 父宽若是内容撑出来的，
   * 百分比会退化成 auto，86% 就悄悄变成了"三颗胶囊刚好 274pt"。这里拉伸一下把父宽
   * 定成整屏，`shell` 的 86% 才真的是 86%。
   */
  root: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  /**
   * 外壳：恒定 86% 屏宽 × 48 高，两个状态共用。
   *
   * 为什么宽度不跟着状态变（收拢时让内容撑、展开时给 86%）：那样每次切换都会触发一次
   * 布局重排，"平滑过渡"就只剩透明度变化、位置会跳一下。恒定宽度之后，收拢态那三颗
   * 胶囊在一个透明容器里居中，视觉上与"自己撑开"完全一样（86% 的来历见
   * `CAPSULE_WIDTH`：三颗 86 + 2×8 = 274，正好约等于 320pt 机型上 86% 的 275）。
   * 高度 48 = 展开态玻璃的高度，收拢态三颗 30pt 胶囊在其中垂直居中（上下各 9pt）。
   */
  shell: {
    width: DIAL_WIDTH_RATIO,
    height: DIAL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * `memo`：父级每次因为参数变化重渲染时，本组件的 props 全是原始值 + 稳定回调，
 * 不该跟着重建——它内部握着 `Animated.Value` 与 `PanResponder`，重建一次就多一份。
 */
export const ParameterScrubBar = memo(ParameterScrubBarInner);
