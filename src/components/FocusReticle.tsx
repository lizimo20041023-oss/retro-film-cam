/**
 * 对焦框：只画一个黄框，不含手势、不含计时。
 *
 * 为什么把"框"和"手指"拆成两个文件：曝光滑块的触摸区必须压在这一层之上，而框本身
 * 必须 `pointerEvents: 'none'` —— 否则它会吃掉自己身下那一点面积的"点按对焦"。
 * 两种触摸语义塞进同一个组件，迟早有人给它挂上 panHandlers 而悄悄弄坏别处的点按；
 * 拆开之后，这个错误在结构上就写不出来了。
 *
 * 为什么脉冲用 `Animated.spring` 而不是 `timing`：镜头合焦是机械动作，收束要有过冲。
 * 匀速的 timing 看起来像普通 UI 动画，不像对焦。
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { Rect } from '../types';
import { useTheme } from '../constants/theme';

/** 点击落点：`x` / `y` 是以取景器为参照的 0~1 归一化坐标，`at` 是时间戳（毫秒）。 */
export type FocusTarget = { x: number; y: number; at: number } | null;

/**
 * 框的边长。取景器上唯一一个"手指大小"的标记：76 与旧版一致，
 * 换尺寸会让老用户觉得对焦"变小了/变大了"，而它并没有。
 */
export const RETICLE_SIZE = 76;

const STROKE = 1;
const RADIUS = 2;
/** 按下瞬间的放大倍数：1.18 看得出来"被按到了"，又不会盖住旁边刚落下的手指。 */
const PULSE_SCALE = 1.18;
const PULSE_SPEED = 20;
const PULSE_BOUNCINESS = 9;

/**
 * 安全内边距：48pt。**用户给的数**（规格 §三-1「上下左右各留出至少 48px 安全内边距」）。
 *
 * 为什么不沿用旧值 6：6pt 只保证了"框不压在窗口那 1pt 白线上"，是一种**美观**余量；
 * 用户要的 48pt 是**行为**要求 —— 框和滑条都只在窗口中间那块里出现，眼睛永远看不到
 * 它们贴近白边，更不会看错成"漏到框外"。两者不冲突，取严的那个。
 *
 * 为什么不做成 props：这是产品决策而不是布局参数，露出一个可调旋钮只会让
 * 取景器的行为随调用点漂移（`CameraScreen` 只传几何，不传设计值）。
 */
export const SAFE_INSET = 48;

/**
 * 把窗口矩形内缩成**安全内区**，对焦框与曝光滑条都只许落在这里面。
 *
 * 内缩量的上限：`max(0, (边长 - RETICLE_SIZE) / 2)`，即"再往里缩就要把 76×76 的框挤出
 * 这条边"的那个临界值，再和用户给的 `SAFE_INSET` 取小。
 *
 * 为什么不用更朴素的 `min(SAFE_INSET, 边长/2)`：那只保证安全区不为负，**不保证框出得来**。
 * 窗口 60pt 宽时内缩量是 30pt，安全区宽度算出来是 0，可 76pt 的框一放进去照样横跨
 * 整扇窗 —— 越界（用户明令禁止的那件事）照旧发生。改成 `(边长 - RETICLE_SIZE)/2` 之后，
 * 内缩量在"框正好还能塞进窗口"的那一刻收缩到 0，安全区与框的关系是连续的。
 *
 * 代价：边长 < 76 + 2×48 = 172pt 的窗口拿不到完整 48pt 内边距 —— 那是物理上留不出来的量。
 * `Math.max(0, ...)` 同时兜住 `width/height` 为负数的脏输入，保证安全区宽高恒 ≥ 0。
 *
 * 纯函数、不依赖任何 state：这样几何可以被探针直接调用验证（见验收证据）。
 */
export function safeAreaRect(bounds: Rect): Rect {
  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  // 上限 = "把框从这条边挤出去"的临界内缩量：窗宽 353 → 138.5（于是取满 48）；
  // 窗宽 100 → 12（框已经放不下，内缩只剩这点空间可让）
  const insetX = Math.min(SAFE_INSET, Math.max(0, (width - RETICLE_SIZE) / 2));
  const insetY = Math.min(SAFE_INSET, Math.max(0, (height - RETICLE_SIZE) / 2));
  return {
    left: bounds.left + insetX,
    top: bounds.top + insetY,
    width: width - insetX * 2,
    height: height - insetY * 2,
  };
}

/**
 * 把归一化落点换算成框左上角的像素坐标，并把它按在**镂空取景窗的安全内区**里。
 *
 * 为什么必须夹紧：手指点到画面最边缘时，框会有一半落在取景器外面 —— 看起来像被裁掉了；
 * 而且曝光滑块要贴着框右侧 8pt，框越界会把滑块一起推出画面。
 *
 * ⚠️ **夹到"整个取景器"是不够的**（那是本函数最初的写法）：取景器现在铺满全屏，
 * 而"会被拍进去的"只有镂空窗那一块。只夹到全屏的话，用户点在窗口下沿附近时，
 * 框的下半截会穿到窗口外的遮罩区去 —— 真机实测报的就是这一条。
 * 所以调用方要把窗口矩形当 `bounds` 传进来；不传时退回"夹到整块画布"的老行为
 * （保持这个函数对旧调用点仍然成立）。
 *
 * 夹的是 `safeAreaRect(bounds)` 而不是 `bounds` 本身：48pt 安全内区是用户要的行为，
 * 而"整框不越出窗口"只是它的必要条件。`FocusExposure` 要把**同一个**安全矩形
 * 拿去夹曝光滑条，所以这里顺手把窗口也算一遍 —— 两条几何口径必须来自同一个函数。
 *
 * 安全区比框还窄时（理论上只在极小屏 + 极窄画幅同时发生）夹紧区间会反向，
 * 这时让框**居中**而不是钉在左沿：两种做法都必然溢出（76pt 的框塞不进 60pt 的窗），
 * 居中是唯一左右对称、看不出"框被推出取景器"的那种。
 */
export function reticleOrigin(
  target: { x: number; y: number },
  width: number,
  height: number,
  bounds?: Rect,
): { left: number; top: number } {
  const window = bounds ?? { left: 0, top: 0, width, height };
  const area = safeAreaRect(window);
  /*
   * 退化分支（只在极小屏 + 极窄画幅同时出现）：**窗口本身**就比框窄/矮。
   * 这时"框不越窗口"物理上做不到，"夹到安全区"更是没有意义 —— 安全区宽已经算成 0。
   * 还能守住的语义只有一条：把框**居中**，让左右（上下）两侧的外溢量相等，
   * 看上去是"框比取景器大"而不是"框被推到一边漏出去了"。
   * 居中基准用**窗口**而不是已经塌成 0 宽的安全区：后者会把框钉在窗口左沿，反而更偏。
   */
  const centre = {
    x: window.left + window.width / 2 - RETICLE_SIZE / 2,
    y: window.top + window.height / 2 - RETICLE_SIZE / 2,
  };
  // 轴向单独判：极窄窗口里"横向居中、纵向照常跟手指"才是对的（两个方向互不牵连）
  const x = area.width < RETICLE_SIZE
    ? centre.x
    : clampWithin(target.x * width - RETICLE_SIZE / 2, area.left, area.left + area.width - RETICLE_SIZE);
  const y = area.height < RETICLE_SIZE
    ? centre.y
    : clampWithin(target.y * height - RETICLE_SIZE / 2, area.top, area.top + area.height - RETICLE_SIZE);
  return { left: x, top: y };
}

/** 把 `value` 夹进 [`lo`, `hi`]；`lo > hi`（退化输入）时取 `lo`，绝不返回越界值。 */
function clampWithin(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), Math.max(lo, hi));
}

export interface FocusReticleProps {
  target: FocusTarget;
  width: number;
  height: number;
  /**
   * 镂空取景窗在**同一个坐标系**里的矩形。传了它，框就只会在窗口的**安全内区**
   * （再内缩 `SAFE_INSET`，见 `safeAreaRect`）里出现；不传 = 夹到整块画布。
   * 真机实测：完全不传时框会穿到窗口外的遮罩区。
   */
  bounds?: Rect;
  /** 整层透明度由父级驱动：`IDLE_MS` 无操作时它要和曝光滑块一起淡出，所以不能各淡各的。 */
  opacity: Animated.Value;
}

export function FocusReticle({ target, width, height, bounds, opacity }: FocusReticleProps) {
  const { focus } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  /**
   * 用时间戳而不是 target 对象当依赖：每次点击 target 都是新对象，拿它比较等于每次必跑动画；
   * 而父级因别的原因（拖 EV、切镜头）重渲染时时间戳没变，动画就不该重跑。
   */
  const stamp = target === null ? 0 : target.at;

  useEffect(() => {
    if (stamp === 0) {
      return;
    }
    scale.setValue(PULSE_SCALE);
    const pulse = Animated.spring(scale, {
      toValue: 1,
      speed: PULSE_SPEED,
      bounciness: PULSE_BOUNCINESS,
      useNativeDriver: true,
    });
    pulse.start();
    return () => pulse.stop();
  }, [stamp, scale]);

  if (target === null) {
    return null;
  }

  const origin = reticleOrigin(target, width, height, bounds);

  return (
    <Animated.View
      style={[
        styles.box,
        { left: origin.left, top: origin.top, borderColor: focus, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

// 这里只放几何：颜色一律现取，放模块级会把首次渲染时的配色冻住，切深浅色就不跟手了。
const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderWidth: STROKE,
    borderRadius: RADIUS,
    pointerEvents: 'none',
  },
});
